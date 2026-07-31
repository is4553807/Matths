const fs = require("node:fs");
const path = require("node:path");
const bcrypt = require("bcrypt");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const yaml = require("js-yaml");

dotenv.config({
  path: path.resolve(
    __dirname,
    "..",
    "config.env"
  ),
  quiet: true,
});

/*
 * 2025 국가수준 학업성취도 평가의 고2 수학 모집단 추정치:
 * - 1수준: 11.6%
 * - 2수준: 32.2% (= 100 - 11.6 - 56.2)
 * - 3수준 이상: 56.2%
 *
 * 3수준/4수준의 개별 비율은 보도자료에 공개되지 않아 35.7%/20.5%로
 * 나눈 모델링 가정이다. 각 수준 안에서는 균일·삼각·좌우 꼬리 분포를
 * 섞어 단일 정규분포가 되지 않도록 한다.
 *
 * 출처:
 * https://www.moe.go.kr/boardCnts/viewRenew.do?boardID=294&boardSeq=106502&lev=0&m=020402&opType=N&page=1&s=moe
 */

const DEFAULT_COUNT = 130000;
const DEFAULT_BATCH_SIZE = 1000;
const DEFAULT_SEED = "matths-korean-high-school-math-2025-v1";
const DEFAULT_PASSWORD = "LsbProDucTion!";
const DUMMY_EMAIL_PATTERN =
  /^dummy-rank-\d{6}@matths\.test$/;
const DUMMY_EMAIL_MONGO_PATTERN =
  /^dummy-rank-\d{6}@matths\.test$/i;
const GENERATION_VERSION =
  "dummy-ranking-korean-high-school-2025-v1";
const SCHOOL_DATA_PATH = path.resolve(
  __dirname,
  "..",
  "kr-high-schools.yaml"
);

const ACHIEVEMENT_LEVELS = [
  {
    code: 1,
    label: "1수준",
    share: 0.116,
  },
  {
    code: 2,
    label: "2수준",
    share: 0.322,
  },
  {
    code: 3,
    label: "3수준",
    share: 0.357,
  },
  {
    code: 4,
    label: "4수준",
    share: 0.205,
  },
];

const TIER_CONFIG = [
  {
    code: "BRONZE",
    label: "브론즈",
    share: 0.116,
    minMmr: 400,
    maxMmr: 799,
    minScore: 7,
    maxScore: 36,
  },
  {
    code: "SILVER",
    label: "실버",
    share: 0.18,
    minMmr: 800,
    maxMmr: 924,
    minScore: 25,
    maxScore: 49,
  },
  {
    code: "GOLD",
    label: "골드",
    share: 0.204,
    minMmr: 925,
    maxMmr: 1024,
    minScore: 38,
    maxScore: 65,
  },
  {
    code: "PLATINUM",
    label: "플래티넘",
    share: 0.18,
    minMmr: 1025,
    maxMmr: 1119,
    minScore: 55,
    maxScore: 73,
  },
  {
    code: "EMERALD",
    label: "에메랄드",
    share: 0.145,
    minMmr: 1120,
    maxMmr: 1209,
    minScore: 65,
    maxScore: 87,
  },
  {
    code: "DIAMOND",
    label: "다이아몬드",
    share: 0.125,
    minMmr: 1210,
    maxMmr: 1329,
    minScore: 78,
    maxScore: 93,
  },
  {
    code: "MASTER",
    label: "마스터",
    share: 0.035,
    minMmr: 1330,
    maxMmr: 1439,
    minScore: 87,
    maxScore: 97,
  },
  {
    code: "GRANDMASTER",
    label: "그랜드마스터",
    share: 0.01,
    minMmr: 1440,
    maxMmr: 1519,
    minScore: 92,
    maxScore: 99,
  },
  {
    code: "CHALLENGER",
    label: "챌린저",
    share: 0.005,
    minMmr: 1520,
    maxMmr: 1699,
    minScore: 96,
    maxScore: 100,
  },
];

const TIER_BY_CODE = new Map(
  TIER_CONFIG.map((tier) => [
    tier.code,
    tier,
  ])
);

function clamp(
  value,
  minimum = 0,
  maximum = 1
) {
  return Math.min(
    maximum,
    Math.max(
      minimum,
      Number(value) || 0
    )
  );
}

function round(value, digits = 1) {
  const multiplier = 10 ** digits;
  return (
    Math.round(
      Number(value) * multiplier
    ) / multiplier
  );
}

function createSeededRandom(seed) {
  let hash = 2166136261;

  for (const character of String(seed)) {
    hash ^=
      character.codePointAt(0);
    hash = Math.imul(
      hash,
      16777619
    );
  }

  let state = hash >>> 0;

  return function random() {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(
      value ^ (value >>> 15),
      value | 1
    );
    value ^=
      value +
      Math.imul(
        value ^ (value >>> 7),
        value | 61
      );

    return (
      (
        value ^
        (value >>> 14)
      ) >>>
      0
    ) / 4294967296;
  };
}

