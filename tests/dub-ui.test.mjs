import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { after, describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { createServer } from "vite";

const vite = await createServer({
  appType: "custom",
  logLevel: "silent",
  root: fileURLToPath(new URL("..", import.meta.url)),
  server: { middlewareMode: true },
});
const dubModule = await vite
  .ssrLoadModule("/src/dubbing/DuckDub.tsx")
  .catch(() => ({}));
const sceneModule = await vite
  .ssrLoadModule("/src/dubbing/DuckScene.tsx")
  .catch(() => ({}));
const projectHomeModule = await vite
  .ssrLoadModule("/src/dubbing/DubProjectHome.tsx")
  .catch(() => ({}));
const sceneEditorModule = await vite
  .ssrLoadModule("/src/dubbing/DubSceneEditor.tsx")
  .catch(() => ({}));
const { DUB_LINES } = await vite.ssrLoadModule(
  "/src/dubbing/dub-script.ts",
);
const { createInitialDubState } = await vite.ssrLoadModule(
  "/src/dubbing/dub-state.ts",
);
const { DuckDubView } = dubModule;
const { DuckScene } = sceneModule;
const { DubProjectHome } = projectHomeModule;
const { DubSceneEditor } = sceneEditorModule;

after(async () => vite.close());

function renderInRouter(element) {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: ["/dubs/five-little-ducks"] },
      element,
    ),
  );
}

const handlers = {
  onDelete() {},
  onHearGuide() {},
  onHearTake() {},
  onNext() {},
  onRecord() {},
  onRetake() {},
  onSelectLine() {},
  onSaveAgain() {},
  onStopPlayback() {},
  onStopRecording() {},
  onStopTake() {},
  onWatch() {},
};

function renderDuckDub(state, confirmed = true, viewProps = {}) {
  assert.equal(
    typeof DuckDubView,
    "function",
    "Expected an executable DuckDubView",
  );
  const mergedState = { ...createInitialDubState(), ...state };
  return renderInRouter(
    createElement(DuckDubView, {
      confirmed,
      line: DUB_LINES[mergedState.currentLineIndex],
      onConfirm() {},
      state: mergedState,
      ...handlers,
      ...viewProps,
    }),
  );
}

function renderProjectHome(viewProps = {}) {
  assert.equal(
    typeof DubProjectHome,
    "function",
    "Expected an executable DubProjectHome",
  );
  return renderToStaticMarkup(
    createElement(DubProjectHome, {
      activeLine: DUB_LINES[0],
      needsRetake: new Set(),
      onContinue() {},
      onDelete() {},
      onOpenScene() {},
      onTogglePlayback() {},
      playback: "idle",
      saved: {},
      ...viewProps,
    }),
  );
}

function renderSceneEditor(viewProps = {}) {
  assert.equal(
    typeof DubSceneEditor,
    "function",
    "Expected an executable DubSceneEditor",
  );
  return renderToStaticMarkup(
    createElement(DubSceneEditor, {
      activeLine: DUB_LINES[0],
      activeSceneIndex: 0,
      error: "",
      needsRetake: new Set(),
      onBack() {},
      onHearGuide() {},
      onHearTake() {},
      onRecord() {},
      onRetrySave() {},
      onSelectLine() {},
      onToggleScenePlayback() {},
      operation: "idle",
      pendingTake: null,
      saveRecovery: null,
      saved: {},
      ...viewProps,
    }),
  );
}

function liveStatusText(html) {
  const match = html.match(
    /<div(?=[^>]*aria-atomic="true")(?=[^>]*aria-live="polite")(?=[^>]*role="status")[^>]*>([^<]*)<\/div>/,
  );
  assert.ok(match, "Expected one atomic polite status region");
  return match[1].replace(/\s+/g, " ").trim();
}

function buttonTag(html, accessibleName) {
  const match = html.match(
    new RegExp(`<button(?=[^>]*aria-label="${accessibleName}")[^>]*>`),
  );
  assert.ok(match, `Expected button named ${accessibleName}`);
  return match[0];
}

function buttonDisabled(html, accessibleName) {
  return /\sdisabled=""/.test(buttonTag(html, accessibleName));
}

