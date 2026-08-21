import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import {
  act,
  createElement,
  useState,
  useSyncExternalStore,
} from "react";
import {
  MemoryRouter,
  useLocation,
  useNavigate,
} from "react-router";
import { after, afterEach, before, describe, it } from "node:test";
import { createServer } from "vite";
import {
  cleanupMountedRoots,
  click,
  deferred,
  flush,
  input,
  installDom,
  mountStrict,
  waitFor,
} from "../helpers/react-lifecycle.mjs";

const projectRoot = fileURLToPath(new URL("../..", import.meta.url));
const restoreDom = installDom();
const originalFetch = globalThis.fetch;
const originalAudio = globalThis.Audio;
const originalMediaRecorder = globalThis.MediaRecorder;
const originalMediaDevices = navigator.mediaDevices;
const vite = await createServer({
  appType: "custom",
  logLevel: "silent",
  root: projectRoot,
  server: { middlewareMode: true },
});

let ApplicationRoutes;
let ConversationSurface;
let experienceEvents;
let maxExperienceDurationMs;
let LearnerProfileGate;
let usePeppaConversation;
let createAuthGate;
let firstLesson;
let firstLessonId;
let restoreExperienceSink = () => {};

before(async () => {
  ({
    experienceEvents,
    MAX_EXPERIENCE_DURATION_MS: maxExperienceDurationMs,
  } = await vite.ssrLoadModule("/src/experience/experience-events.ts"));
  ({ ConversationSurface } = await vite.ssrLoadModule(
    "/src/conversation/ConversationSurface.tsx",
  ));
  ({ createAuthGate } = await vite.ssrLoadModule("/src/auth/AuthGate.tsx"));
  ({ LearnerProfileGate } = await vite.ssrLoadModule("/src/learner-profile/LearnerProfileGate.tsx"));
  ({ usePeppaConversation } = await vite.ssrLoadModule(
    "/src/conversation/usePeppaConversation.ts",
  ));
  ({ ApplicationRoutes } = await vite.ssrLoadModule("/src/app/App.tsx"));
  const catalog = await vite.ssrLoadModule("/src/lessons/lesson-catalog.ts");
  firstLesson = catalog.LESSONS[0].lesson;
  firstLessonId = catalog.LESSONS[0].id;
});

afterEach(async () => {
  restoreExperienceSink();
  restoreExperienceSink = () => {};
  await cleanupMountedRoots();
  document.body.replaceChildren();
  globalThis.fetch = originalFetch;
  globalThis.Audio = originalAudio;
  globalThis.MediaRecorder = originalMediaRecorder;
  window.Audio = originalAudio;
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: originalMediaDevices,
  });
  window.history.replaceState(null, "", "/");
});

after(async () => {
  await vite.close();
  restoreDom();
});

function emptyAnswers(responses = {}) {
  return {
    schemaVersion: 2,
    questionnaireVersion: 2,
    responses,
    legacyAnswers: null,
  };
}

function question(overrides = {}) {
  return {
    answerKey: "name",
    position: 1,
    promptEn: "Hi! I'm Peppa. What's your name?",
    promptZh: "你好！我是佩奇。你叫什么名字？",
    required: true,
    maxLength: 120,
    audio: null,
    ...overrides,
  };
}

function fullLearnerProfileState(overrides = {}) {
  const base = {
    mode: "full",
    profile: {
      name: null,
      age: null,
      answers: emptyAnswers(),
      questionnaireVersion: 2,
      currentQuestionKey: "name",
      profileStatus: "not_started",
      completedAt: null,
    },
    questionnaire: { version: 2 },
    question: question(),
    progress: { answered: 0, current: 1, total: 1 },
    canBypass: false,
  };

  return { ...base, ...overrides };
}

function completedLearnerProfileState() {
  return fullLearnerProfileState({
    canBypass: true,
    profile: {
      ...fullLearnerProfileState().profile,
      name: "Mia",
      currentQuestionKey: null,
      profileStatus: "completed",
      completedAt: "2026-07-06T08:00:00.000Z",
    },
    question: null,
    progress: { answered: 1, current: 1, total: 1 },
  });
}

function json(payload, status = 200) {
  return Response.json(payload, { status });
}

function conversationStartResponse(id) {
  return json({
    conversation: { id },
    livekit: {
      participantToken: "participant-token",
      url: "wss://livekit.example.test",
    },
    scenario: {
      key: "small-chat",
      maxOptionalExchanges: 3,
      requiredDetails: [],
      summaryMode: "none",
      version: 1,
    },
  });
}

function installConversationFetch(id) {
  globalThis.fetch = async (path, init = {}) => {
    if (path === "/api/conversations" && init.method === "POST") {
      return conversationStartResponse(id);
    }
    if (
      path === `/api/conversations/${id}/finish` &&
      init.method === "POST"
    ) {
      return json({ conversation: {} });
    }
    throw new Error(`Unexpected request: ${init.method} ${path}`);
  };
}

function abortError() {
  const error = new Error("The request was aborted.");
  error.name = "AbortError";
  return error;
}

function button(name) {
  const match = [...document.querySelectorAll("button")].find(
    (candidate) =>
      candidate.getAttribute("aria-label") === name ||
      candidate.textContent.trim() === name,
  );
  assert.ok(match, `Expected a button named ${name}.`);
  return match;
}

function output(name) {
  const match = document.querySelector(`output[aria-label="${name}"]`);
  assert.ok(match, `Expected an output named ${name}.`);
  return match;
}

function learnerProfileRouteProps(completedLearnerProfileFallback) {
  return {
    completedLearnerProfileFallback,
    isLearnerProfileRoute: true,
    isProfileRoute: false,
    learnerProfileFallback: createElement("p", null, "LEARNER_PROFILE ROUTE"),
    onCloseProfileRoute() {},
    onOpenProfileRoute() {},
  };
}

function ConversationHookHarness({
  createTransport,
  now,
  onBack = () => {},
  onCompleted = async () => {},
  purpose = "onboarding",
}) {
  const conversation = usePeppaConversation({
    active: true,
    createTransport,
    now,
    onBack,
    onCompleted,
    purpose,
  });
  return createElement(
    "section",
    null,
    createElement("output", { "aria-label": "Conversation status" }, conversation.status),
    createElement(
      "output",
      { "aria-label": "Learner turn ready" },
      String(conversation.turnReady),
    ),
    createElement(
      "output",
      { "aria-label": "Microphone busy" },
      String(conversation.microphoneBusy),
    ),
    createElement(
      "output",
      { "aria-label": "Audio playback blocked" },
      String(conversation.audioPlaybackBlocked),
    ),
    createElement(
      "output",
      { "aria-label": "Audio playback busy" },
      String(conversation.audioPlaybackBusy),
    ),
    createElement(
      "output",
      { "aria-label": "Audio playback error" },
      conversation.audioPlaybackError,
    ),
    createElement(
      "output",
      { "aria-label": "Peppa response latency" },
      conversation.responseLatencyMs ?? "",
    ),
    createElement(
      "output",
      { "aria-label": "Live transcript" },
      conversation.liveTranscript ?? "",
    ),
    createElement(
      "output",
      { "aria-label": "Conversation error" },
      conversation.error,
    ),
    createElement("button", { onClick: conversation.onStart, type: "button" }, "Start voice"),
    createElement(
      "button",
      {
        disabled: conversation.audioPlaybackBusy,
        onClick: conversation.onStartAudio,
        type: "button",
      },
      "Start sound",
    ),
    createElement(
      "button",
      { onClick: conversation.onToggleMicrophone, type: "button" },
      conversation.microphoneEnabled ? "End my turn" : "Start my turn",
    ),
    createElement(
      "button",
      { onClick: conversation.onRepeatAudio, type: "button" },
      "Repeat voice",
    ),
    createElement(
      "button",
      { onClick: conversation.onFinish, type: "button" },
      "Finish voice",
    ),
    createElement(
      "button",
      { onClick: conversation.onBack, type: "button" },
      "Back voice",
    ),
  );
}

function conversationSurfaceProps(overrides = {}) {
  return {
    canFinish: true,
    error: "",
    liveTranscript: "",
    microphoneBusy: false,
    microphoneEnabled: false,
    onBack() {},
    onFinish() {},
    onPromptStyleChange() {},
    onRepeatAudio() {},
    onStart() {},
    onToggleMicrophone() {},
    purpose: "small-chat",
    promptStyle: "tiny-turns",
    responseLatencyMs: null,
    status: "listening",
    turnReady: true,
    turns: [],
    ...overrides,
  };
}

function ProfileRouteHarness({ children }) {
  const [route, setRoute] = useState("/");

  return createElement(
    LearnerProfileGate,
    {
      completedLearnerProfileFallback: children,
      isLearnerProfileRoute: false,
      isProfileRoute: route === "/profile",
      learnerProfileFallback: createElement("p", null, "LEARNER_PROFILE ROUTE"),
      onCloseProfileRoute: () => setRoute("/"),
      onOpenProfileRoute: () => setRoute("/profile"),
    },
    children,
  );
}

function StandaloneConversationRouteHarness() {
  const [route, setRoute] = useState("/talk-to-peppa");
  const isConversationRoute = route === "/talk-to-peppa";

  return createElement(
    LearnerProfileGate,
    {
      completedLearnerProfileFallback: createElement("p", null, "MAIN MENU"),
      isConversationRoute,
      isLearnerProfileRoute: false,
      isProfileRoute: false,
      learnerProfileFallback: createElement("p", null, "LEARNER PROFILE ROUTE"),
      onCloseProfileRoute() {},
      onConversationCompleted: () => setRoute("/"),
      onOpenProfileRoute() {},
      onRedoCompleted() {},
      onRedoLearnerProfileRoute() {},
      redoLearnerProfile: false,
    },
    isConversationRoute
      ? createElement("p", null, "VOICE CHAT UNAVAILABLE")
      : createElement(
          "main",
          null,
          createElement("p", null, "MAIN MENU"),
          createElement(
            "button",
            { onClick: () => setRoute("/talk-to-peppa"), type: "button" },
            "Talk to Peppa",
          ),
        ),
  );
}

function RouterHistoryControls() {
  const location = useLocation();
  const navigate = useNavigate();

  return createElement(
    "aside",
    { "aria-label": "Router test controls" },
    createElement(
      "output",
      {
        "aria-label": "Current route",
        "data-location-key": location.key,
      },
      `${location.pathname}${location.search}${location.hash}`,
    ),
    createElement(
      "button",
      { onClick: () => navigate(-1), type: "button" },
      "History back",
    ),
    createElement(
      "button",
      { onClick: () => navigate(lessonScenePath(2)), type: "button" },
      "Open scene 2",
    ),
  );
}

function applicationRoutesInMemory({ initialEntries, initialIndex }) {
  return createElement(
    MemoryRouter,
    { initialEntries, initialIndex },
    createElement(
      "div",
      null,
      createElement(ApplicationRoutes, { loginTarget: "/" }),
      createElement(RouterHistoryControls),
    ),
  );
}