function hashToUnit(value) {
  const random =
    createSeededRandom(value);
  return random();
}

function allocateCounts(
  total,
  weightedItems
) {
  const allocations =
    weightedItems.map(
      (item, index) => {
        const exact =
          total * item.share;

        return {
          index,
          floor:
            Math.floor(exact),
          remainder:
            exact -
            Math.floor(exact),
        };
      }
    );
  let remaining =
    total -
    allocations.reduce(
      (sum, item) =>
        sum + item.floor,
      0
    );

  allocations
    .slice()
    .sort(
      (left, right) =>
        right.remainder -
          left.remainder ||
        left.index - right.index
    )
    .forEach((item) => {
      if (remaining <= 0) {
        return;
      }
      allocations[
        item.index
      ].floor += 1;
      remaining -= 1;
    });

  return allocations.map(
    (item) => item.floor
  );
}

function loadHighSchools() {
  const source = yaml.load(
    fs.readFileSync(
      SCHOOL_DATA_PATH,
      "utf8"
    )
  );
  const schools = Object.entries(
    source?.regions || {}
  ).flatMap(
    ([region, regionData]) =>
      (
        regionData?.schools || []
      ).map((school) => ({
        region,
        code: String(
          school.code || ""
        ),
        name: String(
          school.name || ""
        ),
        roadAddress: String(
          school.road_address ||
            ""
        ),
        establishment: String(
          school.establishment ||
            ""
        ),
        highSchoolType: String(
          school.high_school_type ||
            ""
        ),
        generalVocationalType:
          String(
            school.general_vocational_type ||
              ""
          ),
      }))
  );

  if (!schools.length) {
    throw new Error(
      "kr-high-schools.yaml에서 고등학교를 찾지 못했습니다."
    );
  }

  return schools.map((school) => {
    const typeBase =
      {
        특목고: 0.8,
        자율고: 0.68,
        일반고: 0.5,
        특성화고: 0.3,
      }[
        school.highSchoolType
      ] ?? 0.5;
    const schoolVariation =
      (
        hashToUnit(
          `${DEFAULT_SEED}:${school.code}`
        ) -
        0.5
      ) * 0.3;

    return {
      ...school,
      academicIndex: clamp(
        typeBase +
          schoolVariation,
        0.05,
        0.95
      ),
    };
  });
}

function nonNormalUnit(
  random,
  abilityPosition
) {
  const component =
    random();
  let sample;

  if (component < 0.34) {
    sample = random();
  } else if (
    component < 0.62
  ) {
    sample =
      (
        random() +
        random()
      ) / 2;
  } else if (
    component < 0.82
  ) {
    sample = random() ** 2.35;
  } else {
    sample =
      1 -
      random() ** 2.15;
  }

  return clamp(
    abilityPosition * 0.58 +
      sample * 0.42
  );
}

function pickWeightedGrade(random) {
  const value = random();

  if (value < 0.34) {
    return 10;
  }
  if (value < 0.67) {
    return 11;
  }
  return 12;
}

function chooseSchool({
  schools,
  random,
  globalAbility,
}) {
  if (random() >= 0.45) {
    return schools[
      Math.floor(
        random() *
          schools.length
      )
    ];
  }

  const candidates =
    Array.from(
      {
        length: 4,
      },
      () =>
        schools[
          Math.floor(
            random() *
              schools.length
          )
        ]
    );

  return candidates.sort(
    (left, right) =>
      Math.abs(
        left.academicIndex -
          globalAbility
      ) -
      Math.abs(
        right.academicIndex -
          globalAbility
      )
  )[0];
}

function rankPointForTier(
  mmr,
  tier
) {
  if (
    tier.code ===
    "CHALLENGER"
  ) {
    return 99;
  }

  return Math.min(
    99,
    Math.max(
      0,
      Math.floor(
        (
          (
            mmr -
            tier.minMmr
          ) /
          (
            tier.maxMmr -
            tier.minMmr +
            1
          )
        ) * 100
      )
    )
  );
}

