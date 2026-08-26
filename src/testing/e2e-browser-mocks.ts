import questionnaire from "../../content/learner-profile/questionnaire-v2.json";
import generatedLessonTemplate from "../../content/lessons/01-peppas-high-ball.json";

type RecorderHandler<TEvent extends Event> = ((event: TEvent) => void) | null;

const MOCK_AUDIO_DELAY_MS = 200;
const MOCK_FEEDBACK_AUDIO_DELAY_MS = 5000;
const MOCK_RECORDING_DELAY_MS = 5000;
const playedAudioSources: string[] = [];
const createdObjectUrls: string[] = [];
const revokedObjectUrls: string[] = [];
let audioContextDoubleCloses = 0;
const DEFAULT_SCENARIO = "correct";
const E2E_SCENARIOS = new Set(["correct", "incorrect", "no-speech"]);
const E2E_DUB_SCENARIOS = new Set([
  "audio-fetch-failed",
  "almost-complete",
  "both-source-failed",
  "corrupt-line-5",
  "delete-failed",
  "delete-held",
  "empty",
  "load-held",
  "multiple-source-failed",
  "not-granted",
  "partial",
  "complete",
  "playback-setup-failed",
  "reset-delete-failed",
  "reset-delete-lost-response",
  "reset-interrupted",
  "revoking",
  "upload-failed",
  "upload-retry-held",
  "upload-rejected",
  "verse-fetch-failed",
]);
const E2E_DUB_LINE_IDS = Array.from(
  { length: 24 },
  (_, index) => `line-${index + 1}` as `line-${number}`,
);
const E2E_DUB_API = "/api/dubs/five-little-ducks-v2";
const E2E_DUB_RECORDED_AT = "2026-08-25T10:00:00.000Z";
const E2E_LESSON_REVISION = "a".repeat(64);
const E2E_DUB_CONSENT_VERSION = "guardian-voice-r2-v2";
const E2E_DUB_SCENARIO_KEY = "parrot-e2e-dub:active-scenario";
const E2E_MICROPHONE_SCENARIOS = new Set(["delayed", "denied", "unsupported"]);
const E2E_LESSON_SCENARIO = new URL(window.location.href).searchParams.get(
  "parrotE2eLesson",
);
type E2ELessonCue = {
  endedAt: number | null;
  kind: "device" | "static";
  startedAt: number;
  text: string;
  volume: number;
};
type E2ELessonUpload = {
  attempt: number;
  lessonId: string;
  outcome:
    | "failed"
    | "held"
    | "learner_selection_changed"
    | "lesson_changed"
    | "recording_disabled"
    | "saved";
  expectedLearnerProfileId: string | null;
  revision: string | null;
  sceneIndex: number;
  size: number;
  source: "my" | "parrot";
  stepIndex: number;
  type: string;
};
type PendingLessonPlayback = {
  cancel: () => void;
  fail: () => void;
  finish: () => void;
};
type PendingLessonUpload = {
  persist: () => void;
  record: E2ELessonUpload;
  reject: (error: unknown) => void;
  resolve: (response: Response) => void;
};
type LessonRecordingMockScope = {
  consentRequested: () => void;
  isEnabled: () => boolean;
  learnerProfileId?: () => string | null;
  pendingUploads: PendingLessonUpload[];
  persist: () => void;
  uploads: E2ELessonUpload[];
};
type ScopedLessonRecordingMedia = {
  rejectNextUpload: () => boolean;
  resolveNextUpload: () => boolean;
  snapshot: () => {
    consentRequests: number;
    pendingUploads: number;
    uploads: E2ELessonUpload[];
  };
};
const lessonMediaMetrics = {
  consentRequests: 0,
  cueCancellations: 0,
  cues: [] as E2ELessonCue[],
  evaluateRequests: 0,
  getUserMediaCalls: 0,
  nextRecorderId: 0,
  recorderStarts: [] as Array<{ id: number; startedAt: number }>,
  recorderStops: [] as Array<{ id: number; stoppedAt: number }>,
  stoppedTracks: 0,
  uploads: [] as E2ELessonUpload[],
};
const pendingLessonPlayback: PendingLessonPlayback[] = [];
const pendingLessonUploads: PendingLessonUpload[] = [];
let scopedLessonRecordingMedia: ScopedLessonRecordingMedia | null = null;
const E2E_PROFILE_ACKNOWLEDGMENT_SCENARIO = "acknowledgment";
const E2E_PROFILE_LONG_ACKNOWLEDGMENT_SCENARIO = "long-acknowledgment";
const E2E_PROFILE_RESUME_SCENARIO = "viewport-resume";
const E2E_PROFILE_VIEWPORT_SCENARIO = "viewport-stability";
const E2E_PROFILE_OPERATION_SCENARIO = "held";
const E2E_GUARDIAN_PASSWORD = "e2e-guardian-password";
const E2E_GUARDIAN_ACCESS_TTL_MS = 15 * 60 * 1000;
const E2E_EXPIRED_ACCESS_DELAY_MS = 2_000;
const E2E_GUARDIAN_SCENARIO_KEY = "parrot-e2e-guardian:active-scenario";
const E2E_GUARDIAN_SCENARIOS = new Set([
  "learner",
  "guardian",
  "unlock-error",
  "lock-error",
  "expired",
]);
const E2E_PROFILE_VISUAL_PHASES = new Set([
  "listening",
  "opening",
  "ready",
  "thinking",
  "writing",
]);
const E2E_LONG_ACKNOWLEDGMENT =
  "Mia, that is a lovely answer! Peppa is happy to know you, and she cannot wait to hear about your favourite games, animals, stories, songs, and silly dances too!";
const E2E_SAVED_ACKNOWLEDGMENT_AUDIO = {
  id: "peppa-thank-you",
  src: "/assets/audio/peppa-thank-you.mp3",
  text: "Thank you!",
};
const E2E_PROFILE_SCENARIOS = new Set([
  E2E_PROFILE_ACKNOWLEDGMENT_SCENARIO,
  E2E_PROFILE_LONG_ACKNOWLEDGMENT_SCENARIO,
  E2E_PROFILE_RESUME_SCENARIO,
  E2E_PROFILE_VIEWPORT_SCENARIO,
]);
const E2E_LEARNER_SCENARIOS = new Set([
  "multiple",
  "selection-required",
  "select-error",
  "create-error",
  "stale-selection",
  "zero-learners",
]);
const E2E_LEARNER_SCENARIO_KEY = "parrot-e2e-learners:active-scenario";
const E2E_LEARNER_SESSION_KEY = "parrot-e2e-learners:active-session";
const E2E_LEARNER_ACCOUNT_KEY_PREFIX = "parrot-e2e-learners:account";
const E2E_STORY_ART_CONSENT_VERSION = "guardian-photo-cloudflare-v1";

const E2E_INCOMPLETE_PROFILE = {
  canBypass: false,
  experienceMode: "form",
  mode: "full",
  profile: {
    id: "e2e-learner",
    age: null,
    answers: {
      legacyAnswers: null,
      questionnaireVersion: 2,
      responses: {},
      schemaVersion: 2,
    },
    completedAt: null,
    currentQuestionKey: "name",
    description: null,
    name: null,
    profileStatus: "not_started",
    questionnaireVersion: 2,
  },
  progress: { answered: 0, current: 1, total: 1 },
  question: {
    answerKey: "name",
    audio: null,
    maxLength: 120,
    position: 1,
    promptEn: "What's your name?",
    promptZh: null,
    required: true,
  },
  questionnaire: { version: 2 },
};

const E2E_COMPLETED_PROFILE_WITH_ACKNOWLEDGMENT = {
  ...E2E_INCOMPLETE_PROFILE,
  acknowledgment: {
    audio: E2E_SAVED_ACKNOWLEDGMENT_AUDIO,
    text: "Thank you!",
  },
  canBypass: true,
  profile: {
    ...E2E_INCOMPLETE_PROFILE.profile,
    answers: {
      ...E2E_INCOMPLETE_PROFILE.profile.answers,
      responses: { name: "Mia" },
    },
    completedAt: "2026-07-10T08:00:00.000Z",
    currentQuestionKey: null,
    name: "Mia",
    profileStatus: "completed",
    storyLevel: "first-words",
  },
  progress: { answered: 1, current: 1, total: 1 },
  question: null,
};

const E2E_COMPLETED_PROFILE_WITH_LONG_ACKNOWLEDGMENT = {
  ...E2E_COMPLETED_PROFILE_WITH_ACKNOWLEDGMENT,
  acknowledgment: {
    audio: null,
    text: E2E_LONG_ACKNOWLEDGMENT,
  },
};

const E2E_VIEWPORT_QUESTIONS = questionnaire.questions.map((question) => ({
  answerKey: question.answerKey,
  audio: {
    id: question.audioId,
    src: `/assets/audio/${question.audioId}.mp3`,
    text: question.promptEn,
  },
  maxLength: question.maxLength,
  position: question.position,
  promptEn: question.promptEn,
  promptZh: question.promptZh,
  required: question.required,
}));

const E2E_VIEWPORT_INCOMPLETE_PROFILE = {
  ...E2E_INCOMPLETE_PROFILE,
  progress: { answered: 0, current: 1, total: 6 },
  question: E2E_VIEWPORT_QUESTIONS[0],
};

const E2E_VIEWPORT_PROFILE_AFTER_NAME = {
  ...E2E_VIEWPORT_INCOMPLETE_PROFILE,
  acknowledgment: {
    audio: E2E_SAVED_ACKNOWLEDGMENT_AUDIO,
    text: "Thank you!",
  },
  profile: {
    ...E2E_VIEWPORT_INCOMPLETE_PROFILE.profile,
    answers: {
      ...E2E_VIEWPORT_INCOMPLETE_PROFILE.profile.answers,
      responses: {
        name: {
          acknowledgment: "Thank you!",
          answeredAt: "2026-07-10T08:00:00.000Z",
          enrichmentStatus: "generated",
          question: E2E_VIEWPORT_QUESTIONS[0].promptEn,
          rawAnswer: "Mia",
          summary: "Mia",
        },
      },
    },
    currentQuestionKey: "age",
    name: "Mia",
    profileStatus: "in_progress",
  },
  progress: { answered: 1, current: 2, total: 6 },
  question: E2E_VIEWPORT_QUESTIONS[1],
};

const E2E_VIEWPORT_RESUMED_PROFILE = {
  canBypass: E2E_VIEWPORT_PROFILE_AFTER_NAME.canBypass,
  experienceMode: E2E_VIEWPORT_PROFILE_AFTER_NAME.experienceMode,
  mode: E2E_VIEWPORT_PROFILE_AFTER_NAME.mode,
  profile: E2E_VIEWPORT_PROFILE_AFTER_NAME.profile,
  progress: E2E_VIEWPORT_PROFILE_AFTER_NAME.progress,
  question: E2E_VIEWPORT_PROFILE_AFTER_NAME.question,
  questionnaire: E2E_VIEWPORT_PROFILE_AFTER_NAME.questionnaire,
};

const E2E_VIEWPORT_RAW_ANSWERS = [
  "Mia",
  "8",
  "Bluey",
  "pandas",
  "drawing",
  "animal stories",
];

const E2E_VIEWPORT_COMPLETED_RESPONSES = Object.fromEntries(
  E2E_VIEWPORT_QUESTIONS.map((question, index) => {
    const answer = E2E_VIEWPORT_RAW_ANSWERS[index];
    return [
      question.answerKey,
      {
        acknowledgment: "Thank you!",
        answeredAt: "2026-07-10T08:00:00.000Z",
        enrichmentStatus: "generated",
        question: question.promptEn,
        rawAnswer: answer,
        summary: answer,
      },
    ];
  }),
);

const E2E_VIEWPORT_EDITOR_PROFILE = {
  ...E2E_VIEWPORT_PROFILE_AFTER_NAME.profile,
  age: 8,
  answers: {
    ...E2E_VIEWPORT_PROFILE_AFTER_NAME.profile.answers,
    responses: E2E_VIEWPORT_COMPLETED_RESPONSES,
  },
  completedAt: "2026-07-10T08:00:00.000Z",
  currentQuestionKey: null,
  profileStatus: "completed",
  storyLevel: "first-words",
};

const E2E_VIEWPORT_EDITOR_GATE = {
  canBypass: true,
  experienceMode: "form",
  mode: "full",
  profile: E2E_VIEWPORT_EDITOR_PROFILE,
  progress: { answered: 6, current: 6, total: 6 },
  question: null,
  questionnaire: { version: 2 },
};

const E2E_VIEWPORT_EDITOR_STATE = {
  profile: {
    ...E2E_VIEWPORT_EDITOR_PROFILE,
    lessonRecordingCleanupPending: false,
    lessonRecordingConsent: false,
  },
  questions: E2E_VIEWPORT_QUESTIONS,
};

type MockLearnerScenario =
  | "create-error"
  | "multiple"
  | "select-error"
  | "selection-required"
  | "stale-selection"
  | "zero-learners";

const LEARNER_PROFILE_TARGET_QUERY_KEY = "learnerProfileId";
const MAX_LEARNER_PROFILE_ID_BYTES = 128;
const TARGETABLE_LEARNER_PROFILE_PATHS = new Set([
  "/api/learner-profile",
  "/api/learner-profile/answer",
  "/api/learner-profile/complete",
  "/api/learner-profile/question/skip",
  "/api/learner-profile/skip",
  "/api/learner-profile/transcribe",
  "/api/profile",
  "/api/profile/lesson-recording-consent",
  "/api/profile/preferences",
]);

