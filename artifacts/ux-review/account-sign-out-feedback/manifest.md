# Account sign-out feedback visual manifest

Date captured: 2026-08-24

Branch: `codex/account-sign-out-feedback`

Base commit: `5dce79a`

Research commit: `553d1c2`

Rendered behavior commit: `3fb69ba`

Implementation source: `0dd76c45819dd04a384d43e56c8ef0b45f0cf7a8`

Capture harness: `7be6b86979b8720622e3e9aa9850e340103be4da`

## Capture conditions

The six retained images are uncropped Playwright Chromium viewport captures
from the local Vite E2E environment at device-pixel ratio 1. The signed-in
identity is the deterministic fixture **Mia**. The implementation captures
hold `/api/auth/sign-out` until after the screenshot, so they show a truthful
pending request. The still-capture API disables animation at capture time; it
does not fabricate the request or DOM state.

The four `/lessons` shelf captures wait for fonts and images to settle. The
640x360 accessibility capture combines Chromium `forced-colors: active` with
`prefers-reduced-motion: reduce` and uses the keyboard path. It demonstrates
one emulated forced-color palette, not every physical Windows High Contrast
configuration. The lesson-player capture holds its opening audio after the
real **Start lesson** transition so the dense listening layout remains stable.

The failed request is released only after each capture. Browser contracts then
verify that the existing alert appears, Account becomes available, the live
status clears, and the menu can reopen for a deliberate retry.

Durable captures are written only when
`PARROT_CAPTURE_SIGN_OUT_EVIDENCE=1` is set. The recorded bundle was captured
with one Chromium worker; an ordinary `npm run test:browser` verifies the same
behavior without rewriting evidence files.

```sh
PARROT_CAPTURE_SIGN_OUT_EVIDENCE=1 npx playwright test tests/e2e/account-sign-out-feedback.spec.ts --project=chromium --workers=1
```

## Prototype comparison

Two real-code prototypes were stacked from `5dce79a` in isolated worktrees:

| Prototype | Branch / commit | Result |
| --- | --- | --- |
| Inline trigger morph | `codex/prototype-sign-out-inline-status` at `5ff9213` | Selected visually: one cause-and-effect locus, 65px route gap at 280px, and almost the ordinary Account footprint on desktop. Its first semantic implementation lost the Account identity and restored focus in an effect, so that code was not transplanted unchanged. |
| Adjacent status pill | `codex/prototype-sign-out-adjacent-status` at `9c96f24` | Rejected visually: three top-row surfaces at 280px, a 21px route gap, and an approximately 324px desktop cluster that resembled two available actions. Its stable Account identity and synchronous focus behavior informed the final semantics. |

The retained implementation preserves the inline pixels but separates the
semantics: an absolutely aligned sibling `role=status` owns the visible words,
while the underlying focused button keeps its Account identity, menu
relationship, and hit area. Its ready-state `title="Account"` is omitted while
pending so it cannot become a redundant accessible description or stale hover
tooltip. Because exact overlay still makes the status a plausible visible
button label, the pending accessible name is **Signing out… Account for Mia**.
The visible words occur first, as W3C recommends; the status remains a sibling
rather than a second visible button descendant.

The prototype screenshots remain durable on their named branches. Their four
viewport SHA-256 sets are:

- inline 280/390/640/1440:
  `4b04a90b87ee6b2530b06f4f2b6fcd46d45608e87c3772106269afe8d654487a`,
  `300dc8bde081ead85b0ea64fc0b483222a6133e8f4e17093a0ac44abde63873b`,
  `9ec80d788a1560d8bfa1a05edb59d2cfad69f9712534069c7d341602cb2db965`,
  `77f0ebcd2ce268e6318a3034b1d376b366bd47daa9c02e519323fc049087fc8d`;