function buildAbilitySlots(
  count,
  random
) {
  const tierCounts =
    allocateCounts(
      count,
      TIER_CONFIG
    );
  const levelCounts =
    allocateCounts(
      count,
      ACHIEVEMENT_LEVELS
    );
  const levelBoundaries = [];
  let levelTotal = 0;

  ACHIEVEMENT_LEVELS.forEach(
    (level, index) => {
      levelTotal +=
        levelCounts[index];
      levelBoundaries.push({
        ...level,
        upperExclusive:
          levelTotal,
      });
    }
  );

  const slots = [];
  let globalOrdinal = 0;

  TIER_CONFIG.forEach(
    (tier, tierIndex) => {
      const tierCount =
        tierCounts[tierIndex];

      for (
        let localIndex = 0;
        localIndex < tierCount;
        localIndex += 1
      ) {
        const localPosition =
          (
            localIndex +
            random()
          ) /
          Math.max(
            tierCount,
            1
          );
        const achievementLevel =
          levelBoundaries.find(
            (level) =>
              globalOrdinal <
              level.upperExclusive
          ) ||
          levelBoundaries[
            levelBoundaries.length -
              1
          ];

        slots.push({
          tier,
          localPosition,
          globalAbility:
            (
              globalOrdinal +
              0.5
            ) / count,
          achievementLevel:
            achievementLevel.code,
          achievementLabel:
            achievementLevel.label,
        });
        globalOrdinal += 1;
      }
    }
  );

  for (
    let index =
      slots.length - 1;
    index > 0;
    index -= 1
  ) {
    const target =
      Math.floor(
        random() *
          (index + 1)
      );
    [
      slots[index],
      slots[target],
    ] = [
      slots[target],
      slots[index],
    ];
  }

  return slots;
}

function scoreForSlot(
  slot,
  random
) {
  const unit =
    nonNormalUnit(
      random,
      slot.localPosition
    );
  const score =
    slot.tier.minScore +
    unit *
      (
        slot.tier.maxScore -
        slot.tier.minScore
      ) +
    (
      random() -
      0.5
    ) *
      2.6;

  return round(
    clamp(
      score,
      0,
      100
    ),
    1
  );
}

function mmrForSlot(
  slot,
  random
) {
  const unit =
    clamp(
      slot.localPosition *
        0.72 +
        nonNormalUnit(
          random,
          slot.localPosition
        ) *
          0.28
    );

  return Math.min(
    slot.tier.maxMmr,
    slot.tier.minMmr +
      Math.floor(
        unit *
          (
            slot.tier.maxMmr -
            slot.tier.minMmr +
            1
          )
      )
  );
}

function populationStats(values) {
  const mean =
    values.reduce(
      (sum, value) =>
        sum + value,
      0
    ) / values.length;
  const variance =
    values.reduce(
      (sum, value) =>
        sum +
        (
          value -
          mean
        ) ** 2,
      0
    ) / values.length;

  return {
    mean,
    standardDeviation:
      Math.sqrt(variance),
  };
}

