const path = require("path");
const express = require("express");

const app = express();
const projectRoot = path.resolve(__dirname, "../..");
const port = Number(process.env.MATTHS_PREVIEW_PORT) || 4173;

app.set("view engine", "ejs");
app.set("views", path.join(projectRoot, "views"));
app.use(express.static(path.join(projectRoot, "public")));

const user = {
  _id: "promo-user",
  id: "promo-user",
  name: "하준",
  realName: "김하준",
  email: "hajun@example.com",
  role: "student",
  schoolGrade: 10,
  school: {
    code: "promo-school",
    name: "한빛고등학교",
  },
  currentStreak: 12,
  preferences: {
    coachMode: "spicy",
    rankingDisplayMode: "nickname",
  },
};

const dashboardData = {
  notifications: [
    {
      title: "오늘의 복습이 도착했어요",
      description: "완전제곱식 1개념 · 예상 8분",
      href: "#",
      urgent: false,
    },
  ],
  hasUrgentNotification: false,
  activeAnnouncements: [],
  currentLearning: {
    courseTitle: "공통수학1",
    unitTitle: "방정식과 부등식",
    conceptTitle: "이차함수의 최댓값과 최솟값",
    stepTitle: "그래프의 꼭짓점이 이동하는 이유를 확인해요.",
    progress: 68,
    href: "#",
    estimatedMinutes: 9,
    stepLabel: "STEP 3 / 4",
    preview: {
      title: "VISUAL CONCEPT",
      type: "area-model",
      blocks: [
        { label: "x²", tone: "blue" },
        { label: "3x", tone: "violet" },
        { label: "3x", tone: "violet" },
        { label: "9", tone: "light" },
      ],
    },
  },
  todayPlan: {
    progress: 67,
    completedCount: 2,
    totalCount: 3,
    message: "딱 하나만 더 끝내면 오늘 계획 완료!",
    tasks: [
      {
        id: "task-1",
        title: "완전제곱식 복습",
        description: "막힌 Step 2부터 다시 보기",
        estimatedMinutes: 8,
        status: "completed",
        href: "#",
      },
      {
        id: "task-2",
        title: "이차함수 개념 적용",
        description: "확인 문제 4개",
        estimatedMinutes: 12,
        status: "completed",
        href: "#",
      },
      {
        id: "task-3",
        title: "40초 눈풀이",
        description: "2점 기본기 10문제",
        estimatedMinutes: 7,
        status: "pending",
        href: "#",
      },
    ],
  },
  stats: {
    weeklyStudyMinutes: 184,
    weeklyStudyDetail: "지난주보다 32분 ↑",
    correctRate: 78,
    correctRateDetail: "지난주보다 6% ↑",
    totalSolvedProblems: 326,
    weeklySolvedProblems: 54,
    pendingReviewCount: 3,
  },
  weeklyActivity: {
    maxMinutes: 48,
    days: [
      { label: "월", minutes: 24, isToday: false },
      { label: "화", minutes: 42, isToday: false },
      { label: "수", minutes: 18, isToday: false },
      { label: "목", minutes: 36, isToday: false },
      { label: "금", minutes: 48, isToday: false },
      { label: "토", minutes: 16, isToday: false },
      { label: "일", minutes: 32, isToday: true },
    ],
  },
  weakConcepts: [
    {
      rank: 1,
      title: "완전제곱식 변형",
      accuracy: 42,
      unitTitle: "방정식과 부등식",
      urgency: "urgent",
      statusText: "지금 복습",
      href: "#",
    },
    {
      rank: 2,
      title: "이차함수 최솟값",
      accuracy: 58,
      unitTitle: "함수",
      urgency: "warning",
      statusText: "복습 추천",
      href: "#",
    },
  ],
  curriculumCourses: [
    {
      id: "common-math-1",
      title: "공통수학1",
      progress: 68,
      completedConcepts: 13,
      totalConcepts: 19,
    },
    {
      id: "common-math-2",
      title: "공통수학2",
      progress: 21,
      completedConcepts: 4,
      totalConcepts: 20,
    },
  ],
  recentWrongAnswers: [
    {
      score: 3,
      stem: "이차함수 y = x² − 4x + 7의 최솟값",
      reason: "조건 해석 · 꼭짓점 확인 필요",
      href: "#",
    },
    {
      score: 2,
      stem: "완전제곱식의 상수항 구하기",
      reason: "공식 적용 · Step 2 복습",
      href: "#",
    },
  ],
};