describe("duck dubbing presentation", () => {
  it("requires grown-up confirmation and explains private account storage", () => {
    const unchecked = renderDuckDub({ phase: "intro" }, false);
    assert.match(unchecked, /Five Little Ducks/);
    assert.match(unchecked, /Your recordings are private/);
    assert.match(unchecked, /signed-in grown-up(?:&#x27;|')s account/);
    assert.doesNotMatch(unchecked, /Line 1 of 24/);
    assert.doesNotMatch(unchecked, /Five little ducks went out one day\./);
    assert.match(
      unchecked,
      /I’m the grown-up and I agree to save these private voice clips\./,
    );
    assert.match(unchecked, /<input[^>]*required/);
    assert.match(unchecked, /<button[^>]*disabled[^>]*>Start dubbing<\/button>/);
    assert.match(unchecked, /<details(?![^>]*\bopen\b)[^>]*>/);
    assert.match(unchecked, /<summary[^>]*aria-label="Grown-up options"/);
    assert.match(unchecked, />Delete saved recordings<\/button>/);

    const continued = renderDuckDub(
      { phase: "intro", saved: { "line-1": "saved" } },
      true,
    );
    const continueButton = continued.match(
      /<button([^>]*)>Continue dubbing<\/button>/,
    );
    assert.ok(continueButton);
    assert.doesNotMatch(continueButton[1], /\sdisabled(?:=|\s|$)/);
  });

  it("makes the current lyric unmistakable and keeps the saved guide replayable", () => {
    const html = renderDuckDub({ phase: "line-ready", currentLineIndex: 0 });
    assert.match(html, /Verse 1 of 6 · Line 1 of 4/);
    assert.doesNotMatch(html, /Line 1 of 24/);
    assert.match(html, /aria-valuetext="Verse 1 of 6, line 1 of 4"/);
    assert.match(html, /Now read/);
    assert.match(html, /Five little ducks went out one day\./);
    assert.match(html, /aria-label="Record line 1"/);
    assert.equal(buttonDisabled(html, "Next line"), true);
    assert.ok(
      html.indexOf('aria-label="Record line 1"') < html.indexOf('aria-label="Next line"'),
    );
    assert.match(html, /aria-label="Replay example"/);
    assert.doesNotMatch(html, /aria-label="Hear the line"/);
    assert.doesNotMatch(html, /Watch my dub/);

    const complete = renderDuckDub({
      phase: "line-ready",
      saved: Object.fromEntries(DUB_LINES.map(({ id }) => [id, "saved"])),
    });
    assert.doesNotMatch(complete, /Watch my dub/);
    assert.doesNotMatch(complete, /Back to my dub/);
    assert.equal(buttonDisabled(complete, "Next line"), false);
  });

  it("keeps recording, saving, failure, and review actions child-readable", () => {
    const opening = renderDuckDub({ phase: "mic-opening" });
    assert.match(opening, /Opening microphone…/);
    assert.equal(buttonDisabled(opening, "Record line 1"), true);
    assert.equal(buttonDisabled(opening, "Next line"), true);

    const recording = renderDuckDub({ phase: "recording", currentLineIndex: 2 });
    assert.match(recording, /Recording…/);
    assert.match(recording, /aria-label="Stop recording line 3"/);
    assert.equal(buttonDisabled(recording, "Next line"), true);

    const saving = renderDuckDub({ phase: "saving" });
    assert.match(saving, /Saving your take…/);
    assert.equal(buttonDisabled(saving, "Record line 1"), true);
    assert.equal(buttonDisabled(saving, "Next line"), true);

    const failed = renderDuckDub({
      error: "Your take was not saved. Try again.",
      phase: "save-error",
    });
    assert.match(failed, /role="alert"/);
    assert.match(failed, />Save again<\/button>/);
    assert.match(failed, /aria-label="Record again line 1"/);
    assert.equal(buttonDisabled(failed, "Next line"), true);

    const rejected = renderDuckDub({
      error: "That recording is too long. Try the line again.",
      phase: "save-error",
      saveRecovery: "record",
    });
    assert.match(rejected, /role="alert"/);
    assert.match(rejected, />Record again<\/button>/);
    assert.doesNotMatch(rejected, />Save again<\/button>/);

    const review = renderDuckDub(
      { phase: "line-review" },
      true,
      { takeBlob: new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" }) },
    );
    assert.match(review, /Your voice/);
    assert.match(review, /aria-label="Your recording waveform"/);
    assert.match(review, /aria-label="Hear my voice"/);
    assert.equal(buttonDisabled(review, "Next line"), false);
    assert.match(review, /aria-label="Record again line 1"/);
    assert.ok(
      review.indexOf('aria-label="Record again line 1"') < review.indexOf('aria-label="Next line"'),
    );

    const playingTake = renderDuckDub(
      { phase: "line-review" },
      true,
      {
        takeBlob: new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" }),
        takePlaying: true,
      },
    );
    assert.match(playingTake, /aria-label="Stop my voice"/);

    const versePlaying = renderDuckDub({
      currentLineIndex: 3,
      phase: "verse-playing",
      saved: Object.fromEntries(DUB_LINES.slice(0, 4).map(({ id }) => [id, "saved"])),
    });
    assert.match(versePlaying, />Your verse</);
    assert.match(versePlaying, />Playing verse 1…</);
    assert.equal(buttonDisabled(versePlaying, "Record line 4"), true);
    assert.equal(buttonDisabled(versePlaying, "Next line"), false);
  });

  it("keeps final management controls inside closed grown-up options", () => {
    const ready = renderDuckDub({
      currentLineIndex: 4,
      phase: "final-ready",
      saved: Object.fromEntries(DUB_LINES.map(({ id }) => [id, "saved"])),
    });
    assert.match(ready, /Watch my dub<\/button>/);
    assert.match(ready, /All 6 verses recorded/);
    assert.match(ready, /Your dub is ready!/);
    assert.doesNotMatch(ready, /aria-label="Verse 2 of 6, line 1 of 4"/);
    assert.match(ready, /<details(?![^>]*\bopen\b)[^>]*>/);
    assert.match(ready, /<summary[^>]*aria-label="Grown-up options"/);
    assert.match(ready, />Grown-up options<\/summary>|>Grown-up options<span/);
    assert.match(ready, /<label[^>]*>Choose a saved line<\/label>/);
    assert.match(ready, /<select[^>]*aria-label="Choose a saved line"/);
    assert.match(ready, /<option[^>]*value="line-5"[^>]*selected=""[^>]*>Line 5: Four little ducks went out one day\.<\/option>/);
    assert.equal((ready.match(/<option/g) ?? []).length, 24);
    assert.match(ready, />Record selected line<\/button>/);
    assert.match(ready, />Delete my dub<\/button>/);
    assert.match(ready, /Your recordings are private/);

    const loading = renderDuckDub({ phase: "final-loading" });
    assert.match(loading, /Getting your dub ready…/);
    assert.match(loading, /disabled/);

    const playing = renderDuckDub({ phase: "final-playing" });
    assert.match(playing, />Stop playback<\/button>/);
  });

  it("shows recurring privacy guidance only at consent and inside grown-up options", () => {
    const intro = renderDuckDub({ phase: "intro" }, false);
    const ready = renderDuckDub({ phase: "line-ready" });
    const review = renderDuckDub({ phase: "line-review" });
    const complete = renderDuckDub({
      phase: "final-ready",
      saved: Object.fromEntries(DUB_LINES.map(({ id }) => [id, "saved"])),
    });

    assert.match(intro, /Your recordings are private/);
    assert.doesNotMatch(ready, /Your recordings are private/);
    assert.doesNotMatch(review, /Your recordings are private/);
    assert.match(complete, /Your recordings are private/);
  });

  it("announces every phase accurately through one atomic polite live region", () => {
    const complete = Object.fromEntries(DUB_LINES.map(({ id }) => [id, "saved"]));
    const cases = [
      [{ phase: "loading" }, {}, "Loading your private dub."],
      [
        { phase: "loading" },
        { loadError: "Your saved dub could not be loaded." },
        "Loading stopped. Try loading again.",
      ],
      [
        { phase: "loading" },
        {
          loadError:
            "Deleting your saved dub was interrupted. Ask a grown-up to finish deleting it.",
          resetInterrupted: true,
        },
        "Deleting your saved dub was interrupted. A grown-up can finish deleting it.",
      ],
      [{ phase: "intro" }, {}, "Grown-up confirmation is needed before dubbing."],
      [
        { currentLineIndex: 2, phase: "line-ready" },
        {},
        "Verse 1 of 6, line 3 of 4. Listen to the example, then record this line.",
      ],
      [
        { currentLineIndex: 2, phase: "mic-opening" },
        {},
        "Verse 1 of 6, line 3 of 4. Opening the microphone.",
      ],
      [
        { currentLineIndex: 2, phase: "recording" },
        {},
        "Verse 1 of 6, line 3 of 4. Recording in progress.",
      ],
      [
        { currentLineIndex: 2, phase: "saving" },
        {},
        "Verse 1 of 6, line 3 of 4. Saving your take.",
      ],
      [
        { currentLineIndex: 2, error: "Not saved.", phase: "save-error" },
        {},
        "Verse 1 of 6, line 3 of 4. Choose Save again.",
      ],
      [
        {
          currentLineIndex: 2,
          error: "Too long.",
          phase: "save-error",
          saveRecovery: "record",
        },
        {},
        "Verse 1 of 6, line 3 of 4. Choose Record again.",
      ],
      [
        { currentLineIndex: 2, phase: "line-review" },
        {},
        "Verse 1 of 6, line 3 of 4. Your take is saved. Hear your voice or choose Next line.",
      ],
      [
        { currentLineIndex: 3, phase: "verse-loading" },
        {},
        "Getting verse 1 of 6 ready. Next skips the preview.",
      ],
      [
        { currentLineIndex: 3, phase: "verse-playing" },
        {},
        "Playing verse 1 of 6. Next skips to the next verse.",
      ],
      [
        { currentLineIndex: 23, phase: "verse-loading" },
        {},
        "Getting verse 6 of 6 ready. Next skips to your completed dub.",
      ],
      [
        { currentLineIndex: 23, phase: "verse-playing" },
        {},
        "Playing verse 6 of 6. Next skips to your completed dub.",
      ],
      [
        { currentLineIndex: 2, phase: "final-ready", saved: complete },
        {},
        "Your complete dub is ready. Choose Watch my dub.",
      ],
      [
        { currentLineIndex: 2, phase: "final-loading", saved: complete },
        {},
        "Getting your dub ready to play.",
      ],
      [
        { currentLineIndex: 2, phase: "final-playing", saved: complete },
        {},
        "Playing your dub. Verse 1 of 6, line 3 of 4.",
      ],
      [
        { currentLineIndex: 2, phase: "final-ready", saved: complete },
        { isDeleting: true },
        "Deleting your saved dub.",
      ],
      [
        { phase: "loading" },
        {
          isDeleting: true,
          loadError:
            "Deleting your saved dub was interrupted. Ask a grown-up to finish deleting it.",
          resetInterrupted: true,
        },
        "Deleting your saved dub.",
      ],
    ];

    for (const [state, viewProps, expected] of cases) {
      const html = renderDuckDub(state, true, viewProps);
      assert.equal(liveStatusText(html), expected);
      assert.equal((html.match(/role="status"/g) ?? []).length, 1);
      assert.equal((html.match(/aria-live="polite"/g) ?? []).length, 1);
    }
  });

  it("offers an explicit reset recovery only for an interrupted deletion", () => {
    const ordinary = renderDuckDub(
      { phase: "loading" },
      true,
      { loadError: "Your saved dub could not be loaded." },
    );
    assert.match(ordinary, />Try loading again<\/button>/);
    assert.doesNotMatch(ordinary, /Finish deleting my dub/);

    const interrupted = renderDuckDub(
      { phase: "loading" },
      true,
      {
        loadError:
          "Deleting your saved dub was interrupted. Ask a grown-up to finish deleting it.",
        resetInterrupted: true,
      },
    );
    assert.match(interrupted, />Finish deleting my dub<\/button>/);
    assert.doesNotMatch(interrupted, /Try loading again/);

    const deleting = renderDuckDub(
      { phase: "loading" },
      true,
      {
        isDeleting: true,
        loadError:
          "Deleting your saved dub was interrupted. Ask a grown-up to finish deleting it.",
        resetInterrupted: true,
      },
    );
    assert.match(deleting, /<button[^>]*disabled[^>]*>Deleting your dub…<\/button>/);
    assert.doesNotMatch(deleting, /Try loading again|Finish deleting my dub/);
  });

  it("keeps visible progress and recording text accessible but non-live", () => {
    const html = renderDuckDub({ phase: "recording", currentLineIndex: 2 });
    assert.match(html, />Verse 1 of 6 · Line 3 of 4<\/p>/);
    assert.match(html, />Recording…<\/p>/);
    assert.equal((html.match(/role="status"/g) ?? []).length, 1);
    assert.equal((html.match(/aria-live="polite"/g) ?? []).length, 1);
    assert.doesNotMatch(html, /<p[^>]*(?:aria-live|role="status")[^>]*>[^<]*(?:Line 3|Recording…)/);
  });

  it("uses one hidden original SVG with adjacent scene description", () => {
    assert.equal(typeof DuckScene, "function", "Expected an executable DuckScene");
    const html = renderToStaticMarkup(
      createElement(DuckScene, { line: DUB_LINES[2], playing: true }),
    );
    assert.match(html, /<svg[^>]*aria-hidden="true"[^>]*viewBox="0 0 960 540"/);
    assert.doesNotMatch(html, /frog/i);
    assert.match(html, /Mother duck calls/);
    assert.equal((html.match(/<svg/g) ?? []).length, 1);
    assert.doesNotMatch(html, /<img|https?:\/\//);
  });
});

describe("duck dubbing storyboard presentation", () => {
  it("renders a selectable six-scene project workspace without line controls", () => {
    const html = renderProjectHome();

    assert.match(html, /aria-label="Full video player"/);
    assert.match(html, /Play full video/);
    assert.match(html, />Draft</);
    assert.match(html, />0 of 24 voice clips recorded</);
    assert.match(html, />Continue Scene 1</);
    for (let scene = 1; scene <= 6; scene += 1) {
      assert.match(html, new RegExp("aria-label=\\\"Scene " + scene + ", draft\\\""));
    }
    assert.doesNotMatch(html, /Five little ducks went out one day\\.|waveform|Record line|Next line/i);
  });

  it("keeps every scene selectable after all voice clips are recorded", () => {
    const html = renderProjectHome({
      activeLine: DUB_LINES[23],
      saved: Object.fromEntries(DUB_LINES.map(({ id }) => [id, "saved"])),
    });

    assert.match(html, />Your dub</);
    assert.match(html, />All scenes recorded</);
    for (let scene = 1; scene <= 6; scene += 1) {
      assert.match(html, new RegExp("aria-label=\\\"Scene " + scene + ", recorded\\\""));
    }
  });

  it("renders the focused scene editor with explicit selection and playback scopes", () => {
    const html = renderSceneEditor({
      needsRetake: new Set(["line-3"]),
      saved: { "line-1": "saved" },
    });

    assert.match(html, />Back to full video</);
    assert.match(html, /aria-label="Play this scene"/);
    assert.match(html, /aria-current="page"[^>]*>Scene 1 of 6/);
    assert.match(html, /aria-current="true"[^>]*aria-label="Line 1, selected, recorded"/);
    assert.match(html, /aria-label="Line 2, generated"/);
    assert.match(html, /aria-label="Line 3, needs retake"/);
    assert.match(html, /aria-label="Line 4, generated"/);
    for (const line of DUB_LINES.slice(0, 4)) {
      assert.match(html, new RegExp(line.text.replaceAll(".", "\\.")));
    }
    assert.match(html, /Hear example/);
    assert.match(html, /aria-label="Record line"/);
    assert.equal((html.match(/aria-label="Record line"/g) ?? []).length, 1);
    assert.doesNotMatch(html, /Next line/);
  });

  it("keeps the fixed record action while exposing a saved take and retry recovery", () => {
    const html = renderSceneEditor({
      error: "Your take was not saved.",
      operation: "recording",
      pendingTake: new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" }),
      saveRecovery: "save",
    });

    assert.match(html, /aria-label="Record line"[^>]*disabled/);
    assert.match(html, /aria-label="Your recording waveform"/);
    assert.match(html, /aria-label="Hear my voice"/);
    assert.match(html, />Save again</);
    assert.match(html, /role="alert"/);
    assert.doesNotMatch(html, /Next line/);
  });
});