function buildDummyRecords({
  count = DEFAULT_COUNT,
  seed = DEFAULT_SEED,
  schools = loadHighSchools(),
  now = new Date(),
} = {}) {
  if (
    !Number.isInteger(count) ||
    count < 1 ||
    count > 500000
  ) {
    throw new Error(
      "--count는 1 이상 500000 이하의 정수여야 합니다."
    );
  }

  const random =
    createSeededRandom(seed);
  const slots =
    buildAbilitySlots(
      count,
      random
    );
  const records =
    slots.map(
      (slot, zeroIndex) => {
        const userIndex =
          zeroIndex + 1;
        const school =
          chooseSchool({
            schools,
            random,
            globalAbility:
              slot.globalAbility,
          });
        const placementScore =
          scoreForSlot(
            slot,
            random
          );
        const mmr =
          mmrForSlot(
            slot,
            random
          );
        const rankPoint =
          rankPointForTier(
            mmr,
            slot.tier
          );
        const performanceCenter =
          clamp(
            placementScore /
              100 *
              0.72 +
              slot.globalAbility *
                0.28
          );
        const latestPerformance =
          round(
            clamp(
              performanceCenter +
                (
                  random() -
                  0.5
                ) *
                  0.08
            ),
            6
          );
        const recentPerformances =
          [
            latestPerformance,
            round(
              clamp(
                performanceCenter +
                  (
                    random() -
                    0.5
                  ) *
                    0.12
              ),
              6
            ),
            round(
              clamp(
                performanceCenter +
                  (
                    random() -
                    0.5
                  ) *
                    0.14
              ),
              6
            ),
          ];
        const advancedPerformance =
          round(
            clamp(
              performanceCenter *
                0.82 +
                slot.globalAbility *
                  0.18 +
                (
                  random() -
                  0.5
                ) *
                  0.1
            ),
            6
          );
        const consistency =
          round(
            clamp(
              0.45 +
                slot.globalAbility *
                  0.35 +
                (
                  random() -
                  0.5
                ) *
                  0.32
            ),
            6
          );
        const elapsedTimeMs =
          Math.round(
            (
              54 +
              (
                1 -
                slot.globalAbility
              ) *
                24 +
              random() * 22
            ) *
              60 *
              1000
          );
        const submittedAt =
          new Date(
            now.getTime() -
              Math.floor(
                random() *
                  180
              ) *
                24 *
                60 *
                60 *
                1000 -
              Math.floor(
                random() *
                  24 *
                  60 *
                  60 *
                  1000
              )
          );
        const reachedCurrentMmrAt =
          new Date(
            submittedAt.getTime() +
              Math.floor(
                random() *
                  14 *
                  24 *
                  60 *
                  60 *
                  1000
              )
          );
        const nickname =
          `테스트학생${String(
            userIndex
          ).padStart(6, "0")}`;
        const email =
          `dummy-rank-${String(
            userIndex
          ).padStart(
            6,
            "0"
          )}@matths.test`;

        return {
          userIndex,
          email,
          nickname,
          role: "test",
          schoolGrade:
            pickWeightedGrade(
              random
            ),
          school,
          achievementLevel:
            slot.achievementLevel,
          achievementLabel:
            slot.achievementLabel,
          placementScore,
          mmr,
          tierCode:
            slot.tier.code,
          tierLabel:
            slot.tier.label,
          rankPoint,
          recentPerformances,
          latestPerformance,
          recentPerformanceAverage:
            recentPerformances.reduce(
              (sum, value) =>
                sum + value,
              0
            ) /
            recentPerformances.length,
          advancedPerformance,
          consistency,
          elapsedTimeMs,
          submittedAt,
          reachedCurrentMmrAt,
        };
      }
    );
  const rankedRecords =
    [...records].sort(
      (left, right) => {
        if (
          right.mmr !==
          left.mmr
        ) {
          return (
            right.mmr -
            left.mmr
          );
        }
        if (
          right.latestPerformance !==
          left.latestPerformance
        ) {
          return (
            right.latestPerformance -
            left.latestPerformance
          );
        }
        if (
          right.recentPerformanceAverage !==
          left.recentPerformanceAverage
        ) {
          return (
            right.recentPerformanceAverage -
            left.recentPerformanceAverage
          );
        }
        if (
          right.advancedPerformance !==
          left.advancedPerformance
        ) {
          return (
            right.advancedPerformance -
            left.advancedPerformance
          );
        }
        if (
          right.placementScore !==
          left.placementScore
        ) {
          return (
            right.placementScore -
            left.placementScore
          );
        }

        const reachedDifference =
          left.reachedCurrentMmrAt -
          right.reachedCurrentMmrAt;

        if (reachedDifference) {
          return reachedDifference;
        }

        return (
          left.elapsedTimeMs -
          right.elapsedTimeMs
        );
      }
    );

  rankedRecords.forEach(
    (record, index) => {
      record.overallRank =
        index + 1;
      record.percentile =
        clamp(
          1 -
            index /
              records.length
        );
    }
  );

  const scoreStats =
    populationStats(
      records.map(
        (record) =>
          record.placementScore
      )
    );

  records.forEach((record) => {
    record.cohortSize =
      records.length;
    record.cohortAverage =
      round(
        scoreStats.mean,
        1
      );
    record.cohortStandardDeviation =
      round(
        scoreStats.standardDeviation,
        2
      );
    record.standardizedScore =
      round(
        (
          record.placementScore -
          scoreStats.mean
        ) /
          Math.max(
            scoreStats.standardDeviation,
            0.01
          ),
        4
      );
  });

  validateGeneratedRecords(
    records
  );

  return records;
}

function validateGeneratedRecords(
  records
) {
  const emails = new Set();
  const tierCounts =
    Object.fromEntries(
      TIER_CONFIG.map(
        (tier) => [
          tier.code,
          0,
        ]
      )
    );
  const levelCounts =
    Object.fromEntries(
      ACHIEVEMENT_LEVELS.map(
        (level) => [
          level.code,
          0,
        ]
      )
    );
  const ranks = new Set();

  for (const record of records) {
    const tier =
      TIER_BY_CODE.get(
        record.tierCode
      );

    if (
      !DUMMY_EMAIL_PATTERN.test(
        record.email
      ) ||
      emails.has(record.email)
    ) {
      throw new Error(
        `더미 이메일 검증 실패: ${record.email}`
      );
    }
    emails.add(record.email);

    if (
      !tier ||
      record.mmr <
        tier.minMmr ||
      record.mmr >
        tier.maxMmr
    ) {
      throw new Error(
        `티어/MMR 검증 실패: ${record.email}`
      );
    }

    if (
      record.placementScore <
        0 ||
      record.placementScore > 100
    ) {
      throw new Error(
        `배치고사 점수 검증 실패: ${record.email}`
      );
    }

    tierCounts[
      record.tierCode
    ] += 1;
    levelCounts[
      record.achievementLevel
    ] += 1;
    ranks.add(
      record.overallRank
    );
  }

  if (
    ranks.size !==
    records.length
  ) {
    throw new Error(
      "전체 랭킹이 중복되거나 누락되었습니다."
    );
  }

  const expectedTierCounts =
    allocateCounts(
      records.length,
      TIER_CONFIG
    );
  TIER_CONFIG.forEach(
    (tier, index) => {
      if (
        tierCounts[
          tier.code
        ] !==
        expectedTierCounts[index]
      ) {
        throw new Error(
          `${tier.code} 티어 인원 검증 실패`
        );
      }
    }
  );

  const expectedLevelCounts =
    allocateCounts(
      records.length,
      ACHIEVEMENT_LEVELS
    );
  ACHIEVEMENT_LEVELS.forEach(
    (level, index) => {
      if (
        levelCounts[
          level.code
        ] !==
        expectedLevelCounts[index]
      ) {
        throw new Error(
          `${level.label} 인원 검증 실패`
        );
      }
    }
  );
}