app.get("/", (req, res) => {
  res.render("index", { user: null });
});

app.get("/visual-learning", (req, res) => {
  res.render("visual-learning", { user });
});

app.get("/learning-flow", (req, res) => {
  res.render("learning-flow", { user });
});

app.get("/main", (req, res) => {
  res.render("main", { user, dashboardData });
});

app.get("/quick-practice", (req, res) => {
  res.render("quick-practice", {
    user,
    stats: {
      total: 128,
      accuracy: 84,
      averageMs: 21700,
    },
    catalog: {
      scope: "공통수학1·2",
      typeCount: 18,
      variantCount: 72,
      byPoint: [
        {
          points: 2,
          types: [
            {
              label: "기본 계산",
              variants: ["다항식", "방정식", "함수"],
            },
          ],
        },
        {
          points: 3,
          types: [
            {
              label: "조건 적용",
              variants: ["그래프 해석", "최댓값·최솟값"],
            },
          ],
        },
      ],
    },
  });
});

app.get("/community", (req, res) => {
  const board = String(req.query.board || "high-school");
  const selectedSchool =
    board === "school"
      ? {
          code: "promo-school",
          name: "한빛고등학교",
        }
      : null;
  const posts = [
    {
      _id: "post-1",
      title: "급식 먹고 40초 눈풀이 한 판 할 사람",
      content: "점심시간에 2점짜리만 빠르게 돌리는 중. 오늘 최고 기록 31초.",
      schoolName: "한빛고등학교",
      authorName: "익명",
      authorRegion: "서울",
      authorSchoolGrade: 10,
      isAnonymous: true,
      isPopular: true,
      viewCount: 842,
      upvoteCount: 137,
      downvoteCount: 4,
      createdAt: new Date("2026-07-29T03:12:00+09:00"),
    },
    {
      _id: "post-2",
      title: "이번 주 War of GOAT 우리 학교 순위 실화냐",
      content: "일요일 9시 C형까지 보고 다시 올려보자. 한빛고 이번 주는 간다.",
      schoolName: "한빛고등학교",
      authorName: "그래프장인",
      authorRegion: "서울",
      authorSchoolGrade: 11,
      isAnonymous: false,
      isPopular: false,
      viewCount: 516,
      upvoteCount: 89,
      downvoteCount: 2,
      createdAt: new Date("2026-07-29T02:21:00+09:00"),
    },
    {
      _id: "post-3",
      title: "수학 때문에 개빡친 거 나만 그런 거 아니지",
      content: "오늘 틀린 문제는 오답노트에 넣었다. 내일 비슷한 유형으로 복수한다.",
      schoolName: "서린고등학교",
      authorName: "익명",
      authorRegion: "서울",
      authorSchoolGrade: 10,
      isAnonymous: true,
      isPopular: false,
      viewCount: 1204,
      upvoteCount: 244,
      downvoteCount: 8,
      createdAt: new Date("2026-07-28T23:08:00+09:00"),
    },
  ];
  res.render("community", {
    user,
    feedback: null,
    boardData: {
      board,
      boardLabel:
        board === "school"
          ? "한빛고등학교 게시판"
          : board === "math"
            ? "수학 게시판"
            : "통합 고등학교 게시판",
      selectedSchool,
      search: "",
      sort: "latest",
      posts,
      popularPosts: posts.slice(0, 2),
      schoolOptions: [
        { code: "promo-school", name: "한빛고등학교", postCount: 128 },
        { code: "school-2", name: "서린고등학교", postCount: 94 },
      ],
      pagination: {
        total: 486,
        page: 1,
        totalPages: 49,
        hasPrevious: false,
        hasNext: true,
      },
    },
  });
});

