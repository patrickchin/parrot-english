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
  it("uses painted raster artwork with an adjacent scene description", () => {
    const html = renderToStaticMarkup(
      createElement(DuckScene, { line: DUB_LINES[2], playing: true }),
    );
    const sources = [...html.matchAll(/<img[^>]*src="([^"]+)"/g)].map((match) => match[1]);

    assert.match(html, /Mother duck calls/);
    assert.equal(sources.length, 7);
    assert.ok(sources.every((source) =>
      /^https:\/\/media\.parrotbook\.com\/assets\/v\d+\/dubbing\/five-little-ducks\/[a-z0-9-]+\.webp$/.test(source)
    ));
    assert.match(html, /data-story-layer="painted-environment"/);
    assert.doesNotMatch(html, /<svg|<path|<ellipse|<circle/);
  });

  it("keeps every duck actor mounted and gives sad mother a distinct story pose", () => {
    const depart = renderToStaticMarkup(
      createElement(DuckScene, { line: DUB_LINES[20] }),
    );
    const hill = renderToStaticMarkup(
      createElement(DuckScene, { line: DUB_LINES[21] }),
    );
    const call = renderToStaticMarkup(
      createElement(DuckScene, { line: DUB_LINES[22] }),
    );

    for (const html of [depart, hill, call]) {
      assert.equal((html.match(/data-duck-actor="duckling-[1-5]"/g) ?? []).length, 5);
      assert.equal((html.match(/data-duck-actor="mother"/g) ?? []).length, 1);
    }
    assert.match(depart, /data-duck-actor="mother"[^>]*data-pose="sad-swim"/);
    assert.match(hill, /data-duck-actor="mother"[^>]*data-pose="sad-walk"/);
    assert.match(call, /data-duck-actor="mother"[^>]*data-pose="sad-call"/);
  });

  it("uses distinct complete-character artwork for swimming, walking, and calling", () => {
    const swimming = renderToStaticMarkup(
      createElement(DuckScene, { line: DUB_LINES[0], playing: true }),
    );
    const walking = renderToStaticMarkup(
      createElement(DuckScene, { line: DUB_LINES[1], playing: true }),
    );
    const calling = renderToStaticMarkup(
      createElement(DuckScene, { line: DUB_LINES[2], playing: true }),
    );

    assert.match(swimming, /duckling-swim\.webp/);
    assert.match(walking, /duckling-walk\.webp/);
    assert.match(calling, /mother-call\.webp/);
    assert.doesNotMatch(calling, /data-duck-actor="duckling-\d"[^>]*src="[^"]*mother-call/);
  });

  it("lets only mother call while hidden ducklings stay on the hill", () => {
    const calling = renderToStaticMarkup(
      createElement(DuckScene, { line: DUB_LINES[2], playing: true }),
    );
    const ducklings = [...calling.matchAll(
      /data-duck-actor="duckling-\d"[^>]*data-pose="([^"]+)"[^>]*data-visible="false"[^>]*data-x="(\d+)"[^>]*data-y="(\d+)"/g,
    )];

    assert.equal((calling.match(/data-effect="call-rings"/g) ?? []).length, 1);
    assert.deepEqual(
      ducklings.map(([, pose, x, y]) => [pose, Number(x), Number(y)]),
      [
        ["wait", 345, 250],
        ["wait", 420, 235],
        ["wait", 500, 220],
        ["wait", 580, 235],
        ["wait", 655, 250],
      ],
    );
  });

  it("keeps every visible character inside the illustrated camera frame", () => {
    for (const line of DUB_LINES) {
      const html = renderToStaticMarkup(createElement(DuckScene, { line }));
      const actors = [...html.matchAll(
        /data-duck-actor="([^"]+)"[^>]*data-visible="true"[^>]*data-x="(\d+)"[^>]*data-y="(\d+)"/g,
      )];
      assert.ok(actors.length > 0 || line.duckCount === 0);
      for (const [, actor, x, y] of actors) {
        assert.ok(Number(x) >= 95 && Number(x) <= 840, `${line.id} ${actor} x=${x}`);
        assert.ok(Number(y) >= 210 && Number(y) <= 470, `${line.id} ${actor} y=${y}`);
      }
    }
  });

  it("illustrates the call, sad turn, and reunion as distinct story moments", () => {
    const call = renderToStaticMarkup(createElement(DuckScene, { line: DUB_LINES[2] }));
    const sadCall = renderToStaticMarkup(createElement(DuckScene, { line: DUB_LINES[22] }));
    const reunion = renderToStaticMarkup(createElement(DuckScene, { line: DUB_LINES[23] }));

    assert.match(call, /data-effect="call-rings"/);
    assert.match(sadCall, /data-expression="sad"/);
    assert.match(reunion, /data-effect="celebration"/);
    for (const html of [call, sadCall, reunion]) {
      assert.match(html, /data-story-layer="painted-environment"/);
    }
  });

  it("keeps thumbnail artwork static and defers its decorative images", () => {
    const reunion = renderToStaticMarkup(
      createElement(DuckScene, { line: DUB_LINES[23], playing: true, thumbnail: true }),
    );

    assert.doesNotMatch(reunion, /data-animated="true"/);
    assert.equal((reunion.match(/loading="lazy"/g) ?? []).length, 7);
  });

  it("keeps mother duck waiting when the ducklings return or stay away", () => {
    const returning = renderToStaticMarkup(createElement(DuckScene, { line: DUB_LINES[3] }));
    const noneReturn = renderToStaticMarkup(createElement(DuckScene, { line: DUB_LINES[19] }));

    assert.match(returning, /data-duck-actor="mother"[^>]*data-expression="bright"[^>]*data-visible="true"/);
    assert.match(noneReturn, /data-duck-actor="mother"[^>]*data-expression="sad"[^>]*data-visible="true"/);
  });

  it("renders a selectable six-scene project workspace without line controls", () => {
    const html = renderProjectHome();
    assert.match(html, /aria-label="Full video player"/);
    assert.match(html, /aria-label="Play full video"/);
    assert.match(html, /aria-label="Continue Scene 1"[^>]*>Continue<\/button>/);
    for (let scene = 1; scene <= 6; scene += 1) {
      assert.match(html, new RegExp(`aria-label="Scene ${scene}, Not started"`));
      assert.match(html, new RegExp(`aria-label="Scene ${scene} thumbnail"[^>]*role="img"`));
    }
    assert.doesNotMatch(html, />Draft<|>Your dub<|>Not started<|voice clips recorded/);
    assert.doesNotMatch(html, /waveform|Record line|Next line/i);
  });

  it("keeps full figure markup out of the six scene buttons", () => {
    const html = renderProjectHome();
    const sceneButtons = html.match(
      /<button(?=[^>]*aria-label="Scene \d,)[\s\S]*?<\/button>/g,
    ) ?? [];

    assert.equal(sceneButtons.length, 6);
    assert.doesNotMatch(sceneButtons.join(""), /<figure\b/);
  });

  it("reuses immutable painted artwork without SVG ID collisions", () => {
    const html = renderProjectHome();
    const sceneSources = [...html.matchAll(
      /<img[^>]*src="(https:\/\/media\.parrotbook\.com\/assets\/v\d+\/dubbing\/five-little-ducks\/[a-z0-9-]+\.webp)"/g,
    )].map(([, source]) => source);

    assert.equal(sceneSources.length, 49);
    assert.equal(new Set(sceneSources).size, 4);
    assert.doesNotMatch(html, /viewBox="0 0 960 540"|\bid=".*-sky"/);
  });

  it("keeps every scene selectable after all clips are recorded", () => {
    const html = renderProjectHome({
      activeLine: DUB_LINES[23],
      saved: Object.fromEntries(DUB_LINES.map(({ id }) => [id, "saved"])),
    });
    assert.doesNotMatch(html, />Your dub<|>Draft<|All scenes recorded/);
    assert.doesNotMatch(html, /aria-label="Continue Scene/);
    for (let scene = 1; scene <= 6; scene += 1) {
      assert.match(html, new RegExp(`aria-label="Scene ${scene}, Done"`));
    }
  });

  it("keeps retake status when every clip has a saved object", () => {
    const html = renderProjectHome({
      activeLine: DUB_LINES[4],
      needsRetake: new Set(["line-5"]),
      saved: Object.fromEntries(DUB_LINES.map(({ id }) => [id, "saved"])),
    });
    assert.doesNotMatch(html, />Draft<|>Your dub<|All scenes recorded/);
    assert.doesNotMatch(html, /aria-label="Continue Scene/);
    assert.match(html, /aria-label="Scene 2, Needs retake"/);
  });

  it("continues from the first missing scene independently of the preview", () => {
    const html = renderProjectHome({
      activeLine: DUB_LINES[16],
      saved: { "line-1": "saved", "line-3": "saved" },
    });
    assert.match(html, /aria-label="Continue Scene 1"/);
    assert.doesNotMatch(html, /aria-label="Continue Scene 5"/);
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
    assert.match(html, /<summary[^>]*aria-label="More grown-up options"/);
    assert.match(html, />Delete my dub<\/button>/);
  });

  it("uses visible shapes as well as color for scene and line status", () => {
    const project = renderProjectHome({
      needsRetake: new Set(["line-5"]),
      saved: {
        "line-1": "saved",
        "line-5": "saved",
        "line-9": "saved",
        "line-10": "saved",
        "line-11": "saved",
        "line-12": "saved",
      },
    });
    const editor = renderSceneEditor({
      needsRetake: new Set(["line-3"]),
      saved: { "line-1": "saved" },
    });

    assert.match(project, /aria-label="Scene 1, 1 \/ 4"[\s\S]*?data-status-icon="in-progress"[^>]*>◐<\/span>/);
    assert.match(project, /aria-label="Scene 2, Needs retake"[\s\S]*?data-status-icon="needs-retake"[^>]*>!<\/span>/);
    assert.match(project, /aria-label="Scene 3, Done"[\s\S]*?data-status-icon="done"[^>]*>✓<\/span>/);
    assert.match(project, /aria-label="Scene 4, Not started"[\s\S]*?data-status-icon="not-started"[^>]*>○<\/span>/);
    assert.match(editor, /aria-label="Line 1, selected, recorded"[\s\S]*?data-status-icon="recorded"[^>]*>✓<\/span>/);
    assert.match(editor, /aria-label="Line 2, generated"[\s\S]*?data-status-icon="generated"[^>]*>○<\/span>/);
    assert.match(editor, /aria-label="Line 3, needs retake"[\s\S]*?data-status-icon="needs-retake"[^>]*>!<\/span>/);
  });

  it("renders the focused scene editor with explicit line states", () => {
    const html = renderSceneEditor({
      needsRetake: new Set(["line-3"]),
      saved: { "line-1": "saved" },
    });
    assert.match(html, /aria-label="Back to full video"/);
    assert.match(html, /aria-label="Play this scene"/);
    assert.match(html, /aria-current="page"[^>]*>Scene 1 of 6/);
    assert.match(html, /<h1[^>]*>Five little ducks<\/h1>/);
    assert.match(html, /aria-current="true"[^>]*aria-label="Line 1, selected, recorded"/);
    assert.match(html, /aria-label="Line 2, generated"/);
    assert.match(html, /aria-label="Line 3, needs retake"/);
    assert.doesNotMatch(html, />Choose a line<|>Selected · Recorded<|>Generated<|>Needs retake</);
    assert.match(html, /<details(?![^>]*\bopen\b)[^>]*>[\s\S]*<summary[^>]*aria-label="Listen"/);
    assert.match(html, /Hear example/);
    assert.match(html, /aria-label="Record line"/);
    assert.ok(html.indexOf('aria-label="Record line"') < html.indexOf('aria-label="Listen"'));
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
    assert.match(html, /<button(?=[^>]*aria-label="Back to full video")(?=[^>]*disabled)[^>]*>/);
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
    assert.match(deletingScene, /<button(?=[^>]*aria-label="Back to full video")(?=[^>]*disabled)[^>]*>/);
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

  it("keeps the consent screen concise and hides deletion behind More", () => {
    const html = renderToStaticMarkup(createElement(DubEntry, {
      confirmed: false,
      deleting: false,
      error: "",
      onConfirm() {},
      onDelete() {},
      onEnter() {},
      onRetryLoad() {},
      resetInterrupted: false,
      savedCount: 0,
    }));

    assert.match(html, /Private voice clips are saved to your grown-up account and deleted with it\./);
    assert.match(html, /I’m the grown-up and agree to save these voice clips\./);
    assert.match(html, /<summary[^>]*aria-label="More grown-up options"[^>]*>More/);
    assert.doesNotMatch(html, /You can replay or replace them here|Grown-up options <span/);
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
