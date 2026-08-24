# Account sign-out recovery visual manifest

Date captured: 2026-08-24

Branch: `codex/account-sign-out-recovery`

Base commit: `1de1f6d`

Research commit: `374b34b123fa65a8c6210dec7f2cb41998a89470`

Initial implementation source: `fdd5897e3a7a1e12dc76f74ed77c7ca1ac3ce8be`

Review contracts: `ac270ce468afec3228f68e4742c04d812d59b048`

Capture harness: `fbe9422b417dbcb468c4dac0359418b1845d1ac1`

Independent-review hardening: `eca3c0bea30869b0b22a8ee37f2a1b1393f8332b`

Capture source: `687f59dfe8c710769413cd808855cb0ce2870a9f`

## Capture conditions

The ten retained implementation images are uncropped Playwright Chromium
viewport captures from the local Vite E2E environment at device-pixel ratio 1.
The deterministic signed-in identity is **Mia**. The ordinary shelf,
forced-colors, and dense Lesson Player cases hold `/api/auth/sign-out` until the
pending state is verified, then abort it. The text-spacing cases abort the same
routed request immediately. Every image therefore contains the real
failed-request recovery DOM. Animation is disabled at capture time.

The ordinary shelf and forced-colors captures wait for fonts, decoded `img`
assets, and two animation frames before activation. The 640x360 Lesson Player
captures replace audio with a held deterministic test double after navigation,
enter the real **Start lesson** transition, and apply the same readiness barrier
to newly mounted scene assets. The
accessibility capture combines Chromium `forced-colors: active` and
`prefers-reduced-motion: reduce`; it is an emulation, not proof for every
physical Windows High Contrast configuration.

Durable captures and measurements are written only when
`PARROT_CAPTURE_SIGN_OUT_RECOVERY_EVIDENCE=1` is set. The recorded bundle was
captured serially to keep the lesson state deterministic:

```sh
PARROT_CAPTURE_SIGN_OUT_RECOVERY_EVIDENCE=1 npx playwright test tests/e2e/account-sign-out-feedback.spec.ts --workers=1
```

An ordinary run executes the same eight behavior tests without rewriting the
evidence files. The ninth metrics case is registered only under the capture
flag so hardware-dependent numbers are evidence, not a CI pass/fail threshold.

## Baseline obstruction

The base branch's absolute failure alert had no direct action and covered the
following sampled content:

| Viewport | Existing alert | Sampled heading covered |
| --- | --- | ---: |
| 280x568 | 256x57 | 100% |
| 390x844 | 256x57 | 84.8% |
| 640x360 | 320x39.5 | 25.9% |
| 1440x900 | 320x39.5 | 0% |

On the 640x360 Lesson Player it covered about 64.7% of the HUD, including the
complete scene title. These are deterministic rectangle intersections from
the local baseline, not gaze, comprehension, or field-use measurements.

## Prototype comparison

Two real-code prototypes were stacked from research commit `374b34b` in
isolated worktrees:

| Prototype | Branch / commit | Result |
| --- | --- | --- |
| Single-locus Account morph | `codex/prototype-sign-out-recovery-locus` at `5cefe19a3066c53a2ffebd6912d17abeda6bb160` | Compact and collision-free, but rejected because Account utilities disappear indefinitely after failure. |
| Split Account and retry | `codex/prototype-sign-out-recovery-split` at `8dff319c8e93e8f5828f52fa7405d7f229f7f929`, reviewed at `ba6598598801936b12a992125db2809439b7be62` | Selected. Preserves Account and adds a one-Tab retry. Review restored the 180px desktop pending frame and made retry close an open menu synchronously. |

The prototype source remains on its named branches, and the exact captures are
copied into this bundle. The split images were captured from `8dff319` before
the later `ba65985` pending-width/open-menu review fix.

| File | Captured source | SHA-256 |
| --- | --- | --- |
| `prototypes/single-locus/lessons-280x568.png` | `5cefe19` | `b1b59ef034dfb4c0b9f81cffc4f7515c23c0392ed0dd8387ec64cbe5fa1530b2` |
| `prototypes/single-locus/lessons-390x844.png` | `5cefe19` | `60d92b6431112ecb53b69facc2506290df9d75edb9d89523c50897f8bfd5b60a` |
| `prototypes/single-locus/lessons-640x360.png` | `5cefe19` | `484b75c044b050b0c8b09f847ede6c29734cda0ea98ea34968d3087866ed96fd` |
| `prototypes/single-locus/lessons-1440x900.png` | `5cefe19` | `e535fcc8645505b987468635d69eaafda3d0b1060b3a6c3ae763243399f8879a` |
| `prototypes/single-locus/lesson-player-640x360.png` | `5cefe19` | `8e713df0c13ec52f16333da804e451ce44999ee21216f8f9325cbe351d6d8d22` |
| `prototypes/split/lessons-280x568.png` | `8dff319` | `baaeb8ca35c078c829767232f02d5573452e714f0859e5b2b5094ab6ddd41dcb` |
| `prototypes/split/lessons-390x844.png` | `8dff319` | `6e082f1d24e999fb96f4e2bf6f6c1ca82240bded19cd651316206373a5a19315` |
| `prototypes/split/lessons-640x360.png` | `8dff319` | `3dc079aba2c524f57c2599b7fc2938de0538d8ce631b9eb79b3a8f55ed115977` |
| `prototypes/split/lessons-1440x900.png` | `8dff319` | `007cf7c78555e5bcc18b564be0998d2cefdeb95e6471c32396e616f3b84850d3` |
| `prototypes/split/lesson-player-640x360.png` | `8dff319` | `2c2d3d89ac5a5f0e657c491caf45928fbf3be453fb9d8091479a6fc7f8de3af5` |