function isTargetableLearnerPath(pathname: string) {
  return (
    TARGETABLE_LEARNER_PROFILE_PATHS.has(pathname) ||
    pathname === "/api/lesson-recordings/consent" ||
    lessonRecordingSlot(new URL(pathname, window.location.origin)) !== null ||
    pathname === "/api/lessons/my" ||
    /^\/api\/lessons\/my\/[^/]+$/.test(pathname) ||
    pathname === E2E_DUB_API ||
    pathname === `${E2E_DUB_API}/consent` ||
    /^\/api\/dubs\/five-little-ducks-v2\/lines\/line-(?:[1-9]|1[0-9]|2[0-4])(?:\/audio)?$/.test(
      pathname,
    ) ||
    /^\/api\/stories\/[^/]+\/personalized-art(?:\/asset)?$/.test(pathname)
  );
}

function hasExplicitLearnerTarget(url: URL) {
  return (
    url.origin === window.location.origin &&
    isTargetableLearnerPath(url.pathname) &&
    url.searchParams.has(LEARNER_PROFILE_TARGET_QUERY_KEY)
  );
}

function singletonUnsupportedTargetMethodResponse(
  url: URL,
  method: string,
) {
  const pathname = url.pathname;
  let allowedMethods: readonly string[] | null = null;
  let notFoundForUnsupportedMethod = false;

  if (pathname === "/api/learner-profile") allowedMethods = ["GET"];
  else if (pathname === "/api/learner-profile/answer") {
    allowedMethods = ["PUT"];
  } else if (
    pathname === "/api/learner-profile/complete" ||
    pathname === "/api/learner-profile/question/skip" ||
    pathname === "/api/learner-profile/skip" ||
    pathname === "/api/learner-profile/transcribe"
  ) {
    allowedMethods = ["POST"];
  } else if (pathname === "/api/profile") {
    allowedMethods = ["GET", "PUT"];
  } else if (
    pathname === "/api/profile/lesson-recording-consent" ||
    pathname === "/api/profile/preferences"
  ) {
    allowedMethods = ["PUT"];
  } else if (pathname === "/api/lesson-recordings/consent") {
    allowedMethods = ["GET"];
  } else if (lessonRecordingSlot(url) !== null) {
    allowedMethods = ["PUT"];
  } else if (pathname === E2E_DUB_API) {
    allowedMethods = ["GET", "DELETE"];
  } else if (pathname === `${E2E_DUB_API}/consent`) {
    allowedMethods = ["PUT"];
  } else if (
    /^\/api\/dubs\/five-little-ducks-v2\/lines\/line-(?:[1-9]|1[0-9]|2[0-4])\/audio$/.test(
      pathname,
    )
  ) {
    allowedMethods = ["GET"];
  } else if (
    /^\/api\/dubs\/five-little-ducks-v2\/lines\/line-(?:[1-9]|1[0-9]|2[0-4])$/.test(
      pathname,
    )
  ) {
    allowedMethods = ["PUT"];
  } else if (pathname === "/api/lessons/my") {
    allowedMethods = ["GET", "POST"];
    notFoundForUnsupportedMethod = true;
  } else if (pathname === "/api/lessons/my/generate") {
    allowedMethods = ["POST"];
    notFoundForUnsupportedMethod = true;
  } else if (/^\/api\/lessons\/my\/[^/]+$/.test(pathname)) {
    allowedMethods = ["GET", "PUT"];
    notFoundForUnsupportedMethod = true;
  } else if (/^\/api\/stories\/[^/]+\/personalized-art\/asset$/.test(pathname)) {
    allowedMethods = ["GET"];
    notFoundForUnsupportedMethod = true;
  } else if (/^\/api\/stories\/[^/]+\/personalized-art$/.test(pathname)) {
    allowedMethods = ["GET", "POST", "DELETE"];
    notFoundForUnsupportedMethod = true;
  }

  if (allowedMethods === null || allowedMethods.includes(method)) return null;
  const status = notFoundForUnsupportedMethod ? 404 : 405;
  const error = notFoundForUnsupportedMethod ? "not_found" : "method_not_allowed";
  return pathname.startsWith("/api/dubs/")
    ? e2eDubJson({ error }, status)
    : e2eJson({ error }, status);
}

function parseExplicitLearnerTarget(url: URL) {
  const values = url.searchParams.getAll(LEARNER_PROFILE_TARGET_QUERY_KEY);
  if (values.length !== 1) return null;
  const profileId = values[0]!;
  if (
    profileId.trim() === "" ||
    new TextEncoder().encode(profileId).byteLength >
      MAX_LEARNER_PROFILE_ID_BYTES
  ) {
    return null;
  }
  return profileId;
}

function targetedLearnerNotFound() {
  return e2eJson({ error: "not_found" }, 404);
}

type MockLearnerProfile = {
  age: number | null;
  answers: {
    legacyAnswers: Record<string, unknown> | null;
    questionnaireVersion: number;
    responses: Record<string, unknown>;
    schemaVersion: 2;
  };
  completedAt: string | null;
  currentQuestionKey: string | null;
  description: string | null;
  id: string;
  name: string;
  profileStatus: "completed" | "in_progress" | "not_started";
  questionnaireVersion: number;
  storyLevel:
    "early-a1" | "first-words" | "repeating-patterns" | "tiny-stories";
};

type MockLessonDescriptor = {
  createdAt: string;
  id: string;
  lesson: unknown;
  revision: string;
  source: "generated" | "uploaded";
  updatedAt: string;
};

type MockStoryArtState = {
  hasStoredArt: boolean;
  updatedAt: string | null;
};

type MockDubState = {
  consentState: "granted" | "not_granted" | "revoking";
  savedLineIds: string[];
};

type MockLessonRecordingState = {
  cleanupPending: boolean;
  consent: boolean;
  consentRequests: number;
  uploads: E2ELessonUpload[];
};

type MockLearnerState = {
  art: Map<string, MockStoryArtState>;
  conversationIds: Set<string>;
  createdAt: string;
  dub: MockDubState;
  lessonRecording: MockLessonRecordingState;
  lessons: Map<string, MockLessonDescriptor>;
  profile: MockLearnerProfile;
};

type MockAccountState = {
  activeProfileId: string | null;
  learners: Map<string, MockLearnerState>;
};

type StoredMockLearnerState = Omit<
  MockLearnerState,
  "art" | "conversationIds" | "lessons"
> & {
  art: Array<[string, MockStoryArtState]>;
  conversationIds: string[];
  lessons: Array<[string, MockLessonDescriptor]>;
};

type StoredMockAccountState = {
  activeProfileId: string | null;
  learners: Array<[string, StoredMockLearnerState]>;
};

function getE2eLearnerScenario(): MockLearnerScenario | null {
  const requested = new URL(window.location.href).searchParams.get(
    "parrotE2eLearners",
  );
  if (requested && E2E_LEARNER_SCENARIOS.has(requested)) {
    sessionStorage.setItem(E2E_LEARNER_SCENARIO_KEY, requested);
    return requested as MockLearnerScenario;
  }
  const persisted = sessionStorage.getItem(E2E_LEARNER_SCENARIO_KEY);
  return persisted && E2E_LEARNER_SCENARIOS.has(persisted)
    ? (persisted as MockLearnerScenario)
    : null;
}

function getE2eLearnerSessionId() {
  const requested = new URL(window.location.href).searchParams.get(
    "parrotE2eSession",
  );
  if (requested) {
    sessionStorage.setItem(E2E_LEARNER_SESSION_KEY, requested);
    return requested;
  }
  return sessionStorage.getItem(E2E_LEARNER_SESSION_KEY) ?? "e2e-session";
}

function mockQuestion(answerKey: string) {
  const question = questionnaire.questions.find(
    (candidate) => candidate.answerKey === answerKey,
  );
  if (!question) return null;
  return {
    answerKey: question.answerKey,
    audio: {
      id: question.audioId,
      src: `/assets/audio/${question.audioId}.mp3`,
      text: question.promptEn,
    },
    maxLength: question.maxLength,
    position: question.position,
    promptEn: question.promptEn,
    promptZh: question.promptZh,
    required: question.required,
  };
}

function mockQuestions() {
  return questionnaire.questions.map((question) =>
    mockQuestion(question.answerKey)!,
  );
}

function createMockProfile(
  id: string,
  name: string,
  age: number | null,
  completed: boolean,
): MockLearnerProfile {
  return {
    age,
    answers: {
      legacyAnswers: null,
      questionnaireVersion: 2,
      responses: completed
        ? {
            name: {
              acknowledgment: "Thank you!",
              answeredAt: E2E_DUB_RECORDED_AT,
              enrichmentStatus: "generated",
              question: "Hi! I'm Peppa. What's your name?",
              rawAnswer: name,
              summary: name,
            },
          }
        : {},
      schemaVersion: 2,
    },
    completedAt: completed ? E2E_DUB_RECORDED_AT : null,
    currentQuestionKey: completed ? null : "name",
    description: null,
    id,
    name,
    profileStatus: completed ? "completed" : "not_started",
    questionnaireVersion: 2,
    storyLevel: "first-words",
  };
}

function createMockLearner(
  id: string,
  name: string,
  age: number | null,
  createdAt: string,
  completed = true,
): MockLearnerState {
  return {
    art: new Map(),
    conversationIds: new Set(),
    createdAt,
    dub: { consentState: "not_granted", savedLineIds: [] },
    lessonRecording: {
      cleanupPending: false,
      consent: false,
      consentRequests: 0,
      uploads: [],
    },
    lessons: new Map(),
    profile: createMockProfile(id, name, age, completed),
  };
}

function initialMockAccountState(
  scenario: MockLearnerScenario,
): MockAccountState {
  if (scenario === "zero-learners") {
    return { activeProfileId: null, learners: new Map() };
  }
  const learners = new Map<string, MockLearnerState>([
    [
      "learner-mia",
      createMockLearner("learner-mia", "Mia", 8, "2026-08-01T08:00:00.000Z"),
    ],
    [
      "learner-noah",
      createMockLearner("learner-noah", "Noah", 10, "2026-08-02T08:00:00.000Z"),
    ],
  ]);
  return {
    activeProfileId: scenario === "selection-required" ? null : "learner-mia",
    learners,
  };
}

function storeMockAccountState(
  state: MockAccountState,
): StoredMockAccountState {
  return {
    activeProfileId: state.activeProfileId,
    learners: [...state.learners].map(([id, learner]) => [
      id,
      {
        ...learner,
        art: [...learner.art],
        conversationIds: [...learner.conversationIds],
        lessons: [...learner.lessons],
      },
    ]),
  };
}

function restoreMockAccountState(
  state: StoredMockAccountState,
): MockAccountState {
  return {
    activeProfileId: state.activeProfileId,
    learners: new Map(
      state.learners.map(([id, learner]) => [
        id,
        {
          ...learner,
          art: new Map(learner.art),
          conversationIds: new Set(learner.conversationIds),
          lessonRecording: {
            cleanupPending:
              learner.lessonRecording?.cleanupPending === true,
            consent: learner.lessonRecording?.consent === true,
            consentRequests: Number.isSafeInteger(
              learner.lessonRecording?.consentRequests,
            )
              ? learner.lessonRecording.consentRequests
              : 0,
            uploads: Array.isArray(learner.lessonRecording?.uploads)
              ? learner.lessonRecording.uploads
              : [],
          },
          lessons: new Map(learner.lessons),
        },
      ]),
    ),
  };
}

function isStoredMockAccountState(
  value: unknown,
): value is StoredMockAccountState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<StoredMockAccountState>;
  return (
    (candidate.activeProfileId === null ||
      typeof candidate.activeProfileId === "string") &&
    Array.isArray(candidate.learners)
  );
}

