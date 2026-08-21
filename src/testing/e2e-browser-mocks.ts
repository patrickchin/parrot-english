type RecorderHandler<TEvent extends Event> = ((event: TEvent) => void) | null;

const MOCK_AUDIO_DELAY_MS = 200;
const MOCK_FEEDBACK_AUDIO_DELAY_MS = 5000;
const MOCK_RECORDING_DELAY_MS = 5000;
const DEFAULT_SCENARIO = "correct";
const E2E_SCENARIOS = new Set(["correct", "incorrect", "no-speech"]);
const E2E_MICROPHONE_SCENARIOS = new Set(["denied", "unsupported"]);
const E2E_PROFILE_ACKNOWLEDGMENT_SCENARIO = "acknowledgment";
const E2E_PROFILE_LONG_ACKNOWLEDGMENT_SCENARIO = "long-acknowledgment";
const E2E_PROFILE_VIEWPORT_SCENARIO = "viewport-stability";
const E2E_LONG_ACKNOWLEDGMENT =
  "Mia, that is a lovely answer! Peppa is happy to know you, and she cannot wait to hear about your favourite games, animals, stories, songs, and silly dances too!";
const E2E_PROFILE_SCENARIOS = new Set([
  E2E_PROFILE_ACKNOWLEDGMENT_SCENARIO,
  E2E_PROFILE_LONG_ACKNOWLEDGMENT_SCENARIO,
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
  acknowledgment: { audio: null, text: "Thank you!" },
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

const E2E_VIEWPORT_INCOMPLETE_PROFILE = {
  ...E2E_INCOMPLETE_PROFILE,
  progress: { answered: 0, current: 1, total: 2 },
};

const E2E_VIEWPORT_PROFILE_AFTER_NAME = {
  ...E2E_VIEWPORT_INCOMPLETE_PROFILE,
  acknowledgment: { audio: null, text: "Thank you!" },
  profile: {
    ...E2E_VIEWPORT_INCOMPLETE_PROFILE.profile,
    answers: {
      ...E2E_VIEWPORT_INCOMPLETE_PROFILE.profile.answers,
      responses: {
        name: {
          acknowledgment: "Thank you!",
          answeredAt: "2026-07-10T08:00:00.000Z",
          enrichmentStatus: "generated",
          question: "What's your name?",
          rawAnswer: "Mia",
          summary: "Mia",
        },
      },
    },
    currentQuestionKey: "age",
    name: "Mia",
    profileStatus: "in_progress",
  },
  progress: { answered: 1, current: 2, total: 2 },
  question: {
    answerKey: "age",
    audio: null,
    maxLength: 120,
    position: 2,
    promptEn: "How old are you?",
    promptZh: null,
    required: true,
  },
};

const E2E_VIEWPORT_EDITOR_PROFILE = {
  ...E2E_VIEWPORT_PROFILE_AFTER_NAME.profile,
  age: 8,
  completedAt: "2026-07-10T08:00:00.000Z",
  currentQuestionKey: null,
  profileStatus: "completed",
};

const E2E_VIEWPORT_EDITOR_GATE = {
  canBypass: true,
  experienceMode: "form",
  mode: "full",
  profile: E2E_VIEWPORT_EDITOR_PROFILE,
  progress: { answered: 2, current: 2, total: 2 },
  question: null,
  questionnaire: { version: 2 },
};

const E2E_VIEWPORT_EDITOR_STATE = {
  profile: E2E_VIEWPORT_EDITOR_PROFILE,
  questions: [],
};

function getE2eScenario() {
  const scenario = new URL(window.location.href).searchParams.get(
    "parrotE2eScenario"
  );

  return scenario && E2E_SCENARIOS.has(scenario) ? scenario : DEFAULT_SCENARIO;
}

function getE2eMicrophoneScenario() {
  const scenario = new URL(window.location.href).searchParams.get(
    "parrotE2eMicrophone",
  );

  return scenario && E2E_MICROPHONE_SCENARIOS.has(scenario) ? scenario : null;
}

function getE2eProfileScenario() {
  const scenario = new URL(window.location.href).searchParams.get(
    "parrotE2eProfile",
  );

  return scenario && E2E_PROFILE_SCENARIOS.has(scenario) ? scenario : null;
}

function installE2eProfileFetchMock() {
  const nativeFetch = window.fetch.bind(window);

  window.fetch = async (input, init) => {
    const profileScenario = getE2eProfileScenario();
    if (!profileScenario) {
      return nativeFetch(input, init);
    }

    const request = input instanceof Request ? input : null;
    const source =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const url = new URL(source, window.location.href);
    const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
    const json = (payload: unknown) =>
      Response.json(payload, {
        headers: {
          "Cache-Control": "no-store",
          "X-Parrot-Mock-Api": "browser",
        },
      });

    if (
      url.origin === window.location.origin &&
      url.pathname === "/api/learner-profile" &&
      method === "GET"
    ) {
      return json(
        profileScenario === E2E_PROFILE_VIEWPORT_SCENARIO
          ? window.location.pathname === "/profile"
            ? E2E_VIEWPORT_EDITOR_GATE
            : E2E_VIEWPORT_INCOMPLETE_PROFILE
          : E2E_INCOMPLETE_PROFILE,
      );
    }

    if (
      profileScenario === E2E_PROFILE_VIEWPORT_SCENARIO &&
      url.origin === window.location.origin &&
      url.pathname === "/api/profile" &&
      method === "GET"
    ) {
      return json(E2E_VIEWPORT_EDITOR_STATE);
    }

    if (
      url.origin === window.location.origin &&
      url.pathname === "/api/learner-profile/answer" &&
      method === "PUT"
    ) {
      return json(
        profileScenario === E2E_PROFILE_VIEWPORT_SCENARIO
          ? E2E_VIEWPORT_PROFILE_AFTER_NAME
          : profileScenario === E2E_PROFILE_LONG_ACKNOWLEDGMENT_SCENARIO
            ? E2E_COMPLETED_PROFILE_WITH_LONG_ACKNOWLEDGMENT
            : E2E_COMPLETED_PROFILE_WITH_ACKNOWLEDGMENT,
      );
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

  constructor(readonly src: string) {}

  pause() {}

  async play() {
    window.setTimeout(() => {
      this.onended?.(new Event("ended"));
    }, getMockAudioDelayMs(this.src));
  }
}

class MockMediaRecorder {
  static isTypeSupported() {
    return true;
  }

  ondataavailable: RecorderHandler<BlobEvent> = null;
  onstop: RecorderHandler<Event> = null;
  state: RecordingState = "inactive";

  constructor(
    readonly stream: MediaStream,
    readonly options?: MediaRecorderOptions
  ) {}

  start() {
    this.state = "recording";
    window.setTimeout(() => {
      if (this.state === "recording") this.stop();
    }, MOCK_RECORDING_DELAY_MS);
  }

  stop() {
    if (this.state === "inactive") return;

    this.state = "inactive";
    const data = new Blob([`parrot-e2e-audio:${getE2eScenario()}`], {
      type: "audio/webm",
    });
    this.ondataavailable?.({ data } as BlobEvent);
    this.onstop?.(new Event("stop"));
  }
}

function createMockStream() {
  const track = {
    enabled: true,
    kind: "audio",
    label: "Parrot E2E microphone",
    readyState: "live",
    stop() {},
  } as MediaStreamTrack;

  return {
    active: true,
    getAudioTracks: () => [track],
    getTracks: () => [track],
  } as unknown as MediaStream;
}

Object.defineProperty(window, "Audio", {
  configurable: true,
  value: MockAudioElement,
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
      if (getE2eMicrophoneScenario() === "denied") {
        throw new DOMException("Permission denied", "NotAllowedError");
      }
      return createMockStream();
    },
  },
});

installE2eProfileFetchMock();

export {};
