# Story Reader join-in visibility evidence

Captured 2026-08-23 (Asia/Shanghai) for
`codex/story-reader-join-in-visibility`.

## Provenance

- The image is a genuine Codex in-app Browser JPEG at the filename's exact
  640×360 viewport.
- Baseline source: `codex/static-profile-acknowledgment-audio` documentation
  hand-off `6ca36e7`, served locally from the isolated implementation worktree.
- The route used the repository's opt-in deterministic E2E account/session
  fixture. No production account, child, microphone, transcript, or story data
  was used.
- The page sentence owned focus and the inner reading pane was at scroll origin.
- JPEGs are qualitative review evidence. Quantitative visibility uses live DOM
  bounding rectangles rather than compressed pixels.

## Baseline capture

| File | Viewport | Evidence moment | SHA-256 |
| --- | ---: | --- | --- |
| [before-kite-page-4-640x360.jpg](./before-kite-page-4-640x360.jpg) | 640×360 | Kite, Come Back! page 4 at arrival; only the top yellow edge is exposed and neither prompt label nor phrase is visible | `837827ab161063ad5cdf466d5d6e549c0d0a7a62d17ed2bc23dff21ef9ad3f87` |

The image demonstrates presentation only. It does not prove narration timing,
keyboard or assistive-technology behavior, child comprehension, physical audio,
or behavior in another browser. Retained-state captures and final verification
will be added after implementation is frozen.