function createE2eLearnerAccount(
  scenario: MockLearnerScenario,
  sessionId: string,
) {
  const storageKey = `${E2E_LEARNER_ACCOUNT_KEY_PREFIX}:${scenario}:${sessionId}`;
  let state = initialMockAccountState(scenario);
  function restoreStoredState(saved: string | null) {
    if (!saved) return;
    try {
      const parsed: unknown = JSON.parse(saved);
      if (isStoredMockAccountState(parsed))
        state = restoreMockAccountState(parsed);
    } catch {
      // Use the deterministic initial account when stored test state is corrupt.
    }
  }
  restoreStoredState(localStorage.getItem(storageKey));
  window.addEventListener("storage", (event) => {
    if (event.key === storageKey) restoreStoredState(event.newValue);
  });

  let heldSelection: {
    resolve: (response: Response) => void;
    response: Response;
  } | null = null;
  let failNextLearnerProfileLoad = false;
  let learnerProfileLoadFailures = 0;
  const pendingLessonUploadsByLearner = new Map<
    string,
    PendingLessonUpload[]
  >();
  let staleSelectionUsed = false;

  function persist() {
    localStorage.setItem(
      storageKey,
      JSON.stringify(storeMockAccountState(state)),
    );
  }

  function roster() {
    return {
      activeProfileId: state.activeProfileId,
      profiles: [...state.learners.values()].map(({ createdAt, profile }) => ({
        age: profile.age,
        createdAt,
        id: profile.id,
        name: profile.name,
        profileStatus: profile.profileStatus,
      })),
    };
  }

  function selectedLearner() {
    return state.activeProfileId
      ? (state.learners.get(state.activeProfileId) ?? null)
      : null;
  }

  function selectionRequired() {
    return e2eJson(
      {
        error: "learner_selection_required",
        message: "Ask a grown-up to choose a learner.",
      },
      409,
    );
  }

  function requestLearner(explicitLearner: MockLearnerState | null) {
    return explicitLearner ?? selectedLearner() ?? selectionRequired();
  }

  function fullProfileState(learner: MockLearnerState) {
    const answered = Object.keys(learner.profile.answers.responses).length;
    const question = learner.profile.currentQuestionKey
      ? mockQuestion(learner.profile.currentQuestionKey)
      : null;
    return {
      canBypass: learner.profile.profileStatus === "completed",
      experienceMode:
        learner.profile.profileStatus === "completed" &&
        getE2eProfileScenario() !== E2E_PROFILE_VIEWPORT_SCENARIO
          ? "realtime"
          : "form",
      mode: "full",
      profile: learner.profile,
      progress: {
        answered,
        current: question?.position ?? questionnaire.questions.length,
        total: questionnaire.questions.length,
      },
      question,
      questionnaire: { version: questionnaire.version },
    };
  }

  function profileEditorState(learner: MockLearnerState) {
    return {
      profile: {
        ...learner.profile,
        lessonRecordingCleanupPending:
          learner.lessonRecording.cleanupPending,
        lessonRecordingConsent: learner.lessonRecording.consent,
      },
      questions: mockQuestions(),
    };
  }

  function updateAnswer(
    learner: MockLearnerState,
    answerKey: string,
    raw: string,
  ) {
    const value = raw.normalize("NFKC").trim();
    const questionIndex = questionnaire.questions.findIndex(
      (question) => question.answerKey === answerKey,
    );
    if (questionIndex < 0) return false;
    learner.profile.answers.responses[answerKey] = {
      acknowledgment: "Thank you!",
      answeredAt: E2E_DUB_RECORDED_AT,
      enrichmentStatus: "generated",
      question: questionnaire.questions[questionIndex]!.promptEn,
      rawAnswer: value,
      summary: value,
    };
    if (answerKey === "name" && value) learner.profile.name = value;
    if (answerKey === "age" && /^\d+$/.test(value)) {
      learner.profile.age = Number.parseInt(value, 10);
    }
    const next = questionnaire.questions[questionIndex + 1];
    learner.profile.currentQuestionKey = next?.answerKey ?? null;
    learner.profile.profileStatus = next ? "in_progress" : "completed";
    learner.profile.completedAt = next ? null : E2E_DUB_RECORDED_AT;
    persist();
    return true;
  }

  async function jsonBody(request: Request) {
    try {
      return (await request.clone().json()) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  function dubStatus(learner: MockLearnerState) {
    const saved = new Set(learner.dub.savedLineIds);
    return {
      complete:
        learner.dub.consentState === "granted" &&
        E2E_DUB_LINE_IDS.every((id) => saved.has(id)),
      consentState: learner.dub.consentState,
      dubId: "five-little-ducks-v2",
      guardianConsentVersion: E2E_DUB_CONSENT_VERSION,
      lines: E2E_DUB_LINE_IDS.map((id) => ({
        id,
        recordedAt: saved.has(id) ? E2E_DUB_RECORDED_AT : null,
        saved: learner.dub.consentState === "granted" && saved.has(id),
      })),
      recordingEnabled: learner.dub.consentState === "granted",
    };
  }

  async function handleDub(
    url: URL,
    method: string,
    request: Request,
    explicitLearner: MockLearnerState | null,
  ) {
    if (!url.pathname.startsWith("/api/dubs/")) return null;
    const resolvedLearner = requestLearner(explicitLearner);
    if (resolvedLearner instanceof Response) return resolvedLearner;
    const learner = resolvedLearner;

    if (url.pathname === `${E2E_DUB_API}/consent`) {
      if (method !== "PUT")
        return e2eDubJson({ error: "method_not_allowed" }, 405);
      if (currentGuardianAccess().mode !== "guardian") {
        return e2eDubJson({ error: "guardian_required" }, 403);
      }
      const body = await jsonBody(request);
      if (
        body.accepted !== true ||
        body.consentVersion !== E2E_DUB_CONSENT_VERSION
      ) {
        return e2eDubJson({ error: "invalid_request" }, 400);
      }
      learner.dub.consentState = "granted";
      persist();
      return new Response(null, { status: 204 });
    }

    if (url.pathname === E2E_DUB_API) {
      if (method === "GET") return e2eDubJson(dubStatus(learner));
      if (method === "DELETE") {
        if (currentGuardianAccess().mode !== "guardian") {
          return e2eDubJson({ error: "guardian_required" }, 403);
        }
        learner.dub = { consentState: "not_granted", savedLineIds: [] };
        persist();
        return new Response(null, { status: 204 });
      }
    }

    const line = url.pathname.match(
      /^\/api\/dubs\/five-little-ducks-v2\/lines\/(line-(?:[1-9]|1[0-9]|2[0-4]))(\/audio)?$/,
    );
    if (!line) return e2eDubJson({ error: "not_found" }, 404);
    if (learner.dub.consentState !== "granted") {
      return e2eDubJson({ error: "dubbing_not_enabled" }, 403);
    }
    const [, lineId, audio] = line;
    if (method === "GET" && audio) {
      return learner.dub.savedLineIds.includes(lineId)
        ? new Response(createE2eDubBlob(), {
            headers: { "Content-Type": "audio/webm" },
          })
        : new Response(null, { status: 404 });
    }
    if (method === "PUT" && !audio) {
      if (!learner.dub.savedLineIds.includes(lineId)) {
        learner.dub.savedLineIds.push(lineId);
      }
      persist();
      return e2eDubJson({ lineId, recordedAt: E2E_DUB_RECORDED_AT }, 201);
    }
    return e2eDubJson({ error: "method_not_allowed" }, 405);
  }

  async function handleArt(
    url: URL,
    method: string,
    explicitLearner: MockLearnerState | null,
  ): Promise<Response | null> {
    const match = url.pathname.match(
      /^\/api\/stories\/([^/]+)\/personalized-art(\/asset)?$/,
    );
    if (!match) return null;
    const resolvedLearner = requestLearner(explicitLearner);
    if (resolvedLearner instanceof Response) return resolvedLearner;
    const learner = resolvedLearner;
    const storyId = decodeURIComponent(match[1]!);
    const art = learner.art.get(storyId) ?? {
      hasStoredArt: false,
      updatedAt: null,
    };
    if (match[2]) {
      return art.hasStoredArt
        ? new Response(new Uint8Array([137, 80, 78, 71]), {
            headers: { "Content-Type": "image/png" },
          })
        : new Response(null, { status: 404 });
    }
    if (method === "GET") {
      return e2eJson({
        enabled: true,
        guardianConsentVersion: E2E_STORY_ART_CONSENT_VERSION,
        hasStoredArt: art.hasStoredArt,
        stories: art.hasStoredArt
          ? {
              [storyId]: {
                pages: {
                  "my-red-ball": {
                    alt: `${learner.profile.name} holding a bright red ball`,
                    src: `/api/stories/${encodeURIComponent(storyId)}/personalized-art/asset?${new URLSearchParams(
                      {
                        v: "1786276800000",
                        ...(explicitLearner
                          ? { learnerProfileId: explicitLearner.profile.id }
                          : {}),
                      },
                    )}`,
                  },
                },
              },
            }
          : {},
        updatedAt: art.updatedAt,
      });
    }
    if (method === "POST") {
      learner.art.set(storyId, {
        hasStoredArt: true,
        updatedAt: E2E_DUB_RECORDED_AT,
      });
      persist();
      const created: Response | null = await handleArt(
        url,
        "GET",
        explicitLearner,
      );
      return e2eJson(await created!.json(), 201);
    }
    if (method === "DELETE") {
      learner.art.delete(storyId);
      persist();
      return new Response(null, { status: 204 });
    }
    return e2eJson({ error: "method_not_allowed" }, 405);
  }

  function lessonRecordingScope(
    learner: MockLearnerState,
  ): LessonRecordingMockScope {
    let pendingUploads = pendingLessonUploadsByLearner.get(learner.profile.id);
    if (!pendingUploads) {
      pendingUploads = [];
      pendingLessonUploadsByLearner.set(learner.profile.id, pendingUploads);
    }
    return {
      consentRequested() {
        learner.lessonRecording.consentRequests += 1;
        persist();
      },
      isEnabled: () =>
        learner.lessonRecording.consent &&
        !learner.lessonRecording.cleanupPending,
      learnerProfileId: () => learner.profile.id,
      pendingUploads,
      persist,
      uploads: learner.lessonRecording.uploads,
    };
  }

  async function handleLessonRecording(
    input: RequestInfo | URL,
    init: RequestInit | undefined,
    url: URL,
    method: string,
    request: Request,
    explicitLearner: MockLearnerState | null,
  ) {
    const isLessonRecordingPath =
      url.pathname === "/api/lesson-recordings/consent" ||
      lessonRecordingSlot(url) !== null;
    const isProfileConsentPath =
      url.pathname === "/api/profile/lesson-recording-consent";
    if (!isLessonRecordingPath && !isProfileConsentPath) return null;

    const resolvedLearner = requestLearner(explicitLearner);
    if (resolvedLearner instanceof Response) return resolvedLearner;
    const learner = resolvedLearner;
    if (isProfileConsentPath) {
      if (method !== "PUT") {
        return e2eJson({ error: "method_not_allowed" }, 405);
      }
      const body = await jsonBody(request);
      if (typeof body.enabled !== "boolean") {
        return e2eJson({ error: "invalid_request" }, 400);
      }
      if (body.enabled) {
        learner.lessonRecording.consent = true;
        learner.lessonRecording.cleanupPending = false;
      } else if (learner.lessonRecording.consent) {
        learner.lessonRecording.consent = false;
        learner.lessonRecording.cleanupPending = true;
      } else {
        learner.lessonRecording.cleanupPending = false;
        learner.lessonRecording.uploads = [];
      }
      persist();
      return e2eJson({
        cleanupPending: learner.lessonRecording.cleanupPending,
        enabled: learner.lessonRecording.consent,
      });
    }

    return lessonRecordingResponse(
      input,
      init,
      url,
      method,
      lessonRecordingScope(learner),
    );
  }

  async function handle(
    input: RequestInfo | URL,
    init: RequestInit | undefined,
    explicitLearner: MockLearnerState | null,
  ) {
    const request =
      input instanceof Request
        ? input
        : new Request(
            input instanceof URL
              ? input.href
              : new URL(input, window.location.href),
            init,
          );
    const url = new URL(request.url, window.location.href);
    if (url.origin !== window.location.origin) return null;
    const method = (init?.method ?? request.method ?? "GET").toUpperCase();

    const dub = await handleDub(url, method, request, explicitLearner);
    if (dub) return dub;
    const art = await handleArt(url, method, explicitLearner);
    if (art) return art;
    const lessonRecording = await handleLessonRecording(
      input,
      init,
      url,
      method,
      request,
      explicitLearner,
    );
    if (lessonRecording) return lessonRecording;

    if (url.pathname === "/api/learner-profiles") {
      if (method === "GET") return e2eJson(roster());
      if (method === "POST") {
        if (scenario === "create-error") {
          return e2eJson(
            {
              error: "create_failed",
              message: "The learner could not be added.",
            },
            503,
          );
        }
        const body = await jsonBody(request);
        const name =
          typeof body.name === "string"
            ? body.name.normalize("NFKC").trim()
            : "";
        if (!name) {
          return e2eJson(
            {
              error: "invalid_name",
              message: "Please enter a preferred name.",
            },
            400,
          );
        }
        const id = `learner-${name.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-")}-${state.learners.size + 1}`;
        const learner = createMockLearner(
          id,
          name,
          null,
          new Date(Date.UTC(2026, 7, state.learners.size + 3, 8)).toISOString(),
          false,
        );
        state.learners.set(id, learner);
        persist();
        return e2eJson(roster());
      }
      return e2eJson({ error: "method_not_allowed" }, 405);
    }

    const selection = url.pathname.match(
      /^\/api\/learner-profiles\/([^/]+)\/active$/,
    );
    if (selection && method === "PUT") {
      let profileId = "";
      try {
        profileId = decodeURIComponent(selection[1]!);
      } catch {
        return e2eJson({ error: "not_found" }, 404);
      }
      if (!state.learners.has(profileId))
        return e2eJson({ error: "not_found" }, 404);
      if (scenario === "select-error" && profileId !== state.activeProfileId) {
        return e2eJson(
          { error: "select_failed", message: "Could not select this learner." },
          503,
        );
      }
      state.activeProfileId = profileId;
      persist();
      const response = e2eJson(roster());
      if (scenario === "stale-selection" && !staleSelectionUsed) {
        staleSelectionUsed = true;
        return new Promise<Response>((resolve) => {
          heldSelection = { resolve, response };
        });
      }
      return response;
    }

    const resolvedLearner = requestLearner(explicitLearner);
    const learner =
      resolvedLearner instanceof Response ? null : resolvedLearner;
    const learnerOwnedPath =
      url.pathname.startsWith("/api/learner-profile") ||
      url.pathname === "/api/profile" ||
      url.pathname === "/api/profile/preferences" ||
      url.pathname.startsWith("/api/lessons/my") ||
      url.pathname.startsWith("/api/conversations");
    if (learnerOwnedPath && resolvedLearner instanceof Response) {
      return resolvedLearner;
    }
    if (!learner) return null;

    if (url.pathname === "/api/learner-profile" && method === "GET") {
      if (failNextLearnerProfileLoad) {
        failNextLearnerProfileLoad = false;
        learnerProfileLoadFailures += 1;
        return e2eJson(
          {
            error: "profile_unavailable",
            message: "The learner could not be checked.",
          },
          503,
        );
      }
      return e2eJson(fullProfileState(learner));
    }
    if (
      url.pathname === "/api/learner-profile/transcribe" &&
      method === "POST"
    ) {
      return e2eJson({ transcript: learner.profile.name });
    }
    if (url.pathname === "/api/learner-profile/answer" && method === "PUT") {
      const body = await jsonBody(request);
      if (
        typeof body.questionKey !== "string" ||
        typeof body.rawAnswer !== "string" ||
        !updateAnswer(learner, body.questionKey, body.rawAnswer)
      ) {
        return e2eJson({ error: "invalid_request" }, 400);
      }
      return e2eJson(fullProfileState(learner));
    }
    if (
      (url.pathname === "/api/learner-profile/skip" ||
        url.pathname === "/api/learner-profile/complete") &&
      method === "POST"
    ) {
      learner.profile.profileStatus = "completed";
      learner.profile.currentQuestionKey = null;
      learner.profile.completedAt = E2E_DUB_RECORDED_AT;
      persist();
      return e2eJson(fullProfileState(learner));
    }
    if (
      url.pathname === "/api/learner-profile/question/skip" &&
      method === "POST"
    ) {
      let body: Record<string, unknown>;
      try {
        body = (await request.clone().json()) as Record<string, unknown>;
      } catch {
        return e2eJson({ error: "invalid_json" }, 400);
      }
      const index = questionnaire.questions.findIndex(
        (question) => question.answerKey === body.questionKey,
      );
      const question = questionnaire.questions[index];
      if (!question) {
        return e2eJson(
          {
            error: "invalid_answer",
            fieldError: "This question is no longer available.",
          },
          409,
        );
      }
      if (learner.profile.currentQuestionKey !== question.answerKey) {
        return e2eJson(
          {
            error: "invalid_answer",
            fieldError: "Please answer the current question first.",
          },
          409,
        );
      }
      if (question.required) {
        return e2eJson(
          {
            error: "invalid_answer",
            fieldError: "This question is required.",
          },
          400,
        );
      }
      learner.profile.currentQuestionKey =
        questionnaire.questions[index + 1]?.answerKey ?? null;
      persist();
      return e2eJson(fullProfileState(learner));
    }

    if (url.pathname === "/api/profile" && method === "GET") {
      return e2eJson(profileEditorState(learner));
    }
    if (url.pathname === "/api/profile" && method === "PUT") {
      const body = await jsonBody(request);
      const answers =
        body.answers && typeof body.answers === "object"
          ? (body.answers as Record<string, unknown>)
          : {};
      if (typeof answers.name === "string" && answers.name.trim()) {
        learner.profile.name = answers.name.normalize("NFKC").trim();
      }
      if (typeof answers.age === "string" && /^\d+$/.test(answers.age.trim())) {
        learner.profile.age = Number.parseInt(answers.age.trim(), 10);
      }
      if (typeof answers.description === "string") {
        learner.profile.description = answers.description.trim() || null;
      }
      persist();
      return e2eJson(profileEditorState(learner));
    }
    if (url.pathname === "/api/profile/preferences" && method === "PUT") {
      const body = await jsonBody(request);
      if (typeof body.storyLevel === "string") {
        learner.profile.storyLevel =
          body.storyLevel as MockLearnerProfile["storyLevel"];
      }
      persist();
      return e2eJson(profileEditorState(learner));
    }

    if (url.pathname === "/api/lessons/my/generate" && method === "POST") {
      const body = await jsonBody(request);
      const topic =
        typeof body.topic === "string" && body.topic.trim()
          ? body.topic.normalize("NFKC").trim()
          : "English practice";
      const lesson = structuredClone(generatedLessonTemplate);
      lesson.childName = learner.profile.name;
      lesson.title = `${topic} with ${learner.profile.name}`;
      return e2eJson({ lesson, warnings: [] });
    }
    if (url.pathname === "/api/lessons/my" && method === "GET") {
      return e2eJson({ lessons: [...learner.lessons.values()] });
    }
    if (url.pathname === "/api/lessons/my" && method === "POST") {
      const body = await jsonBody(request);
      const id = `lesson-${learner.profile.id}-${learner.lessons.size + 1}`;
      const descriptor: MockLessonDescriptor = {
        createdAt: E2E_DUB_RECORDED_AT,
        id,
        lesson: body.lesson,
        revision: E2E_LESSON_REVISION,
        source: body.source === "generated" ? "generated" : "uploaded",
        updatedAt: E2E_DUB_RECORDED_AT,
      };
      learner.lessons.set(id, descriptor);
      persist();
      return e2eJson({ lesson: descriptor }, 201);
    }
    const lessonMatch = url.pathname.match(/^\/api\/lessons\/my\/([^/]+)$/);
    if (lessonMatch) {
      const id = decodeURIComponent(lessonMatch[1]!);
      const descriptor = learner.lessons.get(id);
      if (!descriptor) return e2eJson({ error: "not_found" }, 404);
      if (method === "GET") return e2eJson({ lesson: descriptor });
      if (method === "PUT") {
        const body = await jsonBody(request);
        descriptor.lesson = body.lesson;
        descriptor.updatedAt = E2E_DUB_RECORDED_AT;
        persist();
        return e2eJson({ lesson: descriptor, warnings: [] });
      }
    }

    if (url.pathname === "/api/conversations" && method === "POST") {
      const id = `${learner.profile.id}-conversation-${learner.conversationIds.size + 1}`;
      learner.conversationIds.add(id);
      persist();
      return e2eJson(
        {
          conversation: {
            authUserId: "e2e-user",
            controllerState: {},
            createdAt: E2E_DUB_RECORDED_AT,
            endedAt: null,
            finishReason: null,
            id,
            roomName: `${id}-room`,
            scenarioKey: "onboarding",
            scenarioVersion: 1,
            startedAt: E2E_DUB_RECORDED_AT,
            status: "starting",
            updatedAt: E2E_DUB_RECORDED_AT,
          },
          livekit: {
            participantToken: "parrot-e2e-participant-token",
            url: "wss://parrot-e2e.invalid",
          },
          scenario: {
            key: "onboarding",
            maxOptionalExchanges: 3,
            requiredDetails: ["name", "age"],
            summaryMode: "prose",
            version: 1,
          },
        },
        201,
      );
    }
    const conversation = url.pathname.match(
      /^\/api\/conversations\/([^/]+)(\/finish|\/review)?$/,
    );
    if (conversation) {
      const id = decodeURIComponent(conversation[1]!);
      if (!learner.conversationIds.has(id)) {
        return e2eJson({ error: "not_found" }, 404);
      }
      if (conversation[2] === "/review") {
        return e2eJson({
          bypassed: false,
          conversationId: id,
          profileCompleted: true,
        });
      }
      if (conversation[2] === "/finish") {
        return e2eJson({ conversation: { id, status: "finished" } });
      }
      return e2eJson({
        conversation: {
          id,
          turns: [
            {
              id: `${id}-greeting`,
              role: "assistant",
              text: `Lovely chat, ${learner.profile.name}!`,
            },
          ],
        },
      });
    }

    return null;
  }

  persist();
  return {
    handle,
    failNextLearnerProfileLoad() {
      failNextLearnerProfileLoad = true;
    },
    releaseStaleSelection() {
      if (!heldSelection) return false;
      const pending = heldSelection;
      heldSelection = null;
      pending.resolve(pending.response);
      return true;
    },
    resolveExplicitLearner(profileId: string) {
      return state.learners.get(profileId) ?? null;
    },
    snapshot(profileId?: string) {
      const learner = profileId
        ? (state.learners.get(profileId) ?? null)
        : selectedLearner();
      const pendingUploads = learner
        ? (pendingLessonUploadsByLearner.get(learner.profile.id) ?? [])
        : [];
      return {
        activeProfileId: state.activeProfileId,
        lessonRecording: learner
          ? {
              cleanupPending: learner.lessonRecording.cleanupPending,
              consent: learner.lessonRecording.consent,
              consentRequests: learner.lessonRecording.consentRequests,
              pendingUploads: pendingUploads.length,
              uploads: learner.lessonRecording.uploads.map((upload) => ({
                ...upload,
              })),
            }
          : null,
        profiles: roster().profiles,
        learnerProfileLoadFailures,
        sessionId,
        staleSelectionPending: heldSelection !== null,
      };
    },
    rejectNextLessonUpload() {
      for (const uploads of pendingLessonUploadsByLearner.values()) {
        if (settleNextLessonUpload("reject", uploads)) return true;
      }
      return false;
    },
    resolveNextLessonUpload() {
      for (const uploads of pendingLessonUploadsByLearner.values()) {
        if (settleNextLessonUpload("resolve", uploads)) return true;
      }
      return false;
    },
  };
}

function getE2eScenario() {
  const scenario = new URL(window.location.href).searchParams.get(
    "parrotE2eScenario",
  );

  return scenario && E2E_SCENARIOS.has(scenario) ? scenario : DEFAULT_SCENARIO;
}

function getE2eLessonScenario() {
  return E2E_LESSON_SCENARIO;
}

function lessonRecordingConsentEnabled() {
  const scenario = getE2eLessonScenario();
  return Boolean(
    scenario &&
      ![
        "consent-error",
        "device-no-consent",
        "held-cue-no-consent",
        "held-story",
        "no-consent",
      ].includes(scenario),
  );
}

function getE2eMicrophoneScenario() {
  const scenario = new URL(window.location.href).searchParams.get(
    "parrotE2eMicrophone",
  );

  return scenario && E2E_MICROPHONE_SCENARIOS.has(scenario) ? scenario : null;
}

function getE2eDubScenario() {
  const scenario = new URL(window.location.href).searchParams.get(
    "parrotE2eDub",
  );
  if (scenario && E2E_DUB_SCENARIOS.has(scenario)) {
    sessionStorage.setItem(E2E_DUB_SCENARIO_KEY, scenario);
    return scenario;
  }
  const persisted = sessionStorage.getItem(E2E_DUB_SCENARIO_KEY);
  return persisted && E2E_DUB_SCENARIOS.has(persisted) ? persisted : null;
}

if (getE2eDubScenario()) {
  const createObjectURL = URL.createObjectURL.bind(URL);
  const revokeObjectURL = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = (blob) => {
    const url = createObjectURL(blob);
    createdObjectUrls.push(url);
    return url;
  };
  URL.revokeObjectURL = (url) => {
    revokedObjectUrls.push(url);
    revokeObjectURL(url);
  };
}

function getE2eProfileScenario() {
  const scenario = new URL(window.location.href).searchParams.get(
    "parrotE2eProfile",
  );

  return scenario && E2E_PROFILE_SCENARIOS.has(scenario) ? scenario : null;
}

function hasHeldE2eProfileOperations() {
  return (
    new URL(window.location.href).searchParams.get(
      "parrotE2eProfileOperation",
    ) === E2E_PROFILE_OPERATION_SCENARIO
  );
}

function hasHeldE2eProfilePlayback() {
  return (
    new URL(window.location.href).searchParams.get(
      "parrotE2eProfilePlayback",
    ) === "held"
  );
}

function hasHeldE2eDubPlayback() {
  return (
    new URL(window.location.href).searchParams.get("parrotE2eDubPlayback") ===
    "held"
  );
}

function keepsAbortedE2eProfileOperationsSettleable() {
  return (
    new URL(window.location.href).searchParams.get("parrotE2eProfileAbort") ===
    "settle-late"
  );
}

function getE2eProfileVisualPhase() {
  const phase = new URL(window.location.href).searchParams.get(
    "parrotE2eProfileVisualPhase",
  );
  return phase && E2E_PROFILE_VISUAL_PHASES.has(phase) ? phase : null;
}

type E2EProfileOperation =
  "answerSave" | "questionSkip" | "skipForNow" | "transcription";

type E2EProfileOperationPhase =
  "listening" | "opening" | "thinking" | "writing";

type E2EOperationCounters = {
  aborted: number;
  pending: number;
  rejected: number;
  requests: number;
  resolved: number;
};

type PendingProfileOperation = {
  abort: () => void;
  abortObserved: boolean;
  defaultPayload: unknown;
  reject: (reason?: unknown) => void;
  resolve: (response: Response) => void;
  signal: AbortSignal | null;
};

type PendingProfileRecorder = {
  fail: () => void;
  stop: () => void;
};

const E2E_PROFILE_OPERATIONS: E2EProfileOperation[] = [
  "transcription",
  "answerSave",
  "questionSkip",
  "skipForNow",
];

function createOperationCounters(): E2EOperationCounters {
  return {
    aborted: 0,
    pending: 0,
    rejected: 0,
    requests: 0,
    resolved: 0,
  };
}

const profileOperationCounters = Object.fromEntries(
  E2E_PROFILE_OPERATIONS.map((operation) => [
    operation,
    createOperationCounters(),
  ]),
) as Record<E2EProfileOperation, E2EOperationCounters>;

const profileRecordingCounters = createOperationCounters();
const profilePlaybackCounters = createOperationCounters();
const pendingProfileOperations: Record<
  E2EProfileOperation,
  PendingProfileOperation[]
> = {
  answerSave: [],
  questionSkip: [],
  skipForNow: [],
  transcription: [],
};
const pendingProfileRecorders: PendingProfileRecorder[] = [];

function e2eJson(payload: unknown, status = 200) {
  return Response.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Parrot-Mock-Api": "browser",
    },
  });
}