function summarizeRecords(records) {
  const byTier =
    Object.fromEntries(
      TIER_CONFIG.map(
        (tier) => [
          tier.code,
          {
            label:
              tier.label,
            count: 0,
            scoreTotal: 0,
            minScore:
              Infinity,
            maxScore:
              -Infinity,
            minMmr:
              Infinity,
            maxMmr:
              -Infinity,
          },
        ]
      )
    );
  const byAchievement =
    Object.fromEntries(
      ACHIEVEMENT_LEVELS.map(
        (level) => [
          level.code,
          0,
        ]
      )
    );
  const byGrade = {
    10: 0,
    11: 0,
    12: 0,
  };

  for (const record of records) {
    const tier =
      byTier[
        record.tierCode
      ];
    tier.count += 1;
    tier.scoreTotal +=
      record.placementScore;
    tier.minScore =
      Math.min(
        tier.minScore,
        record.placementScore
      );
    tier.maxScore =
      Math.max(
        tier.maxScore,
        record.placementScore
      );
    tier.minMmr =
      Math.min(
        tier.minMmr,
        record.mmr
      );
    tier.maxMmr =
      Math.max(
        tier.maxMmr,
        record.mmr
      );
    byAchievement[
      record.achievementLevel
    ] += 1;
    byGrade[
      record.schoolGrade
    ] += 1;
  }

  const scoreStats =
    populationStats(
      records.map(
        (record) =>
          record.placementScore
      )
    );

  return {
    total: records.length,
    scoreMean:
      round(
        scoreStats.mean,
        2
      ),
    scoreStandardDeviation:
      round(
        scoreStats.standardDeviation,
        2
      ),
    byTier:
      Object.fromEntries(
        Object.entries(
          byTier
        ).map(
          ([code, value]) => [
            code,
            {
              label:
                value.label,
              count:
                value.count,
              share:
                round(
                  value.count /
                    records.length,
                  4
                ),
              averageScore:
                round(
                  value.scoreTotal /
                    Math.max(
                      value.count,
                      1
                    ),
                  2
                ),
              minScore:
                value.minScore,
              maxScore:
                value.maxScore,
              minMmr:
                value.minMmr,
              maxMmr:
                value.maxMmr,
            },
          ]
        )
      ),
    byAchievement,
    byGrade,
  };
}

function readArguments(argv) {
  const options = {
    count: DEFAULT_COUNT,
    batchSize:
      DEFAULT_BATCH_SIZE,
    seed: DEFAULT_SEED,
    execute: false,
    delete: false,
    help: false,
  };

  for (const argument of argv) {
    if (
      argument === "--execute"
    ) {
      options.execute = true;
    } else if (
      argument === "--delete"
    ) {
      options.delete = true;
    } else if (
      argument === "--help" ||
      argument === "-h"
    ) {
      options.help = true;
    } else if (
      argument.startsWith(
        "--count="
      )
    ) {
      options.count =
        Number(
          argument.slice(
            "--count=".length
          )
        );
    } else if (
      argument.startsWith(
        "--batch-size="
      )
    ) {
      options.batchSize =
        Number(
          argument.slice(
            "--batch-size=".length
          )
        );
    } else if (
      argument.startsWith(
        "--seed="
      )
    ) {
      options.seed =
        argument.slice(
          "--seed=".length
        );
    } else {
      throw new Error(
        `알 수 없는 옵션입니다: ${argument}`
      );
    }
  }

  if (
    !Number.isInteger(
      options.batchSize
    ) ||
    options.batchSize < 100 ||
    options.batchSize > 10000
  ) {
    throw new Error(
      "--batch-size는 100 이상 10000 이하의 정수여야 합니다."
    );
  }

  return options;
}

function printHelp() {
  console.log(`
대한민국 고2 수학 분포 기반 랭킹 더미 유저 시드

미리보기:
  node scripts/seedRankingDummyUsers.js

13만 명 실제 추가:
  node scripts/seedRankingDummyUsers.js --execute

role=test 유저와 해당 배치고사/MMR 데이터 삭제:
  node scripts/seedRankingDummyUsers.js --delete --execute

선택 옵션:
  --count=130000
  --batch-size=1000
  --seed=${DEFAULT_SEED}
`.trim());
}

