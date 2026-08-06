const dotenv = require("dotenv");
const mongoose = require("mongoose");

dotenv.config({ path: "config.env" });

const {
  AdminActionLog,
  AssessmentAttempt,
  RankingProfile,
  User,
  UserNotification,
} = require("../models/matthsModel");
const {
  AccessCycle,
  ArenaAccessState,
  ArenaStanding,
  LiveFinalRankingProfile,
} = require("../models/goatArenaModel");
const {
  ADMIN_PACKAGE_TYPES,
  updateAdminPackageAccess,
} = require("../services/adminPackageAccessService");

const TARGET_USERNAME = "sangyoon0807";
const SETUP_VERSION = "SANGYOON-SUB-PLACEMENT-TEST-V1";

async function findAccounts() {
  const [admin, target] = await Promise.all([
    User.findOne({
      role: "admin",
      isActive: { $ne: false },
      accountStatus: { $ne: "withdrawn" },
    })
      .sort({ createdAt: 1 })
      .select("_id name role")
      .lean(),
    User.findOne({
      $or: [
        { nameNormalized: TARGET_USERNAME },
        { name: new RegExp(`^${TARGET_USERNAME}$`, "i") },
      ],
    })
      .select("_id name role +arenaTestMatchEnabled")
      .lean(),
  ]);
  if (!admin) throw new Error("활성 관리자 계정을 찾을 수 없습니다.");
  if (!target) throw new Error(`${TARGET_USERNAME} 계정을 찾을 수 없습니다.`);
  if (target.role === "admin") {
    throw new Error("대상 계정은 일반 사용자 계정이어야 합니다.");
  }
  return { admin, target };
}

async function isAlreadyPrepared(userId) {
  const [cycle, accessState, rankingProfile, placementAttempt] = await Promise.all([
    AccessCycle.findOne({ userId, status: "ACTIVE" }).lean(),
    ArenaAccessState.findOne({ userId }).lean(),
    RankingProfile.exists({ userId }),
    AssessmentAttempt.exists({ userId, scopeType: "placement" }),
  ]);
  return Boolean(
    cycle?.division === "SUB" &&
      Number(cycle.availableLearningDays || 0) > 0 &&
      accessState?.state === "SEASON_PLACEMENT_REQUIRED" &&
      accessState?.standingId == null &&
      accessState?.currentSeasonPlacementCompleted === false &&
      !rankingProfile &&
      !placementAttempt
  );
}

async function hasCompletedSubPlacement(userId) {
  const [cycle, accessState, activeStanding, rankingProfile, placementAttempt] =
    await Promise.all([
      AccessCycle.findOne({ userId, status: "ACTIVE" }).lean(),
      ArenaAccessState.findOne({ userId }).lean(),
      ArenaStanding.exists({ userId, division: "SUB", status: "ACTIVE" }),
      RankingProfile.exists({ userId }),
      AssessmentAttempt.exists({
        userId,
        scopeType: "placement",
        status: "submitted",
      }),
    ]);

  return Boolean(
    cycle?.division === "SUB" &&
      Number(cycle.availableLearningDays || 0) > 0 &&
      accessState?.state === "PAID_ACTIVE" &&
      accessState?.currentCompetitiveDivision === "SUB" &&
      accessState?.currentSeasonPlacementCompleted === true &&
      accessState?.defensePoolEligible === true &&
      accessState?.standingId &&
      activeStanding &&
      rankingProfile &&
      placementAttempt
  );
}

