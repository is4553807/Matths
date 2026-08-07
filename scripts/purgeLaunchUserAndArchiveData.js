/*
 * 출시 전 사용자·아카이브 정리 도구
 *
 * - 문제은행, 개념, 정책, 상점 상품은 건드리지 않는다.
 * - 명시한 4개 계정만 보존한다.
 * - 실행 전에는 계획만 출력하고, --apply가 있어야 실제 삭제한다.
 */
require("dotenv").config({ path: "config.env" });

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const mongoose = require("mongoose");

const {
  AdminActionLog,
  AdminTodo,
  ArchiveFolder,
  ArchiveItem,
  PrivateMockExam,
  PrivateMockIntegrityCase,
  PrivateMockObjection,
  PrivateMockResource,
  User,
  UserNotification,
} = require("../models/matthsModel");
const { StoreProduct } = require("../models/storeModel");
const {
  ArenaMatch,
  ArenaMatchEvidence,
  ArenaMatchParticipantLock,
  ArenaRevengeRight,
} = require("../models/goatArenaModel");
const { PdfWatermarkIssuance } = require("../models/documentSecurityModel");
const { destroyStoredAsset } = require("../services/fileStorageService");
const {
  purgeUserOwnedData,
  removePrivateAccountData,
  removeUserUploadedFiles,
} = require("../services/accountDeletionService");

const APPLY = process.argv.includes("--apply");
const RETAINED_USERS = Object.freeze([
  { name: "admin", email: "admin@lsbproduction.com", role: "admin" },
  { name: "개수빈", email: "dltnqls7297@naver.com" },
  { name: "sangyoon0807", email: "sangyoonisawesome@gmail.com" },
  { name: "꼰대가르송", email: "playlist0726@gmail.com" },
]);
const LEGACY_ARCHIVE_DIRECTORY = path.resolve(__dirname, "..", "storage", "archive");
const LEGACY_STORE_DIRECTORY = path.resolve(__dirname, "..", "storage", "store");
const LEGACY_STORAGE_ROOT = path.resolve(__dirname, "..", "storage");
const RETIRED_LOCAL_UPLOAD_DIRECTORIES = Object.freeze([
  path.resolve(__dirname, "..", "storage", "arena-evidence"),
  path.resolve(__dirname, "..", "storage", "community"),
  path.resolve(__dirname, "..", "storage", "tmp"),
]);

function userSelector({ name, email, role }) {
  return {
    name,
    email: String(email).toLowerCase(),
    ...(role ? { role } : {}),
  };
}

function idsToStrings(documents) {
  return documents.map((document) => String(document._id));
}

async function listFiles(directory) {
  const entries = await fs.promises.readdir(directory, { withFileTypes: true }).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  const nested = await Promise.all(entries.map(async (entry) => {
    const absolutePath = path.resolve(directory, entry.name);
    if (path.dirname(absolutePath) !== directory) {
      throw new Error(`안전하지 않은 저장소 경로가 감지되었습니다: ${entry.name}`);
    }
    if (entry.isDirectory()) return listFiles(absolutePath);
    return entry.isFile() ? [absolutePath] : [];
  }));
  return nested.flat();
}

async function removeDirectoryIfSafe(directory) {
  const resolved = path.resolve(directory);
  const allowed = [
    LEGACY_ARCHIVE_DIRECTORY,
    LEGACY_STORE_DIRECTORY,
    ...RETIRED_LOCAL_UPLOAD_DIRECTORIES,
  ];
  if (!allowed.includes(resolved)) {
    throw new Error(`허용되지 않은 로컬 저장소 삭제 요청입니다: ${resolved}`);
  }
  await fs.promises.rm(resolved, { recursive: true, force: true });
}

async function removeEmptyLegacyStorageRoot() {
  const entries = await fs.promises.readdir(LEGACY_STORAGE_ROOT).catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (entries === null) return;
  if (entries.length) {
    throw new Error("정리 대상이 아닌 로컬 저장소 항목이 남아 있어 storage 루트를 삭제하지 않았습니다.");
  }
  await fs.promises.rmdir(LEGACY_STORAGE_ROOT);
}

async function resolveRetainedUsers() {
  const retained = [];
  for (const definition of RETAINED_USERS) {
    const users = await User.find(userSelector(definition))
      .select("_id name email role accountStatus")
      .lean();
    assert.equal(
      users.length,
      1,
      `보존 계정 확인 실패: ${definition.name} 계정이 정확히 하나여야 합니다.`
    );
    retained.push(users[0]);
  }
  return retained;
}