app.get("/archive", (req, res) => {
  const now = new Date("2026-07-29T12:00:00+09:00");
  res.render("archive-public", {
    user,
    feedback: null,
    archiveData: {
      isAdmin: false,
      selectedFolder: null,
      breadcrumbs: [],
      folders: [
        {
          id: "folder-1",
          name: "최근 5개년 모의고사",
          description: "학년·월별 문제지와 해설",
          itemCount: 92,
        },
        {
          id: "folder-2",
          name: "학교별 기출",
          description: "학교별 내신 대비 자료",
          itemCount: 48,
        },
        {
          id: "folder-3",
          name: "Matths 주간 모의고사",
          description: "매주 공개된 A·B·C형 시험",
          itemCount: 36,
        },
      ],
      items: [
        {
          id: "archive-1",
          category: "모의고사",
          title: "2026년 7월 Matths 주간 모의고사 해설",
          description: "문제지 · 정답 · 문항별 풀이과정",
          originalName: "matths-weekly-2026-07.pdf",
          sizeBytes: 2840000,
          createdAt: now,
        },
        {
          id: "archive-2",
          category: "기출",
          title: "2025년 고1 전국연합 모의고사 모음",
          description: "문제지와 해설을 월별로 정리했습니다.",
          originalName: "2025-grade10-mock.zip",
          sizeBytes: 9170000,
          createdAt: now,
        },
      ],
    },
  });
});

app.get("/wrong-notes", (req, res) => {
  const items = [
    {
      sourceLabel: "7월 Matths 모의고사 · B형 21번",
      submittedAtLabel: "어제",
      reviewStatus: "pending",
      reviewLabel: "복습 대기",
      scheduledAtLabel: "",
      stem: "이차함수의 최댓값을 구하는 문항",
      courseTitle: "공통수학1",
      unitTitle: "함수",
      conceptTitle: "이차함수",
      difficulty: 4,
      submittedAnswer: "③",
      score: 0,
      maxScore: 4,
      standardCode: "10공수1-02-03",
      conceptHref: "#",
      reviewHref: "#",
      retryAvailable: true,
      isQuickPractice: false,
    },
    {
      sourceLabel: "40초 눈풀이 · 3점",
      submittedAtLabel: "오늘",
      reviewStatus: "scheduled",
      reviewLabel: "내일 리벤지",
      scheduledAtLabel: "7월 30일",
      stem: "완전제곱식의 상수항을 구하는 문항",
      courseTitle: "공통수학1",
      unitTitle: "다항식",
      conceptTitle: "완전제곱식",
      difficulty: 3,
      submittedAnswer: "7",
      score: 0,
      maxScore: 3,
      standardCode: "10공수1-01-02",
      conceptHref: "#",
      reviewHref: "#",
      retryAvailable: true,
      isQuickPractice: true,
    },
  ];
  res.render("wrong-notes", {
    user,
    wrongNoteData: {
      items,
      filters: {
        status: "all",
        course: "",
        search: "",
        sort: "priority",
        page: 1,
      },
      options: {
        courses: [{ id: "common-math-1", title: "공통수학1" }],
      },
      stats: {
        total: 12,
        pending: 4,
        scheduled: 3,
        completed: 5,
        due: 7,
        filtered: 12,
      },
      pagination: {
        currentPage: 1,
        totalPages: 1,
        hasPrevious: false,
        hasNext: false,
      },
    },
  });
});

