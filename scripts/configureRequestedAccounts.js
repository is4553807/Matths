const mongoose = require("mongoose");
const dotenv = require("dotenv");

dotenv.config({ path: "config.env" });

const {
  AdminActionLog,
  User,
  UserNotification,
} = require("../models/matthsModel");
const {
  AccessCycle,
  ArenaAccessState,
  ArenaLearningDayLedger,
  ArenaStanding,
} = require("../models/goatArenaModel");
const {
  ADMIN_PACKAGE_TYPES,
  updateAdminPackageAccess,
} = require("../services/adminPackageAccessService");
const {
  kstSeasonKey,
} = require("../services/arenaStandingService");

const TARGET_USERNAME = "sangyoon0807";
const SETUP_VERSION = "ADMIN-MAIN-30D-V1";

function addDays(value, days) {
  return new Date(new Date(value).getTime() + days * 24 * 60 * 60 * 1000);
}

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
      .select("_id name role")
      .lean(),
  ]);
  if (!admin) throw new Error("활성 관리자 계정을 찾을 수 없습니다.");
  if (!target) throw new Error(`${TARGET_USERNAME} 계정을 찾을 수 없습니다.`);
  if (target.role === "admin") {
    throw new Error("대상 계정은 일반 사용자 계정이어야 합니다.");
  }
  return { admin, target };
}

async function hasRequestedState(userId) {
  const [cycle, accessState] = await Promise.all([
    AccessCycle.findOne({ userId, status: "ACTIVE" }).lean(),
    ArenaAccessState.findOne({ userId }).lean(),
  ]);
  return Boolean(
    cycle &&
      cycle.division === "MAIN" &&
      Number(cycle.availableLearningDays) === 30 &&
      Number(cycle.lockedLearningDays) === 0 &&
      Number(cycle.reservedLearningDays) === 0 &&
      accessState?.currentCompetitiveDivision === "MAIN" &&
      accessState?.state === "PAID_ACTIVE"
  );
}

async function ensureLearningPackage({ admin, target, now }) {
  if (await hasRequestedState(target._id)) return;
  await updateAdminPackageAccess({
    adminUserId: admin._id,
    userId: target._id,
    packageType: ADMIN_PACKAGE_TYPES.LEARNING_PACKAGE,
    reason: "요청에 따른 29일 학습권 패키지 및 Ranked 운영 설정",
    now,
  });
}

