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
let OnboardingGate;
let useConversationOnboarding;
let createAuthGate;
let firstLesson;
let firstLessonId;

before(async () => {
  ({ ConversationSurface } = await vite.ssrLoadModule(
    "/src/ConversationSurface.tsx",
  ));
  ({ createAuthGate } = await vite.ssrLoadModule("/src/AuthGate.tsx"));
  ({ OnboardingGate } = await vite.ssrLoadModule("/src/OnboardingGate.tsx"));
  ({ useConversationOnboarding } = await vite.ssrLoadModule(
    "/src/useConversationOnboarding.ts",
  ));
  ({ ApplicationRoutes } = await vite.ssrLoadModule("/src/App.tsx"));
  const catalog = await vite.ssrLoadModule("/src/lesson-catalog.ts");
  firstLesson = catalog.LESSONS[0].lesson;
  firstLessonId = catalog.LESSONS[0].id;
});

afterEach(async () => {
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

function fullOnboardingState(overrides = {}) {
  const base = {
    mode: "full",
    profile: {
      name: null,
      age: null,
      answers: emptyAnswers(),
      questionnaireVersion: 2,
      currentQuestionKey: "name",
      onboardingStatus: "not_started",
      completedAt: null,
    },
    questionnaire: { version: 2 },
    question: question(),
    progress: { answered: 0, current: 1, total: 1 },
    canBypass: false,
  };

  return { ...base, ...overrides };
}

function completedOnboardingState() {
  return fullOnboardingState({
    canBypass: true,
    profile: {
      ...fullOnboardingState().profile,
      name: "Mia",
      currentQuestionKey: null,
      onboardingStatus: "completed",
      completedAt: "2026-07-06T08:00:00.000Z",
    },
    question: null,
    progress: { answered: 1, current: 1, total: 1 },
  });
}

function json(payload, status = 200) {
  return Response.json(payload, { status });
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

function onboardingRouteProps(completedOnboardingFallback) {
  return {
    completedOnboardingFallback,
    isOnboardingRoute: true,
    isProfileRoute: false,
    onboardingFallback: createElement("p", null, "ONBOARDING ROUTE"),
    onCloseProfileRoute() {},
    onOpenProfileRoute() {},
  };
}

function ConversationHookHarness({ createTransport, onCompleted = async () => {} }) {
  const conversation = useConversationOnboarding({
    active: true,
    createTransport,
    onBack() {},
    onCompleted,
  });
  return createElement(
    "section",
    null,
    createElement("output", { "aria-label": "Conversation status" }, conversation.status),
    createElement("button", { onClick: conversation.onStart, type: "button" }, "Start voice"),
    createElement(
      "button",
      { onClick: conversation.onToggleMicrophone, type: "button" },
      conversation.microphoneEnabled ? "End my turn" : "Start my turn",
    ),
  );
}

function conversationSurfaceProps(overrides = {}) {
  return {
    candidates: [],
    error: "",
    microphoneEnabled: false,
    onBack() {},
    onCandidateChange() {},
    onCandidateStatusChange() {},
    onFinish() {},
    onSendText() {},
    onStart() {},
    onSubmitReview() {},
    onToggleMicrophone() {},
    onTypedValueChange() {},
    status: "listening",
    turns: [],
    typedValue: "",
    ...overrides,
  };
}

function ProfileRouteHarness({ children }) {
  const [route, setRoute] = useState("/");

  return createElement(
    OnboardingGate,
    {
      completedOnboardingFallback: children,
      isOnboardingRoute: false,
      isProfileRoute: route === "/profile",
      onboardingFallback: createElement("p", null, "ONBOARDING ROUTE"),
      onCloseProfileRoute: () => setRoute("/"),
      onOpenProfileRoute: () => setRoute("/profile"),
    },
    children,
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
  await waitFor(() => button("Press and hold to speak"));
}

async function recordLearnerTurn() {
  const microphone = button("Press and hold to speak");
  await act(async () => {
    microphone.dispatchEvent(
      new window.KeyboardEvent("keydown", { bubbles: true, key: "Enter" }),
    );
  });
  await waitFor(() => button("Release when you finish"));

  await act(async () => {
    microphone.dispatchEvent(
      new window.KeyboardEvent("keyup", { bubbles: true, key: "Enter" }),
    );
  });
  await waitFor(() => text(/Checking your speech/));
}

function text(value) {
  assert.match(document.body.textContent, value);
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
      assert.equal(path, "/api/onboarding");
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
        OnboardingGate,
        onboardingRouteProps(createElement("p", null, "LESSON CATALOG")),
        createElement("p", null, "LESSON CATALOG"),
      ),
    );

    await waitFor(() => assert.equal(requests, 2));
    text(/Loading your questions…/);
    noText(/Meet Peppa/);

    response.resolve(json(fullOnboardingState()));
    await waitFor(() => text(/Meet Peppa/));
    noText(/Loading your questions…/);
  });

  it("keeps a newly connected conversation transport alive when its ID is stored", async () => {
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
    await waitFor(() =>
      assert.equal(
        document.querySelector('output[aria-label="Conversation status"]')
          .textContent,
        "connecting",
      ),
    );

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
    await waitFor(() =>
      assert.equal(
        document.querySelector('output[aria-label="Conversation status"]')
          .textContent,
        "listening",
      ),
    );
    assert.deepEqual(microphoneCalls, [false]);

    await click(button("Start my turn"));
    await waitFor(() => assert.deepEqual(microphoneCalls, [false, true]));
    assert.equal(disconnectCalls, 0);
  });

  it("shows a response-loading state from the end of the learner turn until Peppa replies", async () => {
    let listener = () => {};
    const microphoneCalls = [];
    const transport = {
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
      assert.equal(path, "/api/conversations");
      assert.equal(init.method, "POST");
      return json({
        conversation: { id: "conversation-response-loading" },
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
    await waitFor(() =>
      assert.equal(
        document.querySelector('output[aria-label="Conversation status"]')
          .textContent,
        "thinking",
      ),
    );

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

    const finish = button("Finish conversation");
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

  it("accepts the prose profile automatically when the room ends", async () => {
    let listener = () => {};
    let completions = 0;
    const reviews = [];
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
        return json({
          conversation: {
            controllerState: {
              profileSummary: "Mia is eight and loves red racing cars.",
            },
            facts: [],
            turns: [],
          },
        });
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
    await waitFor(() => assert.equal(completions, 1));

    assert.deepEqual(reviews, [
      {
        decisions: [{ factId: "profile-summary", status: "accepted" }],
      },
    ]);
    assert.equal(
      document.querySelector('output[aria-label="Conversation status"]')
        .textContent,
      "saving",
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

    await click(button("Log out"));
    await waitFor(() => text(/Welcome back/));
    noText(/AUTHENTICATED APP/);
  });

  it("moves onboarding through retry, bypass, and final-answer completion", async () => {
    let loadAttempts = 0;
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/onboarding" && init.method === "GET") {
        loadAttempts += 1;
        return loadAttempts <= 2
          ? json({ message: "Questions are unavailable." }, 503)
          : json(fullOnboardingState());
      }
      if (path === "/api/onboarding/skip" && init.method === "POST") {
        return json({ mode: "bypass-only", canBypass: true });
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      createElement(
        OnboardingGate,
        onboardingRouteProps(createElement("p", null, "BYPASSED LESSONS")),
        createElement("p", null, "BYPASSED LESSONS"),
      ),
    );
    await waitFor(() => text(/Questions are taking a break/));
    await click(button("Retry"));
    await waitFor(() => text(/Meet Peppa/));
    await click(button("Skip for now"));
    await waitFor(() => text(/BYPASSED LESSONS/));

    await cleanupMountedRoots();
    document.body.replaceChildren();
    const completed = completedOnboardingState();
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/onboarding" && init.method === "GET") {
        return json(fullOnboardingState());
      }
      if (path === "/api/onboarding/answer" && init.method === "PUT") {
        return json({
          ...completed,
          acknowledgment: { text: "Mia is a lovely name!", audio: null },
        });
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      createElement(
        OnboardingGate,
        onboardingRouteProps(createElement("p", null, "COMPLETED LESSONS")),
        createElement("p", null, "COMPLETED LESSONS"),
      ),
    );
    await waitFor(() => text(/Meet Peppa/));
    await click(button("Start"));
    await waitFor(() => text(/What's your name/));
    await input(document.querySelector("#onboarding-answer-name"), "Mia");
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
        ...completedOnboardingState().profile,
        age: 8,
        description: "Mia is eight and likes dinosaurs.",
      },
      questions: [profileQuestion],
    };
    const savedBodies = [];

    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/onboarding" && init.method === "GET") {
        return json(completedOnboardingState());
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
    await waitFor(() => button("Edit learner profile"));
    await click(button("Edit learner profile"));
    await waitFor(() => text(/Edit profile/));
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
    text(/Choose a lesson/);
    await click(
      document.querySelector('a[aria-label^="Start lesson:"]'),
    );
    await waitFor(() => assert.equal(currentRoute().path, lessonScenePath(1)));
    assert.ok(
      document.querySelector('[aria-label="Parrot English speaking lesson"]'),
    );
    await click(button("Back to lesson list"));
    await waitFor(() => assert.equal(currentRoute().path, "/lessons"));
    text(/Choose a lesson/);

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

    await click(button("Next scene"));
    await waitFor(() => assert.equal(currentRoute().path, lessonScenePath(2)));
    await waitFor(() => text(new RegExp(firstLesson.scenes[1].title)));
    assert.equal(firstPlayback.paused, true);
    await act(async () => staleFirstCompletion(new window.Event("ended")));
    text(new RegExp(firstLesson.scenes[1].title));
    assert.equal(currentRoute().path, lessonScenePath(2));

    await waitFor(() => assert.equal(ControlledAudio.instances.length, 2));
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
    await waitFor(() => text(new RegExp(firstLesson.scenes[0].title)));
    assert.equal(secondPlayback.paused, true);
    await act(async () => staleSecondCompletion(new window.Event("ended")));
    text(new RegExp(firstLesson.scenes[0].title));
    assert.equal(currentRoute().path, lessonScenePath(1));
    await waitFor(() =>
      assert.equal(document.activeElement, button("Start lesson")),
    );
  });

  it("moves a mounted learner turn through recording, checking, and feedback", async () => {
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
        passed: true,
        feedbackText: "Great job!",
        retryAllowed: false,
      }),
    );
    await waitFor(() => text(/Great job!/));
  });

  it("aborts a stale evaluation when browser history changes the lesson route", async () => {
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
          passed: true,
          feedbackText: "Great job!",
          retryAllowed: false,
        }),
      );
      await evaluation.promise;
    });
    await flush();

    assert.equal(currentRoute().path, lessonScenePath(2));
    text(new RegExp(firstLesson.scenes[1].title));
    noText(/Checking your speech|Great job!|Speech check failed|Audio unavailable/);
    assert.equal(document.activeElement, button("Start lesson"));
  });
});
