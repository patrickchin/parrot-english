import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { after, describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const vite = await createServer({
  appType: "custom",
  logLevel: "silent",
  root: fileURLToPath(new URL("..", import.meta.url)),
  server: { middlewareMode: true },
});
const { DuckScene } = await vite.ssrLoadModule("/src/dubbing/DuckScene.tsx");
const { DubProjectHome } = await vite.ssrLoadModule("/src/dubbing/DubProjectHome.tsx");
const { DubSceneEditor } = await vite.ssrLoadModule("/src/dubbing/DubSceneEditor.tsx");
const {
  DubEntry,
  DubLoading,
  resolveDubLineAudioSource,
} = await vite.ssrLoadModule("/src/dubbing/DuckDub.tsx");
const { DUB_LINES } = await vite.ssrLoadModule("/src/dubbing/dub-script.ts");

after(async () => vite.close());

function renderProjectHome(viewProps = {}) {
  return renderToStaticMarkup(createElement(DubProjectHome, {
    activeLine: DUB_LINES[0],
    deleting: false,
    locked: false,
    needsRetake: new Set(),
    onContinue() {},
    onDelete() {},
    onOpenScene() {},
    onTogglePlayback() {},
    playback: "idle",
    saved: {},
    ...viewProps,
  }));
}

function renderSceneEditor(viewProps = {}) {
  return renderToStaticMarkup(createElement(DubSceneEditor, {
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
    locked: false,
    saveRecovery: null,
    saved: {},
    visualLine: DUB_LINES[0],
    ...viewProps,
  }));
}

describe("duck dubbing storyboard presentation", () => {
  it("uses one hidden original SVG with an adjacent scene description", () => {
    const html = renderToStaticMarkup(
      createElement(DuckScene, { line: DUB_LINES[2], playing: true }),
    );
    assert.match(html, /<svg[^>]*aria-hidden="true"[^>]*viewBox="0 0 960 540"/);
    assert.match(html, /Mother duck calls/);
    assert.equal((html.match(/<svg/g) ?? []).length, 1);
    assert.doesNotMatch(html, /<img|https?:\/\//);
  });

  it("renders a selectable six-scene project workspace without line controls", () => {
    const html = renderProjectHome();
    assert.match(html, /aria-label="Full video player"/);
    assert.match(html, /aria-label="Play full video"/);
    assert.match(html, />Draft</);
    assert.match(html, />0 of 24 voice clips recorded</);
    assert.match(html, />Continue Scene 1</);
    for (let scene = 1; scene <= 6; scene += 1) {
      assert.match(html, new RegExp(`aria-label="Scene ${scene}, Not started"`));
      assert.match(html, new RegExp(`aria-label="Scene ${scene} thumbnail"[^>]*role="img"`));
    }
    assert.equal((html.match(/>Not started</g) ?? []).length, 6);
    assert.doesNotMatch(html, /waveform|Record line|Next line/i);
  });

  it("keeps every scene selectable after all clips are recorded", () => {
    const html = renderProjectHome({
      activeLine: DUB_LINES[23],
      saved: Object.fromEntries(DUB_LINES.map(({ id }) => [id, "saved"])),
    });
    assert.match(html, />Your dub</);
    assert.match(html, />All scenes recorded</);
    assert.doesNotMatch(html, /Continue Scene/);
    for (let scene = 1; scene <= 6; scene += 1) {
      assert.match(html, new RegExp(`aria-label="Scene ${scene}, Done"`));
    }
  });

  it("keeps an all-saved project a Draft when a private take needs retake", () => {
    const html = renderProjectHome({
      activeLine: DUB_LINES[4],
      needsRetake: new Set(["line-5"]),
      saved: Object.fromEntries(DUB_LINES.map(({ id }) => [id, "saved"])),
    });
    assert.match(html, />Draft</);
    assert.doesNotMatch(html, />Your dub</);
    assert.match(html, />All scenes recorded</);
    assert.doesNotMatch(html, /Continue Scene/);
    assert.match(html, /aria-label="Scene 2, Needs retake"/);
  });

  it("continues from the first missing scene independently of the preview", () => {
    const html = renderProjectHome({
      activeLine: DUB_LINES[16],
      saved: { "line-1": "saved", "line-3": "saved" },
    });
    assert.match(html, />Continue Scene 1</);
    assert.doesNotMatch(html, /Continue Scene 5/);
  });

  it("shows non-blocking project playback errors and retake status", () => {
    const html = renderProjectHome({
      error: "Scene 2, line 1 could not play. The video will continue without it.",
      needsRetake: new Set(["line-5"]),
      playback: "playing",
      saved: { "line-5": "saved" },
    });
    assert.match(html, /aria-label="Stop full video"/);
    assert.match(html, /aria-label="Scene 2, Needs retake"/);
    assert.match(html, /role="alert"/);
  });

  it("keeps deletion inside closed grown-up options", () => {
    const html = renderProjectHome();
    assert.match(html, /<details(?![^>]*\bopen\b)[^>]*>/);
    assert.match(html, /<summary[^>]*aria-label="Grown-up options"/);
    assert.match(html, />Delete my dub<\/button>/);
  });

  it("renders the focused scene editor with explicit line states", () => {
    const html = renderSceneEditor({
      needsRetake: new Set(["line-3"]),
      saved: { "line-1": "saved" },
    });
    assert.match(html, />Back to full video</);
    assert.match(html, /aria-label="Play this scene"/);
    assert.match(html, /aria-current="page"[^>]*>Scene 1 of 6/);
    assert.match(html, /<h1[^>]*>Five little ducks<\/h1>/);
    assert.match(html, />1 of 4 recorded</);
    assert.match(html, /aria-current="true"[^>]*aria-label="Line 1, selected, recorded"/);
    assert.match(html, /aria-label="Line 2, generated"/);
    assert.match(html, /aria-label="Line 3, needs retake"/);
    assert.match(html, />Selected · Recorded</);
    assert.match(html, />Generated</);
    assert.match(html, />Needs retake</);
    assert.match(html, /Hear example/);
    assert.match(html, /aria-label="Record line"/);
    assert.doesNotMatch(html, /Next line/);
  });

  it("uses playback progress only for the scene visual, not selection or prompt", () => {
    const html = renderSceneEditor({
      activeLine: DUB_LINES[1],
      visualLine: DUB_LINES[3],
    });
    assert.match(html, /aria-current="true"[^>]*aria-label="Line 2, selected, generated"/);
    assert.match(html, /<h2[^>]*>Over the hill and far away\.<\/h2>/);
    assert.match(html, /The ducklings come back to the pond\./);
    assert.doesNotMatch(html, /aria-current="true"[^>]*aria-label="Line 4, selected/);
  });

  it("turns the fixed record action into the immediate stop action", () => {
    const html = renderSceneEditor({ operation: "recording" });
    assert.match(html, /aria-label="Stop recording"/);
    assert.match(html, />Recording…</);
    assert.doesNotMatch(html, /countdown|Get ready/i);
  });

  it("preserves a retryable take while locking navigation", () => {
    const html = renderSceneEditor({
      error: "Your take was not saved.",
      pendingTake: new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" }),
      saveRecovery: "save",
    });
    assert.match(html, /aria-label="Your recording waveform"/);
    assert.match(html, />Save again</);
    assert.match(html, /<button[^>]*disabled[^>]*>Back to full video<\/button>/);
    assert.match(html, /aria-label="Line 2, generated"[^>]*disabled/);
    assert.match(html, /role="alert"/);
  });

  it("keeps replay controls visible but disabled during a retry save", () => {
    const html = renderSceneEditor({
      operation: "saving",
      pendingTake: new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" }),
      saveRecovery: "save",
    });
    assert.match(html, /<button[^>]*disabled[^>]*>[^<]*<svg[^>]*>.*Hear example<\/button>/s);
    assert.match(html, /<button(?=[^>]*aria-label="Hear my voice")(?=[^>]*disabled)[^>]*>/);
    assert.match(html, /<button[^>]*disabled[^>]*>Save again<\/button>/);
  });

  it("exposes accurate loading names and exclusive deletion locks", () => {
    const projectLoading = renderProjectHome({ playback: "loading" });
    assert.match(projectLoading, /aria-label="Loading full video…"[^>]*disabled/);
    assert.doesNotMatch(projectLoading, /aria-label="Play full video"/);

    const sceneLoading = renderSceneEditor({ operation: "playback-loading" });
    assert.match(sceneLoading, /aria-label="Loading scene…"[^>]*disabled/);
    assert.doesNotMatch(sceneLoading, /aria-label="Play this scene"/);

    const deletingProject = renderProjectHome({ deleting: true, locked: true });
    assert.match(deletingProject, /<main[^>]*aria-busy="true"/);
    assert.match(deletingProject, /aria-label="Play full video"[^>]*disabled/);
    assert.match(deletingProject, /aria-label="Scene 1, Not started"[^>]*disabled/);
    assert.match(deletingProject, /<button[^>]*disabled[^>]*>Deleting my dub…<\/button>/);

    const deletingScene = renderSceneEditor({ locked: true, operation: "deleting" });
    assert.match(deletingScene, /<main[^>]*aria-busy="true"/);
    assert.match(deletingScene, /aria-label="Play this scene"[^>]*disabled/);
    assert.match(deletingScene, /aria-label="Record line"[^>]*disabled/);
    assert.match(deletingScene, /<button[^>]*disabled[^>]*>Back to full video<\/button>/);
  });

  it("marks intro and reset-loading route shells busy during deletion", () => {
    assert.equal(typeof DubEntry, "function", "DubEntry must be renderable for route-shell checks");
    assert.equal(typeof DubLoading, "function", "DubLoading must be renderable for route-shell checks");
    const entry = renderToStaticMarkup(createElement(DubEntry, {
      confirmed: false,
      deleting: true,
      error: "",
      onConfirm() {},
      onDelete() {},
      onEnter() {},
      onRetryLoad() {},
      resetInterrupted: false,
      savedCount: 0,
    }));
    const loading = renderToStaticMarkup(createElement(DubLoading, {
      deleting: true,
      error: "",
      onDelete() {},
      onRetryLoad() {},
      resetInterrupted: true,
    }));
    assert.match(entry, /<main[^>]*aria-busy="true"/);
    assert.match(loading, /<main[^>]*aria-busy="true"/);
  });

  it("discards rejected-take preview and exposes one Record again action", () => {
    const html = renderSceneEditor({
      error: "That recording is too long.",
      pendingTake: null,
      saveRecovery: "record",
    });
    assert.match(html, /aria-label="Record again"/);
    assert.equal((html.match(/Record again/g) ?? []).length, 2);
    assert.doesNotMatch(html, /Your recording waveform|Save again/);
  });

  it("names playing full, scene, and local-take controls as stop actions", () => {
    assert.match(renderProjectHome({ playback: "playing" }), /aria-label="Stop full video"/);
    assert.match(renderSceneEditor({ operation: "playback" }), /aria-label="Stop this scene"/);
    assert.match(renderSceneEditor({
      operation: "take-playing",
      pendingTake: new Blob([new Uint8Array([1])], { type: "audio/webm" }),
    }), /aria-label="Stop my voice"/);
  });

  it("keeps private playback resolvable when a saved line has no guide", () => {
    const source = resolveDubLineAudioSource(
      DUB_LINES[4],
      { "line-5": "saved" },
      () => { throw new Error("guide missing"); },
    );
    assert.deepEqual(source, {
      preferredUrl: "/api/dubs/five-little-ducks-v2/lines/line-5/audio",
    });
    assert.throws(
      () => resolveDubLineAudioSource(DUB_LINES[5], {}, () => {
        throw new Error("guide missing");
      }),
      /guide missing/,
    );
  });
});
