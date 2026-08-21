import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { Window } from "happy-dom";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { after, describe, it } from "node:test";
import { createServer } from "vite";

const vite = await createServer({
  appType: "custom",
  logLevel: "silent",
  root: fileURLToPath(new URL("..", import.meta.url)),
  server: { middlewareMode: true },
});
const { ConversationSurface } = await vite.ssrLoadModule(
  "/src/conversation/ConversationSurface.tsx",
);
after(async () => {
  await vite.close();
});

function props(overrides = {}) {
  return {
    audioPlaybackBlocked: false,
    audioPlaybackBusy: false,
    audioPlaybackError: "",
    canFinish: true,
    error: "",
    liveTranscript: "",
    microphoneBusy: false,
    microphoneEnabled: true,
    onBack() {},
    onChooseLesson() {},
    onFinish() {},
    onPromptStyleChange() {},
    onRepeatAudio() {},
    onRetryVoice() {},
    onStart() {},
    onStartAudio() {},
    onToggleMicrophone() {},
    purpose: "small-chat",
    promptStyle: "tiny-turns",
    recoveryPhase: null,
    responseLatencyMs: null,
    status: "ready",
    turnReady: true,
    turns: [],
    voiceRetryUsed: false,
    waitCycle: 0,
    ...overrides,
  };
}

function render(overrides = {}) {
  return renderToStaticMarkup(
    createElement(ConversationSurface, props(overrides)),
  );
}