function e2eDubJson(payload: unknown, status = 200) {
  return Response.json(payload, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Parrot-Mock-Api": "browser",
    },
  });
}

function createE2eDubBlob(scenario = "correct") {
  return new Blob(
    [
      new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x00]),
      `parrot-e2e-audio:${scenario}`,
    ],
    { type: "audio/webm" },
  );
}

function initialE2eDubLineIds(scenario: string) {
  if (
    scenario === "audio-fetch-failed" ||
    scenario === "both-source-failed" ||
    scenario === "complete" ||
    scenario === "corrupt-line-5" ||
    scenario === "multiple-source-failed" ||
    scenario === "playback-setup-failed" ||
    scenario === "reset-delete-failed" ||
    scenario === "reset-delete-lost-response" ||
    scenario === "reset-interrupted"
  ) {
    return [...E2E_DUB_LINE_IDS];
  }
  if (scenario === "almost-complete") return E2E_DUB_LINE_IDS.slice(0, 23);
  if (
    scenario === "delete-failed" ||
    scenario === "delete-held" ||
    scenario === "partial" ||
    scenario === "verse-fetch-failed"
  ) {
    return E2E_DUB_LINE_IDS.slice(0, 3);
  }
  return [];
}

function createE2eDubStore(scenario: string | null) {
  if (!scenario) return null;
  const savedKey = `parrot-e2e-dub:${scenario}:saved`;
  const consentKey = `parrot-e2e-dub:${scenario}:consent`;
  const failureKey = `parrot-e2e-dub:${scenario}:upload-failed`;
  const resetDeleteFailureKey = `parrot-e2e-dub:${scenario}:reset-delete-failed`;
  const resetKey = `parrot-e2e-dub:${scenario}:reset-finished`;
  const persisted = sessionStorage.getItem(savedKey);
  const savedLineIds = persisted
    ? (JSON.parse(persisted) as string[])
    : initialE2eDubLineIds(scenario);
  if (persisted === null)
    sessionStorage.setItem(savedKey, JSON.stringify(savedLineIds));
  let consentState = (sessionStorage.getItem(consentKey) ??
    (scenario === "not-granted" || scenario === "reset-interrupted"
      ? "not_granted"
      : scenario === "reset-delete-failed" ||
          scenario === "reset-delete-lost-response" ||
          scenario === "revoking"
        ? "revoking"
        : "granted")) as "granted" | "not_granted" | "revoking";
  sessionStorage.setItem(consentKey, consentState);

  const clips = new Map(
    savedLineIds.map((id) => [
      id,
      createE2eDubBlob(
        scenario === "corrupt-line-5" && id === "line-5"
          ? "corrupt-line-5"
          : "correct",
      ),
    ]),
  );
  let failedUpload: Uint8Array | null = null;
  let failAudioFetch =
    scenario === "audio-fetch-failed" || scenario === "verse-fetch-failed";
  let legacyResetPending =
    scenario === "reset-interrupted" &&
    sessionStorage.getItem(resetKey) !== "yes";
  let resetCleanupPending =
    (scenario === "reset-delete-failed" ||
      scenario === "reset-delete-lost-response") &&
    sessionStorage.getItem(resetKey) !== "yes";
  let failResetDelete =
    scenario === "reset-delete-failed" &&
    sessionStorage.getItem(resetDeleteFailureKey) !== "used";
  let loseResetDeleteResponse =
    scenario === "reset-delete-lost-response" &&
    sessionStorage.getItem(resetDeleteFailureKey) !== "used";
  let delayNextStatus = false;
  let pendingDelete: ((response: Response) => void) | null = null;
  let pendingRetryUpload: {
    blob: Blob;
    lineId: string;
    resolve(response: Response): void;
  } | null = null;
  const guideFetches: string[] = [];
  const privateFetches: string[] = [];
  const uploads: string[] = [];

  function persist() {
    sessionStorage.setItem(savedKey, JSON.stringify([...clips.keys()]));
  }

  function persistConsent(state: typeof consentState) {
    consentState = state;
    sessionStorage.setItem(consentKey, state);
  }

  function disabledDubResponse() {
    const error =
      consentState === "revoking"
        ? "dub_consent_revoking"
        : "dubbing_not_enabled";
    return e2eDubJson({ error }, consentState === "revoking" ? 409 : 403);
  }

  return {
    async handle(url: URL, method: string, request: Request) {
      if (url.origin !== window.location.origin) return null;
      const guideMatch = url.pathname.match(
        /^\/assets\/audio\/five-little-ducks-v2-guide-(line-(?:[1-9]|1[0-9]|2[0-4]))\.mp3$/,
      );
      if (method === "GET" && guideMatch) {
        guideFetches.push(url.pathname);
        if (
          (scenario === "both-source-failed" && guideMatch[1] === "line-5") ||
          (scenario === "multiple-source-failed" &&
            ["line-5", "line-8"].includes(guideMatch[1]))
        ) {
          if (
            scenario === "multiple-source-failed" &&
            guideMatch[1] === "line-5"
          ) {
            await new Promise<void>((resolve) =>
              window.setTimeout(resolve, 50),
            );
          }
          return new Response(null, { status: 503 });
        }
        return null;
      }
      if (url.pathname === `${E2E_DUB_API}/consent`) {
        if (method !== "PUT")
          return e2eDubJson({ error: "method_not_allowed" }, 405);
        if (currentGuardianAccess().mode !== "guardian") {
          return e2eDubJson({ error: "guardian_required" }, 403);
        }
        if (consentState === "revoking") {
          return e2eDubJson({ error: "dub_consent_revoking" }, 409);
        }
        let body: unknown;
        try {
          body = await request.clone().json();
        } catch {
          return e2eDubJson({ error: "invalid_request" }, 400);
        }
        if (
          typeof body !== "object" ||
          body === null ||
          Object.keys(body).length !== 2 ||
          !("accepted" in body) ||
          body.accepted !== true ||
          !("consentVersion" in body) ||
          body.consentVersion !== E2E_DUB_CONSENT_VERSION
        ) {
          return e2eDubJson({ error: "invalid_request" }, 400);
        }
        persistConsent("granted");
        return new Response(null, {
          headers: { "Cache-Control": "private, no-store" },
          status: 204,
        });
      }
      if (url.pathname === E2E_DUB_API) {
        if (method === "GET") {
          if (scenario === "load-held") return new Promise<Response>(() => {});
          if (delayNextStatus) {
            delayNextStatus = false;
            await new Promise<void>((resolve) =>
              window.setTimeout(resolve, 400),
            );
          }
          if (legacyResetPending && consentState === "granted") {
            return e2eDubJson({ error: "dub_reset_in_progress" }, 409);
          }
          return e2eDubJson({
            complete:
              consentState === "granted" &&
              E2E_DUB_LINE_IDS.every((id) => clips.has(id)),
            consentState,
            dubId: "five-little-ducks-v2",
            guardianConsentVersion: E2E_DUB_CONSENT_VERSION,
            lines: E2E_DUB_LINE_IDS.map((id) => ({
              id,
              recordedAt:
                consentState === "granted" && clips.has(id)
                  ? E2E_DUB_RECORDED_AT
                  : null,
              saved: consentState === "granted" && clips.has(id),
            })),
            recordingEnabled: consentState === "granted",
          });
        }
        if (method === "DELETE") {
          if (currentGuardianAccess().mode !== "guardian") {
            return e2eDubJson({ error: "guardian_required" }, 403);
          }
          persistConsent("revoking");
          if (scenario === "delete-failed") {
            return new Response(null, { status: 503 });
          }
          if (scenario === "delete-held") {
            return new Promise<Response>((resolve) => {
              pendingDelete = resolve;
            });
          }
          if (failResetDelete) {
            failResetDelete = false;
            sessionStorage.setItem(resetDeleteFailureKey, "used");
            return new Response(null, { status: 503 });
          }
          if (legacyResetPending || resetCleanupPending) {
            await new Promise<void>((resolve) =>
              window.setTimeout(resolve, 250),
            );
            legacyResetPending = false;
            resetCleanupPending = false;
            sessionStorage.setItem(resetKey, "yes");
            clips.clear();
            persist();
            persistConsent("not_granted");
            if (loseResetDeleteResponse) {
              loseResetDeleteResponse = false;
              delayNextStatus = true;
              sessionStorage.setItem(resetDeleteFailureKey, "used");
              return new Response(null, { status: 503 });
            }
          }
          clips.clear();
          persist();
          persistConsent("not_granted");
          return new Response(null, {
            headers: { "Cache-Control": "private, no-store" },
            status: 204,
          });
        }
      }

      const lineMatch = url.pathname.match(
        /^\/api\/dubs\/five-little-ducks-v2\/lines\/(line-(?:[1-9]|1[0-9]|2[0-4]))(\/audio)?$/,
      );
      if (!lineMatch) {
        return url.pathname.startsWith("/api/dubs/")
          ? e2eDubJson({ error: "not_found", message: "not_found" }, 404)
          : null;
      }
      const [, lineId, audioPath] = lineMatch;
      if (consentState !== "granted") return disabledDubResponse();
      if (method === "GET" && audioPath) {
        privateFetches.push(url.pathname);
        if (
          (scenario === "both-source-failed" && lineId === "line-5") ||
          (scenario === "multiple-source-failed" &&
            ["line-5", "line-8"].includes(lineId))
        ) {
          return new Response(null, { status: 503 });
        }
        if (failAudioFetch) {
          failAudioFetch = false;
          return new Response(null, { status: 503 });
        }
        const clip = clips.get(lineId);
        return clip
          ? new Response(clip, {
              headers: {
                "Cache-Control": "private, no-store",
                "Content-Type": clip.type,
              },
            })
          : new Response(null, { status: 404 });
      }
      if (method !== "PUT" || audioPath)
        return new Response(null, { status: 405 });

      uploads.push(url.pathname);
      const clip = await request.blob();
      const bytes = new Uint8Array(await clip.arrayBuffer());
      if (request.headers.get("Content-Type") !== "audio/webm") {
        return new Response(null, { status: 400 });
      }
      if (
        scenario === "upload-rejected" &&
        sessionStorage.getItem(failureKey) !== "used"
      ) {
        sessionStorage.setItem(failureKey, "used");
        return new Response(null, { status: 413 });
      }
      if (
        (scenario === "upload-failed" || scenario === "upload-retry-held") &&
        sessionStorage.getItem(failureKey) !== "used"
      ) {
        failedUpload = bytes;
        sessionStorage.setItem(failureKey, "used");
        return new Response(null, { status: 503 });
      }
      if (
        failedUpload &&
        (failedUpload.length !== bytes.length ||
          failedUpload.some((byte, index) => byte !== bytes[index]))
      ) {
        return new Response(null, { status: 409 });
      }
      if (scenario === "upload-retry-held") {
        return new Promise<Response>((resolve) => {
          pendingRetryUpload = { blob: clip, lineId, resolve };
        });
      }
      clips.set(lineId, new Blob([bytes], { type: clip.type }));
      persist();
      return e2eDubJson({ lineId, recordedAt: E2E_DUB_RECORDED_AT }, 201);
    },
    snapshot() {
      return {
        audioContextDoubleCloses,
        createdObjectUrls: [...createdObjectUrls],
        guideFetches: [...guideFetches],
        playedAudioSources: [...playedAudioSources],
        privateFetches: [...privateFetches],
        revokedObjectUrls: [...revokedObjectUrls],
        uploads: [...uploads],
      };
    },
    releaseDelete() {
      if (!pendingDelete) return false;
      const resolve = pendingDelete;
      pendingDelete = null;
      clips.clear();
      persist();
      persistConsent("not_granted");
      resolve(new Response(null, {
        headers: { "Cache-Control": "private, no-store" },
        status: 204,
      }));
      return true;
    },
    releaseUpload() {
      if (!pendingRetryUpload) return false;
      const pending = pendingRetryUpload;
      pendingRetryUpload = null;
      clips.set(pending.lineId, pending.blob);
      persist();
      pending.resolve(
        e2eDubJson(
          { lineId: pending.lineId, recordedAt: E2E_DUB_RECORDED_AT },
          201,
        ),
      );
      return true;
    },
  };
}