function userDocument({
  record,
  passwordHash,
  now,
}) {
  return {
    _id: record.userId,
    name: record.nickname,
    nameNormalized:
      record.nickname.toLocaleLowerCase(
        "ko-KR"
      ),
    realName: "",
    email: record.email,
    passwordHash,
    role: "test",
    schoolGrade:
      record.schoolGrade,
    lastGradePromotionYear:
      null,
    preferences: {
      coachMode: "silent",
      autoplayMotion: false,
      backgroundMusic: false,
      reducedMotion: true,
      rankingDisplayMode:
        "nickname",
    },
    totalStudySeconds: 0,
    currentStreak: 0,
    longestStreak: 0,
    lastStudyDate: null,
    lastLoginAt: null,
    tokenVersion: 0,
    termsAcceptedAt: now,
    termsVersion: "2026-07-28",
    privacyVersion:
      "2026-07-28",
    isActive: true,
    accountStatus: "active",
    accountStatusReason: "",
    suspendedUntil: null,
    accountStatusChangedAt:
      null,
    warningCount: 0,
    school: {
      region:
        record.school.region,
      code: record.school.code,
      name: record.school.name,
      roadAddress:
        record.school.roadAddress,
      establishment:
        record.school.establishment,
      highSchoolType:
        record.school.highSchoolType,
    },
    createdAt: now,
    updatedAt: now,
  };
}

function assessmentDocument({
  record,
  now,
}) {
  const startedAt =
    new Date(
      record.submittedAt.getTime() -
        record.elapsedTimeMs
    );

  return {
    _id: record.attemptId,
    userId: record.userId,
    paperId:
      `dummy-placement-${String(
        record.userIndex
      ).padStart(6, "0")}`,
    generationVersion:
      GENERATION_VERSION,
    scopeType: "placement",
    curriculumId: "kr-2022",
    courseId: "placement",
    unitId: null,
    subunitId: null,
    title:
      "대한민국 고2 수학 분포 기반 더미 배치고사",
    subtitle:
      "랭킹 부하 테스트 전용",
    passScore: 80,
    questions: [],
    totalPoints: 100,
    earnedPoints:
      record.placementScore,
    scorePercent:
      record.placementScore,
    passed:
      record.placementScore >=
      80,
    status: "submitted",
    startedAt,
    submittedAt:
      record.submittedAt,
    elapsedTimeMs:
      record.elapsedTimeMs,
    timeLimitMs:
      100 * 60 * 1000,
    disqualifiedReason: null,
    lastSavedAt:
      record.submittedAt,
    activeQuestionId: "",
    currentQuestionIndex: 29,
    questionTimingLastSeenAt:
      record.submittedAt,
    placementResult: {
      keyQuestions: [],
      answeredCount: 30,
      unansweredCount: 0,
      totalScore:
        record.placementScore,
      totalPercentile:
        record.percentile,
      abilityProfile: {
        coreAbility: clamp(
          record.placementScore /
            100
        ),
        advancedAbilityBeforeVerification:
          record.advancedPerformance,
        advancedAbilityAfterVerification:
          record.advancedPerformance,
        consistency:
          record.consistency,
        placementConfidence:
          round(
            clamp(
              0.62 +
                record.consistency *
                  0.32
            ),
            6
          ),
        basicStability:
          record.consistency,
        possibleMistakeCount: 0,
        confirmedConceptGapCount:
          record.achievementLevel ===
          1
            ? 3
            : record.achievementLevel ===
                2
              ? 2
              : record.achievementLevel ===
                  3
                ? 1
                : 0,
      },
      verification: {
        required: false,
        flagScore: 0,
        reasons: [],
        correct: 0,
        total: 0,
        result: "not-required",
        questions: [],
        timeLimitMs:
          40 * 60 * 1000,
        startedAt: null,
        submittedAt: null,
      },
      placementScore:
        record.placementScore,
      initialMmr: record.mmr,
      tier: record.tierLabel,
      division:
        record.division,
      rankingStatus:
        "confirmed",
      matchesUntilConfirmed: 0,
      cohortSize:
        record.cohortSize,
      cohortAverage:
        record.cohortAverage,
      cohortStandardDeviation:
        record.cohortStandardDeviation,
      standardizedScore:
        record.standardizedScore,
      percentile:
        round(
          record.percentile *
            100,
          1
        ),
      initialRating:
        record.mmr,
      initialTier:
        record.tierLabel,
    },
    createdAt: now,
    updatedAt: now,
  };
}