function currentRoute() {
  const route = document.querySelector('output[aria-label="Current route"]');
  assert.ok(route, "Expected the router controls to expose the current route.");
  return {
    key: route.getAttribute("data-location-key"),
    path: route.textContent,
  };
}

function lessonScenePath(sceneNumber) {
  return `/lessons/parrot/${encodeURIComponent(firstLessonId)}/scenes/${sceneNumber}`;
}

function installControlledAudio() {
  class ControlledAudio {
    static instances = [];

    constructor(source) {
      this.source = source;
      this.onended = null;
      this.onerror = null;
      this.paused = false;
      ControlledAudio.instances.push(this);
    }

    pause() {
      this.paused = true;
    }

    play() {
      return Promise.resolve();
    }

    finish() {
      this.onended?.(new window.Event("ended"));
    }

    fail() {
      this.onerror?.(new window.Event("error"));
    }
  }

  globalThis.Audio = ControlledAudio;
  window.Audio = ControlledAudio;
  return ControlledAudio;
}

function installSpeechRecorder() {
  class TestMediaRecorder {
    constructor() {
      this.ondataavailable = null;
      this.onerror = null;
      this.onstop = null;
      this.state = "inactive";
    }

    start() {
      this.state = "recording";
    }

    stop() {
      if (this.state !== "recording") return;
      this.state = "inactive";
      this.ondataavailable?.({
        data: new Blob(["recorded audio"], { type: "audio/webm" }),
      });
      this.onstop?.();
    }
  }

  globalThis.MediaRecorder = TestMediaRecorder;
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      async getUserMedia() {
        return { getTracks: () => [{ stop() {} }] };
      },
    },
  });
}

async function advanceToLearnerTurn(ControlledAudio) {
  await click(button("Start lesson"));
  for (let index = 0; index < 4; index += 1) {
    await waitFor(() =>
      assert.equal(ControlledAudio.instances.length, index + 1),
    );
    await act(async () => ControlledAudio.instances[index].finish());
  }
  await waitFor(() => {
    const microphone = button("Microphone");
    assert.equal(microphone.getAttribute("aria-pressed"), "false");
    assert.match(microphone.textContent, /Tap to talk/);
  });
}

async function recordLearnerTurn() {
  const microphone = button("Microphone");
  await click(microphone);
  await waitFor(() => {
    assert.equal(microphone.getAttribute("aria-pressed"), "true");
    assert.match(microphone.textContent, /Tap when done/);
  });

  await click(microphone);
  await waitFor(() => text(/Checking your words/));
}

function text(value) {
  assert.match(document.body.textContent, value);
}

function captureExperienceEvents() {
  const events = [];
  restoreExperienceSink();
  restoreExperienceSink = experienceEvents.installSink((event) => {
    events.push(event);
  });
  return events;
}

function noText(value) {
  assert.doesNotMatch(document.body.textContent, value);
}