app.get("/private-mock-exams", (req, res) => {
  const releaseAt = "2026-08-02T15:00:00+09:00";
  res.render("private-mock-exams", {
    user,
    examData: {
      eligibility: {
        allowed: true,
      },
      serverNow: "2026-07-29T12:00:00+09:00",
      nextReleaseAt: releaseAt,
      durationMinutes: 100,
      currentExam: {
        id: "exam-a",
        title: "8월 첫째 주 Matths 사설 모의고사",
        isTest: false,
        formCode: "A",
        questionCount: 30,
        releaseAt,
        attemptStatus: "not_started",
        canEnterRoom: true,
        canStart: false,
        answeredCount: 0,
        lobbyOpensAt: "2026-08-02T14:50:00+09:00",
        href: "#",
      },
      selection: null,
      rankingRules: [
        "일요일 A·B·C형 중 최대 3회 응시",
        "원하는 표준화 성적 하나를 주간 대표 기록으로 선택",
        "실수와 풀이 일관성까지 MMR에 반영",
      ],
      rankingTitle: "7월 넷째 주 랭킹",
      rankingFinalized: true,
      rankingPending: null,
      rankingSummary: {
        participantCount: 812,
        averageScore: 71.4,
      },
      weeklyRanking: [
        {
          rank: 1,
          displayName: "세이지",
          standardizedPerformance: 96,
          attemptCount: 3,
          elapsedLabel: "평균 71분",
        },
        {
          rank: 2,
          displayName: "수리왕",
          standardizedPerformance: 93,
          attemptCount: 2,
          elapsedLabel: "평균 74분",
        },
      ],
    },
  });
});

app.get("/war-of-masters", (req, res) => {
  res.render("war-of-masters", {
    user,
    arenaUser: {
      nickname: "하준",
      displayName: "하준",
      schoolName: "한빛고등학교",
      gradeLabel: "고등학교 1학년",
      displayMode: "닉네임",
    },
    placement: {
      status: "submitted",
      answeredCount: 30,
      ctaHref: "#",
      ctaLabel: "배치 결과 다시 보기",
      result: {
        correctCount: 17,
        initialTier: "실버 2",
        initialRating: 874,
      },
    },
    privateMockEligibility: {
      allowed: true,
      message: "",
      ctaHref: "#",
      ctaLabel: "이번 주 시험 확인",
    },
  });
});

app.get("/war-of-masters/rankings", (req, res) => {
  const current = {
    userId: "promo-user",
    displayName: "하준",
    schoolName: "한빛고등학교",
    schoolCode: "promo-school",
    region: "서울",
    grade: 10,
    tier: "실버",
    division: "2",
    rating: 874,
    rankPoint: 74,
    totalScore: 67,
    overallRank: 483,
    schoolStudentRank: 12,
    schoolRank: 68,
    cityRank: 23,
  };
  const overall = [
    ["rank-1", 1, "세이지", "서린고등학교", "서울", "마스터", "1", 1394, 96, 4212000],
    ["rank-2", 2, "수리왕", "한빛고등학교", "서울", "다이아몬드", "2", 1298, 93, 4380000],
    ["rank-3", 3, "루트킴", "미래고등학교", "부산", "다이아몬드", "3", 1256, 91, 4475000],
    ["rank-482", 482, "등차수열", "도담고등학교", "서울", "실버", "2", 876, 68, 5920000],
    ["promo-user", 483, "하준", "한빛고등학교", "서울", "실버", "2", 874, 67, 6010000],
  ].map(([userId, rank, displayName, schoolName, region, tier, division, rating, totalScore, elapsedTimeMs]) => ({
    userId,
    rank,
    displayName,
    schoolName,
    region,
    tier,
    division,
    rating,
    totalScore,
    elapsedTimeMs,
  }));
  res.render("war-of-masters-rankings", {
    user,
    ranking: {
      current,
      cohortSize: 812,
      overall,
      sameSchool: [
        { ...overall[1], rank: 1, grade: 10 },
        { ...overall[4], rank: 12, grade: 10 },
      ],
      schools: [
        {
          id: "school-1",
          rank: 1,
          name: "서린고등학교",
          region: "서울",
          rating: 1184,
          participantCount: 18,
          bestRating: 1394,
        },
        {
          id: "promo-school",
          rank: 68,
          name: "한빛고등학교",
          region: "서울",
          rating: 936,
          participantCount: 24,
          bestRating: 1298,
        },
      ],
      cities: [
        {
          id: "서울",
          rank: 1,
          name: "서울",
          rating: 1018,
          participantCount: 286,
          bestRating: 1394,
        },
      ],
    },
  });
});

app.listen(port, "127.0.0.1", () => {
  console.log(`Matths promo preview: http://127.0.0.1:${port}`);
});