function rankingProfileDocument({
  record,
  now,
}) {
  return {
    _id: record.profileId,
    userId: record.userId,
    placementAttemptId:
      record.attemptId,
    placementScore:
      record.placementScore,
    placementExpectedPerformance:
      clamp(
        record.placementScore /
          100
      ),
    mmr: record.mmr,
    tier: record.tierCode,
    rankPoint:
      record.rankPoint,
    overallRank:
      record.overallRank,
    percentile:
      record.percentile,
    status: "CONFIRMED",
    datasetOnly: false,
    weeklyExamsUntilConfirmed:
      0,
    seasonId:
      "2026-season-1",
    recentPerformances:
      record.recentPerformances,
    lastAdvancedPerformance:
      record.advancedPerformance,
    lastRawScore:
      record.placementScore,
    reachedCurrentMmrAt:
      record.reachedCurrentMmrAt,
    demotionProtection: {
      active: false,
      consecutiveBelowThreshold:
        0,
      thresholdMmr: null,
    },
    participation: {
      weeklyExamCount: 0,
      consecutiveAbsences: 0,
      lastExamAt: null,
    },
    mmrHistory: [
      {
        placementAttemptId:
          record.attemptId,
        eventType:
          "placement",
        previousMmr: 1000,
        newMmr: record.mmr,
        deltaMmr:
          record.mmr - 1000,
        rawScore:
          record.placementScore,
        totalPercentile:
          record.percentile,
        advancedPercentile:
          record.advancedPerformance,
        consistencyScore:
          record.consistency,
        actualPerformance:
          record.latestPerformance,
        expectedPerformance:
          clamp(
            record.placementScore /
              100
          ),
        kFactor: 0,
        growthBonus: 0,
        createdAt:
          record.submittedAt,
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
}

async function withDatabase(
  operation
) {
  if (!process.env.DB) {
    throw new Error(
      "config.env에 DB 연결 문자열이 없습니다."
    );
  }

  await mongoose.connect(
    process.env.DB
  );

  try {
    return await operation();
  } finally {
    await mongoose.disconnect();
  }
}

async function collectTestUserIds(
  User,
  filter = {
    role: "test",
  }
) {
  const ids = [];
  const cursor = User.find(
    filter
  )
    .select({
      _id: 1,
    })
    .lean()
    .cursor();

  for await (const user of cursor) {
    ids.push(user._id);
  }

  return ids;
}

async function deleteRelatedInChunks({
  userIds,
  AssessmentAttempt,
  RankingProfile,
  batchSize,
}) {
  let deletedAttempts = 0;
  let deletedProfiles = 0;

  for (
    let offset = 0;
    offset < userIds.length;
    offset += batchSize
  ) {
    const ids =
      userIds.slice(
        offset,
        offset + batchSize
      );
    const [
      profileResult,
      attemptResult,
    ] = await Promise.all([
      RankingProfile.deleteMany({
        userId: {
          $in: ids,
        },
      }),
      AssessmentAttempt.deleteMany({
        userId: {
          $in: ids,
        },
      }),
    ]);
    deletedProfiles +=
      profileResult.deletedCount ||
      0;
    deletedAttempts +=
      attemptResult.deletedCount ||
      0;
  }

  return {
    deletedProfiles,
    deletedAttempts,
  };
}

async function deleteTestUsers({
  execute,
  batchSize,
}) {
  return withDatabase(
    async () => {
      const {
        AssessmentAttempt,
        RankingProfile,
        User,
      } = require(
        "../models/matthsModel"
      );
      const userIds =
        await collectTestUserIds(
          User
        );

      console.log(
        `삭제 대상 role=test 유저: ${userIds.length.toLocaleString(
          "ko-KR"
        )}명`
      );

      if (!execute) {
        console.log(
          "실제 삭제하려면 --delete --execute를 함께 사용하세요."
        );
        return;
      }

      const related =
        await deleteRelatedInChunks(
          {
            userIds,
            AssessmentAttempt,
            RankingProfile,
            batchSize,
          }
        );
      const userResult =
        await User.deleteMany({
          role: "test",
        });

      console.log(
        [
          "삭제 완료",
          `users=${userResult.deletedCount || 0}`,
          `assessmentAttempts=${related.deletedAttempts}`,
          `rankingProfiles=${related.deletedProfiles}`,
        ].join(" / ")
      );
    }
  );
}

async function cleanupFailedSeed({
  User,
  AssessmentAttempt,
  RankingProfile,
  batchSize,
}) {
  const userIds =
    await collectTestUserIds(
      User,
      {
        role: "test",
        email:
          DUMMY_EMAIL_MONGO_PATTERN,
      }
    );

  await deleteRelatedInChunks({
    userIds,
    AssessmentAttempt,
    RankingProfile,
    batchSize,
  });
  await User.deleteMany({
    role: "test",
    email:
      DUMMY_EMAIL_MONGO_PATTERN,
  });
}

async function insertDummyUsers({
  count,
  batchSize,
  seed,
}) {
  const schools =
    loadHighSchools();

  console.log(
    `${count.toLocaleString(
      "ko-KR"
    )}명 분포와 랭킹을 생성하고 있습니다...`
  );
  const records =
    buildDummyRecords({
      count,
      seed,
      schools,
    });
  const summary =
    summarizeRecords(records);
  console.log(
    JSON.stringify(
      summary,
      null,
      2
    )
  );

  return withDatabase(
    async () => {
      const {
        AssessmentAttempt,
        RankingProfile,
        User,
      } = require(
        "../models/matthsModel"
      );
      const existingTestUsers =
        await User.countDocuments({
          role: "test",
        });
      const existingDummyEmails =
        await User.countDocuments({
          email:
            DUMMY_EMAIL_MONGO_PATTERN,
        });

      if (
        existingTestUsers > 0 ||
        existingDummyEmails > 0
      ) {
        throw new Error(
          [
            "이미 테스트 유저 또는 더미 이메일이 존재합니다.",
            `role=test: ${existingTestUsers}`,
            `dummy email: ${existingDummyEmails}`,
            "먼저 node scripts/seedRankingDummyUsers.js --delete --execute 를 실행하세요.",
          ].join(" ")
        );
      }

      const passwordHash =
        await bcrypt.hash(
          DEFAULT_PASSWORD,
          12
        );
      const now = new Date();
      let inserted = 0;

      try {
        for (
          let offset = 0;
          offset < records.length;
          offset += batchSize
        ) {
          const batch =
            records.slice(
              offset,
              offset +
                batchSize
            );

          for (const record of batch) {
            record.userId =
              new mongoose.Types.ObjectId();
            record.attemptId =
              new mongoose.Types.ObjectId();
            record.profileId =
              new mongoose.Types.ObjectId();
          }

          await User.collection.insertMany(
            batch.map((record) =>
              userDocument({
                record,
                passwordHash,
                now,
              })
            ),
            {
              ordered: true,
            }
          );
          await AssessmentAttempt.collection.insertMany(
            batch.map((record) =>
              assessmentDocument({
                record,
                now,
              })
            ),
            {
              ordered: true,
            }
          );
          await RankingProfile.collection.insertMany(
            batch.map((record) =>
              rankingProfileDocument({
                record,
                now,
              })
            ),
            {
              ordered: true,
            }
          );

          inserted +=
            batch.length;

          if (
            inserted %
              (
                batchSize *
                10
              ) ===
              0 ||
            inserted ===
              records.length
          ) {
            console.log(
              `진행: ${inserted.toLocaleString(
                "ko-KR"
              )}/${records.length.toLocaleString(
                "ko-KR"
              )}`
            );
          }
        }

        const [
          userCount,
          attemptCount,
          profileCount,
        ] = await Promise.all([
          User.countDocuments({
            role: "test",
            email:
              DUMMY_EMAIL_MONGO_PATTERN,
          }),
          AssessmentAttempt.countDocuments(
            {
              generationVersion:
                GENERATION_VERSION,
            }
          ),
          RankingProfile.countDocuments(
            {
              userId: {
                $in:
                  await collectTestUserIds(
                    User,
                    {
                      role: "test",
                      email:
                        DUMMY_EMAIL_MONGO_PATTERN,
                    }
                  ),
              },
            }
          ),
        ]);

        if (
          userCount !== count ||
          attemptCount !== count ||
          profileCount !== count
        ) {
          throw new Error(
            `삽입 후 검증 실패: users=${userCount}, attempts=${attemptCount}, profiles=${profileCount}`
          );
        }

        console.log(
          [
            "더미 랭킹 데이터 추가 완료",
            `users=${userCount}`,
            `assessmentAttempts=${attemptCount}`,
            `rankingProfiles=${profileCount}`,
          ].join(" / ")
        );
      } catch (error) {
        console.error(
          "삽입 중 오류가 발생해 이번 더미 시드 데이터를 정리합니다."
        );
        await cleanupFailedSeed({
          User,
          AssessmentAttempt,
          RankingProfile,
          batchSize,
        });
        throw error;
      }
    }
  );
}

async function main() {
  const options =
    readArguments(
      process.argv.slice(2)
    );

  if (options.help) {
    printHelp();
    return;
  }

  if (options.delete) {
    await deleteTestUsers(
      options
    );
    return;
  }

  if (!options.execute) {
    const records =
      buildDummyRecords({
        count:
          options.count,
        seed: options.seed,
      });
    console.log(
      JSON.stringify(
        summarizeRecords(
          records
        ),
        null,
        2
      )
    );
    console.log(
      "\n미리보기만 완료했습니다. 실제 추가 명령:"
    );
    console.log(
      "node scripts/seedRankingDummyUsers.js --execute"
    );
    return;
  }

  await insertDummyUsers(
    options
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(
      error?.stack ||
        error?.message ||
        error
    );
    process.exitCode = 1;
  });
}

module.exports = {
  ACHIEVEMENT_LEVELS,
  DEFAULT_COUNT,
  DEFAULT_PASSWORD,
  DEFAULT_SEED,
  GENERATION_VERSION,
  TIER_CONFIG,
  allocateCounts,
  assessmentDocument,
  buildDummyRecords,
  loadHighSchools,
  rankingProfileDocument,
  readArguments,
  summarizeRecords,
  userDocument,
  validateGeneratedRecords,
};
