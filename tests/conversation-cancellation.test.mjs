import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { act, createElement, useState } from "react";
import { after, afterEach, before, describe, it } from "node:test";
import { createServer } from "vite";
import {
  cleanupMountedRoots,
  click,
  deferred,
  flush,
  installDom,
  mountStrict,
  waitFor,
} from "./helpers/react-lifecycle.mjs";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const restoreDom = installDom();
const originalFetch = globalThis.fetch;
const vite = await createServer({
  appType: "custom",
  logLevel: "silent",
  root: projectRoot,
  server: { middlewareMode: true },
});

let usePeppaConversation;

before(async () => {
  ({ usePeppaConversation } = await vite.ssrLoadModule(
    "/src/conversation/usePeppaConversation.ts",
  ));
});

afterEach(async () => {
  await cleanupMountedRoots();
  document.body.replaceChildren();
  globalThis.fetch = originalFetch;
});

after(async () => {
  await vite.close();
  restoreDom();
});

function json(payload, status = 200) {
  return Response.json(payload, { status });
}

function startResponse(conversationId) {
  return json({
    conversation: { id: conversationId },
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

function button(name) {
  const match = [...document.querySelectorAll("button")].find(
    (candidate) => candidate.textContent.trim() === name,
  );
  assert.ok(match, `Expected a button named ${name}.`);
  return match;
}

function output(name) {
  const match = document.querySelector(`output[aria-label="${name}"]`);
  assert.ok(match, `Expected an output named ${name}.`);
  return match;
}

function ConversationCancellationHarness({
  active = true,
  createTransport,
  onCompleted = async () => {},
  purpose = "small-chat",
}) {
  const conversation = usePeppaConversation({
    active,
    createTransport,
    onBack() {},
    onChooseLesson() {},
    onCompleted,
    purpose,
  });
  return createElement(
    "section",
    null,
    createElement(
      "output",
      { "aria-label": "Conversation status" },
      conversation.status,
    ),
    createElement(
      "output",
      { "aria-label": "Conversation turns" },
      JSON.stringify(conversation.turns),
    ),
    createElement(
      "output",
      { "aria-label": "Live transcript" },
      conversation.liveTranscript,
    ),
    createElement(
      "output",
      { "aria-label": "Can finish" },
      String(conversation.canFinish),
    ),
    createElement(
      "button",
      { onClick: conversation.onStart, type: "button" },
      "Start voice",
    ),
    createElement(
      "button",
      { onClick: conversation.onFinish, type: "button" },
      "Finish voice",
    ),
    createElement(
      "button",
      { onClick: conversation.resetConversation, type: "button" },
      "Reset voice",
    ),
  );
}

function ActiveToggleHarness({ createTransport }) {
  const [active, setActive] = useState(true);
  return createElement(
    "section",
    null,
    createElement(
      "button",
      { onClick: () => setActive(false), type: "button" },
      "Deactivate voice",
    ),
    createElement(ConversationCancellationHarness, {
      active,
      createTransport,
    }),
  );
}

function ConversationPairHarness({ createTransport }) {
  const first = usePeppaConversation({
    active: true,
    createTransport,
    onBack() {},
    onChooseLesson() {},
    async onCompleted() {},
    purpose: "small-chat",
  });
  const second = usePeppaConversation({
    active: true,
    createTransport,
    onBack() {},
    onChooseLesson() {},
    async onCompleted() {},
    purpose: "small-chat",
  });
  return createElement(
    "section",
    null,
    createElement(
      "button",
      { onClick: first.onStart, type: "button" },
      "Start first voice",
    ),
    createElement(
      "button",
      { onClick: second.onStart, type: "button" },
      "Start second voice",
    ),
    createElement(
      "button",
      { onClick: first.resetConversation, type: "button" },
      "Reset first voice",
    ),
  );
}

function transportProbe() {
  let listener = () => {};
  let connects = 0;
  let disconnects = 0;
  return {
    get connects() {
      return connects;
    },
    get disconnects() {
      return disconnects;
    },
    emit(event) {
      listener(event);
    },
    transport: {
      async connect() {
        connects += 1;
      },
      async disconnect() {
        disconnects += 1;
      },
      async setMicrophoneEnabled() {},
      subscribe(nextListener) {
        listener = nextListener;
        return () => {};
      },
    },
  };
}

describe("conversation learner lifecycle cancellation", () => {
  it("aborts and detaches pending starts before quarantining late responses", async () => {
    const firstStart = deferred();
    const secondStart = deferred();
    const startSignals = [];
    const retired = [];
    let starts = 0;
    let transports = 0;
    let completed = 0;
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/conversations" && init.method === "POST") {
        starts += 1;
        startSignals.push(init.signal);
        return starts === 1 ? firstStart.promise : secondStart.promise;
      }
      const finishMatch = String(path).match(
        /^\/api\/conversations\/([^/]+)\/finish$/,
      );
      if (finishMatch && init.method === "POST") {
        retired.push({
          id: decodeURIComponent(finishMatch[1]),
          reason: JSON.parse(init.body).reason,
          signal: init.signal,
        });
        return json({ conversation: {} });
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      createElement(ConversationCancellationHarness, {
        createTransport: () => {
          transports += 1;
          return transportProbe().transport;
        },
        onCompleted: async () => {
          completed += 1;
        },
      }),
    );
    await click(button("Start voice"));
    await click(button("Start voice"));
    assert.equal(starts, 2);

    firstStart.resolve(startResponse("stale-before-reset"));
    await flush();
    assert.deepEqual(retired, []);

    await click(button("Reset voice"));
    assert.equal(startSignals[1]?.aborted, true);
    assert.equal(output("Conversation status").textContent, "ready");
    await waitFor(() =>
      assert.deepEqual(retired, [
        {
          id: "stale-before-reset",
          reason: "superseded_start",
          signal: undefined,
        },
      ]),
    );

    secondStart.resolve(startResponse("late-after-reset"));
    await waitFor(() => assert.equal(retired.length, 2));
    assert.deepEqual(retired[1], {
      id: "late-after-reset",
      reason: "superseded_start",
      signal: undefined,
    });
    assert.equal(transports, 0);
    assert.equal(completed, 0);
  });

  it("does not let a hung late-start cleanup block the next learner's conversation", async () => {
    const lateStart = deferred();
    const staleRetirement = deferred();
    let starts = 0;
    let retirementCalls = 0;
    let transports = 0;
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/conversations" && init.method === "POST") {
        starts += 1;
        return starts === 1
          ? lateStart.promise
          : startResponse("next-learner-conversation");
      }
      if (
        path === "/api/conversations/stale-learner-conversation/finish" &&
        init.method === "POST"
      ) {
        retirementCalls += 1;
        assert.equal(init.signal, undefined);
        return staleRetirement.promise;
      }
      if (
        path === "/api/conversations/next-learner-conversation/finish" &&
        init.method === "POST"
      ) {
        return json({ conversation: {} });
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      createElement(ConversationCancellationHarness, {
        createTransport: () => {
          transports += 1;
          return transportProbe().transport;
        },
      }),
    );
    await click(button("Start voice"));
    assert.equal(starts, 1);
    await click(button("Reset voice"));

    lateStart.resolve(startResponse("stale-learner-conversation"));
    await waitFor(() => assert.equal(retirementCalls, 1));
    await click(button("Start voice"));

    await waitFor(() => assert.equal(starts, 2));
    await waitFor(() => assert.equal(transports, 1));
    staleRetirement.resolve(json({ conversation: {} }));
    await flush();
  });

  it("disconnects and clears an active conversation while retirement continues", async () => {
    const probe = transportProbe();
    const retired = [];
    let starts = 0;
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/conversations" && init.method === "POST") {
        starts += 1;
        return startResponse("active-before-reset");
      }
      if (
        path === "/api/conversations/active-before-reset/finish" &&
        init.method === "POST"
      ) {
        retired.push({
          reason: JSON.parse(init.body).reason,
          signal: init.signal,
        });
        return json({ conversation: {} });
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      createElement(ConversationCancellationHarness, {
        createTransport: () => probe.transport,
        purpose: "onboarding",
      }),
    );
    await waitFor(() => assert.equal(probe.connects, 1));
    await act(async () => {
      probe.emit({
        final: true,
        id: "learner-turn",
        language: "en",
        role: "user",
        text: "I like ducks.",
        type: "transcription",
      });
      await flush();
    });
    assert.match(output("Conversation turns").textContent, /I like ducks/);

    await click(button("Reset voice"));

    assert.equal(probe.disconnects, 1);
    assert.equal(output("Conversation status").textContent, "ready");
    assert.equal(output("Conversation turns").textContent, "[]");
    assert.equal(output("Live transcript").textContent, "");
    assert.equal(output("Can finish").textContent, "false");
    await waitFor(() =>
      assert.deepEqual(retired, [
        { reason: "left_conversation", signal: undefined },
      ]),
    );
    await flush();
    assert.equal(starts, 1, "reset remains deactivated until active changes");
  });

  it("does not let old-learner retirement failure block the next conversation", async () => {
    const retirement = deferred();
    let starts = 0;
    let retirementCalls = 0;
    let transports = 0;
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/conversations" && init.method === "POST") {
        starts += 1;
        return startResponse(`selection-${starts}`);
      }
      if (
        path === "/api/conversations/selection-1/finish" &&
        init.method === "POST"
      ) {
        retirementCalls += 1;
        assert.equal(init.signal, undefined);
        return retirement.promise;
      }
      if (
        path === "/api/conversations/selection-2/finish" &&
        init.method === "POST"
      ) {
        return json({ conversation: {} });
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      createElement(ConversationCancellationHarness, {
        createTransport: () => {
          transports += 1;
          return transportProbe().transport;
        },
      }),
    );
    await click(button("Start voice"));
    await waitFor(() => assert.equal(transports, 1));

    await click(button("Reset voice"));
    await waitFor(() => assert.equal(retirementCalls, 1));
    await click(button("Start voice"));

    await waitFor(() => assert.equal(starts, 2));
    assert.equal(retirementCalls, 1);
    await waitFor(() => assert.equal(transports, 2));
    retirement.resolve(json({ error: "not_found" }, 404));
    await flush();
  });

  it("keeps a reused ID open when a replacement owner claims it", async () => {
    const replacementStart = deferred();
    let starts = 0;
    let transports = 0;
    const retired = [];
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/conversations" && init.method === "POST") {
        starts += 1;
        return starts === 1
          ? startResponse("reused-after-reset")
          : replacementStart.promise;
      }
      if (
        path === "/api/conversations/reused-after-reset/finish" &&
        init.method === "POST"
      ) {
        retired.push(JSON.parse(init.body).reason);
        return json({ conversation: {} });
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      createElement(ConversationPairHarness, {
        createTransport: () => {
          transports += 1;
          return transportProbe().transport;
        },
      }),
    );
    await click(button("Start first voice"));
    await waitFor(() => assert.equal(transports, 1));
    await click(button("Start second voice"));
    await waitFor(() => assert.equal(starts, 2));

    await click(button("Reset first voice"));
    assert.deepEqual(retired, []);
    replacementStart.resolve(startResponse("reused-after-reset"));
    await waitFor(() => assert.equal(transports, 2));
    await flush();

    assert.deepEqual(retired, []);
  });

  it("does not connect a reused ID that reset cleanup retires", async () => {
    const retirement = deferred();
    let retirementCalls = 0;
    let starts = 0;
    let transports = 0;
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/conversations" && init.method === "POST") {
        starts += 1;
        return startResponse(
          starts < 3 ? "reset-reused" : "fresh-after-retirement",
        );
      }
      if (
        path === "/api/conversations/reset-reused/finish" &&
        init.method === "POST"
      ) {
        retirementCalls += 1;
        return retirement.promise;
      }
      if (
        path === "/api/conversations/fresh-after-retirement/finish" &&
        init.method === "POST"
      ) {
        return json({ conversation: {} });
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      createElement(ConversationCancellationHarness, {
        createTransport: () => {
          transports += 1;
          return transportProbe().transport;
        },
      }),
    );
    await click(button("Start voice"));
    await waitFor(() => assert.equal(transports, 1));
    await click(button("Reset voice"));
    await waitFor(() => assert.equal(retirementCalls, 1));

    await click(button("Start voice"));
    await waitFor(() => assert.equal(starts, 2));
    assert.equal(transports, 1);
    retirement.resolve(json({ conversation: {} }));

    await waitFor(() => assert.equal(starts, 3));
    await waitFor(() => assert.equal(transports, 2));
    assert.equal(retirementCalls, 1);
  });

  it("remembers reset cleanup that settles before a reused-ID response", async () => {
    const retirement = deferred();
    const replacementStart = deferred();
    let retirementSettled = false;
    let starts = 0;
    let transports = 0;
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/conversations" && init.method === "POST") {
        starts += 1;
        if (starts === 1) return startResponse("settled-reset-reused");
        if (starts === 2) return replacementStart.promise;
        return startResponse("fresh-after-settled-retirement");
      }
      if (
        path === "/api/conversations/settled-reset-reused/finish" &&
        init.method === "POST"
      ) {
        return retirement.promise.then((response) => {
          retirementSettled = true;
          return response;
        });
      }
      if (
        path === "/api/conversations/fresh-after-settled-retirement/finish" &&
        init.method === "POST"
      ) {
        return json({ conversation: {} });
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      createElement(ConversationCancellationHarness, {
        createTransport: () => {
          transports += 1;
          return transportProbe().transport;
        },
      }),
    );
    await click(button("Start voice"));
    await waitFor(() => assert.equal(transports, 1));
    await click(button("Reset voice"));

    await click(button("Start voice"));
    await waitFor(() => assert.equal(starts, 2));
    retirement.resolve(json({ conversation: {} }));
    await waitFor(() => assert.equal(retirementSettled, true));
    await flush();
    replacementStart.resolve(startResponse("settled-reset-reused"));

    await waitFor(() => assert.equal(starts, 3));
    await waitFor(() => assert.equal(transports, 2));
  });

  it("aborts a stored-summary load and blocks its late review and completion", async () => {
    const probe = transportProbe();
    const summary = deferred();
    let summarySignal;
    let reviews = 0;
    let completed = 0;
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/conversations" && init.method === "POST") {
        return startResponse("summary-before-reset");
      }
      if (
        path === "/api/conversations/summary-before-reset" &&
        init.method === "GET"
      ) {
        summarySignal = init.signal;
        return summary.promise;
      }
      if (
        path === "/api/conversations/summary-before-reset/review" &&
        init.method === "PUT"
      ) {
        reviews += 1;
        return json({ profileCompleted: true });
      }
      if (
        path === "/api/conversations/summary-before-reset/finish" &&
        init.method === "POST"
      ) {
        return json({ conversation: {} });
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      createElement(ConversationCancellationHarness, {
        createTransport: () => probe.transport,
        onCompleted: async () => {
          completed += 1;
        },
      }),
    );
    await click(button("Start voice"));
    await waitFor(() => assert.equal(probe.connects, 1));
    await act(async () => {
      probe.emit({ type: "disconnected", reason: "task_complete" });
      await flush();
    });
    assert.ok(summarySignal);

    await click(button("Reset voice"));
    assert.equal(summarySignal.aborted, true);
    summary.resolve(
      json({
        conversation: {
          turns: [{ id: "stored", role: "assistant", text: "Late summary" }],
        },
      }),
    );
    await flush();

    assert.equal(reviews, 0);
    assert.equal(completed, 0);
    assert.equal(output("Conversation status").textContent, "ready");
    assert.equal(output("Conversation turns").textContent, "[]");
  });

  it("aborts review and prevents a late review from completing the route", async () => {
    const probe = transportProbe();
    const review = deferred();
    let reviewSignal;
    let completed = 0;
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/conversations" && init.method === "POST") {
        return startResponse("review-before-reset");
      }
      if (
        path === "/api/conversations/review-before-reset" &&
        init.method === "GET"
      ) {
        return json({ conversation: { turns: [] } });
      }
      if (
        path === "/api/conversations/review-before-reset/review" &&
        init.method === "PUT"
      ) {
        reviewSignal = init.signal;
        return review.promise;
      }
      if (
        path === "/api/conversations/review-before-reset/finish" &&
        init.method === "POST"
      ) {
        return json({ conversation: {} });
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      createElement(ConversationCancellationHarness, {
        createTransport: () => probe.transport,
        onCompleted: async () => {
          completed += 1;
        },
      }),
    );
    await click(button("Start voice"));
    await waitFor(() => assert.equal(probe.connects, 1));
    await act(async () => {
      probe.emit({ type: "disconnected", reason: "task_complete" });
      await flush();
    });
    await waitFor(() => assert.ok(reviewSignal));

    await click(button("Reset voice"));
    assert.equal(reviewSignal.aborted, true);
    review.resolve(json({ profileCompleted: true }));
    await flush();

    assert.equal(completed, 0);
    assert.equal(output("Conversation status").textContent, "ready");
  });

  it("aborts learner finish and prevents its late response from loading a summary", async () => {
    const probe = transportProbe();
    const learnerFinish = deferred();
    let learnerFinishSignal;
    let summaryLoads = 0;
    let completed = 0;
    const cleanupReasons = [];
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/conversations" && init.method === "POST") {
        return startResponse("finish-before-reset");
      }
      if (
        path === "/api/conversations/finish-before-reset/finish" &&
        init.method === "POST"
      ) {
        const reason = JSON.parse(init.body).reason;
        if (reason === "finished_by_learner") {
          learnerFinishSignal = init.signal;
          return learnerFinish.promise;
        }
        cleanupReasons.push({ reason, signal: init.signal });
        return json({ conversation: {} });
      }
      if (
        path === "/api/conversations/finish-before-reset" &&
        init.method === "GET"
      ) {
        summaryLoads += 1;
        return json({ conversation: { turns: [] } });
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      createElement(ConversationCancellationHarness, {
        createTransport: () => probe.transport,
        onCompleted: async () => {
          completed += 1;
        },
      }),
    );
    await click(button("Start voice"));
    await waitFor(() => assert.equal(probe.connects, 1));
    await click(button("Finish voice"));
    await waitFor(() => assert.ok(learnerFinishSignal));

    await click(button("Reset voice"));
    assert.equal(learnerFinishSignal.aborted, true);
    await waitFor(() =>
      assert.deepEqual(cleanupReasons, [
        { reason: "left_conversation", signal: undefined },
      ]),
    );
    learnerFinish.resolve(json({ conversation: {} }));
    await flush();

    assert.equal(summaryLoads, 0);
    assert.equal(completed, 0);
    assert.equal(output("Conversation status").textContent, "ready");
  });

  it("aborts an unfinished request when the hook unmounts", async () => {
    const start = deferred();
    let starts = 0;
    let startSignal;
    let transports = 0;
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/conversations" && init.method === "POST") {
        starts += 1;
        startSignal = init.signal;
        return start.promise;
      }
      if (
        path === "/api/conversations/late-after-unmount/finish" &&
        init.method === "POST"
      ) {
        assert.equal(init.signal, undefined);
        return json({ conversation: {} });
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      createElement(ConversationCancellationHarness, {
        createTransport: () => {
          transports += 1;
          return transportProbe().transport;
        },
      }),
    );
    await click(button("Start voice"));
    await waitFor(() => assert.equal(starts, 1));

    await cleanupMountedRoots();
    assert.equal(startSignal?.aborted, true);
    start.resolve(startResponse("late-after-unmount"));
    await flush();

    assert.equal(transports, 0);
  });

  it("aborts an unfinished request when active becomes false", async () => {
    const start = deferred();
    let startSignal;
    let transports = 0;
    globalThis.fetch = async (path, init = {}) => {
      if (path === "/api/conversations" && init.method === "POST") {
        startSignal = init.signal;
        return start.promise;
      }
      if (
        path === "/api/conversations/late-after-deactivation/finish" &&
        init.method === "POST"
      ) {
        assert.equal(init.signal, undefined);
        return json({ conversation: {} });
      }
      throw new Error(`Unexpected request: ${init.method} ${path}`);
    };

    await mountStrict(
      createElement(ActiveToggleHarness, {
        createTransport: () => {
          transports += 1;
          return transportProbe().transport;
        },
      }),
    );
    await click(button("Start voice"));
    await waitFor(() => assert.ok(startSignal));

    await click(button("Deactivate voice"));
    assert.equal(startSignal.aborted, true);
    start.resolve(startResponse("late-after-deactivation"));
    await flush();

    assert.equal(transports, 0);
    assert.equal(output("Conversation status").textContent, "ready");
  });
});