- adjacent 280/390/640/1440:
  `d30cce6a9d971e96bfe45b423825ba578855b6a9ef6d71fdb358274834071928`,
  `aef1ea6e5d3d1edbe513ab2354735f31fc49d0b4568e2d7831513f6160e6ef13`,
  `dafabebd5158816bd3e49c4634880bd7db30285eb799558f632f357062b6c90e`,
  `2b3a2913159d32cd22a1bf7a39810257f7ec7bd1d6069a2904a93f15891e795e`.

## Measured retained state

The status and Account rectangles are identical at every shelf viewport, so
the visible status stays inside the persistent hit target. The document keeps
its viewport width and the lesson heading rectangle is unchanged from before
activation.

| Viewport | Account and status | Back control | Horizontal route gap | Document width |
| --- | --- | --- | ---: | ---: |
| 280x568 | 152x44 at `x=118, y=10` | 44x44 at `x=10, y=10` | 64px | 280px |
| 390x844 | 164x52 at `x=212, y=14` | 52x52 at `x=14, y=14` | 146px | 390px |
| 640x360 | 152x44 at `x=478, y=10` | 44x44 at `x=10, y=10` | 424px | 640px |
| 1440x900 | 180x64 at `x=1232, y=24` | 185.4x64 at `x=28, y=24` | 1018.6px | 1440px |

At all four sizes the active element is **Signing out… Account for Mia**,
`aria-disabled=true`, the computed cursor is `wait`, and status text inherits
the button's white foreground. Pointer hit-testing at the control center
resolves inside Account rather than falling through to lesson content.

The full values and all 20 timing samples are preserved in
[`capture-metrics.json`](./capture-metrics.json).

## Local timing diagnostic

Twenty fresh local Chromium pages, five at each shelf viewport, measured from
a DOM activation to the complete pending mutation and the next
`requestAnimationFrame` callback. Nearest-rank summaries were:

| Boundary | Min | p50 | p95 | Max |
| --- | ---: | ---: | ---: | ---: |
| Complete pending DOM mutation | 1.3ms | 1.4ms | 1.5ms | 1.5ms |
| Next animation-frame callback | 17.0ms | 18.5ms | 20.1ms | 20.5ms |

The callback runs before paint. These are candidate-only local diagnostics,
not physical input latency, field INP, low-end-device performance,
assistive-technology announcement latency, or a child-perception threshold.

## Retained files and SHA-256

| File | State | SHA-256 |
| --- | --- | --- |
| `implementation/signing-out-280x568.png` | Shelf, pointer path | `ab7ef13d5c183042323ba8ce4bdc9487d62bf81b447a551baf9ee7b8a9f61f4f` |
| `implementation/signing-out-390x844.png` | Shelf, pointer path | `0d6c838ae9b400cb8a697d66e19dde03b0169293d350ff73943fbe14a3d1dfa4` |
| `implementation/signing-out-640x360.png` | Shelf, short landscape | `3fa39487ee5a619eadee40216d7c4ff26ae3010ad690a80f19b9318f464d12a2` |
| `implementation/signing-out-1440x900.png` | Shelf, desktop | `a78c05e136720850919635b1ebda032254cfab1d1668a1653b121a571ddb811c` |
| `implementation/signing-out-forced-colors-reduced-motion-640x360.png` | Keyboard focus, emulated forced colors and reduced motion | `ad3d7d9588c95ac4cfc6c359f00b66fdff3c1ff2738a958a8ae42ae16bf2c6d2` |
| `implementation/signing-out-lesson-player-640x360.png` | Active listening lesson | `14295073868970b331c162e4a3ee458eb3c7a5a967ed81a69e5aaf2c50daa9aa` |

## Evidence boundary

These files establish local Chromium rendering, sampled geometry, hit-testing,
focus retention, one reduced-motion state, one emulated forced-color state,
and one dense lesson layout. They do not establish VoiceOver, NVDA, TalkBack,
Safari, Firefox, 200% browser zoom, localization or RTL fit, physical touch
behavior, real network timing, production Better Auth latency, or comprehension
by a five-year-old or weak-English caregiver. They also do not establish
whether a target browser/assistive-technology pair announces the focused name
change and live status once or twice.