async function promoteToMainWithThirtyDays({ admin, target, now }) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const cycle = await AccessCycle.findOne({
        userId: target._id,
        status: "ACTIVE",
      }).session(session);
      if (!cycle) throw new Error("대상 사용자의 활성 학습권을 찾을 수 없습니다.");

      const seasonKey = kstSeasonKey(now);
      const existingStanding = await ArenaStanding.findOne({
        userId: target._id,
        division: "MAIN",
        seasonKey,
      }).session(session);
      let standing = existingStanding;
      if (!standing) {
        const bottomBronze = await ArenaStanding.findOne({
          division: "MAIN",
          seasonKey,
          arenaRank: "브론즈",
        })
          .sort({ arenaPosition: -1 })
          .select("arenaPosition")
          .session(session)
          .lean();
        [standing] = await ArenaStanding.create(
          [
            {
              userId: target._id,
              division: "MAIN",
              seasonKey,
              seedPolicyVersion: SETUP_VERSION,
              seededAt: now,
              arenaRank: "브론즈",
              arenaPosition: Number(bottomBronze?.arenaPosition || 0) + 1,
              arenaGp: 0,
              status: "ACTIVE",
              reachedCurrentGpAt: now,
            },
          ],
          { session }
        );
      } else {
        standing.status = "ACTIVE";
        await standing.save({ session });
      }

      await ArenaStanding.updateMany(
        {
          userId: target._id,
          _id: { $ne: standing._id },
          status: { $ne: "ARCHIVED" },
        },
        { $set: { status: "LOCKED" } },
        { session }
      );

      const previousBalance = Number(cycle.availableLearningDays || 0);
      const previousLocked = Number(cycle.lockedLearningDays || 0);
      const previousReserved = Number(cycle.reservedLearningDays || 0);
      cycle.division = "MAIN";
      cycle.availableLearningDays = 30;
      cycle.lockedLearningDays = 0;
      cycle.reservedLearningDays = 0;
      cycle.learningDayBuckets = [
        {
          sourceType: "ADMIN_GRANT",
          availableDays: 30,
          reservedDays: 0,
          lockedDays: 0,
        },
      ];
      cycle.depletedAt = null;
      cycle.baseExpiresAt = addDays(now, 30);
      cycle.expiresAt = addDays(now, 30);
      cycle.evaluationAt = addDays(now, 30);
      await cycle.save({ session });

      await ArenaLearningDayLedger.updateOne(
        { idempotencyKey: `${cycle._id}:${SETUP_VERSION}` },
        {
          $setOnInsert: {
            userId: target._id,
            accessCycleId: cycle._id,
            idempotencyKey: `${cycle._id}:${SETUP_VERSION}`,
            eventType: "ADMIN_ADJUSTMENT",
            availableLearningDaysDelta: 30 - previousBalance,
            paybackScoreDaysDelta: 0,
            lockedLearningDaysDelta: -previousLocked,
            reservedLearningDaysDelta: -previousReserved,
            sourceBucket: "ADMIN_GRANT",
            balanceAfter: {
              availableLearningDays: 30,
              paybackScoreDays: Number(cycle.paybackScoreDays || 0),
              lockedLearningDays: 0,
              reservedLearningDays: 0,
            },
            sourceType: "ADMIN_PACKAGE_MANAGEMENT",
            sourceId: admin._id,
            occurredAt: now,
            metadata: {
              setupVersion: SETUP_VERSION,
              division: "MAIN",
              reason: "요청에 따른 Ranked 승급 및 잔여 학습일 30일 설정",
            },
          },
        },
        { upsert: true, session }
      );

      await ArenaAccessState.updateOne(
        { userId: target._id },
        {
          $set: {
            currentCompetitiveDivision: "MAIN",
            accessCycleId: cycle._id,
            standingId: standing._id,
            state: "PAID_ACTIVE",
            mainAchievementStatus: "ACHIEVED",
            currentSeasonPlacementCompleted: true,
            expiredAt: null,
            renewalGraceDeadline: null,
            defensePoolEligible: true,
            weeklyMockEligible: true,
            finalRankingActive: true,
            integrityStatus: "CLEAR",
            reasonCode: SETUP_VERSION,
          },
        },
        { upsert: true, session }
      );

      await UserNotification.updateOne(
        { userId: target._id, dedupeKey: `${target._id}:${SETUP_VERSION}` },
        {
          $setOnInsert: {
            userId: target._id,
            title: "이용 플랜과 Division이 변경되었습니다",
            message:
              "29일 학습권 패키지가 적용되었고 Ranked 잔여 학습일이 30일로 설정되었습니다.",
            href: "/goat-arena/profile",
            dedupeKey: `${target._id}:${SETUP_VERSION}`,
            sourceType: "ADMIN_PACKAGE_MANAGEMENT",
            sourceId: cycle._id,
            kind: "account",
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
            detail: "29일 학습권 패키지 · Ranked · 잔여 30일 적용",
            metadata: {
              accessCycleId: cycle._id,
              standingId: standing._id,
              seasonKey,
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
  await mongoose.connect(process.env.DB, { serverSelectionTimeoutMS: 10_000 });
  const now = new Date();
  const accounts = await findAccounts();
  const alreadyConfigured = await hasRequestedState(accounts.target._id);
  if (!alreadyConfigured) {
    await ensureLearningPackage({ ...accounts, now });
    await promoteToMainWithThirtyDays({ ...accounts, now });
  }

  const [cycle, accessState, standing] = await Promise.all([
    AccessCycle.findOne({ userId: accounts.target._id, status: "ACTIVE" })
      .select("division status availableLearningDays lockedLearningDays reservedLearningDays")
      .lean(),
    ArenaAccessState.findOne({ userId: accounts.target._id })
      .select("currentCompetitiveDivision state currentSeasonPlacementCompleted")
      .lean(),
    ArenaStanding.findOne({
      userId: accounts.target._id,
      division: "MAIN",
      seasonKey: kstSeasonKey(now),
    })
      .select("division arenaRank arenaPosition arenaGp status")
      .lean(),
  ]);
  console.log(
    JSON.stringify(
      {
        username: accounts.target.name,
        package: "29일 학습권 패키지",
        cycle,
        accessState,
        standing,
        adminAccess: "역할 기반 무기한·무제한",
        changed: !alreadyConfigured,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
