import questionnaire from "../../content/learner-profile/questionnaire-v2.json";

type RecorderHandler<TEvent extends Event> = ((event: TEvent) => void) | null;

const MOCK_AUDIO_DELAY_MS = 200;
const MOCK_FEEDBACK_AUDIO_DELAY_MS = 5000;
const MOCK_RECORDING_DELAY_MS = 5000;
const playedAudioSources: string[] = [];
let audioContextDoubleCloses = 0;
const DEFAULT_SCENARIO = "correct";
const E2E_SCENARIOS = new Set(["correct", "incorrect", "no-speech"]);
const E2E_DUB_SCENARIOS = new Set([
  "audio-fetch-failed",
  "corrupt-line-5",
  "empty",
  "partial",
  "complete",
  "playback-setup-failed",
  "reset-delete-failed",
  "reset-interrupted",
  "upload-failed",
  "upload-rejected",
]);
const E2E_DUB_LINE_IDS = Array.from(
  { length: 24 },
  (_, index) => `line-${index + 1}` as `line-${number}`,
);
const E2E_DUB_API = "/api/dubs/five-little-ducks-v2";
const E2E_DUB_RECORDED_AT = "2026-08-25T10:00:00.000Z";
const E2E_MICROPHONE_SCENARIOS = new Set([
  "delayed",
  "denied",
  "unsupported",
]);
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
  outcome: "failed" | "held" | "recording_disabled" | "saved";
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
  record: E2ELessonUpload;
  reject: (error: unknown) => void;
  resolve: (response: Response) => void;
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
const E2E_PROFILE_ACKNOWLEDGMENT_SCENARIO = "acknowledgment";
const E2E_PROFILE_LONG_ACKNOWLEDGMENT_SCENARIO = "long-acknowledgment";
const E2E_PROFILE_RESUME_SCENARIO = "viewport-resume";
const E2E_PROFILE_VIEWPORT_SCENARIO = "viewport-stability";
const E2E_PROFILE_OPERATION_SCENARIO = "held";
const E2E_GUARDIAN_PASSWORD = "e2e-guardian-password";
const E2E_GUARDIAN_ACCESS_TTL_MS = 15 * 60 * 1000;
const E2E_EXPIRED_ACCESS_DELAY_MS = 2_000;
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