async function buildPlan() {
  const retainedUsers = await resolveRetainedUsers();
  const retainedIds = idsToStrings(retainedUsers);
  const users = await User.find({}).select("_id name email role accountStatus").lean();
  const removedUsers = users.filter((user) => !retainedIds.includes(String(user._id)));
  const removedIds = removedUsers.map((user) => user._id);
  const [archiveItems, archiveFolders, protectedArchiveReferenceCounts, localArchiveFiles, localStoreFiles, nonR2StoreAssets] = await Promise.all([
    ArchiveItem.find({}).lean(),
    ArchiveFolder.find({}).lean(),
    Promise.all([
      PrivateMockExam.countDocuments({
        $or: [
          { archiveItemId: { $ne: null } },
          { answerSheetArchiveItemId: { $ne: null } },
        ],
      }),
      PrivateMockResource.countDocuments({ archiveItemId: { $ne: null } }),
    ]),
    listFiles(LEGACY_ARCHIVE_DIRECTORY),
    listFiles(LEGACY_STORE_DIRECTORY),
    StoreProduct.countDocuments({ "assets.storageProvider": { $ne: "R2" } }),
  ]);

  assert.equal(
    protectedArchiveReferenceCounts.reduce((sum, count) => sum + count, 0),
    0,
    "아카이브가 주간 모의고사 또는 공식 자료에 참조되어 있어 안전상 삭제를 중단했습니다."
  );
  assert.equal(
    nonR2StoreAssets,
    0,
    "R2에 이관되지 않은 상점 원본이 있어 로컬 상점 복제본 삭제를 중단했습니다."
  );

  const [relatedMatches, relatedEvidence, relatedLocks, relatedRevenge, directNotifications, directTodos, directLogs, watermarkIssuances] = await Promise.all([
    removedIds.length
      ? ArenaMatch.find({
        $or: [
          { requestInitiatorUserId: { $in: removedIds } },
          { "challenger.userId": { $in: removedIds } },
          { "defender.userId": { $in: removedIds } },
        ],
      }).select("_id").lean()
      : [],
    removedIds.length ? ArenaMatchEvidence.find({ userId: { $in: removedIds } }).select("_id").lean() : [],
    removedIds.length ? ArenaMatchParticipantLock.find({ userId: { $in: removedIds } }).select("_id").lean() : [],
    removedIds.length ? ArenaRevengeRight.find({ $or: [{ eligibleUserId: { $in: removedIds } }, { opponentUserId: { $in: removedIds } }] }).select("_id").lean() : [],
    removedIds.length ? UserNotification.find({ userId: { $in: removedIds } }).select("_id").lean() : [],
    removedIds.length ? AdminTodo.find({ $or: [{ targetUserId: { $in: removedIds } }, { actorUserId: { $in: removedIds } }] }).select("_id").lean() : [],
    removedIds.length ? AdminActionLog.find({ $or: [{ targetUserId: { $in: removedIds } }, { adminUserId: { $in: removedIds } }] }).select("_id").lean() : [],
    removedIds.length ? PdfWatermarkIssuance.find({ userId: { $in: removedIds } }).select("_id").lean() : [],
  ]);

  return {
    retainedUsers,
    removedUsers,
    archiveItems,
    archiveFolders,
    localArchiveFiles,
    localStoreFiles,
    related: {
      matches: relatedMatches,
      evidence: relatedEvidence,
      locks: relatedLocks,
      revengeRights: relatedRevenge,
      notifications: directNotifications,
      todos: directTodos,
      adminLogs: directLogs,
      watermarkIssuances,
    },
  };
}

function summarizePlan(plan) {
  return {
    preservedUsers: plan.retainedUsers.map((user) => ({
      id: String(user._id), name: user.name, role: user.role,
    })),
    removedUsers: plan.removedUsers.map((user) => ({
      id: String(user._id), name: user.name, email: user.email, role: user.role,
    })),
    archiveItems: plan.archiveItems.length,
    archiveFolders: plan.archiveFolders.length,
    legacyLocalArchiveFiles: plan.localArchiveFiles.length,
    legacyLocalStoreCopies: plan.localStoreFiles.length,
    userRelated: Object.fromEntries(
      Object.entries(plan.related).map(([key, documents]) => [key, documents.length])
    ),
  };
}