type MockGuardianAccess = {
  mode: "learner" | "guardian";
  expiresAt?: string;
};

type MockGuardianScenario =
  "learner" | "guardian" | "unlock-error" | "lock-error" | "expired";

function getE2eGuardianScenario(): MockGuardianScenario {
  const persistForLearnerScenario = getE2eLearnerScenario() !== null;
  const requested = new URL(window.location.href).searchParams.get(
    "parrotE2eGuardian",
  );
  if (requested && E2E_GUARDIAN_SCENARIOS.has(requested)) {
    if (persistForLearnerScenario) {
      sessionStorage.setItem(E2E_GUARDIAN_SCENARIO_KEY, requested);
    }
    return requested as MockGuardianScenario;
  }
  const persisted = persistForLearnerScenario
    ? sessionStorage.getItem(E2E_GUARDIAN_SCENARIO_KEY)
    : null;
  return persisted && E2E_GUARDIAN_SCENARIOS.has(persisted)
    ? (persisted as MockGuardianScenario)
    : "learner";
}

const guardianScenario = getE2eGuardianScenario();
const guardianStorageKey = `parrot-e2e-guardian-access:${guardianScenario}`;

function initialGuardianAccess(): MockGuardianAccess {
  if (guardianScenario === "guardian" || guardianScenario === "lock-error") {
    return {
      expiresAt: new Date(
        Date.now() + E2E_GUARDIAN_ACCESS_TTL_MS,
      ).toISOString(),
      mode: "guardian",
    };
  }
  if (guardianScenario === "expired") {
    return {
      expiresAt: new Date(
        Date.now() + E2E_EXPIRED_ACCESS_DELAY_MS,
      ).toISOString(),
      mode: "guardian",
    };
  }
  return { mode: "learner" };
}

