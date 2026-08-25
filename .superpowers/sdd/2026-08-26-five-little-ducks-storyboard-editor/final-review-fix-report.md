# Final Storyboard Review Fix Report

Date: 2026-08-26

Branch: `codex/dub-storyboard-editor`

Reviewed base: `6b2a3c4af32a0efde234143ba62c3820598bf48d`

Verified implementation snapshot: `6b19be85284c8187220561279740e5320d348fb1`

The implementation snapshot was created before this report was added so that
the report could contain a concrete SHA. The final amended commit retains the
required subject, `fix: close storyboard review gaps`; its SHA is recorded in
the final task handoff because a commit cannot embed its own hash.

## Outcome

All nine accepted findings in `final-review-findings.md` are addressed without
changing the private v2 API/R2 contract, consent and account-deletion flows, or
the approved no-countdown recording behavior. The implementation stays in
React/Tailwind and the existing shared controls/header; no page-specific CSS or
new dependency was added.

## Root causes and corrections

1. **Route scrolling:** the document is globally non-scrolling, but dubbing
   shells used growing `min-h-dvh` containers. Intro, loading/error, project,
   and scene shells now each own an `h-dvh w-screen` viewport with constrained
   horizontal overflow, vertical auto-scroll, and contained overscroll. Browser
   coverage inspects the actual scroll container and uses real wheel input.
2. **Scoped audio clocks and diagnostics:** scene duration was derived only
   from successfully decoded clips, and one mutable error string overwrote
   earlier unavailable slots. Scoped playback now keeps the authored boundary
   through the next canonical cue (or the 98-second boundary) and extends for a
   longer decoded tail. Unavailable IDs are de-duplicated and rendered in
   canonical `DUB_LINES` order. Missing voices still leave the music/visual
   clock running.
3. **640x360 composition:** the ordinary vertical project and editor layouts
   exceeded the short viewport. The existing `short-wide:` variant now creates
   a bounded project stage/action/dock split and a two-column scene editor with
   the stage, selectors, lyric, playback/example actions, and record action all
   below the shared header and inside the viewport.
4. **Project label semantics:** one `allRecorded` flag incorrectly drove both
   workflow completion and the usable-dub label. The home now distinguishes
   `allSaved` from `allUsable = allSaved && needsRetake.size === 0`; a complete
   fallback project stays `Draft` while preserving saved-count completion
   mechanics.
5. **Storyboard metadata/status:** project status was independently derived
   with obsolete lowercase vocabulary and controls lacked thumbnails. Both
   project and scene presentations now use `getDubSceneStatus`; controls show a
   representative scene image and exact `Not started`, `n / 4`, `Done`, or
   `Needs retake` text. The editor shows a descriptive authored scene title and
   `n of 4 recorded` progress.
6. **280px selectors:** shared `ActionButton` default sizing imposed
   `min-w-36` on each item in a two-column row, and selected/state meaning was
   primarily color-based. Selectors use the shared control with `size="none"`,
   explicit `w-full min-w-0`, visible state text, and a visible `Selected ·`
   marker. Geometry tests assert every selector stays within the 280px viewport.
7. **Continue focus:** Continue dispatched navigation without retaining the
   cancellation generation or scheduling focus. It now follows the established
   generation-guarded `focusAfterRender` path and focuses the scene heading.
8. **Same-line reselection:** every selector invocation called
   `cancelMedia(true)`, revoking the current local take even when selection did
   not change. Reselecting the active line now stops media with
   `cancelMedia(false)`; changing lines still discards the take.
9. **Object URL evidence — ADDRESSED:** the E2E harness did not observe browser
   object URL ownership. It now instruments create/revoke operations and
   verifies retained same-line review plus exactly-once cleanup for replacement,
   changed-line selection, Back, rejected upload, and route unmount. Delete is
   available only on the project home while a live preview exists only in the
   scene editor, so Back necessarily revokes the preview before Delete becomes
   reachable; the combined Back/delete coverage verifies deletion does not
   double-revoke it. The reviewer verified that live-preview/deletion
   coexistence is unreachable and reclassified original finding 9 as
   **ADDRESSED**. The unmount assertion polls passive-effect cleanup rather than
   racing it.

## RED evidence

The required Node command first passed the prior behavior at 110/110, providing
a clean baseline. Focused tests were then changed/added before implementation.

```text
node --test tests/dub-playback.test.mjs tests/dub-ui.test.mjs
35 passed, 7 failed (42 total)
```

The failures exposed the intended roots: an all-unavailable scene created zero
music oscillators instead of 25 and ended on a zero clock; rendered project and
editor output lacked the approved statuses, thumbnails, descriptive title,
visible line state/selection, progress, and all-saved-but-unusable Draft state.