async function purgeArchiveRecords(plan) {
  const archiveItemIds = plan.archiveItems.map((item) => item._id);
  for (const item of plan.archiveItems) {
    const source = {
      ...item,
      storageProvider: item.storageProvider || (item.r2ObjectKey ? "R2" : ""),
    };
    await destroyStoredAsset(source).catch((error) => {
      if (source.r2ObjectKey || source.cloudPublicId) throw error;
    });
  }
  await Promise.all([
    PdfWatermarkIssuance.deleteMany({ sourceType: "ARCHIVE" }),
    ...(archiveItemIds.length
      ? [
        UserNotification.deleteMany({ sourceId: { $in: archiveItemIds } }),
        AdminTodo.deleteMany({ sourceId: { $in: archiveItemIds } }),
      ]
      : []),
    ArchiveItem.deleteMany({}),
    ArchiveFolder.deleteMany({}),
  ]);
  await removeDirectoryIfSafe(LEGACY_ARCHIVE_DIRECTORY);
}

async function purgeLegacyStoreCopies() {
  await removeDirectoryIfSafe(LEGACY_STORE_DIRECTORY);
  await Promise.all(RETIRED_LOCAL_UPLOAD_DIRECTORIES.map(removeDirectoryIfSafe));
  await removeEmptyLegacyStorageRoot();
}

async function purgeDeletedUsers(plan) {
  const deletedUserIds = plan.removedUsers.map((user) => user._id);
  const relatedMatchIds = plan.related.matches.map((match) => match._id);
  for (const user of plan.removedUsers) {
    await removePrivateAccountData(user._id);
    await removeUserUploadedFiles(user._id);
    await purgeUserOwnedData(user._id);
    await User.deleteOne({ _id: user._id });
  }

  if (!deletedUserIds.length) return;
  await Promise.all([
    AdminActionLog.deleteMany({
      $or: [
        { targetUserId: { $in: deletedUserIds } },
        { adminUserId: { $in: deletedUserIds } },
      ],
    }),
    AdminTodo.deleteMany({
      $or: [
        { targetUserId: { $in: deletedUserIds } },
        { actorUserId: { $in: deletedUserIds } },
        ...(relatedMatchIds.length ? [{ sourceId: { $in: relatedMatchIds } }] : []),
      ],
    }),
    UserNotification.deleteMany(
      relatedMatchIds.length
        ? { $or: [{ userId: { $in: deletedUserIds } }, { sourceId: { $in: relatedMatchIds } }] }
        : { userId: { $in: deletedUserIds } }
    ),
  ]);

  const sessionCollections = (await mongoose.connection.db.listCollections().toArray())
    .map((entry) => entry.name)
    .filter((name) => /^(sessions|session)$/i.test(name));
  const userIdPattern = deletedUserIds.map((id) => String(id).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  if (userIdPattern) {
    await Promise.all(sessionCollections.map((name) => mongoose.connection.db
      .collection(name)
      .deleteMany({ session: { $regex: userIdPattern } })));
  }
}

async function verifyResult() {
  const expectedNames = RETAINED_USERS.map((entry) => entry.name).sort();
  const users = await User.find({}).select("_id name email role").lean();
  const actualNames = users.map((user) => user.name).sort();
  assert.deepEqual(actualNames, expectedNames, "보존 계정 외 사용자 레코드가 남아 있습니다.");
  assert.equal(await ArchiveItem.countDocuments(), 0, "아카이브 파일 DB 레코드가 남아 있습니다.");
  assert.equal(await ArchiveFolder.countDocuments(), 0, "아카이브 폴더 DB 레코드가 남아 있습니다.");
  assert.equal((await listFiles(LEGACY_ARCHIVE_DIRECTORY)).length, 0, "로컬 아카이브 원본이 남아 있습니다.");
  assert.equal((await listFiles(LEGACY_STORE_DIRECTORY)).length, 0, "R2 이관 뒤 남은 로컬 상점 원본이 있습니다.");
  assert.equal(fs.existsSync(LEGACY_STORAGE_ROOT), false, "레거시 storage 디렉터리가 남아 있습니다.");
  assert.ok(await StoreProduct.countDocuments(), "상점 상품은 보존되어야 합니다.");
  return { users: users.map((user) => ({ id: String(user._id), name: user.name, role: user.role })) };
}

async function run() {
  if (!String(process.env.DB || "").trim()) throw new Error("DB 연결 정보가 없습니다.");
  await mongoose.connect(process.env.DB);
  try {
    const plan = await buildPlan();
    console.log(JSON.stringify(summarizePlan(plan), null, 2));
    if (!APPLY) {
      console.log("검토 모드입니다. 실제 삭제는 --apply 옵션으로만 실행됩니다.");
      return;
    }
    await purgeArchiveRecords(plan);
    await purgeLegacyStoreCopies();
    await purgeDeletedUsers(plan);
    const verified = await verifyResult();
    console.log(JSON.stringify({ status: "PURGED", ...verified }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((error) => {
  console.error(`출시 데이터 정리 실패: ${error.message}`);
  process.exitCode = 1;
});