function readGuardianAccess(): MockGuardianAccess {
  const saved = sessionStorage.getItem(guardianStorageKey);
  if (saved) {
    try {
      const parsed = JSON.parse(saved) as MockGuardianAccess;
      if (
        parsed.mode === "learner" ||
        (parsed.mode === "guardian" &&
          typeof parsed.expiresAt === "string" &&
          Number.isFinite(Date.parse(parsed.expiresAt)))
      ) {
        return parsed;
      }
    } catch {
      // Fall through to the deterministic scenario state.
    }
  }
  const access = initialGuardianAccess();
  sessionStorage.setItem(guardianStorageKey, JSON.stringify(access));
  return access;
}

let guardianAccess = readGuardianAccess();

function setGuardianAccess(access: MockGuardianAccess) {
  guardianAccess = access;
  sessionStorage.setItem(guardianStorageKey, JSON.stringify(access));
}

function currentGuardianAccess() {
  if (
    guardianAccess.mode === "guardian" &&
    Date.parse(guardianAccess.expiresAt ?? "") <= Date.now()
  ) {
    setGuardianAccess({ mode: "learner" });
  }
  return guardianAccess;
}

function requiresGuardianAccess(
  url: URL,
  method: string,
  hasLearnerTarget = false,
) {
  if (hasLearnerTarget) return true;
  if (url.pathname === "/api/learner-profiles") {
    return method === "GET" || method === "POST";
  }
  if (/^\/api\/learner-profiles\/[^/]+\/active$/.test(url.pathname)) {
    return method === "PUT";
  }
  if (url.pathname === "/api/profile") {
    return method === "GET" || method === "PUT";
  }
  if (url.pathname === "/api/profile/preferences") return method === "PUT";
  if (url.pathname === "/api/profile/lesson-recording-consent") {
    return method === "PUT";
  }
  if (/^\/api\/dubs\/[^/]+\/consent$/.test(url.pathname)) {
    return method === "PUT";
  }
  if (/^\/api\/dubs\/[^/]+$/.test(url.pathname)) {
    return method === "DELETE";
  }
  if (url.pathname === "/api/lessons/my") return method === "POST";
  if (url.pathname === "/api/lessons/my/generate") return method === "POST";
  if (/^\/api\/lessons\/my\/[^/]+$/.test(url.pathname)) {
    return method === "PUT";
  }
  return (
    /^\/api\/stories\/[^/]+\/personalized-art$/.test(url.pathname) &&
    (method === "POST" || method === "DELETE")
  );
}

async function guardianResponse(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  url: URL,
  method: string,
  hasLearnerTarget: boolean,
) {
  if (url.origin !== window.location.origin) return null;
  if (url.pathname === "/api/guardian-access") {
    if (method === "GET") return e2eJson(currentGuardianAccess());
    if (method === "POST") {
      const request = input instanceof Request ? input : null;
      const body = init?.body ?? (request ? await request.clone().text() : "");
      let password = "";
      try {
        password = (JSON.parse(String(body)) as { password?: unknown })
          .password as string;
      } catch {
        return e2eJson({ error: "invalid_json" }, 400);
      }
      if (password !== E2E_GUARDIAN_PASSWORD) {
        return e2eJson(
          {
            error: "invalid_password",
            message: "The password did not match this account.",
          },
          401,
        );
      }
      if (guardianScenario === "unlock-error") {
        return e2eJson(
          {
            error: "request_failed",
            message: "Guardian access could not be checked. Please try again.",
          },
          503,
        );
      }
      setGuardianAccess({
        expiresAt: new Date(
          Date.now() + E2E_GUARDIAN_ACCESS_TTL_MS,
        ).toISOString(),
        mode: "guardian",
      });
      return e2eJson(guardianAccess);
    }
    if (method === "DELETE") {
      if (guardianScenario === "lock-error") {
        return e2eJson({ error: "lock_failed" }, 503);
      }
      setGuardianAccess({ mode: "learner" });
      return e2eJson(guardianAccess);
    }
    return e2eJson({ error: "method_not_allowed" }, 405);
  }
  if (
    requiresGuardianAccess(url, method, hasLearnerTarget) &&
    currentGuardianAccess().mode === "learner"
  ) {
    return e2eJson({ error: "guardian_required" }, 403);
  }
  return null;
}

function createProfileOperationAbortError() {
  return new DOMException("The operation was aborted.", "AbortError");
}

function answerSavePayload(profileScenario: string | null) {
  return profileScenario === E2E_PROFILE_VIEWPORT_SCENARIO
    ? E2E_VIEWPORT_PROFILE_AFTER_NAME
    : profileScenario === E2E_PROFILE_LONG_ACKNOWLEDGMENT_SCENARIO
      ? E2E_COMPLETED_PROFILE_WITH_LONG_ACKNOWLEDGMENT
      : E2E_COMPLETED_PROFILE_WITH_ACKNOWLEDGMENT;
}

function defaultProfileOperationPayload(
  operation: E2EProfileOperation,
  profileScenario: string | null,
) {
  if (operation === "transcription") return { transcript: "Mia" };
  if (operation === "skipForNow") {
    return { canBypass: true, mode: "bypass-only" };
  }
  return answerSavePayload(profileScenario);
}

function profileOperationForRequest(
  url: URL,
  method: string,
): E2EProfileOperation | null {
  if (url.origin !== window.location.origin) return null;
  if (url.pathname === "/api/learner-profile/transcribe" && method === "POST") {
    return "transcription";
  }
  if (url.pathname === "/api/learner-profile/answer" && method === "PUT") {
    return "answerSave";
  }
  if (
    url.pathname === "/api/learner-profile/question/skip" &&
    method === "POST"
  ) {
    return "questionSkip";
  }
  if (url.pathname === "/api/learner-profile/skip" && method === "POST") {
    return "skipForNow";
  }
  return null;
}

function updateProfileOperationPending(operation: E2EProfileOperation) {
  profileOperationCounters[operation].pending =
    pendingProfileOperations[operation].length;
}

function holdProfileOperation(
  operation: E2EProfileOperation,
  signal: AbortSignal | null,
  defaultPayload: unknown,
) {
  const counters = profileOperationCounters[operation];
  const pending = pendingProfileOperations[operation];
  counters.requests += 1;

  if (signal?.aborted) {
    counters.aborted += 1;
    return Promise.reject(createProfileOperationAbortError());
  }

  const keepAbortSettleable = keepsAbortedE2eProfileOperationsSettleable();
  return new Promise<Response>((resolve, reject) => {
    const request: PendingProfileOperation = {
      abort() {
        const index = pending.indexOf(request);
        if (index === -1 || request.abortObserved) return;
        request.abortObserved = true;
        counters.aborted += 1;
        if (keepAbortSettleable) return;
        pending.splice(index, 1);
        updateProfileOperationPending(operation);
        reject(createProfileOperationAbortError());
      },
      abortObserved: false,
      defaultPayload,
      reject,
      resolve,
      signal,
    };

    pending.push(request);
    updateProfileOperationPending(operation);
    signal?.addEventListener("abort", request.abort, { once: true });
  });
}

function takePendingProfileOperation(operation: E2EProfileOperation) {
  const request = pendingProfileOperations[operation].shift();
  if (!request) return null;
  request.signal?.removeEventListener("abort", request.abort);
  updateProfileOperationPending(operation);
  return request;
}

function resolveNextProfileOperation(
  operation: E2EProfileOperation,
  payload?: unknown,
) {
  const request = takePendingProfileOperation(operation);
  if (!request) return false;
  profileOperationCounters[operation].resolved += 1;
  request.resolve(
    e2eJson(payload === undefined ? request.defaultPayload : payload),
  );
  return true;
}

function rejectNextProfileOperation(
  operation: E2EProfileOperation,
  message = "Held profile operation failed.",
) {
  const request = takePendingProfileOperation(operation);
  if (!request) return false;
  profileOperationCounters[operation].rejected += 1;
  request.reject(new Error(message));
  return true;
}

function trackHeldProfileRecording(recorder: PendingProfileRecorder) {
  profileRecordingCounters.requests += 1;
  pendingProfileRecorders.push(recorder);
  profileRecordingCounters.pending = pendingProfileRecorders.length;
}

function finishHeldProfileRecording(
  recorder: PendingProfileRecorder,
  outcome: "rejected" | "resolved",
) {
  const index = pendingProfileRecorders.indexOf(recorder);
  if (index === -1) return;
  pendingProfileRecorders.splice(index, 1);
  profileRecordingCounters.pending = pendingProfileRecorders.length;
  profileRecordingCounters[outcome] += 1;
}

function stopNextProfileRecording() {
  const recorder = pendingProfileRecorders[0];
  if (!recorder) return false;
  recorder.stop();
  return true;
}

function rejectNextProfileRecording() {
  const recorder = pendingProfileRecorders[0];
  if (!recorder) return false;
  recorder.fail();
  return true;
}

function lessonRecordingSlot(url: URL) {
  const match = url.pathname.match(
    /^\/api\/lesson-recordings\/(my|parrot)\/([^/]+)\/scenes\/(\d+)\/steps\/(\d+)$/,
  );
  if (!match) return null;
  try {
    return {
      lessonId: decodeURIComponent(match[2]),
      sceneIndex: Number(match[3]),
      source: match[1] as "my" | "parrot",
      stepIndex: Number(match[4]),
    };
  } catch {
    return null;
  }
}

function globalLessonRecordingScope(): LessonRecordingMockScope {
  return {
    consentRequested() {
      lessonMediaMetrics.consentRequests += 1;
    },
    isEnabled: lessonRecordingConsentEnabled,
    pendingUploads: pendingLessonUploads,
    persist() {},
    uploads: lessonMediaMetrics.uploads,
  };
}

async function lessonRecordingResponse(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  url: URL,
  method: string,
  scope = globalLessonRecordingScope(),
) {
  if (url.origin !== window.location.origin) return null;
  if (
    url.pathname === "/api/lesson-recordings/consent" &&
    method === "GET"
  ) {
    scope.consentRequested();
    if (getE2eLessonScenario() === "malformed-consent") {
      return e2eJson({ enabled: "false" });
    }
    return getE2eLessonScenario() === "consent-error"
      ? e2eJson({ error: "request_failed" }, 503)
      : e2eJson({ enabled: scope.isEnabled() });
  }

  const slot = lessonRecordingSlot(url);
  if (!slot || method !== "PUT") return null;
  const request = input instanceof Request ? input : null;
  const requestHeaders = new Headers(init?.headers ?? request?.headers);
  const expectedLearnerProfileId = requestHeaders.get(
    "X-Parrot-Expected-Learner-Profile",
  );
  const resolvedLearnerProfileId = scope.learnerProfileId?.();
  const attempt =
    scope.uploads.filter(
      (candidate) =>
        candidate.source === slot.source &&
        candidate.lessonId === slot.lessonId &&
        candidate.sceneIndex === slot.sceneIndex &&
        candidate.stepIndex === slot.stepIndex,
    ).length + 1;
  const record: E2ELessonUpload = {
    ...slot,
    attempt,
    expectedLearnerProfileId,
    outcome: "saved",
    revision: requestHeaders.get("X-Parrot-Lesson-Revision"),
    size: 0,
    type: "",
  };
  if (
    resolvedLearnerProfileId !== undefined &&
    expectedLearnerProfileId !== resolvedLearnerProfileId
  ) {
    record.outcome = "learner_selection_changed";
    scope.uploads.push(record);
    scope.persist();
    return e2eJson({ error: "learner_selection_changed" }, 409);
  }
  const blob =
    init?.body instanceof Blob
      ? init.body
      : request
        ? await request.clone().blob()
        : new Blob();
  record.size = blob.size;
  record.type = blob.type;
  scope.uploads.push(record);
  const scenario = getE2eLessonScenario();

  if (scenario === "recording-disabled" || !scope.isEnabled()) {
    record.outcome = "recording_disabled";
    scope.persist();
    return e2eJson({ error: "guardian_consent_required" }, 403);
  }
  if (scenario === "account-deletion-pending") {
    record.outcome = "recording_disabled";
    scope.persist();
    return e2eJson({ error: "account_deletion_pending" }, 409);
  }
  if (scenario === "lesson-changed") {
    record.outcome = "lesson_changed";
    scope.persist();
    return e2eJson({ error: "lesson_changed" }, 409);
  }
  if (
    (scenario === "upload-failed" || scenario === "upload-retry-held") &&
    attempt === 1
  ) {
    record.outcome = "failed";
    scope.persist();
    return e2eJson({ error: "upload_failed" }, 503);
  }
  if (
    scenario === "upload-held" ||
    (scenario === "upload-retry-held" && attempt === 2)
  ) {
    record.outcome = "held";
    scope.persist();
    return new Promise<Response>((resolve, reject) => {
      scope.pendingUploads.push({
        persist: scope.persist,
        record,
        reject,
        resolve,
      });
    });
  }
  scope.persist();
  return e2eJson({ recordedAt: "2026-08-26T08:00:00.000Z" }, 201);
}