async function resetArenaPlacementState({ admin, target, now }) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const cycle = await AccessCycle.findOne({
        userId: target._id,
        status: "ACTIVE",
      })
        .sort({ paidAt: -1 })
        .session(session);
      if (!cycle || cycle.division !== "SUB") {
        throw new Error("새로 발급된 Unranked 29일 학습권을 찾을 수 없습니다.");
      }

      const archivedStandingResult = await ArenaStanding.updateMany(
        { userId: target._id, status: { $ne: "ARCHIVED" } },
        { $set: { status: "ARCHIVED" } },
        { session }
      );
      const [rankingDelete, finalRankingDelete, placementDelete] = await Promise.all([
        RankingProfile.deleteMany({ userId: target._id }).session(session),
        LiveFinalRankingProfile.deleteMany({ userId: target._id }).session(session),
        AssessmentAttempt.deleteMany({
          userId: target._id,
          scopeType: "placement",
        }).session(session),
      ]);

      await ArenaAccessState.updateOne(
        { userId: target._id },
        {
          $set: {
            currentCompetitiveDivision: "SUB",
            accessCycleId: cycle._id,
            standingId: null,
            state: "SEASON_PLACEMENT_REQUIRED",
            mainAchievementStatus: "NOT_ACHIEVED",
            currentSeasonPlacementCompleted: false,
            expiredAt: null,
            renewalGraceDeadline: null,
            lastMainSnapshotId: null,
            referenceSubPlacementId: null,
            defensePoolEligible: false,
            weeklyMockEligible: false,
            finalRankingActive: false,
            integrityStatus: "CLEAR",
            integrityCaseId: null,
            reasonCode: SETUP_VERSION,
          },
        },
        { upsert: true, session }
      );

      await User.updateOne(
        { _id: target._id },
        { $set: { arenaTestMatchEnabled: true } },
        { session }
      );

      await UserNotification.updateOne(
        { dedupeKey: `${target._id}:${SETUP_VERSION}` },
        {
          $setOnInsert: {
            userId: target._id,
            title: "GOAT Arena 배치고사를 시작할 수 있습니다",
            message:
              "29일 학습권 패키지는 유지되며 기존 티어·GP·랭킹은 초기화되었습니다. 배치고사를 완료하면 Unranked에서 테스트 계정과 바로 1대1 매치를 진행할 수 있습니다.",
            href: "/war-of-masters",
            dedupeKey: `${target._id}:${SETUP_VERSION}`,
            sourceType: "ARENA_TEST_SETUP",
            sourceId: cycle._id,
            kind: "system",
            createdBy: admin._id,
          },
        },
        { upsert: true, session }
      );

      await AdminActionLog.updateOne(
        {
          adminUserId: admin._id,
          targetUserId: target._id,
          action: SETUP_VERSION,
        },
        {
          $setOnInsert: {
            adminUserId: admin._id,
            targetUserId: target._id,
            action: SETUP_VERSION,
            detail:
              "29일 학습권 유지 · 기존 티어/GP/랭킹 제거 · 배치고사 재응시 · 테스트 계정 매칭 허용",
            metadata: {
              accessCycleId: cycle._id,
              archivedStandings: Number(archivedStandingResult.modifiedCount || 0),
              deletedRankingProfiles: Number(rankingDelete.deletedCount || 0),
              deletedFinalRankingProfiles: Number(finalRankingDelete.deletedCount || 0),
              deletedPlacementAttempts: Number(placementDelete.deletedCount || 0),
            },
          },
        },
        { upsert: true, session }
      );
    });
  } finally {
    await session.endSession();
  }
}

async function main() {
  if (!process.env.DB) throw new Error("config.env의 DB 연결 문자열이 필요합니다.");
  await mongoose.connect(process.env.DB, {
    serverSelectionTimeoutMS: 15_000,
    connectTimeoutMS: 15_000,
  });
  const now = new Date();
  try {
    const accounts = await findAccounts();
    const awaitingPlacement = await isAlreadyPrepared(accounts.target._id);
    const placementCompleted = await hasCompletedSubPlacement(accounts.target._id);

    if (!awaitingPlacement && !placementCompleted) {
      await updateAdminPackageAccess({
        adminUserId: accounts.admin._id,
        userId: accounts.target._id,
        packageType: ADMIN_PACKAGE_TYPES.LEARNING_PACKAGE,
        reason: "배치고사부터 다시 진행하는 GOAT Arena 실전 1대1 테스트 준비",
        now,
      });
      await resetArenaPlacementState({ ...accounts, now });
    } else {
      // 이미 배치고사를 완료한 테스트 계정은 티어·GP·응시 기록을 다시
      // 초기화하지 않고, 더미 계정과의 제한적 매칭 권한만 복구한다.
      await User.updateOne(
        { _id: accounts.target._id },
        { $set: { arenaTestMatchEnabled: true } }
      );
    }

    await UserNotification.updateOne(
      { dedupeKey: `${accounts.target._id}:${SETUP_VERSION}` },
      {
        $set: {
          href: "/war-of-masters",
          title: "GOAT Arena 배치고사를 시작할 수 있습니다",
          message:
            "29일 학습권 패키지는 유지되며 기존 티어·GP·랭킹은 초기화되었습니다. 배치고사를 완료하면 Unranked에서 테스트 계정과 바로 1대1 매치를 진행할 수 있습니다.",
        },
      }
    );

    const [cycle, accessState, activeStandings, rankingProfiles, placementAttempts, target] =
      await Promise.all([
        AccessCycle.findOne({ userId: accounts.target._id, status: "ACTIVE" })
          .select("division status availableLearningDays paybackScoreDays lockedPaybackScoreDays lockedLearningDays reservedLearningDays")
          .lean(),
        ArenaAccessState.findOne({ userId: accounts.target._id })
          .select("currentCompetitiveDivision state standingId currentSeasonPlacementCompleted defensePoolEligible weeklyMockEligible finalRankingActive reasonCode")
          .lean(),
        ArenaStanding.countDocuments({
          userId: accounts.target._id,
          status: { $in: ["ACTIVE", "LOCKED"] },
        }),
        RankingProfile.countDocuments({ userId: accounts.target._id }),
        AssessmentAttempt.countDocuments({
          userId: accounts.target._id,
          scopeType: "placement",
        }),
        User.findById(accounts.target._id)
          .select("name +arenaTestMatchEnabled")
          .lean(),
      ]);

    console.log(
      JSON.stringify({
        ok: true,
        database: mongoose.connection.name,
        user: target?.name,
        package: "29일 학습권 패키지",
        cycle,
        accessState,
        activeStandings,
        rankingProfiles,
        placementAttempts,
        arenaTestMatchEnabled: Boolean(target?.arenaTestMatchEnabled),
      })
    );
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(async (error) => {
  console.error(error);
  if (mongoose.connection.readyState) await mongoose.disconnect();
  process.exitCode = 1;
});