function createSessionClient(initialState) {
  let state = initialState;
  const listeners = new Set();
  const retry = deferred();
  const signInCalls = [];

  function publish(nextState) {
    state = nextState;
    for (const listener of listeners) listener();
  }

  const client = {
    retry,
    signInCalls,
    signIn: {
      async email(fields) {
        signInCalls.push(fields);
        publish({
          data: { user: { email: fields.email, name: "Mia" } },
          error: null,
          isPending: false,
        });
        return { error: null };
      },
    },
    async signOut() {
      publish({ data: null, error: null, isPending: false });
      return { error: null };
    },
    signUp: {
      async email(fields) {
        publish({
          data: { user: { email: fields.email, name: fields.name } },
          error: null,
          isPending: false,
        });
        return { error: null };
      },
    },
    useSession() {
      const snapshot = useSyncExternalStore(
        (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        () => state,
        () => state,
      );
      return {
        ...snapshot,
        async refetch() {
          if (!snapshot.error) return;
          await retry.promise;
          publish({ data: null, error: null, isPending: false });
        },
      };
    },
  };

  return client;
}

describe("mounted React lifecycle boundaries", { concurrency: false }, () => {
  it("keeps loading visible until the StrictMode onboarding request resolves", async () => {
    const response = deferred();
    let requests = 0;
    globalThis.fetch = async (path, init = {}) => {
      assert.equal(path, "/api/learner-profile");
      requests += 1;
      if (requests === 1) {
        return new Promise((_, reject) => {
          init.signal.addEventListener("abort", () => reject(abortError()), {
            once: true,
          });
        });
      }
      return response.promise;
    };

    await mountStrict(
      createElement(
        LearnerProfileGate,
        learnerProfileRouteProps(createElement("p", null, "LESSON CATALOG")),
        createElement("p", null, "LESSON CATALOG"),
      ),
    );

    await waitFor(() => assert.equal(requests, 2));
    text(/Loading your questions…/);
    noText(/Help Peppa get to know you/);

    response.resolve(json(fullLearnerProfileState()));
    await waitFor(() => text(/Help Peppa get to know you/));
    noText(/Loading your questions…/);
  });

  it("opens the learner's turn only after Peppa finishes her opening", async () => {
    const experienceTrace = captureExperienceEvents();
    let disconnectCalls = 0;
    let listener = () => {};
    const microphoneCalls = [];
    const transport = {
      async connect() {},
      async disconnect() {
        disconnectCalls += 1;
      },
      async sendText() {},
      async setMicrophoneEnabled(enabled) {
        microphoneCalls.push(enabled);
      },
      subscribe(nextListener) {
        listener = nextListener;
        return () => {};
      },
    };
    globalThis.fetch = async (path, init = {}) => {
      assert.equal(path, "/api/conversations");
      assert.equal(init.method, "POST");
      return json({
        conversation: { id: "conversation-1" },
        livekit: {
          participantToken: "participant-token",
          url: "wss://livekit.example.test",
        },
        scenario: {
          key: "small-chat",
          maxOptionalExchanges: 3,
          requiredDetails: ["name", "age"],
          summaryMode: "prose",
          version: 1,
        },
      });
    };

    await mountStrict(
      createElement(ConversationHookHarness, {
        createTransport: () => transport,
      }),
    );
    await waitFor(() =>
      assert.equal(
        document.querySelector('output[aria-label="Conversation status"]')
          .textContent,
        "connecting",
      ),
    );

    assert.deepEqual(microphoneCalls, [false]);
    await act(async () => {
      listener({ type: "speech-started", role: "assistant" });
      await flush();
    });
    assert.equal(
      document.querySelector('output[aria-label="Conversation status"]')
        .textContent,
      "speaking",
    );
    assert.equal(
      document.querySelector('output[aria-label="Learner turn ready"]')
        .textContent,
      "false",
    );
    await click(button("Start my turn"));
    assert.deepEqual(microphoneCalls, [false]);

    await act(async () => {
      listener({
        type: "transcription",
        id: "peppa-opening",
        text: "Hi Mia! Lovely to see you again!",
        final: true,
        language: "en",
        role: "assistant",
      });
      await flush();
    });
    assert.equal(
      document.querySelector('output[aria-label="Conversation status"]')
        .textContent,
      "speaking",
    );

    await act(async () => {
      listener({ type: "speech-ended", role: "assistant" });
      await flush();
    });
    await waitFor(() =>
      assert.equal(
        document.querySelector('output[aria-label="Conversation status"]')
          .textContent,
        "listening",
      ),
    );
    assert.equal(
      document.querySelector('output[aria-label="Learner turn ready"]')
        .textContent,
      "true",
    );
    await waitFor(() => {
      const startup = experienceTrace.find(
        (event) =>
          event.name === "conversation_start" && event.outcome === "ready",
      );
      assert.ok(startup);
      assert.equal(startup.surface, "learner_profile");
      assert.ok(startup.apiReadyMs <= startup.roomReadyMs);
      assert.ok(startup.roomReadyMs <= startup.microphoneMutedMs);
      assert.ok(startup.microphoneMutedMs <= startup.learnerTurnReadyMs);
      assert.deepEqual(Object.keys(startup).sort(), [
        "apiReadyMs",
        "learnerTurnReadyMs",
        "microphoneMutedMs",
        "name",
        "outcome",
        "roomReadyMs",
        "schemaVersion",
        "surface",
      ]);
    });
    await click(button("Start my turn"));
    await waitFor(() => assert.deepEqual(microphoneCalls, [false, true]));
    assert.equal(disconnectCalls, 0);
  });

  it("keeps the learner turn closed until blocked sound is recovered and replayed", async () => {
    const experienceTrace = captureExperienceEvents();
    const startAudioRequest = deferred();
    const microphoneCalls = [];
    let listener = () => {};
    let now = 1_000;
    let repeatCalls = 0;
    let startAudioCalls = 0;
    const transport = {
      async connect() {},
      async disconnect() {},
      async repeatLastAudio() {
        repeatCalls += 1;
      },
      setMicrophoneEnabled(enabled) {
        microphoneCalls.push(enabled);
      },
      startAudio() {
        startAudioCalls += 1;
        return startAudioRequest.promise;
      },
      subscribe(nextListener) {
        listener = nextListener;
        return () => {};
      },
    };
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/conversations" && init.method === "POST") {
        return conversationStartResponse("conversation-audio-blocked");
      }
      if (path.endsWith("/finish") && init.method === "POST") {
        return json({ conversation: {} });
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      createElement(ConversationHookHarness, {
        createTransport: () => transport,
        now: () => now,
        purpose: "small-chat",
      }),
    );
    await click(button("Start voice"));
    await waitFor(() => assert.deepEqual(microphoneCalls, [false]));

    await act(async () => {
      listener({ type: "speech-started", role: "assistant" });
      listener({
        type: "transcription",
        id: "private-opening-id",
        text: "Hi Mia, this is a private opening.",
        final: true,
        language: "en",
        role: "assistant",
      });
      await flush();
    });
    now = 1_120;
    await act(async () => {
      listener({ type: "audio-playback", state: "blocked" });
      listener({ type: "speech-ended", role: "assistant" });
      await flush();
    });

    assert.equal(output("Audio playback blocked").textContent, "true");
    assert.equal(output("Audio playback busy").textContent, "false");
    assert.equal(output("Learner turn ready").textContent, "false");
    await click(button("Start my turn"));
    assert.deepEqual(microphoneCalls, [false]);
    await waitFor(() => {
      const playbackEvents = experienceTrace.filter(
        (event) => event.name === "conversation_audio_playback",
      );
      assert.deepEqual(playbackEvents, [
        {
          durationMs: 120,
          name: "conversation_audio_playback",
          outcome: "blocked",
          schemaVersion: 1,
          surface: "talk",
        },
      ]);
      assert.doesNotMatch(
        JSON.stringify(playbackEvents),
        /Mia|private-opening-id|private opening|conversation-audio-blocked/i,
      );
    });

    await click(button("Start sound"));
    assert.equal(startAudioCalls, 1);
    assert.equal(output("Audio playback busy").textContent, "true");
    assert.equal(output("Learner turn ready").textContent, "false");
    assert.equal(button("Start sound").disabled, true);

    await act(async () => {
      listener({ type: "audio-playback", state: "ready" });
      await flush();
    });
    assert.equal(output("Audio playback blocked").textContent, "false");
    assert.equal(output("Audio playback busy").textContent, "false");
    assert.equal(repeatCalls, 1);

    startAudioRequest.resolve();
    await flush();
    assert.equal(repeatCalls, 1);
    assert.equal(output("Audio playback blocked").textContent, "false");
    assert.equal(output("Audio playback busy").textContent, "false");
    assert.equal(output("Learner turn ready").textContent, "false");

    await act(async () => {
      listener({ type: "audio-playback", state: "started" });
      listener({ type: "speech-started", role: "assistant" });
      listener({ type: "speech-ended", role: "assistant" });
      await flush();
    });
    await waitFor(() =>
      assert.equal(output("Learner turn ready").textContent, "true"),
    );
    assert.equal(output("Conversation status").textContent, "listening");
    assert.equal(repeatCalls, 1);
  });

  it("restores the sound action with fixed copy when playback recovery fails", async () => {
    const microphoneCalls = [];
    let listener = () => {};
    let startAudioCalls = 0;
    const transport = {
      async connect() {},
      async disconnect() {},
      async repeatLastAudio() {},
      setMicrophoneEnabled(enabled) {
        microphoneCalls.push(enabled);
      },
      async startAudio() {
        startAudioCalls += 1;
        throw new Error("NotAllowedError for Mia and secret-room-token");
      },
      subscribe(nextListener) {
        listener = nextListener;
        return () => {};
      },
    };
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/conversations" && init.method === "POST") {
        return conversationStartResponse("conversation-audio-rejected");
      }
      if (path.endsWith("/finish") && init.method === "POST") {
        return json({ conversation: {} });
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      createElement(ConversationHookHarness, {
        createTransport: () => transport,
        purpose: "small-chat",
      }),
    );
    await click(button("Start voice"));
    await waitFor(() => assert.deepEqual(microphoneCalls, [false]));
    await act(async () => {
      listener({ type: "audio-playback", state: "blocked" });
      await flush();
    });

    await click(button("Start sound"));
    await waitFor(() => {
      assert.equal(output("Audio playback blocked").textContent, "true");
      assert.equal(output("Audio playback busy").textContent, "false");
      assert.equal(
        output("Audio playback error").textContent,
        "Sound did not start. Tap again.",
      );
    });
    assert.equal(button("Start sound").disabled, false);
    assert.equal(output("Conversation error").textContent, "");
    assert.doesNotMatch(
      document.body.textContent,
      /NotAllowedError|Mia|secret-room-token/,
    );

    await click(button("Start sound"));
    await waitFor(() => assert.equal(startAudioCalls, 2));
    assert.equal(button("Start sound").disabled, false);
    assert.equal(
      output("Audio playback error").textContent,
      "Sound did not start. Tap again.",
    );
  });

  it("does not restore a sound block when native playback wins a late rejection", async () => {
    const startAudioRequest = deferred();
    const microphoneCalls = [];
    let listener = () => {};
    let repeatCalls = 0;
    let startAudioCalls = 0;
    const transport = {
      async connect() {},
      async disconnect() {},
      async repeatLastAudio() {
        repeatCalls += 1;
      },
      setMicrophoneEnabled(enabled) {
        microphoneCalls.push(enabled);
      },
      startAudio() {
        startAudioCalls += 1;
        return startAudioRequest.promise;
      },
      subscribe(nextListener) {
        listener = nextListener;
        return () => {};
      },
    };
    installConversationFetch("conversation-audio-late-rejection");

    await mountStrict(
      createElement(ConversationHookHarness, {
        createTransport: () => transport,
        purpose: "small-chat",
      }),
    );
    await click(button("Start voice"));
    await waitFor(() => assert.deepEqual(microphoneCalls, [false]));
    await act(async () => {
      listener({ type: "audio-playback", state: "blocked" });
      await flush();
    });
    await click(button("Start sound"));
    assert.equal(startAudioCalls, 1);
    assert.equal(output("Audio playback busy").textContent, "true");

    await act(async () => {
      listener({ type: "audio-playback", state: "started" });
      await flush();
    });
    assert.equal(output("Audio playback blocked").textContent, "false");
    assert.equal(output("Audio playback busy").textContent, "false");
    assert.equal(output("Audio playback error").textContent, "");

    startAudioRequest.reject(
      new Error("NotAllowedError with private-room-token"),
    );
    await flush();
    assert.equal(output("Audio playback blocked").textContent, "false");
    assert.equal(output("Audio playback busy").textContent, "false");
    assert.equal(output("Audio playback error").textContent, "");
    assert.equal(repeatCalls, 0);
    assert.doesNotMatch(document.body.textContent, /private-room-token/);
  });

  it("keeps a newer sound recovery pending when an older request rejects", async () => {
    const firstStartAudio = deferred();
    const secondStartAudio = deferred();
    const microphoneCalls = [];
    let listener = () => {};
    let startAudioCalls = 0;
    const transport = {
      async connect() {},
      async disconnect() {},
      async repeatLastAudio() {},
      setMicrophoneEnabled(enabled) {
        microphoneCalls.push(enabled);
      },
      startAudio() {
        startAudioCalls += 1;
        return startAudioCalls === 1
          ? firstStartAudio.promise
          : secondStartAudio.promise;
      },
      subscribe(nextListener) {
        listener = nextListener;
        return () => {};
      },
    };
    installConversationFetch("conversation-audio-recovery-epochs");

    await mountStrict(
      createElement(ConversationHookHarness, {
        createTransport: () => transport,
        purpose: "small-chat",
      }),
    );
    await click(button("Start voice"));
    await waitFor(() => assert.deepEqual(microphoneCalls, [false]));
    await act(async () => {
      listener({ type: "audio-playback", state: "blocked" });
      await flush();
    });
    await click(button("Start sound"));
    assert.equal(startAudioCalls, 1);
    assert.equal(output("Audio playback busy").textContent, "true");

    await act(async () => {
      listener({ type: "audio-playback", state: "ready" });
      listener({ type: "audio-playback", state: "blocked" });
      await flush();
    });
    assert.equal(output("Audio playback blocked").textContent, "true");
    assert.equal(output("Audio playback busy").textContent, "false");

    await click(button("Start sound"));
    assert.equal(startAudioCalls, 2);
    assert.equal(output("Audio playback busy").textContent, "true");
    assert.equal(output("Audio playback error").textContent, "");

    firstStartAudio.reject(
      new Error("NotAllowedError from stale private-room-token"),
    );
    await flush();
    assert.equal(output("Audio playback blocked").textContent, "true");
    assert.equal(output("Audio playback busy").textContent, "true");
    assert.equal(output("Audio playback error").textContent, "");
    assert.equal(button("Start sound").disabled, true);
    assert.doesNotMatch(document.body.textContent, /private-room-token/);

    secondStartAudio.resolve();
    await waitFor(() =>
      assert.equal(output("Audio playback busy").textContent, "false"),
    );
    assert.equal(output("Audio playback blocked").textContent, "false");
    assert.equal(output("Audio playback error").textContent, "");
    assert.equal(startAudioCalls, 2);
  });

  it("coalesces rapid sound taps while playback recovery is pending", async () => {
    const startAudioRequest = deferred();
    const microphoneCalls = [];
    let listener = () => {};
    let startAudioCalls = 0;
    const transport = {
      async connect() {},
      async disconnect() {},
      async repeatLastAudio() {},
      setMicrophoneEnabled(enabled) {
        microphoneCalls.push(enabled);
      },
      startAudio() {
        startAudioCalls += 1;
        return startAudioRequest.promise;
      },
      subscribe(nextListener) {
        listener = nextListener;
        return () => {};
      },
    };
    installConversationFetch("conversation-audio-rapid-taps");

    await mountStrict(
      createElement(ConversationHookHarness, {
        createTransport: () => transport,
        purpose: "small-chat",
      }),
    );
    await click(button("Start voice"));
    await waitFor(() => assert.deepEqual(microphoneCalls, [false]));
    await act(async () => {
      listener({ type: "audio-playback", state: "blocked" });
      await flush();
    });

    const sound = button("Start sound");
    await act(async () => {
      sound.click();
      sound.click();
      await flush();
    });
    assert.equal(startAudioCalls, 1);
    assert.equal(output("Audio playback busy").textContent, "true");
    assert.equal(button("Start sound").disabled, true);

    startAudioRequest.resolve();
    await waitFor(() =>
      assert.equal(output("Audio playback busy").textContent, "false"),
    );
    assert.equal(startAudioCalls, 1);
    assert.equal(output("Audio playback blocked").textContent, "false");
    assert.equal(output("Audio playback error").textContent, "");
  });

  it("recovers an established track from ready and a fulfilled sound request", async () => {
    const startAudioRequest = deferred();
    const microphoneCalls = [];
    let listener = () => {};
    let repeatCalls = 0;
    let startAudioCalls = 0;
    const transport = {
      async connect() {},
      async disconnect() {},
      async repeatLastAudio() {
        repeatCalls += 1;
      },
      setMicrophoneEnabled(enabled) {
        microphoneCalls.push(enabled);
      },
      startAudio() {
        startAudioCalls += 1;
        return startAudioRequest.promise;
      },
      subscribe(nextListener) {
        listener = nextListener;
        return () => {};
      },
    };
    installConversationFetch("conversation-audio-established-track");

    await mountStrict(
      createElement(ConversationHookHarness, {
        createTransport: () => transport,
        purpose: "small-chat",
      }),
    );
    await click(button("Start voice"));
    await waitFor(() => assert.deepEqual(microphoneCalls, [false]));
    await act(async () => {
      listener({ type: "audio-playback", state: "started" });
      listener({
        type: "transcription",
        id: "established-opening",
        text: "Hello!",
        final: true,
        language: "en",
        role: "assistant",
      });
      await flush();
    });
    await waitFor(() =>
      assert.equal(output("Learner turn ready").textContent, "true"),
    );

    await act(async () => {
      listener({ type: "audio-playback", state: "blocked" });
      await flush();
    });
    assert.equal(output("Audio playback blocked").textContent, "true");
    assert.equal(output("Learner turn ready").textContent, "false");

    await click(button("Start sound"));
    assert.equal(startAudioCalls, 1);
    assert.equal(output("Audio playback busy").textContent, "true");
    await act(async () => {
      listener({ type: "audio-playback", state: "ready" });
      await flush();
    });
    assert.equal(output("Audio playback blocked").textContent, "false");
    assert.equal(output("Audio playback busy").textContent, "false");
    assert.equal(output("Learner turn ready").textContent, "true");

    startAudioRequest.resolve();
    await flush();
    assert.equal(output("Audio playback blocked").textContent, "false");
    assert.equal(output("Audio playback busy").textContent, "false");
    assert.equal(output("Audio playback error").textContent, "");
    assert.equal(output("Conversation status").textContent, "listening");
    assert.equal(repeatCalls, 0);
  });

  it("does not infer a missed opening from a delayed native playback signal", async () => {
    const experienceTrace = captureExperienceEvents();
    const microphoneCalls = [];
    let listener = () => {};
    let now = 2_000;
    let repeatCalls = 0;
    const transport = {
      async connect() {},
      async disconnect() {},
      async repeatLastAudio() {
        repeatCalls += 1;
      },
      setMicrophoneEnabled(enabled) {
        microphoneCalls.push(enabled);
      },
      async startAudio() {},
      subscribe(nextListener) {
        listener = nextListener;
        return () => {};
      },
    };
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/conversations" && init.method === "POST") {
        return conversationStartResponse("conversation-audio-delayed");
      }
      if (path.endsWith("/finish") && init.method === "POST") {
        return json({ conversation: {} });
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      createElement(ConversationHookHarness, {
        createTransport: () => transport,
        now: () => now,
        purpose: "small-chat",
      }),
    );
    await click(button("Start voice"));
    await waitFor(() => assert.deepEqual(microphoneCalls, [false]));
    await act(async () => {
      listener({ type: "audio-playback", state: "ready" });
      listener({ type: "speech-started", role: "assistant" });
      listener({
        type: "transcription",
        id: "opening-before-native-playing",
        text: "Hello!",
        final: true,
        language: "en",
        role: "assistant",
      });
      listener({ type: "speech-ended", role: "assistant" });
      await flush();
    });
    assert.equal(output("Learner turn ready").textContent, "false");
    assert.equal(repeatCalls, 0);
    assert.deepEqual(
      experienceTrace.filter(
        (event) => event.name === "conversation_audio_playback",
      ),
      [],
    );

    now = 2_400;
    await act(async () => {
      listener({ type: "audio-playback", state: "started" });
      await flush();
    });
    await waitFor(() =>
      assert.equal(output("Learner turn ready").textContent, "true"),
    );
    assert.equal(repeatCalls, 0);
    await act(async () => {
      listener({ type: "audio-playback", state: "started" });
      await flush();
    });
    assert.equal(repeatCalls, 0);
    await waitFor(() => {
      const playbackEvents = experienceTrace.filter(
        (event) => event.name === "conversation_audio_playback",
      );
      assert.deepEqual(playbackEvents, [
        {
          durationMs: 400,
          name: "conversation_audio_playback",
          outcome: "ready",
          schemaVersion: 1,
          surface: "talk",
        },
      ]);
    });

    assert.equal(output("Conversation status").textContent, "listening");
    assert.equal(repeatCalls, 0);
  });

  it("replays once when playback stops during speech and a replacement starts", async () => {
    const microphoneCalls = [];
    let listener = () => {};
    let repeatCalls = 0;
    const transport = {
      async connect() {},
      async disconnect() {},
      async repeatLastAudio() {
        repeatCalls += 1;
      },
      setMicrophoneEnabled(enabled) {
        microphoneCalls.push(enabled);
      },
      async startAudio() {},
      subscribe(nextListener) {
        listener = nextListener;
        return () => {};
      },
    };
    installConversationFetch("conversation-audio-replacement-track");

    await mountStrict(
      createElement(ConversationHookHarness, {
        createTransport: () => transport,
        purpose: "small-chat",
      }),
    );
    await click(button("Start voice"));
    await waitFor(() => assert.deepEqual(microphoneCalls, [false]));
    await act(async () => {
      listener({ type: "audio-playback", state: "started" });
      listener({
        type: "transcription",
        id: "opening-before-replacement",
        text: "Hello!",
        final: true,
        language: "en",
        role: "assistant",
      });
      await flush();
    });
    await waitFor(() =>
      assert.equal(output("Learner turn ready").textContent, "true"),
    );

    await act(async () => {
      listener({ type: "speech-started", role: "assistant" });
      listener({ type: "audio-playback", state: "stopped" });
      await flush();
    });
    assert.equal(output("Learner turn ready").textContent, "false");
    assert.equal(output("Conversation status").textContent, "connecting");
    assert.equal(repeatCalls, 0);

    await act(async () => {
      listener({ type: "audio-playback", state: "started" });
      listener({ type: "audio-playback", state: "started" });
      await flush();
    });
    assert.equal(repeatCalls, 0);
    assert.equal(output("Learner turn ready").textContent, "false");

    await act(async () => {
      listener({ type: "speech-ended", role: "assistant" });
      await flush();
    });
    await waitFor(() => assert.equal(repeatCalls, 1));
    assert.equal(output("Conversation status").textContent, "speaking");
    assert.equal(output("Learner turn ready").textContent, "false");

    await act(async () => {
      listener({ type: "speech-started", role: "assistant" });
      listener({ type: "speech-ended", role: "assistant" });
      await flush();
    });
    await waitFor(() =>
      assert.equal(output("Learner turn ready").textContent, "true"),
    );
    assert.equal(output("Conversation status").textContent, "listening");
    assert.equal(repeatCalls, 1);
  });

  it("ignores the repeat callback while playback is blocked", async () => {
    const microphoneCalls = [];
    let listener = () => {};
    let repeatCalls = 0;
    const transport = {
      async connect() {},
      async disconnect() {},
      async repeatLastAudio() {
        repeatCalls += 1;
      },
      setMicrophoneEnabled(enabled) {
        microphoneCalls.push(enabled);
      },
      async startAudio() {},
      subscribe(nextListener) {
        listener = nextListener;
        return () => {};
      },
    };
    installConversationFetch("conversation-audio-repeat-blocked");

    await mountStrict(
      createElement(ConversationHookHarness, {
        createTransport: () => transport,
        purpose: "small-chat",
      }),
    );
    await click(button("Start voice"));
    await waitFor(() => assert.deepEqual(microphoneCalls, [false]));
    await act(async () => {
      listener({ type: "audio-playback", state: "started" });
      listener({
        type: "transcription",
        id: "opening-before-repeat-block",
        text: "Hello!",
        final: true,
        language: "en",
        role: "assistant",
      });
      await flush();
    });
    await waitFor(() =>
      assert.equal(output("Learner turn ready").textContent, "true"),
    );

    await act(async () => {
      listener({ type: "audio-playback", state: "blocked" });
      await flush();
    });
    assert.equal(output("Audio playback blocked").textContent, "true");
    assert.equal(output("Learner turn ready").textContent, "false");

    await click(button("Repeat voice"));
    assert.equal(repeatCalls, 0);
    assert.equal(output("Audio playback blocked").textContent, "true");
    assert.equal(output("Conversation error").textContent, "");
    assert.equal(output("Learner turn ready").textContent, "false");
  });

  it("ignores a stale sound-start completion after Back", async () => {
    const startAudioRequest = deferred();
    const microphoneCalls = [];
    let backCalls = 0;
    let disconnectCalls = 0;
    let listener = () => {};
    let repeatCalls = 0;
    const transport = {
      async connect() {},
      async disconnect() {
        disconnectCalls += 1;
      },
      async repeatLastAudio() {
        repeatCalls += 1;
      },
      setMicrophoneEnabled(enabled) {
        microphoneCalls.push(enabled);
      },
      startAudio() {
        return startAudioRequest.promise;
      },
      subscribe(nextListener) {
        listener = nextListener;
        return () => {};
      },
    };
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/conversations" && init.method === "POST") {
        return conversationStartResponse("conversation-audio-back");
      }
      if (path.endsWith("/finish") && init.method === "POST") {
        return json({ conversation: {} });
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      createElement(ConversationHookHarness, {
        createTransport: () => transport,
        onBack: () => {
          backCalls += 1;
        },
        purpose: "small-chat",
      }),
    );
    await click(button("Start voice"));
    await waitFor(() => assert.deepEqual(microphoneCalls, [false]));
    await act(async () => {
      listener({ type: "audio-playback", state: "blocked" });
      await flush();
    });
    await click(button("Start sound"));
    assert.equal(output("Audio playback busy").textContent, "true");

    await click(button("Back voice"));
    assert.equal(backCalls, 1);
    assert.equal(disconnectCalls, 1);
    assert.equal(output("Audio playback blocked").textContent, "false");
    assert.equal(output("Audio playback busy").textContent, "false");
    assert.equal(output("Learner turn ready").textContent, "false");

    startAudioRequest.resolve();
    await act(async () => {
      listener({ type: "audio-playback", state: "started" });
      await flush();
    });
    assert.equal(repeatCalls, 0);
    assert.equal(output("Audio playback blocked").textContent, "false");
    assert.equal(output("Audio playback busy").textContent, "false");
    assert.equal(output("Audio playback error").textContent, "");
    assert.equal(output("Learner turn ready").textContent, "false");
  });

  it("disconnects immediately on Finish and ignores a stale replay completion", async () => {
    const finishRequest = deferred();
    const repeatRequest = deferred();
    const microphoneCalls = [];
    let completedCalls = 0;
    let disconnectCalls = 0;
    let finishCalls = 0;
    let listener = () => {};
    let repeatCalls = 0;
    const transport = {
      async connect() {},
      async disconnect() {
        disconnectCalls += 1;
      },
      repeatLastAudio() {
        repeatCalls += 1;
        return repeatRequest.promise;
      },
      setMicrophoneEnabled(enabled) {
        microphoneCalls.push(enabled);
      },
      async startAudio() {},
      subscribe(nextListener) {
        listener = nextListener;
        return () => {};
      },
    };
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/conversations" && init.method === "POST") {
        return conversationStartResponse("conversation-audio-finish");
      }
      if (
        path === "/api/conversations/conversation-audio-finish/finish" &&
        init.method === "POST"
      ) {
        const { reason } = JSON.parse(init.body);
        if (reason === "finished_by_learner") {
          finishCalls += 1;
          return finishRequest.promise;
        }
        return json({ conversation: {} });
      }
      if (
        path === "/api/conversations/conversation-audio-finish" &&
        init.method === "GET"
      ) {
        return json({ conversation: { turns: [] } });
      }
      if (
        path === "/api/conversations/conversation-audio-finish/review" &&
        init.method === "PUT"
      ) {
        return json({
          bypassed: false,
          conversationId: "conversation-audio-finish",
          profileCompleted: false,
        });
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      createElement(ConversationHookHarness, {
        createTransport: () => transport,
        onCompleted: async () => {
          completedCalls += 1;
        },
        purpose: "small-chat",
      }),
    );
    await click(button("Start voice"));
    await waitFor(() => assert.deepEqual(microphoneCalls, [false]));
    await act(async () => {
      listener({ type: "speech-started", role: "assistant" });
      listener({ type: "audio-playback", state: "blocked" });
      listener({
        type: "transcription",
        id: "opening-before-finish",
        text: "Hello!",
        final: true,
        language: "en",
        role: "assistant",
      });
      listener({ type: "speech-ended", role: "assistant" });
      await flush();
    });
    await click(button("Start sound"));
    await act(async () => {
      listener({ type: "audio-playback", state: "started" });
      await flush();
    });
    await waitFor(() => assert.equal(repeatCalls, 1));
    assert.equal(output("Learner turn ready").textContent, "false");

    await click(button("Finish voice"));
    assert.equal(finishCalls, 1);
    assert.equal(disconnectCalls, 1);
    assert.equal(completedCalls, 0);
    assert.equal(output("Conversation status").textContent, "saving");
    assert.equal(output("Audio playback blocked").textContent, "false");
    assert.equal(output("Audio playback busy").textContent, "false");

    repeatRequest.resolve();
    await act(async () => {
      listener({ type: "audio-playback", state: "started" });
      listener({ type: "speech-ended", role: "assistant" });
      await flush();
    });
    assert.equal(repeatCalls, 1);
    assert.equal(output("Learner turn ready").textContent, "false");
    assert.equal(output("Conversation status").textContent, "saving");

    finishRequest.resolve(json({ conversation: {} }));
    await waitFor(() => assert.equal(completedCalls, 1));
    assert.equal(disconnectCalls, 1);
  });

  it("acknowledges Start before the conversation request finishes", async () => {
    const experienceTrace = captureExperienceEvents();
    const response = deferred();
    globalThis.fetch = async () => response.promise;

    await mountStrict(
      createElement(ConversationHookHarness, { purpose: "small-chat" }),
    );
    assert.equal(
      document.querySelector('output[aria-label="Conversation status"]')
        .textContent,
      "ready",
    );

    await act(async () => {
      button("Start voice").click();
      await flush();
    });
    assert.equal(
      document.querySelector('output[aria-label="Conversation status"]')
        .textContent,
      "connecting",
    );

    response.resolve(json({}, 500));
    await waitFor(() =>
      assert.equal(
        document.querySelector('output[aria-label="Conversation status"]')
          .textContent,
        "error",
      ),
    );
    await waitFor(() =>
      assert.deepEqual(
        experienceTrace.map(({ name, outcome, stage, surface }) => ({
          name,
          outcome,
          stage,
          surface,
        })),
        [
          {
            name: "conversation_start",
            outcome: "failed",
            stage: "api",
            surface: "talk",
          },
        ],
      ),
    );
  });

  it("attributes startup failure after room connection to the initial mute control", async () => {
    const experienceTrace = captureExperienceEvents();
    const transport = {
      async connect() {},
      async disconnect() {},
      async sendText() {},
      async setMicrophoneEnabled() {
        throw new Error("Initial microphone setup failed");
      },
      subscribe() {
        return () => {};
      },
    };
    globalThis.fetch = async () =>
      json({
        conversation: { id: "conversation-microphone-startup-error" },
        livekit: {
          participantToken: "participant-token",
          url: "wss://livekit.example.test",
        },
        scenario: {
          key: "small-chat",
          maxOptionalExchanges: 3,
          requiredDetails: ["name", "age"],
          summaryMode: "prose",
          version: 1,
        },
      });

    await mountStrict(
      createElement(ConversationHookHarness, {
        createTransport: () => transport,
        purpose: "small-chat",
      }),
    );
    await click(button("Start voice"));
    await waitFor(() =>
      assert.equal(
        document.querySelector('output[aria-label="Conversation status"]')
          .textContent,
        "error",
      ),
    );
    await waitFor(() =>
      assert.deepEqual(
        experienceTrace.map(({ name, outcome, stage, surface }) => ({
          name,
          outcome,
          stage,
          surface,
        })),
        [
          {
            name: "conversation_start",
            outcome: "failed",
            stage: "microphone_mute",
            surface: "talk",
          },
        ],
      ),
    );
  });

  it("does not revive startup when the room disconnects during initial mute", async () => {
    const experienceTrace = captureExperienceEvents();
    const initialMute = deferred();
    let listener = () => {};
    let muteStarted = false;
    const transport = {
      async connect() {},
      async disconnect() {},
      async sendText() {},
      async setMicrophoneEnabled() {
        muteStarted = true;
        return initialMute.promise;
      },
      subscribe(nextListener) {
        listener = nextListener;
        return () => {};
      },
    };
    globalThis.fetch = async () =>
      json({
        conversation: { id: "conversation-disconnected-during-mute" },
        livekit: {
          participantToken: "participant-token",
          url: "wss://livekit.example.test",
        },
        scenario: {
          key: "small-chat",
          maxOptionalExchanges: 3,
          requiredDetails: ["name", "age"],
          summaryMode: "prose",
          version: 1,
        },
      });

    await mountStrict(
      createElement(ConversationHookHarness, {
        createTransport: () => transport,
        purpose: "small-chat",
      }),
    );
    await click(button("Start voice"));
    await waitFor(() => assert.equal(muteStarted, true));
    await act(async () => {
      listener({ type: "disconnected", reason: "SERVER_SHUTDOWN" });
      await flush();
    });
    assert.equal(
      document.querySelector('output[aria-label="Conversation status"]')
        .textContent,
      "error",
    );

    initialMute.resolve();
    await act(async () => flush());
    assert.equal(
      document.querySelector('output[aria-label="Conversation status"]')
        .textContent,
      "error",
    );
    assert.deepEqual(
      experienceTrace.map(({ name, outcome, stage }) => ({
        name,
        outcome,
        stage,
      })),
      [
        {
          name: "conversation_start",
          outcome: "failed",
          stage: "microphone_mute",
        },
      ],
    );
  });

  it("quarantines a stale Finish after the learner leaves and reopens chat", async () => {
    const experienceTrace = captureExperienceEvents();
    const finishRequest = deferred();
    let listener = () => {};
    const microphoneCalls = [];
    let conversationStarts = 0;
    let transportStarts = 0;
    const disconnectCalls = [0, 0];
    const transports = disconnectCalls.map((_, index) => ({
      async connect() {},
      async disconnect() {
        disconnectCalls[index] += 1;
      },
      async sendText() {},
      async setMicrophoneEnabled(enabled) {
        microphoneCalls.push(enabled);
      },
      subscribe(nextListener) {
        listener = nextListener;
        return () => {};
      },
    }));
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/conversations" && init.method === "POST") {
        conversationStarts += 1;
        return json({
          conversation: {
            id:
              conversationStarts === 1
                ? "conversation-finished-during-opening"
                : "conversation-reopened",
          },
          livekit: {
            participantToken: "participant-token",
            url: "wss://livekit.example.test",
          },
          scenario: {
            key: "small-chat",
            maxOptionalExchanges: 3,
            requiredDetails: ["name", "age"],
            summaryMode: "prose",
            version: 1,
          },
        });
      }
      if (
        path ===
          "/api/conversations/conversation-finished-during-opening/finish" &&
        init.method === "POST"
      ) {
        const { reason } = JSON.parse(init.body);
        return reason === "finished_by_learner"
          ? finishRequest.promise
          : json({ conversation: {} });
      }
      if (
        path === "/api/conversations/conversation-reopened/finish" &&
        init.method === "POST"
      ) {
        return json({ conversation: {} });
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      createElement(ConversationHookHarness, {
        createTransport: () => transports[transportStarts++],
        purpose: "small-chat",
      }),
    );
    await click(button("Start voice"));
    await waitFor(() => assert.deepEqual(microphoneCalls, [false]));
    await click(button("Finish voice"));
    await act(async () => {
      listener({
        type: "transcription",
        id: "late-opening",
        text: "Hello after Finish",
        final: true,
        language: "en",
        role: "assistant",
      });
      await flush();
    });
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
    assert.equal(
      document.querySelector('output[aria-label="Conversation status"]')
        .textContent,
      "saving",
    );
    assert.equal(
      document.querySelector('output[aria-label="Learner turn ready"]')
        .textContent,
      "false",
    );
    assert.equal(
      experienceTrace.some((event) => event.name === "conversation_start"),
      false,
    );

    await click(button("Back voice"));
    await click(button("Start voice"));
    await waitFor(() => {
      assert.equal(conversationStarts, 2);
      assert.equal(transportStarts, 2);
      assert.deepEqual(microphoneCalls, [false, false]);
    });
    finishRequest.resolve(json({ conversation: {} }));
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
    assert.deepEqual(disconnectCalls, [1, 0]);
    assert.equal(
      document.querySelector('output[aria-label="Conversation status"]')
        .textContent,
      "connecting",
    );
    assert.equal(
      document.querySelector('output[aria-label="Learner turn ready"]')
        .textContent,
      "false",
    );
  });

  it("returns a standalone conversation to the main menu and allows reopening it", async () => {
    let conversationStarts = 0;
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/learner-profile" && init.method === "GET") {
        return json({
          ...completedLearnerProfileState(),
          experienceMode: "realtime",
        });
      }
      if (path === "/api/conversations" && init.method === "POST") {
        conversationStarts += 1;
        assert.deepEqual(JSON.parse(init.body), {
          promptStyle: "tiny-turns",
          purpose: "small-chat",
        });
        return json({
          conversation: { id: `conversation-route-${conversationStarts}` },
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
        });
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(createElement(StandaloneConversationRouteHarness));
    await waitFor(() => text(/Talk to Peppa/));
    await click(button("Start chat"));
    await waitFor(() => text(/Tap, then talk/));

    await click(button("Back"));

    await waitFor(() => text(/MAIN MENU/));
    noText(/VOICE CHAT UNAVAILABLE/);

    await click(button("Talk to Peppa"));
    await waitFor(() => text(/Talk to Peppa/));
    await click(button("Start chat"));
    await waitFor(() => text(/Tap, then talk/));
    assert.equal(conversationStarts, 2);
  });

  it("updates and preserves the latest learner transcript after a microphone turn", async () => {
    let listener = () => {};
    const transport = {
      async commitUserTurn() {},
      async connect() {},
      async disconnect() {},
      async sendText() {},
      async setMicrophoneEnabled() {},
      subscribe(nextListener) {
        listener = nextListener;
        return () => {};
      },
    };
    globalThis.fetch = async (path, init = {}) => {
      assert.equal(path, "/api/conversations");
      assert.equal(init.method, "POST");
      return json({
        conversation: { id: "conversation-live-transcript" },
        livekit: {
          participantToken: "participant-token",
          url: "wss://livekit.example.test",
        },
        scenario: {
          key: "onboarding",
          maxOptionalExchanges: 3,
          requiredDetails: ["name", "age"],
          summaryMode: "prose",
          version: 1,
        },
      });
    };

    await mountStrict(
      createElement(ConversationHookHarness, {
        createTransport: () => transport,
      }),
    );
    await act(async () => {
      listener({
        type: "transcription",
        id: "peppa-opening",
        text: "Hello! What's your name?",
        final: true,
        language: "en",
        role: "assistant",
      });
      await flush();
    });

    await click(button("Start my turn"));
    await act(async () => {
      listener({
        type: "transcription",
        id: "learner-answer",
        text: "My name",
        final: false,
        language: "en",
        role: "user",
      });
      await flush();
    });
    assert.equal(
      document.querySelector('output[aria-label="Live transcript"]')
        .textContent,
      "My name",
    );

    await act(async () => {
      listener({
        type: "transcription",
        id: "learner-answer",
        text: "My name is Mia",
        final: false,
        language: "en",
        role: "user",
      });
      await flush();
    });
    assert.equal(
      document.querySelector('output[aria-label="Live transcript"]')
        .textContent,
      "My name is Mia",
    );

    await click(button("End my turn"));
    assert.equal(
      document.querySelector('output[aria-label="Live transcript"]')
        .textContent,
      "My name is Mia",
    );
  });

  it("shows a response-loading state from the end of the learner turn until Peppa replies", async () => {
    const experienceTrace = captureExperienceEvents();
    const finishRequest = deferred();
    let listener = () => {};
    let now = 1_000;
    let reviewCalls = 0;
    let turnCommits = 0;
    const microphoneCalls = [];
    const transport = {
      async commitUserTurn() {
        turnCommits += 1;
      },
      async connect() {},
      async disconnect() {},
      async sendText() {},
      async setMicrophoneEnabled(enabled) {
        microphoneCalls.push(enabled);
      },
      subscribe(nextListener) {
        listener = nextListener;
        return () => {};
      },
    };
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/conversations" && init.method === "POST") {
        return json({
          conversation: { id: "conversation-response-loading" },
          livekit: {
            participantToken: "participant-token",
            url: "wss://livekit.example.test",
          },
          scenario: {
            key: "small-chat",
            maxOptionalExchanges: 3,
            requiredDetails: ["name", "age"],
            summaryMode: "prose",
            version: 1,
          },
        });
      }
      if (
        path === "/api/conversations/conversation-response-loading/finish" &&
        init.method === "POST"
      ) {
        return finishRequest.promise;
      }
      if (
        path === "/api/conversations/conversation-response-loading" &&
        init.method === "GET"
      ) {
        return json({ conversation: { turns: [] } });
      }
      if (
        path === "/api/conversations/conversation-response-loading/review" &&
        init.method === "PUT"
      ) {
        reviewCalls += 1;
        return json({
          bypassed: false,
          conversationId: "conversation-response-loading",
          profileCompleted: false,
        });
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      createElement(ConversationHookHarness, {
        createTransport: () => transport,
        now: () => now,
      }),
    );
    await waitFor(() => assert.deepEqual(microphoneCalls, [false]));
    await act(async () => {
      listener({
        type: "transcription",
        id: "peppa-opening",
        text: "Hello! What do you like to do?",
        final: true,
        language: "en",
        role: "assistant",
      });
      await flush();
    });

    await click(button("Start my turn"));
    await waitFor(() => assert.deepEqual(microphoneCalls, [false, true]));
    await click(button("End my turn"));
    await waitFor(() => assert.equal(turnCommits, 1));
    await waitFor(() =>
      assert.equal(
        document.querySelector('output[aria-label="Conversation status"]')
          .textContent,
        "thinking",
      ),
    );

    now = 2_254;
    await act(async () => {
      listener({ type: "speech-started", role: "assistant" });
      await flush();
    });
    assert.equal(
      document.querySelector('output[aria-label="Conversation status"]')
        .textContent,
      "speaking",
    );
    assert.equal(
      document.querySelector('output[aria-label="Peppa response latency"]')
        .textContent,
      "1254",
    );
    await waitFor(() => {
      const response = experienceTrace.find(
        (event) => event.name === "conversation_turn_response",
      );
      assert.deepEqual(response, {
        durationMs: 1_254,
        name: "conversation_turn_response",
        outcome: "assistant_signal",
        schemaVersion: 1,
        surface: "learner_profile",
      });
      assert.doesNotMatch(
        JSON.stringify(experienceTrace),
        /Mia|conversation-response-loading|peppa-reply/,
      );
    });

    await act(async () => {
      listener({
        type: "transcription",
        id: "peppa-reply",
        text: "Drawing",
        final: false,
        language: "en",
        role: "assistant",
      });
      await flush();
    });
    assert.equal(
      document.querySelector('output[aria-label="Conversation status"]')
        .textContent,
      "speaking",
    );

    await act(async () => {
      listener({
        type: "transcription",
        id: "peppa-reply",
        text: "Drawing is brilliant!",
        final: true,
        language: "en",
        role: "assistant",
      });
      await flush();
    });
    assert.equal(
      document.querySelector('output[aria-label="Conversation status"]')
        .textContent,
      "speaking",
    );
    await act(async () => {
      listener({ type: "speech-ended", role: "assistant" });
      await flush();
    });
    assert.equal(
      document.querySelector('output[aria-label="Conversation status"]')
        .textContent,
      "listening",
    );

    await click(button("Start my turn"));
    await waitFor(() =>
      assert.deepEqual(microphoneCalls, [false, true, false, true]),
    );
    await click(button("End my turn"));
    await waitFor(() => assert.equal(turnCommits, 2));
    now += maxExperienceDurationMs + 1_000;
    await act(async () => {
      listener({ type: "speech-started", role: "assistant" });
      await flush();
    });
    await waitFor(() => {
      const responses = experienceTrace.filter(
        (event) => event.name === "conversation_turn_response",
      );
      assert.equal(responses.length, 2);
      assert.equal(responses[1].durationMs, maxExperienceDurationMs);
    });

    await act(async () => {
      listener({ type: "speech-ended", role: "assistant" });
      await flush();
    });
    await click(button("Start my turn"));
    await waitFor(() =>
      assert.deepEqual(
        microphoneCalls,
        [false, true, false, true, false, true],
      ),
    );
    await click(button("End my turn"));
    await waitFor(() => assert.equal(turnCommits, 3));

    const replacementTrace = [];
    restoreExperienceSink();
    restoreExperienceSink = experienceEvents.installSink((event) => {
      replacementTrace.push(event);
    });
    now += 100;
    await act(async () => {
      listener({ type: "speech-started", role: "assistant" });
      await flush();
    });
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
    assert.deepEqual(replacementTrace, []);
    assert.equal(
      experienceTrace.filter(
        (event) => event.name === "conversation_turn_response",
      ).length,
      2,
    );

    await act(async () => {
      listener({ type: "speech-ended", role: "assistant" });
      await flush();
    });
    await click(button("Start my turn"));
    await waitFor(() =>
      assert.deepEqual(
        microphoneCalls,
        [false, true, false, true, false, true, false, true],
      ),
    );
    await click(button("End my turn"));
    await waitFor(() => assert.equal(turnCommits, 4));
    await click(button("Finish voice"));
    now += 100;
    await act(async () => {
      listener({ type: "speech-started", role: "assistant" });
      await flush();
    });
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
    assert.deepEqual(replacementTrace, []);
    assert.equal(
      document.querySelector('output[aria-label="Conversation status"]')
        .textContent,
      "saving",
    );
    assert.equal(
      document.querySelector('output[aria-label="Learner turn ready"]')
        .textContent,
      "false",
    );

    finishRequest.resolve(json({ conversation: {} }));
    await waitFor(() => assert.equal(reviewCalls, 1));
  });

  it("distinguishes microphone-stop failure from turn-send failure", async () => {
    const experienceTrace = captureExperienceEvents();
    let listener = () => {};
    let disableCalls = 0;
    let commitCalls = 0;
    const transport = {
      async commitUserTurn() {
        commitCalls += 1;
        throw new Error("Turn commit failed");
      },
      async connect() {},
      async disconnect() {},
      async sendText() {},
      async setMicrophoneEnabled(enabled) {
        if (!enabled) {
          disableCalls += 1;
          if (disableCalls === 2) {
            throw new Error("Microphone stop failed");
          }
        }
      },
      subscribe(nextListener) {
        listener = nextListener;
        return () => {};
      },
    };
    globalThis.fetch = async () =>
      json({
        conversation: { id: "conversation-turn-failures" },
        livekit: {
          participantToken: "participant-token",
          url: "wss://livekit.example.test",
        },
        scenario: {
          key: "small-chat",
          maxOptionalExchanges: 3,
          requiredDetails: ["name", "age"],
          summaryMode: "prose",
          version: 1,
        },
      });

    await mountStrict(
      createElement(ConversationHookHarness, {
        createTransport: () => transport,
        purpose: "small-chat",
      }),
    );
    await click(button("Start voice"));
    await waitFor(() => assert.equal(disableCalls, 1));
    await act(async () => {
      listener({
        type: "transcription",
        id: "opening",
        text: "Hello!",
        final: true,
        language: "en",
        role: "assistant",
      });
      await flush();
    });
    await click(button("Start my turn"));
    await click(button("End my turn"));
    await waitFor(() => {
      const responseEvents = experienceTrace.filter(
        (event) => event.name === "conversation_turn_response",
      );
      assert.equal(responseEvents.length, 1);
      assert.equal(responseEvents[0].outcome, "microphone_stop_failed");
      assert.equal(commitCalls, 0);
    });

    await click(button("End my turn"));
    await waitFor(() => {
      const responseEvents = experienceTrace.filter(
        (event) => event.name === "conversation_turn_response",
      );
      assert.deepEqual(
        responseEvents.map((event) => ({
          keys: Object.keys(event).sort(),
          outcome: event.outcome,
          surface: event.surface,
        })),
        [
          {
            keys: [
              "durationMs",
              "name",
              "outcome",
              "schemaVersion",
              "surface",
            ],
            outcome: "microphone_stop_failed",
            surface: "talk",
          },
          {
            keys: [
              "durationMs",
              "name",
              "outcome",
              "schemaVersion",
              "surface",
            ],
            outcome: "send_failed",
            surface: "talk",
          },
        ],
      );
      assert.equal(commitCalls, 1);
    });
  });

  it("coalesces rapid microphone taps while an async change is pending", async () => {
    let listener = () => {};
    let turnCommits = 0;
    let disabledCalls = 0;
    const startChange = deferred();
    const endChange = deferred();
    const microphoneCalls = [];
    const transport = {
      async commitUserTurn() {
        turnCommits += 1;
      },
      async connect() {},
      async disconnect() {},
      async sendText() {},
      async setMicrophoneEnabled(enabled) {
        microphoneCalls.push(enabled);
        if (enabled) return startChange.promise;
        disabledCalls += 1;
        if (disabledCalls > 1) return endChange.promise;
      },
      subscribe(nextListener) {
        listener = nextListener;
        return () => {};
      },
    };
    globalThis.fetch = async () =>
      json({
        conversation: { id: "conversation-rapid-taps" },
        livekit: {
          participantToken: "participant-token",
          url: "wss://livekit.example.test",
        },
        scenario: {
          key: "small-chat",
          maxOptionalExchanges: 3,
          requiredDetails: ["name", "age"],
          summaryMode: "prose",
          version: 1,
        },
      });

    await mountStrict(
      createElement(ConversationHookHarness, {
        createTransport: () => transport,
      }),
    );
    await waitFor(() => assert.deepEqual(microphoneCalls, [false]));
    await act(async () => {
      listener({
        type: "transcription",
        id: "peppa-opening",
        text: "Hello!",
        final: true,
        language: "en",
        role: "assistant",
      });
      await flush();
    });

    await act(async () => {
      button("Start my turn").click();
      button("Start my turn").click();
      await flush();
    });
    assert.deepEqual(microphoneCalls, [false, true]);
    assert.equal(
      document.querySelector('output[aria-label="Microphone busy"]')
        .textContent,
      "true",
    );

    startChange.resolve();
    await waitFor(() => assert.equal(button("End my turn").textContent, "End my turn"));
    await waitFor(() =>
      assert.equal(
        document.querySelector('output[aria-label="Microphone busy"]')
          .textContent,
        "false",
      ),
    );

    await act(async () => {
      button("End my turn").click();
      button("End my turn").click();
      await flush();
    });
    assert.deepEqual(microphoneCalls, [false, true, false]);
    assert.equal(
      document.querySelector('output[aria-label="Conversation status"]')
        .textContent,
      "thinking",
    );

    endChange.resolve();
    await waitFor(() => assert.equal(turnCommits, 1));
    assert.deepEqual(microphoneCalls, [false, true, false]);
  });

  it("recovers the learner turn with simple copy when microphone access fails", async () => {
    let listener = () => {};
    const transport = {
      async commitUserTurn() {},
      async connect() {},
      async disconnect() {},
      async sendText() {},
      async setMicrophoneEnabled(enabled) {
        if (enabled) throw new Error("Permission denied by browser");
      },
      subscribe(nextListener) {
        listener = nextListener;
        return () => {};
      },
    };
    globalThis.fetch = async () =>
      json({
        conversation: { id: "conversation-microphone-error" },
        livekit: {
          participantToken: "participant-token",
          url: "wss://livekit.example.test",
        },
        scenario: {
          key: "small-chat",
          maxOptionalExchanges: 3,
          requiredDetails: ["name", "age"],
          summaryMode: "prose",
          version: 1,
        },
      });

    await mountStrict(
      createElement(ConversationHookHarness, {
        createTransport: () => transport,
      }),
    );
    await act(async () => {
      listener({
        type: "transcription",
        id: "peppa-opening",
        text: "Hello!",
        final: true,
        language: "en",
        role: "assistant",
      });
      await flush();
    });
    await click(button("Start my turn"));

    await waitFor(() =>
      assert.equal(
        document.querySelector('output[aria-label="Conversation error"]')
          .textContent,
        "Ask a grown-up to turn on the microphone.",
      ),
    );
    assert.equal(
      document.querySelector('output[aria-label="Conversation status"]')
        .textContent,
      "listening",
    );
    assert.equal(
      document.querySelector('output[aria-label="Learner turn ready"]')
        .textContent,
      "true",
    );
    assert.equal(button("Start my turn").textContent, "Start my turn");
  });

  it("hides transport detail when repeating Peppa's voice fails", async () => {
    let listener = () => {};
    const transport = {
      async commitUserTurn() {},
      async connect() {},
      async disconnect() {},
      async repeatLastAudio() {
        throw new Error("LiveKit data packet send failed");
      },
      async setMicrophoneEnabled() {},
      subscribe(nextListener) {
        listener = nextListener;
        return () => {};
      },
    };
    globalThis.fetch = async () =>
      json({
        conversation: { id: "conversation-repeat-error" },
        livekit: {
          participantToken: "participant-token",
          url: "wss://livekit.example.test",
        },
        scenario: {
          key: "small-chat",
          maxOptionalExchanges: 3,
          requiredDetails: [],
          summaryMode: "none",
          version: 2,
        },
      });

    await mountStrict(
      createElement(ConversationHookHarness, {
        createTransport: () => transport,
        purpose: "small-chat",
      }),
    );
    await click(button("Start voice"));
    await act(async () => {
      listener({
        type: "transcription",
        id: "peppa-opening",
        text: "Hello!",
        final: true,
        language: "en",
        role: "assistant",
      });
      await flush();
    });
    await click(button("Repeat voice"));

    await waitFor(() =>
      assert.equal(
        document.querySelector('output[aria-label="Conversation error"]')
          .textContent,
        "Peppa could not say that again. Keep talking.",
      ),
    );
    assert.equal(
      document.querySelector('output[aria-label="Conversation status"]')
        .textContent,
      "listening",
    );
  });

  it("toggles the learner turn with Space without hijacking focused controls", async () => {
    const toggles = [];
    const backs = [];
    await mountStrict(
      createElement(
        ConversationSurface,
        conversationSurfaceProps({
          onBack() {
            backs.push("back");
          },
          onToggleMicrophone() {
            toggles.push("toggle");
          },
        }),
      ),
    );

    const space = new window.KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      code: "Space",
      key: " ",
    });
    await act(async () => window.dispatchEvent(space));
    assert.deepEqual(toggles, ["toggle"]);
    assert.equal(space.defaultPrevented, true);

    await act(async () => {
      window.dispatchEvent(
        new window.KeyboardEvent("keydown", {
          bubbles: true,
          code: "Space",
          key: " ",
          repeat: true,
        }),
      );
    });
    assert.deepEqual(toggles, ["toggle"]);

    const finish = button("Back");
    await act(async () => {
      finish.dispatchEvent(
        new window.KeyboardEvent("keydown", {
          bubbles: true,
          code: "Space",
          key: " ",
        }),
      );
    });
    assert.deepEqual(toggles, ["toggle"]);

    await click(button("Back"));
    assert.deepEqual(backs, ["back"]);
    assert.deepEqual(toggles, ["toggle"]);
  });

  it("repeats Peppa's latest line from the speech box", async () => {
    const repeats = [];
    await mountStrict(
      createElement(
        ConversationSurface,
        conversationSurfaceProps({
          onRepeatAudio() {
            repeats.push("repeat");
          },
          turns: [
            {
              id: "peppa-latest",
              role: "assistant",
              text: "What animals do you like?",
            },
          ],
        }),
      ),
    );

    await click(button("Repeat Peppa's audio"));
    assert.deepEqual(repeats, ["repeat"]);
  });

  it("accepts the prose profile automatically when the room ends", async () => {
    let listener = () => {};
    let completions = 0;
    const reviews = [];
    const summaryResponse = deferred();
    const transport = {
      async connect() {},
      async disconnect() {},
      async sendText() {},
      async setMicrophoneEnabled() {},
      subscribe(nextListener) {
        listener = nextListener;
        return () => {};
      },
    };
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/conversations") {
        return json({
          conversation: { id: "conversation-2" },
          livekit: {
            participantToken: "participant-token",
            url: "wss://livekit.example.test",
          },
          scenario: {
            key: "onboarding",
            maxOptionalExchanges: 3,
            requiredDetails: ["name", "age"],
            summaryMode: "prose",
            version: 1,
          },
        });
      }
      if (path === "/api/conversations/conversation-2") {
        return summaryResponse.promise;
      }
      if (path === "/api/conversations/conversation-2/review") {
        reviews.push(JSON.parse(init.body));
        return json({
          bypassed: false,
          conversationId: "conversation-2",
          profileCompleted: true,
        });
      }
      throw new Error(`Unexpected request: ${path}`);
    };

    await mountStrict(
      createElement(ConversationHookHarness, {
        createTransport: () => transport,
        async onCompleted() {
          completions += 1;
        },
        purpose: "onboarding",
      }),
    );
    await act(async () => {
      listener({
        type: "transcription",
        id: "peppa-opening",
        text: "Hello again, Mia!",
        final: true,
        language: "en",
        role: "assistant",
      });
      await flush();
    });
    await waitFor(() =>
      assert.equal(
        document.querySelector('output[aria-label="Conversation status"]')
          .textContent,
        "listening",
      ),
    );

    await act(async () => {
      listener({ type: "disconnected", reason: "task_complete" });
      await flush();
    });
    assert.equal(
      document.querySelector('output[aria-label="Conversation status"]')
        .textContent,
      "saving",
    );

    summaryResponse.resolve(
      json({
        conversation: {
          controllerState: {
            profileSummary: "Mia is eight and loves red racing cars.",
          },
          turns: [],
        },
      }),
    );
    await waitFor(() => assert.equal(completions, 1));

    assert.deepEqual(reviews, [{}]);
    assert.equal(
      document.querySelector('output[aria-label="Conversation status"]')
        .textContent,
      "saving",
    );
  });

  it("does not present an unexpected room drop as a completed chat", async () => {
    let listener = () => {};
    let summaryLoads = 0;
    const transport = {
      async connect() {},
      async disconnect() {},
      async setMicrophoneEnabled() {},
      subscribe(nextListener) {
        listener = nextListener;
        return () => {};
      },
    };
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/conversations") {
        assert.equal(init.method, "POST");
        return json({
          conversation: { id: "conversation-disconnected" },
          livekit: {
            participantToken: "participant-token",
            url: "wss://livekit.example.test",
          },
          scenario: {
            key: "small-chat",
            maxOptionalExchanges: 3,
            requiredDetails: ["name", "age"],
            summaryMode: "none",
            version: 1,
          },
        });
      }
      if (path === "/api/conversations/conversation-disconnected") {
        summaryLoads += 1;
        return json({ conversation: { turns: [] } });
      }
      throw new Error(`Unexpected request: ${path}`);
    };

    await mountStrict(
      createElement(ConversationHookHarness, {
        createTransport: () => transport,
      }),
    );
    await act(async () => {
      listener({ type: "disconnected", reason: "SERVER_SHUTDOWN" });
      await flush();
    });

    assert.equal(summaryLoads, 0);
    assert.equal(
      document.querySelector('output[aria-label="Conversation status"]')
        .textContent,
      "error",
    );
    assert.match(
      document.querySelector('output[aria-label="Conversation error"]')
        .textContent,
      /chat stopped\. Tap Try again/i,
    );
  });

  it("moves authentication through retry, sign-in, child content, and sign-out", async () => {
    const client = createSessionClient({
      data: null,
      error: new Error("session unavailable"),
      isPending: false,
    });
    const TestAuthGate = createAuthGate({ client });

    await mountStrict(
      createElement(
        TestAuthGate,
        null,
        createElement("p", null, "AUTHENTICATED APP"),
      ),
    );

    text(/Sign-in is temporarily unavailable/);
    await click(button("Try again"));
    text(/Checking your session…/);
    client.retry.resolve();
    await waitFor(() => text(/Welcome back/));

    await input(document.querySelector("#auth-email"), "mia@example.com");
    await input(document.querySelector("#auth-password"), "correct-horse");
    await click(button("Sign in and start"));
    await waitFor(() => text(/AUTHENTICATED APP/));
    assert.deepEqual(client.signInCalls, [
      { email: "mia@example.com", password: "correct-horse" },
    ]);

    await click(button("Account for Mia"));
    await click(button("Sign out"));
    await waitFor(() => text(/Welcome back/));
    noText(/AUTHENTICATED APP/);
  });

  it("moves onboarding through retry, bypass, and final-answer completion", async () => {
    let loadAttempts = 0;
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/learner-profile" && init.method === "GET") {
        loadAttempts += 1;
        return loadAttempts <= 2
          ? json({ message: "Questions are unavailable." }, 503)
          : json(fullLearnerProfileState());
      }
      if (path === "/api/learner-profile/skip" && init.method === "POST") {
        return json({ mode: "bypass-only", canBypass: true });
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      createElement(
        LearnerProfileGate,
        learnerProfileRouteProps(createElement("p", null, "BYPASSED LESSONS")),
        createElement("p", null, "BYPASSED LESSONS"),
      ),
    );
    await waitFor(() => text(/Questions are taking a break/));
    await click(button("Retry"));
    await waitFor(() => text(/Help Peppa get to know you/));
    await click(button("Skip for now"));
    await waitFor(() => text(/BYPASSED LESSONS/));

    await cleanupMountedRoots();
    document.body.replaceChildren();
    const completed = completedLearnerProfileState();
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/learner-profile" && init.method === "GET") {
        return json(fullLearnerProfileState());
      }
      if (path === "/api/learner-profile/answer" && init.method === "PUT") {
        return json({
          ...completed,
          acknowledgment: { text: "Mia is a lovely name!", audio: null },
        });
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      createElement(
        LearnerProfileGate,
        learnerProfileRouteProps(createElement("p", null, "COMPLETED LESSONS")),
        createElement("p", null, "COMPLETED LESSONS"),
      ),
    );
    await waitFor(() => text(/Help Peppa get to know you/));
    await click(button("Set up profile"));
    await waitFor(() => text(/What's your name/));
    await input(document.querySelector("#learner-profile-answer-name"), "Mia");
    await click(button("Next"));
    await waitFor(() => text(/Mia is a lovely name!/));
    await click(button("Next"));
    await waitFor(() => text(/COMPLETED LESSONS/));
  });

  it("registers the profile account action and saves mounted profile edits", async () => {
    const client = createSessionClient({
      data: { user: { email: "mia@example.com", name: "Mia" } },
      error: null,
      isPending: false,
    });
    const TestAuthGate = createAuthGate({ client });
    const profileQuestion = question();
    const profileState = {
      profile: {
        ...completedLearnerProfileState().profile,
        age: 8,
        description: "Mia is eight and likes dinosaurs.",
      },
      questions: [profileQuestion],
    };
    const savedBodies = [];

    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/learner-profile" && init.method === "GET") {
        return json(completedLearnerProfileState());
      }
      if (path === "/api/profile" && init.method === "GET") {
        return json(profileState);
      }
      if (path === "/api/profile" && init.method === "PUT") {
        savedBodies.push(JSON.parse(init.body));
        return json({
          ...profileState,
          profile: { ...profileState.profile, name: "Maya" },
        });
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      createElement(
        TestAuthGate,
        null,
        createElement(
          ProfileRouteHarness,
          null,
          createElement("p", null, "PROFILE LESSONS"),
        ),
      ),
    );

    await waitFor(() => text(/PROFILE LESSONS/));
    await click(button("Account for Mia"));
    await click(button("Learner profile"));
    await waitFor(() => text(/Learner profile/));
    await input(document.querySelector("#profile-name"), "Maya");
    await input(document.querySelector("#profile-age"), "almost nine");
    await input(
      document.querySelector("#profile-description"),
      "Maya is eight and loves drawing dragons.",
    );
    await click(button("Save changes"));
    await waitFor(() => text(/PROFILE LESSONS/));
    assert.deepEqual(savedBodies, [
      {
        answers: {
          name: "Maya",
          age: "almost nine",
          description: "Maya is eight and loves drawing dragons.",
        },
      },
    ]);
  });

  it("navigates production lesson routes and isolates stale playback", async () => {
    const ControlledAudio = installControlledAudio();

    await mountStrict(
      applicationRoutesInMemory({ initialEntries: ["/lessons"] }),
    );
    text(/Listen\. Then speak\./);
    await click(
      document.querySelector('a[aria-label^="Start lesson:"]'),
    );
    await waitFor(() => assert.equal(currentRoute().path, lessonScenePath(1)));
    assert.ok(
      document.querySelector('[aria-label="Parrot English speaking lesson"]'),
    );
    await click(button("Back to lesson list"));
    await waitFor(() => assert.equal(currentRoute().path, "/lessons"));
    text(/Listen\. Then speak\./);

    await click(
      document.querySelector('a[aria-label^="Start lesson:"]'),
    );
    await waitFor(() => assert.equal(currentRoute().path, lessonScenePath(1)));
    const popDestination = currentRoute();
    await click(button("Start lesson"));
    await waitFor(() => assert.equal(ControlledAudio.instances.length, 1));
    const firstPlayback = ControlledAudio.instances[0];
    const staleFirstCompletion = firstPlayback.onended;
    assert.equal(typeof staleFirstCompletion, "function");

    await click(button("Open scene 2"));
    await waitFor(() => assert.equal(currentRoute().path, lessonScenePath(2)));
    await waitFor(() =>
      assert.equal(document.activeElement, button("Start lesson")),
    );
    noText(new RegExp(firstLesson.scenes[1].title));
    assert.equal(firstPlayback.paused, true);
    await act(async () => staleFirstCompletion(new window.Event("ended")));
    noText(new RegExp(firstLesson.scenes[1].title));
    assert.equal(currentRoute().path, lessonScenePath(2));

    await click(button("Start lesson"));
    await waitFor(() => assert.equal(ControlledAudio.instances.length, 2));
    await waitFor(() => text(new RegExp(firstLesson.scenes[1].title)));
    const secondPlayback = ControlledAudio.instances[1];
    const staleSecondCompletion = secondPlayback.onended;
    assert.equal(typeof staleSecondCompletion, "function");
    await act(async () => {
      window.dispatchEvent(
        new window.PopStateEvent("popstate", {
          state: { key: popDestination.key },
        }),
      );
    });
    await click(button("History back"));
    await waitFor(() => assert.equal(currentRoute().path, lessonScenePath(1)));
    assert.equal(currentRoute().key, popDestination.key);
    await waitFor(() =>
      assert.equal(document.activeElement, button("Start lesson")),
    );
    noText(new RegExp(firstLesson.scenes[0].title));
    assert.equal(secondPlayback.paused, true);
    await act(async () => staleSecondCompletion(new window.Event("ended")));
    noText(new RegExp(firstLesson.scenes[0].title));
    assert.equal(currentRoute().path, lessonScenePath(1));
    await waitFor(() =>
      assert.equal(document.activeElement, button("Start lesson")),
    );
  });

  it("offers retry and skip when lesson sound stops", async () => {
    const ControlledAudio = installControlledAudio();

    await mountStrict(
      applicationRoutesInMemory({ initialEntries: [lessonScenePath(1)] }),
    );
    await click(button("Start lesson"));
    await waitFor(() => assert.equal(ControlledAudio.instances.length, 1));

    await act(async () => ControlledAudio.instances[0].fail());
    await waitFor(() => text(/The sound stopped/));
    assert.ok(button("Try sound"));
    assert.ok(button("Skip sound"));

    await click(button("Try sound"));
    await waitFor(() => assert.equal(ControlledAudio.instances.length, 2));
    noText(/The sound stopped/);

    await act(async () => ControlledAudio.instances[1].fail());
    await waitFor(() => text(/The sound stopped/));
    await click(button("Skip sound"));
    await waitFor(() => assert.equal(ControlledAudio.instances.length, 3));
    noText(/The sound stopped/);
  });

  it("moves a mounted learner turn through recording, checking, and feedback", async () => {
    const experienceTrace = captureExperienceEvents();
    const ControlledAudio = installControlledAudio();
    installSpeechRecorder();
    const evaluation = deferred();
    globalThis.fetch = async (path, init = {}) => {
      assert.equal(path, "/api/evaluate-speech");
      assert.equal(init.method, "POST");
      assert.equal(init.body.get("targetText"), "It is up high!");
      return evaluation.promise;
    };

    await mountStrict(
      applicationRoutesInMemory({ initialEntries: [lessonScenePath(1)] }),
    );
    assert.equal(currentRoute().path, lessonScenePath(1));
    await advanceToLearnerTurn(ControlledAudio);
    await recordLearnerTurn();
    evaluation.resolve(
      json({
        transcript: "It is up high!",
        similarity: 1,
        outcome: "correct",
      }),
    );
    await waitFor(() => text(/Great job!/));
    await waitFor(() => {
      const lessonEvents = experienceTrace.filter((event) =>
        event.name.startsWith("lesson_"),
      );
      assert.deepEqual(
        lessonEvents.map(({ name, outcome }) => ({ name, outcome })),
        [
          { name: "lesson_microphone", outcome: "ready" },
          { name: "lesson_speech_check", outcome: "completed" },
        ],
      );
      assert.doesNotMatch(
        JSON.stringify(lessonEvents),
        /It is up high|recorded audio|correct/,
      );
    });
  });

  it("aborts a stale evaluation when browser history changes the lesson route", async () => {
    const experienceTrace = captureExperienceEvents();
    const ControlledAudio = installControlledAudio();
    installSpeechRecorder();
    const evaluation = deferred();
    let evaluationSignal = null;
    globalThis.fetch = async (path, init = {}) => {
      assert.equal(path, "/api/evaluate-speech");
      assert.equal(init.method, "POST");
      evaluationSignal = init.signal;
      return evaluation.promise;
    };

    const destinationKey = "evaluation-pop-destination";
    await mountStrict(
      applicationRoutesInMemory({
        initialEntries: [
          { key: destinationKey, pathname: lessonScenePath(2) },
          { key: "evaluation-source", pathname: lessonScenePath(1) },
        ],
        initialIndex: 1,
      }),
    );
    assert.equal(currentRoute().path, lessonScenePath(1));
    await advanceToLearnerTurn(ControlledAudio);
    await recordLearnerTurn();
    await waitFor(() => assert.ok(evaluationSignal));
    assert.equal(evaluationSignal.aborted, false);

    await act(async () => {
      window.dispatchEvent(
        new window.PopStateEvent("popstate", {
          state: { key: destinationKey },
        }),
      );
    });
    assert.equal(evaluationSignal.aborted, true);
    await click(button("History back"));
    await waitFor(() => assert.equal(currentRoute().path, lessonScenePath(2)));
    assert.equal(currentRoute().key, destinationKey);
    await waitFor(() =>
      assert.equal(document.activeElement, button("Start lesson")),
    );

    await act(async () => {
      evaluation.resolve(
        json({
          transcript: "It is up high!",
          similarity: 1,
          outcome: "correct",
        }),
      );
      await evaluation.promise;
    });
    await flush();

    assert.equal(currentRoute().path, lessonScenePath(2));
    noText(new RegExp(firstLesson.scenes[1].title));
    noText(/Checking your words|Great job!|Speech check failed|Audio unavailable/);
    assert.equal(document.activeElement, button("Start lesson"));
    await waitFor(() =>
      assert.ok(
        experienceTrace.some(
          (event) =>
            event.name === "lesson_microphone" && event.outcome === "ready",
        ),
      ),
    );
    assert.equal(
      experienceTrace.some((event) => event.name === "lesson_speech_check"),
      false,
    );
  });
});