function installE2eProfileFetchMock() {
  const nativeFetch = window.fetch.bind(window);
  const dubStore = createE2eDubStore(getE2eDubScenario());
  const learnerScenario = getE2eLearnerScenario();
  const learnerAccount = learnerScenario
    ? createE2eLearnerAccount(learnerScenario, getE2eLearnerSessionId())
    : null;
  let fallbackStoryLevel = E2E_VIEWPORT_EDITOR_STATE.profile.storyLevel;

  function fallbackProfileState() {
    return {
      ...E2E_VIEWPORT_EDITOR_STATE,
      profile: {
        ...E2E_VIEWPORT_EDITOR_STATE.profile,
        storyLevel: fallbackStoryLevel,
      },
    };
  }
  scopedLessonRecordingMedia = learnerAccount
    ? {
        rejectNextUpload: () => learnerAccount.rejectNextLessonUpload(),
        resolveNextUpload: () => learnerAccount.resolveNextLessonUpload(),
        snapshot: () => {
          const lessonRecording = learnerAccount.snapshot().lessonRecording;
          return lessonRecording
            ? {
                consentRequests: lessonRecording.consentRequests,
                pendingUploads: lessonRecording.pendingUploads,
                uploads: lessonRecording.uploads,
              }
            : { consentRequests: 0, pendingUploads: 0, uploads: [] };
        },
      }
    : null;

  if (dubStore) {
    Object.defineProperty(window, "__parrotE2eDub", {
      configurable: true,
      value: {
        releaseDelete: () => dubStore.releaseDelete(),
        releaseUpload: () => dubStore.releaseUpload(),
        snapshot: () => dubStore.snapshot(),
      },
    });
  }
  if (learnerAccount) {
    Object.defineProperty(window, "__parrotE2eLearners", {
      configurable: true,
      value: {
        failNextLearnerProfileLoad: () =>
          learnerAccount.failNextLearnerProfileLoad(),
        releaseStaleSelection: () => learnerAccount.releaseStaleSelection(),
        snapshot: (profileId?: string) => learnerAccount.snapshot(profileId),
      },
    });
  }

  window.fetch = async (input, init) => {
    const profileScenario = getE2eProfileScenario();
    const request = input instanceof Request ? input : null;
    const source =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const url = new URL(source, window.location.href);
    const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
    const hasLearnerTarget = hasExplicitLearnerTarget(url);
    if (
      getE2eLessonScenario() &&
      url.pathname === "/api/evaluate-speech"
    ) {
      lessonMediaMetrics.evaluateRequests += 1;
    }
    const guardedResponse = await guardianResponse(
      input,
      init,
      url,
      method,
      hasLearnerTarget,
    );
    if (guardedResponse) return guardedResponse;

    const fallbackTarget = hasLearnerTarget
      ? parseExplicitLearnerTarget(url)
      : null;
    if (hasLearnerTarget && fallbackTarget === null) {
      return targetedLearnerNotFound();
    }

    let explicitLearner: MockLearnerState | null = null;
    if (learnerAccount && fallbackTarget !== null) {
      explicitLearner = learnerAccount.resolveExplicitLearner(fallbackTarget);
      if (!explicitLearner) return targetedLearnerNotFound();
    }
    if (
      !learnerAccount &&
      fallbackTarget !== null &&
      fallbackTarget !== E2E_VIEWPORT_EDITOR_STATE.profile.id
    ) {
      return targetedLearnerNotFound();
    }
    if (!learnerAccount) {
      const recordingResponse = await lessonRecordingResponse(
        input,
        init,
        url,
        method,
      );
      if (recordingResponse) return recordingResponse;
    }
    if (dubStore) {
      const dubResponse = await dubStore.handle(
        url,
        method,
        request ?? new Request(url.href, init),
      );
      if (dubResponse) return dubResponse;
    }
    if (learnerAccount) {
      const learnerResponse = await learnerAccount.handle(
        input,
        init,
        explicitLearner,
      );
      if (learnerResponse) return learnerResponse;
    }
    if (
      !learnerAccount &&
      url.origin === window.location.origin &&
      url.pathname === "/api/learner-profiles" &&
      method === "GET"
    ) {
      return e2eJson({
        activeProfileId: E2E_VIEWPORT_EDITOR_STATE.profile.id,
        profiles: [
          {
            age: E2E_VIEWPORT_EDITOR_STATE.profile.age,
            createdAt: "2026-08-01T08:00:00.000Z",
            id: E2E_VIEWPORT_EDITOR_STATE.profile.id,
            name: E2E_VIEWPORT_EDITOR_STATE.profile.name,
            profileStatus: E2E_VIEWPORT_EDITOR_STATE.profile.profileStatus,
          },
        ],
      });
    }
    if (
      !learnerAccount &&
      fallbackTarget === E2E_VIEWPORT_EDITOR_STATE.profile.id &&
      url.origin === window.location.origin &&
      url.pathname === "/api/profile" &&
      method === "GET"
    ) {
      return e2eJson(fallbackProfileState());
    }
    if (
      !learnerAccount &&
      fallbackTarget === E2E_VIEWPORT_EDITOR_STATE.profile.id &&
      url.origin === window.location.origin &&
      url.pathname === "/api/profile/preferences" &&
      method === "PUT"
    ) {
      const body = (await (request ?? new Request(url.href, init))
        .clone()
        .json()) as { storyLevel?: typeof fallbackStoryLevel };
      if (body.storyLevel) fallbackStoryLevel = body.storyLevel;
      return e2eJson(fallbackProfileState());
    }
    if (
      !learnerAccount &&
      fallbackTarget === E2E_VIEWPORT_EDITOR_STATE.profile.id &&
      url.origin === window.location.origin
    ) {
      const methodResponse = singletonUnsupportedTargetMethodResponse(
        url,
        method,
      );
      if (methodResponse) return methodResponse;
    }
    const profileOperation = profileOperationForRequest(url, method);

    const visualPhase = getE2eProfileVisualPhase();
    const shouldResolveReadyTranscription =
      visualPhase === "ready" && profileOperation === "transcription";

    if (shouldResolveReadyTranscription) {
      return e2eJson(
        defaultProfileOperationPayload("transcription", profileScenario),
      );
    }

    if (hasHeldE2eProfileOperations() && profileOperation) {
      const signal = init?.signal ?? request?.signal ?? null;
      return holdProfileOperation(
        profileOperation,
        signal,
        defaultProfileOperationPayload(profileOperation, profileScenario),
      );
    }

    if (!profileScenario) return nativeFetch(input, init);

    if (
      url.origin === window.location.origin &&
      url.pathname === "/api/learner-profile" &&
      method === "GET"
    ) {
      const profileState =
        profileScenario === E2E_PROFILE_RESUME_SCENARIO
          ? E2E_VIEWPORT_RESUMED_PROFILE
          : profileScenario === E2E_PROFILE_VIEWPORT_SCENARIO
            ? window.location.pathname.startsWith("/guardian/learners/")
              ? E2E_VIEWPORT_EDITOR_GATE
              : E2E_VIEWPORT_INCOMPLETE_PROFILE
            : E2E_INCOMPLETE_PROFILE;
      return e2eJson(
        hasHeldE2eProfileOperations() && profileState.question
          ? {
              ...profileState,
              question: { ...profileState.question, required: false },
            }
          : profileState,
      );
    }

    if (
      profileScenario === E2E_PROFILE_VIEWPORT_SCENARIO &&
      url.origin === window.location.origin &&
      url.pathname === "/api/profile" &&
      method === "GET"
    ) {
      return e2eJson(E2E_VIEWPORT_EDITOR_STATE);
    }

    if (
      url.origin === window.location.origin &&
      url.pathname === "/api/learner-profile/answer" &&
      method === "PUT"
    ) {
      return e2eJson(answerSavePayload(profileScenario));
    }

    return nativeFetch(input, init);
  };
}

function getMockAudioDelayMs(src: string) {
  return src.includes("feedback-")
    ? MOCK_FEEDBACK_AUDIO_DELAY_MS
    : MOCK_AUDIO_DELAY_MS;
}

class MockAudioElement {
  onended: RecorderHandler<Event> = null;
  onerror: RecorderHandler<Event> = null;
  volume = 1;
  private held = false;
  private lessonCue = false;
  private lessonPending: PendingLessonPlayback | null = null;
  private lessonResume: (() => void) | null = null;
  private timerId: number | null = null;

  constructor(readonly src: string) {}

  pause() {
    if (this.timerId !== null) {
      window.clearTimeout(this.timerId);
      this.timerId = null;
    }
    if (this.lessonCue) this.lessonPending?.cancel();
    if (this.held) {
      this.held = false;
      pendingProfilePlayback.delete(this);
      profilePlaybackCounters.pending = pendingProfilePlayback.size;
      profilePlaybackCounters.aborted += 1;
    }
  }

  finish() {
    if (!this.held) return false;
    this.held = false;
    pendingProfilePlayback.delete(this);
    profilePlaybackCounters.pending = pendingProfilePlayback.size;
    profilePlaybackCounters.resolved += 1;
    this.onended?.(new Event("ended"));
    return true;
  }

  async play() {
    playedAudioSources.push(this.src);
    if (
      (hasHeldE2eProfilePlayback() && this.src.includes("learner-profile")) ||
      (hasHeldE2eDubPlayback() &&
        (this.src.includes("five-little-ducks") ||
          this.src.startsWith("blob:")))
    ) {
      if (!this.held) {
        this.held = true;
        pendingProfilePlayback.add(this);
        profilePlaybackCounters.pending = pendingProfilePlayback.size;
        profilePlaybackCounters.requests += 1;
      }
      return;
    }
    if (this.lessonResume) {
      this.lessonResume();
      return;
    }
    const lessonScenario = getE2eLessonScenario();
    this.lessonCue = this.src.includes("lesson-join-in-");
    const heldLessonAudio =
      (this.lessonCue &&
        (lessonScenario === "held-cue" ||
          lessonScenario === "held-cue-no-consent" ||
          lessonScenario === "malformed-consent")) ||
      (!this.lessonCue &&
        (lessonScenario === "held-story" || lessonScenario === "held-preflight"));
    const cue: E2ELessonCue | null = this.lessonCue
      ? {
          endedAt: null,
          kind: "static" as const,
          startedAt: performance.now(),
          text: this.src,
          volume: this.volume,
        }
      : null;
    if (cue) lessonMediaMetrics.cues.push(cue);

    let settled = false;
    const removePending = () => {
      if (!this.lessonPending) return;
      const index = pendingLessonPlayback.indexOf(this.lessonPending);
      if (index >= 0) pendingLessonPlayback.splice(index, 1);
      this.lessonPending = null;
    };
    const finish = () => {
      if (settled) return;
      settled = true;
      this.timerId = null;
      this.lessonResume = null;
      removePending();
      if (cue) cue.endedAt = performance.now();
      this.onended?.(new Event("ended"));
    };
    const fail = () => {
      if (settled) return;
      settled = true;
      this.timerId = null;
      this.lessonResume = null;
      removePending();
      if (cue) cue.endedAt = performance.now();
      this.onerror?.(new Event("error"));
    };
    const cancel = () => {
      if (settled) return;
      settled = true;
      if (this.timerId !== null) window.clearTimeout(this.timerId);
      this.timerId = null;
      this.lessonResume = null;
      removePending();
      if (cue) lessonMediaMetrics.cueCancellations += 1;
    };
    this.lessonPending = { cancel, fail, finish };

    if (heldLessonAudio) {
      this.lessonResume = () => {};
      pendingLessonPlayback.push(this.lessonPending);
      return;
    }
    if (this.lessonCue && lessonScenario === "cue-failure") {
      this.timerId = window.setTimeout(fail, 10);
      return;
    }
    if (!this.lessonCue && lessonScenario === "story-failure") {
      this.timerId = window.setTimeout(fail, 10);
      return;
    }
    this.lessonResume = () => {
      if (this.timerId === null) {
        this.timerId = window.setTimeout(
          finish,
          getMockAudioDelayMs(this.src),
        );
      }
    };
    this.lessonResume();
  }
}

const pendingProfilePlayback = new Set<MockAudioElement>();

function resolveNextProfilePlayback() {
  const playback = pendingProfilePlayback.values().next().value;
  return playback?.finish() ?? false;
}

class MockMediaRecorder {
  static isTypeSupported(type: string) {
    return type === "audio/webm;codecs=opus";
  }

  readonly mimeType = "audio/webm";
  ondataavailable: RecorderHandler<BlobEvent> = null;
  onerror: RecorderHandler<Event> = null;
  onstop: RecorderHandler<Event> = null;
  state: RecordingState = "inactive";
  readonly lessonRecorderId: number;

  constructor(
    readonly stream: MediaStream,
    readonly options?: MediaRecorderOptions,
  ) {
    this.lessonRecorderId = getE2eLessonScenario()
      ? ++lessonMediaMetrics.nextRecorderId
      : 0;
  }

  start() {
    this.state = "recording";
    if (this.lessonRecorderId) {
      lessonMediaMetrics.recorderStarts.push({
        id: this.lessonRecorderId,
        startedAt: performance.now(),
      });
    }
    if (hasHeldE2eProfileOperations()) {
      trackHeldProfileRecording(this);
      const visualPhase = getE2eProfileVisualPhase();
      if (visualPhase === "ready" || visualPhase === "writing") {
        queueMicrotask(() => this.stop());
      }
      return;
    }
    window.setTimeout(() => {
      if (this.state === "recording") this.stop();
    }, MOCK_RECORDING_DELAY_MS);
  }

  fail() {
    if (this.state === "inactive") return;
    this.state = "inactive";
    finishHeldProfileRecording(this, "rejected");
    this.onerror?.(new Event("error"));
  }

  stop() {
    if (this.state === "inactive") return;

    this.state = "inactive";
    if (this.lessonRecorderId) {
      lessonMediaMetrics.recorderStops.push({
        id: this.lessonRecorderId,
        stoppedAt: performance.now(),
      });
      if (getE2eLessonScenario() === "stop-failure") {
        this.onerror?.(new Event("error"));
        return;
      }
    }
    finishHeldProfileRecording(this, "resolved");
    const data = createE2eDubBlob(getE2eScenario());
    this.ondataavailable?.({ data } as BlobEvent);
    this.onstop?.(new Event("stop"));
  }
}

class MockAudioParam {
  value = 0;
  linearRampToValueAtTime(value: number) {
    this.value = value;
  }
  setValueAtTime(value: number) {
    this.value = value;
  }
}

class MockAudioNode {
  connect() {
    return this;
  }
  disconnect() {}
}