describe("accessible realtime conversation surface", () => {
  it("starts with one child action and keeps chat style in grown-up options", () => {
    const html = render();

    assert.match(html, /Ready to talk/);
    assert.match(html, /Chat with Peppa/);
    assert.match(html, /peppa\/peppa-happy-768\.webp/);
    assert.match(html, /peppa-happy-384\.webp 384w/);
    assert.match(html, /peppa-happy-1024\.webp 1024w/);
    assert.match(html, /Tap Talk to Peppa\./);
    assert.match(html, /aria-label="Grown-up chat style: Tiny turns"/);
    assert.match(html, /Grown-up: Tiny turns/);
    assert.match(html, /<select[^>]*id="peppa-prompt-style"/);
    assert.match(html, /Tiny turns/);
    assert.match(html, /Gentle guide/);
    assert.match(html, /Playful pal/);
    assert.match(html, /aria-label="Start chat"/);
    assert.match(html, /Talk to Peppa/);
    assert.match(html, /just a few words/i);
    assert.doesNotMatch(html, /Use the form instead/);
    assert.doesNotMatch(html, /About this chat/);
    assert.doesNotMatch(html, /Finish conversation|Response latency|Timing…/);
  });

  it("keeps a consistent Back action on every conversation state", () => {
    for (const status of [
      "ready",
      "connecting",
      "listening",
      "thinking",
      "speaking",
      "reconnecting",
      "error",
      "saving",
    ]) {
      const html = render({ status });
      assert.match(
        html,
        /<button[^>]*aria-label="Back"[^>]*>/,
        status,
      );
    }
  });

  it("uses purpose-specific framing and completion behavior", () => {
    const smallChat = render({
      microphoneEnabled: false,
      purpose: "small-chat",
      status: "listening",
    });
    assert.match(smallChat, /Chat with Peppa/);
    assert.match(smallChat, /Finish chat/);
    assert.doesNotMatch(
      smallChat,
      /Help Peppa know you|Update my profile|Save and finish|Save changes/,
    );

    const onboarding = render({
      microphoneEnabled: false,
      purpose: "onboarding",
      status: "listening",
    });
    assert.match(onboarding, /Help Peppa know you/);
    assert.match(onboarding, /Save and finish/);
    assert.doesNotMatch(onboarding, /Update my profile|Finish conversation/);

    const profileEdit = render({
      microphoneEnabled: false,
      purpose: "profile-edit",
      status: "listening",
    });
    assert.match(profileEdit, /Update my profile/);
    assert.match(profileEdit, /Save changes/);
    assert.doesNotMatch(profileEdit, /Help Peppa know you|Finish conversation/);
  });

  it("describes the selected style without showing setup in profile flows", () => {
    const guide = render({ promptStyle: "gentle-guide" });
    assert.match(guide, /helps you say one easy sentence/);
    assert.match(guide, /<option value="gentle-guide" selected=""/);

    const onboarding = render({ purpose: "onboarding" });
    assert.match(onboarding, /Wait here. The voice chat is getting ready/);
    assert.doesNotMatch(onboarding, /Chat style|Start chat|Gentle guide/);
  });

  it("finishes ordinary chat without claiming to save the profile", () => {
    const html = render({ purpose: "small-chat", status: "saving" });

    assert.match(html, /Finishing chat/);
    assert.match(html, /That was fun/);
    assert.doesNotMatch(html, /remember that|Saving your profile/);
  });

  it("makes a genuine cold-start wait calm, honest, and non-interactive", () => {
    const connecting = render({
      status: "connecting",
      microphoneEnabled: false,
      turnReady: false,
    });
    assert.match(connecting, /Getting ready/);
    assert.match(connecting, /Starting the voice chat/);
    const document = new Window().document;
    document.body.innerHTML = connecting;
    const status = document.querySelector('[role="status"]');
    const captions = document.querySelector(
      '[aria-label="Conversation captions"]',
    );
    assert.ok(status);
    assert.ok(captions);
    assert.equal(
      status.textContent.replace(/\s+/g, " ").trim(),
      "Getting ready. Starting the voice chat.",
    );
    assert.doesNotMatch(captions.textContent, /Getting ready/);
    assert.equal(
      document.querySelector('[role="group"][aria-label="Conversation controls"]'),
      null,
    );
    assert.doesNotMatch(connecting, /Tap, then talk|I’m done/);
    assert.doesNotMatch(connecting, /Repeat Peppa|Response latency|Timing…/);
    assert.doesNotMatch(connecting, /Type instead|Type your answer|>Send</);
  });

  it("offers one literal sound action without claiming the child heard audio", () => {
    const blocked = render({
      audioPlaybackBlocked: true,
      microphoneEnabled: false,
      status: "connecting",
      turnReady: false,
    });
    assert.match(blocked, /Sound is off/);
    assert.match(blocked, /Tap for sound/);
    assert.match(blocked, /<p[^>]*role="status"/);
    assert.doesNotMatch(blocked, /aria-busy/);
    assert.match(blocked, /<button[^>]*>[^<]*(?:<[^>]+>)*Tap for sound/);
    assert.doesNotMatch(blocked, /Tap, then talk|Listen to Peppa|audio heard/i);

    const pending = render({
      audioPlaybackBlocked: true,
      audioPlaybackBusy: true,
      microphoneEnabled: false,
      status: "connecting",
      turnReady: false,
    });
    assert.match(pending, /Starting sound/);
    assert.match(pending, /Starting sound\./);
    assert.match(pending, /<p[^>]*role="status"/);
    assert.doesNotMatch(pending, /aria-busy/);
    assert.match(pending, /<button[^>]*disabled=""[^>]*>/);
    assert.doesNotMatch(pending, /Tap for sound<\/button>/);

    const failed = render({
      audioPlaybackBlocked: true,
      audioPlaybackError: "Sound did not start. Tap again.",
      microphoneEnabled: false,
      status: "connecting",
      turnReady: false,
    });
    assert.match(failed, /Sound did not start\. Tap again/);
    assert.match(failed, /Tap for sound/);
  });

  it("keeps the end-turn action available when sound blocks during recording", () => {
    const recording = render({
      audioPlaybackBlocked: true,
      microphoneEnabled: true,
      status: "listening",
      turnReady: true,
    });
    assert.match(recording, /aria-label="I’m done"/);
    assert.match(recording, /aria-pressed="true"/);
    assert.doesNotMatch(recording, /Tap for sound|Sound is off/);

    const microphoneStopped = render({
      audioPlaybackBlocked: true,
      microphoneEnabled: false,
      status: "listening",
      turnReady: false,
    });
    assert.match(microphoneStopped, /Tap for sound/);
    assert.match(microphoneStopped, /Sound is off/);
    assert.doesNotMatch(microphoneStopped, /I’m done/);
  });

  it("makes the learner and Peppa turns unmistakably different", () => {
    const learnerTurn = render({
      microphoneEnabled: false,
      status: "listening",
    });
    assert.match(learnerTurn, /aria-pressed="false"/);
    assert.match(learnerTurn, /Tap, then talk/);
    assert.match(learnerTurn, /Your turn/);
    assert.doesNotMatch(
      learnerTurn,
      /Type instead|Type your answer|>Send<|Mute microphone|Turn microphone on/,
    );

    const activeTurn = render({
      microphoneEnabled: true,
      status: "listening",
    });
    assert.match(activeTurn, /aria-pressed="true"/);
    assert.match(activeTurn, /I’m done/);
    assert.match(activeTurn, /Tap or press Space/);

    const openingSpeech = render({
      microphoneEnabled: false,
      status: "speaking",
      turnReady: true,
      turns: [
        { id: "opening", role: "assistant", text: "Hello! I am Peppa." },
      ],
    });
    assert.match(openingSpeech, /Peppa’s turn/);
    assert.match(openingSpeech, /Hello! I am Peppa\./);
    assert.doesNotMatch(openingSpeech, /Listen to Peppa/);
    assert.doesNotMatch(openingSpeech, /Tap, then talk|I’m done/);

    const reconnecting = render({
      microphoneEnabled: false,
      status: "reconnecting",
    });
    assert.match(reconnecting, /Trying again/);
    assert.doesNotMatch(reconnecting, /Tap, then talk|I’m done/);
  });

  it("gives immediate microphone feedback and prevents a second tap", () => {
    const html = render({
      microphoneBusy: true,
      microphoneEnabled: false,
      status: "listening",
    });

    assert.match(html, /Opening microphone/);
    assert.match(
      html,
      /<button[^>]*aria-label="Opening microphone"[^>]*disabled=""/,
    );
    assert.doesNotMatch(html, /Tap, then talk|I’m done/);
  });

  it("does not leave an old Peppa sentence on screen when a new reply starts", () => {
    const html = render({
      status: "speaking",
      turnReady: false,
      turns: [
        { id: "old-question", role: "assistant", text: "What is your name?" },
        { id: "answer", role: "user", text: "My name is Mia." },
      ],
    });

    assert.match(html, /Listen to Peppa/);
    assert.doesNotMatch(html, /What is your name/);
    const document = new Window().document;
    document.body.innerHTML = html;
    assert.equal(
      document.querySelector('button[aria-label="Listen to Peppa"]'),
      null,
    );
  });

  it("keeps growing transcripts visual and announces the stable turn status once", () => {
    const peppa = render({
      microphoneEnabled: false,
      status: "listening",
      turns: [
        { id: "one", role: "assistant", text: "What do you like to do?" },
      ],
    });
    const activeTurn = render({
      liveTranscript: "My name",
      microphoneEnabled: true,
      status: "listening",
    });
    const growingTurn = render({
      liveTranscript: "My name is Mia",
      microphoneEnabled: true,
      status: "listening",
    });
    const document = new Window().document;
    document.body.innerHTML = peppa;
    const captions = document.querySelector(
      '[aria-label="Conversation captions"]',
    );
    assert.ok(captions);
    assert.match(captions.textContent, /What do you like to do/);

    assert.match(activeTurn, /aria-label="Conversation captions"/);
    assert.match(activeTurn, /aria-label="Live transcript"/);
    assert.match(activeTurn, /Your words/);
    assert.match(activeTurn, /My name/);
    assert.match(growingTurn, /My name is Mia/);

    for (const [interim, expectedWords] of [
      [activeTurn, "My name"],
      [growingTurn, "My name is Mia"],
    ]) {
      document.body.innerHTML = interim;
      const liveTranscript = document.querySelector(
        '[aria-label="Live transcript"]',
      );
      assert.ok(liveTranscript);
      assert.equal(liveTranscript.querySelector("[aria-live]"), null);
      assert.match(liveTranscript.textContent, new RegExp(expectedWords));

      const turnStatus = document.querySelector('[role="status"]');
      assert.ok(turnStatus);
      assert.equal(turnStatus.getAttribute("aria-live"), "polite");
      assert.equal(turnStatus.getAttribute("aria-atomic"), "true");
      assert.equal(turnStatus.textContent.trim(), "Listening");
    }

    const endedTurn = render({
      liveTranscript: "My name is Mia",
      microphoneEnabled: false,
      status: "thinking",
    });
    assert.match(endedTurn, /aria-label="Your answer"/);
    assert.match(endedTurn, /You said/);
    assert.match(endedTurn, /My name is Mia/);
    document.body.innerHTML = endedTurn;
    const finalTranscript = document.querySelector(
      '[aria-label="Your answer"]',
    );
    assert.ok(finalTranscript);
    assert.equal(finalTranscript.querySelector("[aria-live]"), null);
    const finalStatus = document.querySelector('[role="status"]');
    assert.ok(finalStatus);
    assert.equal(finalStatus.textContent.trim(), "Thinking");
  });

  it("shows a quiet thinking state without exposing a latency badge", () => {
    const html = render({
      microphoneEnabled: false,
      status: "thinking",
      turns: [
        { id: "one", role: "assistant", text: "What do you like to do?" },
        { id: "two", role: "user", text: "I like drawing." },
      ],
    });

    assert.match(html, /role="status"/);
    assert.match(html, /aria-live="polite"/);
    assert.doesNotMatch(html, /aria-busy/);
    assert.match(html, /Thinking/);
    assert.match(html, /Your turn is done. Wait for Peppa/);
    assert.doesNotMatch(html, /aria-label="Waiting for Peppa"/);
    assert.doesNotMatch(html, /What do you like to do/);
    assert.doesNotMatch(html, /response latency|Reply:|Timing…/i);
    assert.doesNotMatch(html, /Tap, then talk|I’m done/);
    const document = new Window().document;
    document.body.innerHTML = html;
    assert.equal(
      document
        .querySelector('[role="status"]')
        ?.textContent.replace(/\s+/g, " ")
        .trim(),
      "Thinking. Your turn is done. Wait for Peppa.",
    );
  });

  it("shows only Peppa's latest speech and removes transcript history and developer controls", () => {
    const html = render({
      microphoneEnabled: false,
      status: "listening",
      turns: [
        { id: "one", role: "assistant", text: "What do you like to do?" },
        { id: "two", role: "user", text: "I like drawing." },
        { id: "three", role: "assistant", text: "Ooh, drawing is brilliant!" },
      ],
    });

    assert.match(html, /Ooh, drawing is brilliant!/);
    assert.doesNotMatch(html, /I like drawing/);
    assert.doesNotMatch(html, /Debug transcript/);
    assert.match(html, /Tap, then talk/);
    assert.doesNotMatch(html, /Chat with your pig pal/);
  });

  it("offers an accessible repeat action for Peppa's latest completed line", () => {
    const ready = render();
    assert.doesNotMatch(ready, /Repeat Peppa's audio/);

    const listening = render({
      microphoneEnabled: false,
      status: "listening",
      turns: [
        { id: "one", role: "assistant", text: "What do you like to do?" },
      ],
    });
    assert.match(listening, /role="group"/);
    assert.match(listening, /aria-label="Peppa(?:'|&#x27;)s message"/);
    assert.match(listening, /aria-label="Repeat Peppa(?:'|&#x27;)s audio"/);
    assert.doesNotMatch(
      listening,
      /aria-label="Repeat Peppa(?:'|&#x27;)s audio"[^>]*disabled/,
    );

    const speaking = render({
      microphoneEnabled: false,
      status: "speaking",
      turns: [
        { id: "one", role: "assistant", text: "What do you like to do?" },
      ],
    });
    assert.doesNotMatch(speaking, /Repeat Peppa(?:'|&#x27;)s audio/);
  });

  it("keeps recovery clear without bringing back typed input or a second large action", () => {
    const html = render({
      canFinish: false,
      error: "The voice room took a break.",
      recoveryPhase: "restart",
      status: "error",
    });

    assert.match(html, /The voice room took a break/);
    assert.match(html, /Try again/);
    assert.doesNotMatch(html, /Finish chat|Tap, then talk|I’m done/);
    assert.doesNotMatch(html, /Type instead|Type your answer|>Send</);
  });

  it("offers one picture-led lesson path after the voice retry also fails", () => {
    const html = render({
      error: "Peppa cannot talk now. Tap Try again.",
      recoveryPhase: "restart",
      status: "error",
      voiceRetryUsed: true,
    });

    assert.match(html, /Chat paused/);
    assert.match(html, /Peppa cannot talk now/);
    assert.match(html, /Play a lesson/);
    assert.match(html, /01-peppas-high-ball/);
    assert.doesNotMatch(html, /role="alert"/);
    assert.doesNotMatch(html, /Try again|Finish chat|alt="Peppa"/);
    assert.doesNotMatch(html, /aria-busy/);
  });

  it("gives a finish failure one matching full-width finish action", () => {
    const html = render({
      error: "The chat did not finish. Tap Finish chat again.",
      recoveryPhase: "finish",
      status: "error",
    });

    assert.match(html, /The chat did not finish/);
    assert.match(html, />Finish chat again</);
    assert.doesNotMatch(html, />Try again</);
  });

  it("shows a microphone error without throwing away the learner's turn", () => {
    const html = render({
      error: "Ask a grown-up to turn on the microphone.",
      microphoneEnabled: false,
      status: "listening",
    });

    assert.match(html, /role="alert"/);
    assert.match(html, /Please try again/);
    assert.match(html, /Ask a grown-up to turn on the microphone/);
    assert.match(html, /Tap, then talk/);
  });

  it("saves the prose profile without showing a review page", () => {
    const html = render({
      purpose: "profile-edit",
      status: "saving",
      candidates: [
        {
          id: "profile-summary",
          factKey: "summary",
          label: "About this learner",
          status: "accepted",
          value: "Mia is seven years old and loves giant pandas.",
        },
      ],
      turns: [
        { id: "heard-one", role: "assistant", text: "How old are you?" },
        { id: "heard-two", role: "user", text: "I am seven." },
      ],
    });

    assert.match(html, /Saving your answers/);
    assert.match(html, /Lovely chat!/);
    const document = new Window().document;
    document.body.innerHTML = html;
    const status = document.querySelector('[role="status"]');
    const captions = document.querySelector(
      '[aria-label="Conversation captions"]',
    );
    assert.ok(status);
    assert.ok(captions);
    assert.equal(
      status.textContent.replace(/\s+/g, " ").trim(),
      "Saving your answers. Lovely chat!",
    );
    assert.doesNotMatch(captions.textContent, /Saving your answers/);
    assert.equal(
      document.querySelector('[role="group"][aria-label="Conversation controls"]'),
      null,
    );
    assert.doesNotMatch(html, /Here’s what I heard/);
    assert.doesNotMatch(html, /aria-label="Edit About this learner"/);
    assert.doesNotMatch(html, /<textarea/);
    assert.doesNotMatch(html, /Save and continue|Keep this|Leave this out/);
    assert.doesNotMatch(html, /Debug transcript|I am seven\./);
  });
});