```text
PLAYWRIGHT_PORT=4199 npx playwright test tests/e2e/dubbing.spec.ts
30 passed, 13 failed (43 total)
```

Representative observed failures were: route shells computed vertical overflow
as `visible` and overscroll as `auto`; real wheel input left `scrollTop` at 0;
same-line reselection removed the waveform; the corrupt complete project did
not render `Draft`; Continue had no descriptive focus target; and the 640x360
project stage bottom was 496.5px, beyond the 360px viewport. New lifecycle
assertions also had no create/revoke instrumentation to inspect.

## GREEN evidence

Focused implementation checks:

```text
node --test tests/dub-state.test.mjs tests/dub-playback.test.mjs tests/dub-ui.test.mjs tests/dub-api.test.mjs tests/dub-worker.test.mjs tests/dub-waveform.test.mjs
112 passed, 0 failed (6 suites)

PLAYWRIGHT_PORT=4199 npx playwright test tests/e2e/dubbing.spec.ts
43 passed, 0 failed
```

One fresh final browser run initially reported 42/43 because the route URL was
observable before React's passive unmount cleanup. The product had revoked the
URL on earlier runs; the direct snapshot assertion was timing-dependent. It was
changed to poll the instrumented revocation count and the exact command then
passed 43/43.

Repository-wide checks required by the design and agent notes also passed:

```text
npm test
948 passed, 0 failed (104 suites)

npm run test:browser
454 passed, 0 failed
```

Final non-test verification:

```text
npm run build
passed (TypeScript and Vite production build)

npm run lint
passed with 0 errors and 2 pre-existing unused-disable warnings in worker-configuration.d.ts

git diff --check
passed with no output
```

Vite continued to emit its existing advisory that one generated chunk exceeds
500 kB; this did not fail the build.

## Files changed

- `src/dubbing/DubProjectHome.tsx` — usable/saved labeling, domain statuses,
  thumbnails, constrained shell, and short-wide project layout.
- `src/dubbing/DubSceneEditor.tsx` — titles/progress, visible line states,
  narrow selector sizing, constrained shell, and compact two-column layout.
- `src/dubbing/DuckDub.tsx` — constrained entry/loading shells, aggregate
  unavailable diagnostics, Continue focus, and same-line take preservation.
- `src/dubbing/dub-playback.ts` — authored scoped duration floor plus decoded
  tail extension.
- `src/dubbing/dub-script.ts` — fixed authored scene-title metadata.
- `src/shared/ui.tsx` — exposes the existing no-size shared-control mode to
  `ActionButton` consumers.
- `src/testing/e2e-browser-mocks.ts` — object URL instrumentation and focused
  load/multi-source-failure scenarios.
- `tests/dub-playback.test.mjs` — authored-clock, missing-voice, music, and tail
  regression coverage.
- `tests/dub-ui.test.mjs` — storyboard vocabulary, metadata, state, progress,
  and usable-vs-saved presentation coverage.
- `tests/e2e/dubbing.spec.ts` — real scrolling, responsive geometry, focus,
  fallback aggregation, same-line review, and URL lifecycle coverage.

## Remaining concerns

No functional concern remains for the accepted findings. The only observed
warnings are the two pre-existing generated-type lint warnings and Vite's
non-failing chunk-size advisory noted above. No deployment or external state
change was performed.

## Residual review follow-up after `2ca587a`

The residual reviewer confirmed original finding 9 as **ADDRESSED** for the
unreachable deletion/live-preview state described above, and identified one
separate markup breakage: the six representative scene thumbnails reused the
full `DuckScene` figure markup inside their buttons and all seven rendered duck
SVGs reused `id="duck-sky-gradient"`.

### RED

Two focused SSR assertions were added before production changes:

```text
node --test tests/dub-ui.test.mjs
17 passed, 2 failed (19 total)
```

`keeps full figure markup out of the six scene buttons` failed because every
button contained a `<figure>`. `gives every rendered duck SVG a document-unique
ID` failed because seven SVG IDs produced a unique-set size of one.

### Correction

`DuckScene` now has an explicit thumbnail rendering mode that returns only its
hidden SVG art inside the caller's already labeled `role="img"`. Ordinary and
compact scene presentations retain their figure and adjacent caption contract.
React `useId` supplies a stable document-unique gradient ID and the matching
local paint reference for every rendered instance.

### GREEN

```text
node --test tests/dub-ui.test.mjs
19 passed, 0 failed

PLAYWRIGHT_PORT=4199 npx playwright test tests/e2e/dubbing.spec.ts
43 passed, 0 failed

npm run build
passed (TypeScript and Vite production build)

npm run lint
passed with 0 errors and the same 2 pre-existing generated-type warnings

git diff --check
passed with no output
```

Vite also repeated the existing non-failing chunk-size advisory. No API,
storage, consent, deletion, recording, or external state behavior changed.