class MockAnalyserNode extends MockAudioNode {
  fftSize = 256;
  smoothingTimeConstant = 0;

  getFloatTimeDomainData(samples: Float32Array) {
    samples.forEach((_, index) => {
      samples[index] = Math.sin(index / 8) * 0.6;
    });
  }
}

class MockScheduledAudioNode extends MockAudioNode {
  buffer: AudioBuffer | null = null;
  frequency = new MockAudioParam();
  type: OscillatorType = "sine";
  start() {}
  stop() {}
}

class MockGainNode extends MockAudioNode {
  gain = new MockAudioParam();
}

class MockAudioContext {
  readonly destination = new MockAudioNode();
  private readonly startedAt = performance.now();
  private closed = false;

  get currentTime() {
    return ((performance.now() - this.startedAt) / 1_000) * 20;
  }

  async close() {
    if (this.closed) {
      audioContextDoubleCloses += 1;
      throw new DOMException(
        "Cannot close a closed AudioContext.",
        "InvalidStateError",
      );
    }
    this.closed = true;
  }
  createBufferSource() {
    return new MockScheduledAudioNode();
  }
  createAnalyser() {
    return new MockAnalyserNode();
  }
  createGain() {
    return new MockGainNode();
  }
  createMediaStreamSource() {
    return new MockAudioNode();
  }
  createOscillator() {
    return new MockScheduledAudioNode();
  }
  async decodeAudioData(bytes: ArrayBuffer) {
    if (new TextDecoder().decode(bytes).includes("corrupt-line-5")) {
      throw new DOMException("Mock undecodable dub line.", "EncodingError");
    }
    return {
      duration: 4,
      getChannelData: () => Float32Array.from([0, 0.25, -0.8, 0.45, -1, 0.15]),
      sampleRate: 16_000,
    } as unknown as AudioBuffer;
  }
  async resume() {
    if (getE2eDubScenario() === "playback-setup-failed") {
      throw new DOMException(
        "Mock AudioContext resume failed: sample-rate mismatch at graph 7.",
        "InvalidStateError",
      );
    }
  }
}

function createMockStream(onStop?: () => void) {
  let stopped = false;
  const track = {
    enabled: true,
    kind: "audio",
    label: "Parrot E2E microphone",
    readyState: "live",
    stop() {
      if (stopped) return;
      stopped = true;
      onStop?.();
    },
  } as MediaStreamTrack;

  return {
    active: true,
    getAudioTracks: () => [track],
    getTracks: () => [track],
  } as unknown as MediaStream;
}

type PendingMicrophoneRequest = {
  reject: (reason?: unknown) => void;
  resolve: (stream: MediaStream) => void;
};

const pendingMicrophoneRequests: PendingMicrophoneRequest[] = [];
const e2eLessonMicrophone = {
  pending: 0,
  rejected: 0,
  requests: 0,
  resolved: 0,
  stoppedTracks: 0,
  rejectNext() {
    const request = pendingMicrophoneRequests.shift();
    if (!request) return false;
    this.pending = pendingMicrophoneRequests.length;
    this.rejected += 1;
    request.reject(new DOMException("Permission denied", "NotAllowedError"));
    return true;
  },
  resolveNext() {
    const request = pendingMicrophoneRequests.shift();
    if (!request) return false;
    this.pending = pendingMicrophoneRequests.length;
    this.resolved += 1;
    request.resolve(
      createMockStream(() => {
        this.stoppedTracks += 1;
      }),
    );
    return true;
  },
};

function operationSnapshot(counters: E2EOperationCounters) {
  return { ...counters };
}

function microphoneSnapshot() {
  return {
    aborted: 0,
    pending: e2eLessonMicrophone.pending,
    rejected: e2eLessonMicrophone.rejected,
    requests: e2eLessonMicrophone.requests,
    resolved: e2eLessonMicrophone.resolved,
  };
}

function resolveThinkingOperation() {
  const operation = (
    ["answerSave", "questionSkip", "skipForNow"] as E2EProfileOperation[]
  ).find((candidate) => pendingProfileOperations[candidate].length > 0);
  return operation ? resolveNextProfileOperation(operation) : false;
}

function rejectThinkingOperation() {
  const operation = (
    ["answerSave", "questionSkip", "skipForNow"] as E2EProfileOperation[]
  ).find((candidate) => pendingProfileOperations[candidate].length > 0);
  return operation ? rejectNextProfileOperation(operation) : false;
}

const e2eProfileOperations = {
  reject(phase: E2EProfileOperationPhase) {
    if (phase === "opening") return e2eLessonMicrophone.rejectNext();
    if (phase === "listening") return rejectNextProfileRecording();
    if (phase === "writing") {
      return rejectNextProfileOperation("transcription");
    }
    return rejectThinkingOperation();
  },
  rejectNext(
    operation: E2EProfileOperation,
    message = "Held profile operation failed.",
  ) {
    return rejectNextProfileOperation(operation, message);
  },
  release(phase: E2EProfileOperationPhase) {
    if (phase === "opening") return e2eLessonMicrophone.resolveNext();
    if (phase === "listening") return stopNextProfileRecording();
    if (phase === "writing") {
      return resolveNextProfileOperation("transcription");
    }
    return resolveThinkingOperation();
  },
  resolveNext(operation: E2EProfileOperation, payload?: unknown) {
    return resolveNextProfileOperation(operation, payload);
  },
  snapshot() {
    return {
      answerSave: operationSnapshot(profileOperationCounters.answerSave),
      microphone: microphoneSnapshot(),
      playback: operationSnapshot(profilePlaybackCounters),
      questionSkip: operationSnapshot(profileOperationCounters.questionSkip),
      recording: {
        ...operationSnapshot(profileRecordingCounters),
        stoppedTracks: e2eLessonMicrophone.stoppedTracks,
      },
      skipForNow: operationSnapshot(profileOperationCounters.skipForNow),
      transcription: operationSnapshot(profileOperationCounters.transcription),
    };
  },
  releasePlayback: resolveNextProfilePlayback,
  stopRecording: stopNextProfileRecording,
};

function settleNextLessonPlayback(action: "fail" | "finish") {
  const playback = pendingLessonPlayback[0];
  if (!playback) return false;
  playback[action]();
  return true;
}

function settleNextLessonUpload(
  action: "reject" | "resolve",
  uploads = pendingLessonUploads,
) {
  const upload = uploads.shift();
  if (!upload) return false;
  if (action === "resolve") {
    upload.record.outcome = "saved";
    upload.persist();
    upload.resolve(
      e2eJson({ recordedAt: "2026-08-26T08:00:00.000Z" }, 201),
    );
  } else {
    upload.record.outcome = "failed";
    upload.persist();
    upload.reject(new Error("Held lesson recording upload failed."));
  }
  return true;
}

const e2eLessonMedia = {
  failNextCue: () => settleNextLessonPlayback("fail"),
  rejectNextUpload: () =>
    scopedLessonRecordingMedia?.rejectNextUpload() ??
    settleNextLessonUpload("reject"),
  releaseNextCue: () => settleNextLessonPlayback("finish"),
  resolveNextUpload: () =>
    scopedLessonRecordingMedia?.resolveNextUpload() ??
    settleNextLessonUpload("resolve"),
  snapshot() {
    const lessonRecording = scopedLessonRecordingMedia?.snapshot() ?? {
      consentRequests: lessonMediaMetrics.consentRequests,
      pendingUploads: pendingLessonUploads.length,
      uploads: lessonMediaMetrics.uploads.map((upload) => ({ ...upload })),
    };
    return {
      consentRequests: lessonRecording.consentRequests,
      cueCancellations: lessonMediaMetrics.cueCancellations,
      cues: lessonMediaMetrics.cues.map((cue) => ({ ...cue })),
      evaluateRequests: lessonMediaMetrics.evaluateRequests,
      getUserMediaCalls: lessonMediaMetrics.getUserMediaCalls,
      pendingCues: pendingLessonPlayback.length,
      pendingUploads: lessonRecording.pendingUploads,
      recorderStarts: lessonMediaMetrics.recorderStarts.map((entry) => ({
        ...entry,
      })),
      recorderStops: lessonMediaMetrics.recorderStops.map((entry) => ({
        ...entry,
      })),
      stoppedTracks: lessonMediaMetrics.stoppedTracks,
      uploads: lessonRecording.uploads,
    };
  },
};

class MockLessonSpeechUtterance {
  lang = "";
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  pitch = 1;
  rate = 1;
  voice = null;
  volume = 1;

  constructor(readonly text: string) {}
}

let currentDevicePlayback: PendingLessonPlayback | null = null;
const mockLessonSpeechSynthesis = {
  cancel() {
    currentDevicePlayback?.cancel();
    currentDevicePlayback = null;
  },
  getVoices() {
    return [
      {
        default: true,
        lang: "en-US",
        localService: true,
        name: "Parrot E2E English",
      },
    ];
  },
  pause() {},
  resume() {},
  speak(utterance: MockLessonSpeechUtterance) {
    const cue: E2ELessonCue = {
      endedAt: null,
      kind: "device",
      startedAt: performance.now(),
      text: utterance.text,
      volume: utterance.volume,
    };
    lessonMediaMetrics.cues.push(cue);
    let settled = false;
    let timerId: number | null = null;
    const removePending = () => {
      if (!currentDevicePlayback) return;
      const index = pendingLessonPlayback.indexOf(currentDevicePlayback);
      if (index >= 0) pendingLessonPlayback.splice(index, 1);
      currentDevicePlayback = null;
    };
    const finish = () => {
      if (settled) return;
      settled = true;
      cue.endedAt = performance.now();
      removePending();
      utterance.onend?.();
    };
    const fail = () => {
      if (settled) return;
      settled = true;
      cue.endedAt = performance.now();
      removePending();
      utterance.onerror?.();
    };
    const cancel = () => {
      if (settled) return;
      settled = true;
      if (timerId !== null) window.clearTimeout(timerId);
      removePending();
      lessonMediaMetrics.cueCancellations += 1;
    };
    currentDevicePlayback = { cancel, fail, finish };
    const lessonScenario = getE2eLessonScenario();
    if (
      lessonScenario === "held-cue" ||
      lessonScenario === "held-cue-no-consent" ||
      (lessonScenario === "account-deletion-pending" &&
        utterance.text === "The kite turns.") ||
      (lessonScenario === "lesson-changed" &&
        utterance.text === "The kite turns.")
    ) {
      pendingLessonPlayback.push(currentDevicePlayback);
    } else if (getE2eLessonScenario() === "cue-failure") {
      timerId = window.setTimeout(fail, 10);
    } else {
      timerId = window.setTimeout(finish, MOCK_AUDIO_DELAY_MS);
    }
  },
};

Object.defineProperty(window, "__parrotE2eLessonMedia", {
  configurable: true,
  value: e2eLessonMedia,
});

if (getE2eLessonScenario()) {
  Object.defineProperty(window, "SpeechSynthesisUtterance", {
    configurable: true,
    value: MockLessonSpeechUtterance,
  });
  Object.defineProperty(window, "speechSynthesis", {
    configurable: true,
    value: mockLessonSpeechSynthesis,
  });
}

Object.defineProperty(window, "__parrotE2eLessonMicrophone", {
  configurable: true,
  value: e2eLessonMicrophone,
});

if (hasHeldE2eProfileOperations()) {
  Object.defineProperty(window, "__parrotE2eProfileOperations", {
    configurable: true,
    value: e2eProfileOperations,
  });
}

Object.defineProperty(window, "Audio", {
  configurable: true,
  value: MockAudioElement,
});

Object.defineProperty(window, "AudioContext", {
  configurable: true,
  value: MockAudioContext,
});

Object.defineProperty(window, "MediaRecorder", {
  configurable: true,
  value:
    getE2eMicrophoneScenario() === "unsupported"
      ? undefined
      : MockMediaRecorder,
});

Object.defineProperty(navigator, "mediaDevices", {
  configurable: true,
  value: {
    getUserMedia: async () => {
      const lessonScenario = getE2eLessonScenario();
      if (lessonScenario) {
        lessonMediaMetrics.getUserMediaCalls += 1;
        if (
          (lessonScenario === "denied-preflight" &&
            lessonMediaMetrics.getUserMediaCalls === 1) ||
          (lessonScenario === "later-mic-failure" &&
            lessonMediaMetrics.getUserMediaCalls === 3)
        ) {
          throw new DOMException("Permission denied", "NotAllowedError");
        }
        if (
          (lessonScenario === "held-preflight" &&
            lessonMediaMetrics.getUserMediaCalls === 1) ||
          (lessonScenario === "held-later-mic-failure" &&
            lessonMediaMetrics.getUserMediaCalls === 3)
        ) {
          e2eLessonMicrophone.requests += 1;
          return new Promise<MediaStream>((resolve, reject) => {
            pendingMicrophoneRequests.push({ reject, resolve });
            e2eLessonMicrophone.pending = pendingMicrophoneRequests.length;
          });
        }
      }
      if (getE2eMicrophoneScenario() === "denied") {
        throw new DOMException("Permission denied", "NotAllowedError");
      }
      if (getE2eMicrophoneScenario() === "delayed") {
        e2eLessonMicrophone.requests += 1;
        return new Promise<MediaStream>((resolve, reject) => {
          pendingMicrophoneRequests.push({ reject, resolve });
          e2eLessonMicrophone.pending = pendingMicrophoneRequests.length;
        });
      }
      return createMockStream(
        lessonScenario
          ? () => {
              lessonMediaMetrics.stoppedTracks += 1;
            }
          : undefined,
      );
    },
  },
});

installE2eProfileFetchMock();

export {};