const E2E_INCOMPLETE_PROFILE = {
  canBypass: false,
  experienceMode: "form",
  mode: "full",
  profile: {
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
  profile: E2E_VIEWPORT_EDITOR_PROFILE,
  questions: E2E_VIEWPORT_QUESTIONS,
};

function getE2eScenario() {
  const scenario = new URL(window.location.href).searchParams.get(
    "parrotE2eScenario"
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

  return scenario && E2E_DUB_SCENARIOS.has(scenario) ? scenario : null;
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
  | "answerSave"
  | "questionSkip"
  | "skipForNow"
  | "transcription";

type E2EProfileOperationPhase =
  | "listening"
  | "opening"
  | "thinking"
  | "writing";

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
    scenario === "complete" ||
    scenario === "corrupt-line-5" ||
    scenario === "playback-setup-failed" ||
    scenario === "reset-delete-failed" ||
    scenario === "reset-interrupted"
  ) {
    return [...E2E_DUB_LINE_IDS];
  }
  if (scenario === "partial") return E2E_DUB_LINE_IDS.slice(0, 3);
  return [];
}

function createE2eDubStore(scenario: string | null) {
  if (!scenario) return null;
  const savedKey = `parrot-e2e-dub:${scenario}:saved`;
  const failureKey = `parrot-e2e-dub:${scenario}:upload-failed`;
  const resetDeleteFailureKey = `parrot-e2e-dub:${scenario}:reset-delete-failed`;
  const resetKey = `parrot-e2e-dub:${scenario}:reset-finished`;
  const persisted = sessionStorage.getItem(savedKey);
  const savedLineIds = persisted
    ? (JSON.parse(persisted) as string[])
    : initialE2eDubLineIds(scenario);
  if (persisted === null) sessionStorage.setItem(savedKey, JSON.stringify(savedLineIds));

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
  let failAudioFetch = scenario === "audio-fetch-failed";
  let resetInterrupted =
    (scenario === "reset-delete-failed" || scenario === "reset-interrupted") &&
    sessionStorage.getItem(resetKey) !== "yes";
  let failResetDelete =
    scenario === "reset-delete-failed" &&
    sessionStorage.getItem(resetDeleteFailureKey) !== "used";
  let delayNextStatus = false;
  const uploads: string[] = [];

  function persist() {
    sessionStorage.setItem(savedKey, JSON.stringify([...clips.keys()]));
  }

  return {
    async handle(url: URL, method: string, request: Request) {
      if (url.origin !== window.location.origin) return null;
      if (url.pathname === E2E_DUB_API) {
        if (method === "GET") {
          if (resetInterrupted) {
            return Response.json(
              {
                error: "dub_reset_in_progress",
                message: "TECHNICAL reset marker generation is deleting",
              },
              {
                headers: {
                  "Cache-Control": "no-store",
                  "X-Parrot-Mock-Api": "browser",
                },
                status: 409,
              },
            );
          }
          if (delayNextStatus) {
            delayNextStatus = false;
            await new Promise<void>((resolve) => window.setTimeout(resolve, 400));
          }
          return e2eJson({
            complete: E2E_DUB_LINE_IDS.every((id) => clips.has(id)),
            dubId: "five-little-ducks-v2",
            guardianConsentVersion: "guardian-voice-r2-v1",
            lines: E2E_DUB_LINE_IDS.map((id) => ({
              id,
              recordedAt: clips.has(id) ? E2E_DUB_RECORDED_AT : null,
              saved: clips.has(id),
            })),
          });
        }
        if (method === "DELETE") {
          if (resetInterrupted) {
            await new Promise<void>((resolve) => window.setTimeout(resolve, 250));
            resetInterrupted = false;
            sessionStorage.setItem(resetKey, "yes");
            clips.clear();
            persist();
            if (failResetDelete) {
              failResetDelete = false;
              delayNextStatus = true;
              sessionStorage.setItem(resetDeleteFailureKey, "used");
              return new Response(null, { status: 503 });
            }
          }
          clips.clear();
          persist();
          return new Response(null, {
            headers: { "Cache-Control": "private, no-store" },
            status: 204,
          });
        }
      }

      const lineMatch = url.pathname.match(
        /^\/api\/dubs\/five-little-ducks-v2\/lines\/(line-(?:[1-9]|1[0-9]|2[0-4]))(\/audio)?$/,
      );
      if (!lineMatch) return null;
      const [, lineId, audioPath] = lineMatch;
      if (method === "GET" && audioPath) {
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
      if (method !== "PUT" || audioPath) return new Response(null, { status: 405 });

      uploads.push(url.pathname);
      const clip = await request.blob();
      const bytes = new Uint8Array(await clip.arrayBuffer());
      const consent = request.headers.get("X-Parrot-Guardian-Consent-Version");
      if (request.headers.get("Content-Type") !== "audio/webm" || consent !== "guardian-voice-r2-v1") {
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
        scenario === "upload-failed" &&
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
      clips.set(lineId, new Blob([bytes], { type: clip.type }));
      persist();
      return e2eJson({ recordedAt: E2E_DUB_RECORDED_AT });
    },
    snapshot() {
      return {
        audioContextDoubleCloses,
        playedAudioSources: [...playedAudioSources],
        uploads: [...uploads],
      };
    },
  };
}

type MockGuardianAccess = {
  mode: "learner" | "guardian";
  expiresAt?: string;
};

type MockGuardianScenario =
  | "learner"
  | "guardian"
  | "unlock-error"
  | "lock-error"
  | "expired";

function getE2eGuardianScenario(): MockGuardianScenario {
  const scenario = new URL(window.location.href).searchParams.get(
    "parrotE2eGuardian",
  );
  return scenario && E2E_GUARDIAN_SCENARIOS.has(scenario)
    ? (scenario as MockGuardianScenario)
    : "learner";
}

const guardianScenario = getE2eGuardianScenario();
const guardianStorageKey = `parrot-e2e-guardian-access:${guardianScenario}`;

function initialGuardianAccess(): MockGuardianAccess {
  if (guardianScenario === "guardian" || guardianScenario === "lock-error") {
    return {
      expiresAt: new Date(Date.now() + E2E_GUARDIAN_ACCESS_TTL_MS).toISOString(),
      mode: "guardian",
    };
  }
  if (guardianScenario === "expired") {
    return {
      expiresAt: new Date(Date.now() + E2E_EXPIRED_ACCESS_DELAY_MS).toISOString(),
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

function requiresGuardianAccess(url: URL, method: string) {
  if (url.pathname === "/api/profile") {
    return method === "GET" || method === "PUT";
  }
  if (url.pathname === "/api/profile/preferences") return method === "PUT";
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
) {
  if (url.origin !== window.location.origin) return null;
  if (url.pathname === "/api/guardian-access") {
    if (method === "GET") return e2eJson(currentGuardianAccess());
    if (method === "POST") {
      const request = input instanceof Request ? input : null;
      const body = init?.body ?? (request ? await request.clone().text() : "");
      let password = "";
      try {
        password = (JSON.parse(String(body)) as { password?: unknown }).password as string;
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
    requiresGuardianAccess(url, method) &&
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

async function lessonRecordingResponse(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  url: URL,
  method: string,
) {
  if (url.origin !== window.location.origin) return null;
  if (
    url.pathname === "/api/lesson-recordings/consent" &&
    method === "GET"
  ) {
    lessonMediaMetrics.consentRequests += 1;
    return getE2eLessonScenario() === "consent-error"
      ? e2eJson({ error: "request_failed" }, 503)
      : e2eJson({ enabled: lessonRecordingConsentEnabled() });
  }

  const slot = lessonRecordingSlot(url);
  if (!slot || method !== "PUT") return null;
  const request = input instanceof Request ? input : null;
  const blob =
    init?.body instanceof Blob
      ? init.body
      : request
        ? await request.clone().blob()
        : new Blob();
  const attempt =
    lessonMediaMetrics.uploads.filter(
      (candidate) =>
        candidate.source === slot.source &&
        candidate.lessonId === slot.lessonId &&
        candidate.sceneIndex === slot.sceneIndex &&
        candidate.stepIndex === slot.stepIndex,
    ).length + 1;
  const record: E2ELessonUpload = {
    ...slot,
    attempt,
    outcome: "saved",
    size: blob.size,
    type: blob.type,
  };
  lessonMediaMetrics.uploads.push(record);
  const scenario = getE2eLessonScenario();

  if (scenario === "recording-disabled") {
    record.outcome = "recording_disabled";
    return e2eJson({ error: "guardian_consent_required" }, 403);
  }
  if (scenario === "upload-failed" && attempt === 1) {
    record.outcome = "failed";
    return e2eJson({ error: "upload_failed" }, 503);
  }
  if (scenario === "upload-held") {
    record.outcome = "held";
    return new Promise<Response>((resolve, reject) => {
      pendingLessonUploads.push({ record, reject, resolve });
    });
  }
  return e2eJson({ recordedAt: "2026-08-26T08:00:00.000Z" }, 201);
}

function installE2eProfileFetchMock() {
  const nativeFetch = window.fetch.bind(window);
  const dubStore = createE2eDubStore(getE2eDubScenario());

  if (dubStore) {
    Object.defineProperty(window, "__parrotE2eDub", {
      configurable: true,
      value: { snapshot: () => dubStore.snapshot() },
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
    if (
      getE2eLessonScenario() &&
      url.pathname === "/api/evaluate-speech"
    ) {
      lessonMediaMetrics.evaluateRequests += 1;
    }
    const recordingResponse = await lessonRecordingResponse(
      input,
      init,
      url,
      method,
    );
    if (recordingResponse) return recordingResponse;
    if (dubStore) {
      const dubResponse = await dubStore.handle(
        url,
        method,
        request ?? new Request(url.href, init),
      );
      if (dubResponse) return dubResponse;
    }
    const guardedResponse = await guardianResponse(input, init, url, method);
    if (guardedResponse) return guardedResponse;
    const profileOperation = profileOperationForRequest(url, method);

    const visualPhase = getE2eProfileVisualPhase();
    const shouldResolveReadyTranscription =
      visualPhase === "ready" && profileOperation === "transcription";

    if (shouldResolveReadyTranscription) {
      return e2eJson(defaultProfileOperationPayload("transcription", profileScenario));
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
            ? window.location.pathname === "/profile"
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
      hasHeldE2eProfilePlayback() &&
      this.src.includes("learner-profile")
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
          lessonScenario === "held-cue-no-consent")) ||
      (!this.lessonCue && lessonScenario === "held-story");
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
    readonly options?: MediaRecorderOptions
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
      throw new DOMException("Cannot close a closed AudioContext.", "InvalidStateError");
    }
    this.closed = true;
  }
  createBufferSource() {
    return new MockScheduledAudioNode();
  }
  createGain() {
    return new MockGainNode();
  }
  createOscillator() {
    return new MockScheduledAudioNode();
  }
  async decodeAudioData(bytes: ArrayBuffer) {
    if (new TextDecoder().decode(bytes).includes("corrupt-line-5")) {
      throw new DOMException("Mock undecodable dub line.", "EncodingError");
    }
    return {
      getChannelData: () => Float32Array.from([0, 0.25, -0.8, 0.45, -1, 0.15]),
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
  const operation = ([
    "answerSave",
    "questionSkip",
    "skipForNow",
  ] as E2EProfileOperation[]).find(
    (candidate) => pendingProfileOperations[candidate].length > 0,
  );
  return operation ? resolveNextProfileOperation(operation) : false;
}

function rejectThinkingOperation() {
  const operation = ([
    "answerSave",
    "questionSkip",
    "skipForNow",
  ] as E2EProfileOperation[]).find(
    (candidate) => pendingProfileOperations[candidate].length > 0,
  );
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

function settleNextLessonUpload(action: "reject" | "resolve") {
  const upload = pendingLessonUploads.shift();
  if (!upload) return false;
  if (action === "resolve") {
    upload.record.outcome = "saved";
    upload.resolve(
      e2eJson({ recordedAt: "2026-08-26T08:00:00.000Z" }, 201),
    );
  } else {
    upload.record.outcome = "failed";
    upload.reject(new Error("Held lesson recording upload failed."));
  }
  return true;
}

const e2eLessonMedia = {
  failNextCue: () => settleNextLessonPlayback("fail"),
  rejectNextUpload: () => settleNextLessonUpload("reject"),
  releaseNextCue: () => settleNextLessonPlayback("finish"),
  resolveNextUpload: () => settleNextLessonUpload("resolve"),
  snapshot() {
    return {
      consentRequests: lessonMediaMetrics.consentRequests,
      cueCancellations: lessonMediaMetrics.cueCancellations,
      cues: lessonMediaMetrics.cues.map((cue) => ({ ...cue })),
      evaluateRequests: lessonMediaMetrics.evaluateRequests,
      getUserMediaCalls: lessonMediaMetrics.getUserMediaCalls,
      pendingCues: pendingLessonPlayback.length,
      pendingUploads: pendingLessonUploads.length,
      recorderStarts: lessonMediaMetrics.recorderStarts.map((entry) => ({
        ...entry,
      })),
      recorderStops: lessonMediaMetrics.recorderStops.map((entry) => ({
        ...entry,
      })),
      stoppedTracks: lessonMediaMetrics.stoppedTracks,
      uploads: lessonMediaMetrics.uploads.map((upload) => ({ ...upload })),
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
    if (
      getE2eLessonScenario() === "held-cue" ||
      getE2eLessonScenario() === "held-cue-no-consent"
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