## Measured retained state

The retry is after Account in DOM/tab order but is painted to its left. Its
complete focus outline stays inside the viewport and does not overlap Back,
Account, or the route heading. The document retains exactly the viewport
width.

| Viewport | Retry | Retry focus paint | Account | Back | Document width |
| --- | --- | --- | --- | --- | ---: |
| 280x568 | 150x44 at `64,10` | 166x60 at `56,2` | 44x44 at `226,10` | 44x44 at `10,10` | 280px |
| 390x844 | 150x48 at `162,14` | 166x64 at `154,6` | 52x52 at `324,14` | 52x52 at `14,14` | 390px |
| 640x360 | 158x44 at `416,10` | 174x60 at `408,2` | 44x44 at `586,10` | 44x44 at `10,10` | 640px |
| 1440x900 | 148.3x48 at `1078.5,24` | 164.3x64 at `1070.5,16` | 173.2x64 at `1238.8,24` | 185.4x64 at `28,24` | 1440px |

The visible heading rectangle is identical before and after failure in every
behavior test. The short Lesson Player test likewise keeps the HUD and speech
rectangles identical and proves no retry/focus intersection with either.
Exact values are preserved in [`capture-metrics.json`](./capture-metrics.json).

## Local timing diagnostic

Twenty fresh local Chromium document loads, five at each shelf viewport,
measured from the Sign out menu item's click event to the alert mutation and
the next animation-frame callback. The route aborted the sign-out request
immediately. Nearest-rank summaries were:

| Boundary | Min | Median | p95 | Max |
| --- | ---: | ---: | ---: | ---: |
| Failure alert DOM mutation | 6.7ms | 8.3ms | 8.9ms | 9.9ms |
| Next animation-frame callback | 13.4ms | 14.9ms | 15.5ms | 16.0ms |

The next-frame callback precedes paint. These numbers isolate local recovery
rendering after an immediate request failure; they are not real network
latency, physical event-to-paint latency, INP, assistive-technology speech
latency, low-end-device performance, or a child-perception threshold.

The JSON records Playwright 1.61.1, headless Chromium 149.0.7827.55,
Node v24.19.0, Darwin arm64, device-pixel ratio 1, cache/context conditions, and
capture-source commit `687f59d`. Its SHA-256 is
`34210697808c76b63aac4533becb7e5ae77a90f639f33eee34859dec63926692`.

## Retained files and SHA-256

| File | State | SHA-256 |
| --- | --- | --- |
| `implementation/failure-280x568.png` | Shelf failure, minimum width | `0d8d9f1d065bbb2cb76af841aac6fbded4cbc98268c3a71fd22a1a4586e6717c` |
| `implementation/failure-390x844.png` | Shelf failure, narrow portrait | `8e83151a5235121ea06cf14fc2fd26d54ed30271fe013232e95f46a3db9b4d29` |
| `implementation/failure-640x360.png` | Shelf failure, short landscape | `adc825d158e95deafe8a4af0488ea057b71bfa38405d3e295126a790172937a4` |
| `implementation/failure-1440x900.png` | Shelf failure, desktop labels | `b56df273f16e22a13484d1096d065e699fd993a5760e9306ddfdcb2e168ec78d` |
| `implementation/retry-focus-280x568.png` | Keyboard retry focus at minimum width | `7ef6d7770e07fbcdefb7faf9c797ab681d490995df46b69e357d2cee6d62d59c` |
| `implementation/failure-lesson-player-640x360.png` | Active listening lesson, failure | `b862b74e1daf7cca9992fdf456ba29fbab80e6f68102f9a04a14c61252c6806e` |
| `implementation/retry-focus-lesson-player-640x360.png` | Active lesson, keyboard retry focus | `41bf6fedf0bdca55eabe7b180df5ab73cb574201aea4a70a1174b8127502aebe` |
| `implementation/retry-forced-colors-reduced-motion-640x360.png` | Emulated forced colors and reduced motion | `3ece87856cbbbcd859d6fed03e5e448ec63772b6c96d9f2a373c42121f421d0a` |
| `implementation/text-spacing-retry-focus-280x568.png` | Exact text-spacing override, minimum-width focus | `dbb00f497e82ae4da3c70d4153f0ab4a4efe537ce51f1179fdd3a7d4ef19e3cb` |
| `implementation/text-spacing-retry-focus-lesson-player-640x360.png` | Exact text-spacing override, dense lesson focus | `b3f7d0614c33a7e114e530753405531750df4c6a42705f0a33be244626281418` |

All files report the dimensions encoded in their names. The lesson and
forced-color files report 640x360.

## Repeat-capture audit

Two consecutive complete serial capture runs followed those explicit readiness
barriers where configured. Eight of ten retained PNGs were byte-exact. The
390px shelf and forced-colors files varied only in unrelated lesson-art edge
rasterization: 270 pixels (0.082%, maximum channel delta 9) and 46 pixels
(0.020%, maximum channel delta 35), respectively. In all ten files, raw pixels
for the complete recovery-side header region (`x=50` through the right edge,
`y=0..99`) were identical. The retained hashes above are the second run. This
is a bounded renderer observation, not a claim that every full-page PNG is
byte-deterministic.

## Evidence boundary

These files establish local Chromium rendering, sampled geometry, stable
content anchors, programmatic focus, pointer/Enter/Space paths, the exact
English LTR text-spacing override at the reviewed sizes, one emulated
forced-color/reduced-motion state, identity ownership, and deterministic request
counting. They do not establish VoiceOver, NVDA, TalkBack, Safari, Firefox,
200% zoom, every script or translated retry fit, production latency,
speech/switch control, physical touch, low-end devices, or comprehension by a
five-year-old or limited-English caregiver.
