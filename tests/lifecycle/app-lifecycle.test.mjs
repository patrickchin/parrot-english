import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { act, createElement, useSyncExternalStore } from "react";
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

let LessonExperience;
let LessonPlayer;
let OnboardingGate;
let createAuthGate;
let firstLesson;

before(async () => {
  ({ createAuthGate } = await vite.ssrLoadModule("/src/AuthGate.tsx"));
  ({ OnboardingGate } = await vite.ssrLoadModule("/src/OnboardingGate.tsx"));
  ({ LessonExperience, LessonPlayer } = await vite.ssrLoadModule("/src/App.tsx"));
  const catalog = await vite.ssrLoadModule("/src/lesson-catalog.ts");
  firstLesson = catalog.LESSONS[0].lesson;
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
        null,
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

    text(/登录服务暂时不可用/);
    await click(button("重试"));
    text(/正在检查登录状态…/);
    client.retry.resolve();
    await waitFor(() => text(/欢迎回来/));

    await input(document.querySelector("#auth-email"), "mia@example.com");
    await input(document.querySelector("#auth-password"), "correct-horse");
    await click(button("登录并开始"));
    await waitFor(() => text(/AUTHENTICATED APP/));
    assert.deepEqual(client.signInCalls, [
      { email: "mia@example.com", password: "correct-horse" },
    ]);

    await click(button("退出登录"));
    await waitFor(() => text(/欢迎回来/));
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
        null,
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
        null,
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
      profile: completedOnboardingState().profile,
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
          OnboardingGate,
          null,
          createElement("p", null, "PROFILE LESSONS"),
        ),
      ),
    );

    await waitFor(() => text(/PROFILE LESSONS/));
    await waitFor(() => button("Edit learner profile"));
    await click(button("Edit learner profile"));
    await waitFor(() => text(/Edit profile/));
    await input(document.querySelector("#profile-answer-name"), "Maya");
    await click(button("Save changes"));
    await waitFor(() => text(/PROFILE LESSONS/));
    assert.deepEqual(savedBodies, [{ answers: { name: "Maya" } }]);
  });

  it("navigates the lesson catalog and controls mounted lesson playback", async () => {
    await mountStrict(createElement(LessonExperience));
    text(/Choose a lesson/);
    await click(document.querySelector(".lesson-card-action"));
    await waitFor(() =>
      assert.ok(
        document.querySelector('[aria-label="Parrot English speaking lesson"]'),
      ),
    );
    await click(button("Back to lesson list"));
    await waitFor(() => text(/Choose a lesson/));

    await cleanupMountedRoots();
    document.body.replaceChildren();
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

    await mountStrict(
      createElement(LessonPlayer, {
        lesson: firstLesson,
        onBack() {},
      }),
    );
    await click(button("Mute lesson audio"));
    assert.equal(button("Unmute lesson audio").getAttribute("aria-pressed"), "true");
    await click(button("Unmute lesson audio"));

    await click(button("Play"));
    await waitFor(() => button("Pause"));
    await waitFor(() => assert.equal(ControlledAudio.instances.length, 1));
    const firstPlayback = ControlledAudio.instances[0];

    await click(button("Next scene"));
    await waitFor(() => text(new RegExp(firstLesson.scenes[1].title)));
    assert.equal(firstPlayback.paused, true);
    firstPlayback.finish();
    await flush();
    text(new RegExp(firstLesson.scenes[1].title));

    await click(button("Pause"));
    await waitFor(() => button("Play"));
    await click(button("Previous scene"));
    await waitFor(() => text(new RegExp(firstLesson.scenes[0].title)));
    button("Pause");
  });

  it("moves a mounted learner turn through recording, checking, and feedback", async () => {
    class ControlledAudio {
      static instances = [];

      constructor() {
        this.onended = null;
        this.onerror = null;
        ControlledAudio.instances.push(this);
      }

      pause() {}

      play() {
        return Promise.resolve();
      }

      finish() {
        this.onended?.(new window.Event("ended"));
      }
    }
    globalThis.Audio = ControlledAudio;
    window.Audio = ControlledAudio;
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
    const evaluation = deferred();
    globalThis.fetch = async (path, init = {}) => {
      assert.equal(path, "/api/evaluate-speech");
      assert.equal(init.method, "POST");
      assert.equal(init.body.get("targetText"), "It is up high!");
      return evaluation.promise;
    };

    await mountStrict(
      createElement(LessonPlayer, {
        lesson: firstLesson,
        onBack() {},
      }),
    );
    await click(button("Play"));

    for (let index = 0; index < 4; index += 1) {
      await waitFor(() =>
        assert.equal(ControlledAudio.instances.length, index + 1),
      );
      await act(async () => ControlledAudio.instances[index].finish());
    }
    await waitFor(() => button("Press and hold to speak"));

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
});
