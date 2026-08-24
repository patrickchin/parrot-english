# Lesson shelf heading reading-position cue visual manifest

Date captured: 2026-08-24  
Branch: `codex/lesson-shelf-heading-reading-cue`  
Baseline commit: `86f5f72`  
Final candidate source commit: `297bd4e`

## Capture conditions

The headless evidence used Playwright Chromium at device-pixel ratio 1 against
the local Vite E2E server with its signed-in fixture. Fonts and visible images
were awaited, animations were disabled for capture, and reduced motion was
requested. Baseline and candidate direct-route captures focus the native
**Pick a lesson** level-one heading; the final 390x844 candidate enters through
a real pointer click on Home's **Play a lesson** link. Cleared images call
`HTMLElement.blur()` and wait a frame without otherwise changing the page.

The 640x360 forced-colors image uses Playwright's `forcedColors: "active"`
emulation. It is evidence for Chromium's rendered fallback, not every Windows
High Contrast palette or physical device.

The 1280x720 images are uncropped captures from the genuine in-app Browser.
That capture API returned JPEG bytes, so the files intentionally use `.jpg`.

The nine `prototypes/` images are runtime-style comparisons, not shipped
states. They hold the twelve-pixel clear gap constant and compare:

- `gap-12-full`: four-pixel full-height square-ended rail (rejected as
  caret/blockquote-like);
- `gap-12-pill-50`: six-pixel, centered 50%-height rounded pill (rejected as
  too bullet-like/slight at 280 pixels); and
- `gap-12-pill-60`: four-pixel, centered 60%-height rounded pill (selected and
  then implemented in `297bd4e`).

## Measured result

| Viewport | Baseline focused box | Final focused box | Final marker | Entry |
| --- | --- | --- | --- | --- |
| 280x568 | 256x36 | 215.78x36 | 4x21.59, 12px gap | direct |
| 390x844 | 366x36 | 215.78x36 | 4x21.59, 12px gap | pointer |
| 640x360 | 608x60 | 359.64x60 | 4x36, 12px gap | direct |
| 1440x900 | 1152x72 | 431.56x72 | 4x43.19, 12px gap | direct |

Independent original-resolution review measured marker-only focus/blur deltas,
title centering within 1.5 pixels, 15–18 visible pixels from marker to the
first glyph, median marker contrast from 4.68:1 to 6.09:1, unchanged card and
subtitle geometry, and complete Back/Account clearance. The forced-colors
candidate hides the decorative pill and surrounds only the text-sized heading
with a real system-mapped outline.

## Files and SHA-256

| File | Size / state | SHA-256 |
| --- | --- | --- |
| `base/in-app-1280x720-focused.jpg` | 1280x720, in-app, focused | `6c4e9302107fe0e5fc63df2077a4bcac2754a10b6c7ef6bebf2c3096458b92f6` |
| `base/lessons-1440x900-focused.jpg` | 1440x900, direct, focused | `08affc15554f5db65d2cb66c0f998377c29ca4abd7e3a3ef359c3276304bbea4` |
| `base/lessons-280x568-focused.jpg` | 280x568, direct, focused | `b24cbcb8438794cb77136d99038258f82a7b82a798924d9ef2c28d8968cd23ff` |
| `base/lessons-390x844-focused.jpg` | 390x844, direct, focused | `193213d5a7211dc7b265b1f0a555ca197b5b8037e227e37d18def02bfd0b986a` |
| `base/lessons-640x360-focused.jpg` | 640x360, direct, focused | `a30d67f09ed0cfc1fc5f7fa5f9f487fe243d974d2b515d15ad085537fc80fe7b` |
| `candidate/in-app-1280x720-focused.jpg` | 1280x720, in-app, focused | `92ff15b9790bed286fa273ec8a9ee3a7ced193244c8aa02c8917dc0b81ec3865` |
| `candidate/lessons-1440x900-blurred.jpg` | 1440x900, direct, cleared | `9b04fde6ba5d53a0b4a378b6cdff8b1f20192ce87929d341004888733e16fb03` |
| `candidate/lessons-1440x900-focused.jpg` | 1440x900, direct, focused | `d72ba06ac59ff3186915e120df82f40959a5cb8bdfa71496121f708a7bd032a8` |
| `candidate/lessons-280x568-blurred.jpg` | 280x568, direct, cleared | `10fa8f5cd0e5ec64fa00cd0e639c9482e3c3373e78e5abb8b92e8e27108d9b8a` |
| `candidate/lessons-280x568-focused.jpg` | 280x568, direct, focused | `f46ea51019550febbed8b7f932e892651c6660e387c79815030d9fc17a8b23d8` |
| `candidate/lessons-390x844-blurred.jpg` | 390x844, pointer, cleared | `d63050da7eeaa8d3f53641c977104950a7b09f870d32e331b329300741f50fa9` |
| `candidate/lessons-390x844-focused.jpg` | 390x844, pointer, focused | `5ddb4c66a4f1d15ebf34e3357d6591be384dc5884f5c8f73b96052ec0f6a59e2` |
| `candidate/lessons-640x360-blurred.jpg` | 640x360, direct, cleared | `769d5eff21b9ddb495cc5f3ee11f5c58f7062d788fe7fc555f05b4581a152173` |
| `candidate/lessons-640x360-focused.jpg` | 640x360, direct, focused | `837020da6a96dc60c57bd08682d3b39275cedcaa4993b1d27f9a9c23085e4806` |
| `candidate/lessons-640x360-forced-colors-focused.png` | 640x360, direct, forced colors | `4e1e2c9e504b64f622efa8fffd72eae6cf8e603cc97e90d6151ac8a0557077f7` |
| `prototypes/gap-12-full-1440x900.jpg` | 1440x900, rejected full | `40dd70be9af4c2606c4f0462daf0e0e767b6da8c4ee0150958ab6c36180daa36` |
| `prototypes/gap-12-full-280x568.jpg` | 280x568, rejected full | `5ce8c34fb08573bc9a1451774c07ef0a46ffdd84dd2fde3626fd5bca6aba4ad4` |
| `prototypes/gap-12-full-640x360.jpg` | 640x360, rejected full | `8541ee8ed11a0b50b7ca6a8971c0757d6295c4098816af678226b7e9ce0a8b64` |
| `prototypes/gap-12-pill-50-1440x900.jpg` | 1440x900, rejected short/wide | `2440f216985711f3684b84427a6bf8bfd09abc248fd17cb6deeef9446f864f9f` |
| `prototypes/gap-12-pill-50-280x568.jpg` | 280x568, rejected short/wide | `3df41fcce46a12081cf429d751dee9a9a215cb06887a866c7b4472370e29a31d` |
| `prototypes/gap-12-pill-50-640x360.jpg` | 640x360, rejected short/wide | `7388dc04990d45cb5b63090892762b72a9f7af2eb17e86467c82d29b4a519ab9` |
| `prototypes/gap-12-pill-60-1440x900.jpg` | 1440x900, selected prototype | `d72ba06ac59ff3186915e120df82f40959a5cb8bdfa71496121f708a7bd032a8` |
| `prototypes/gap-12-pill-60-280x568.jpg` | 280x568, selected prototype | `e244f78956b12e494f18dd024d4c8f735985f7f065d8f44d275d976ae8b96861` |
| `prototypes/gap-12-pill-60-640x360.jpg` | 640x360, selected prototype | `32ec8eb7f7cc27f09ace02aa43f0539c7fb746e135255e0f679cbcf5fcd94bff` |

The prototype and final 1440x900 focused hashes are identical because the
runtime-selected prototype was implemented without further visual changes at
that viewport. The 280 and 640 final files were recaptured after implementation
and differ only in capture settlement/compression, not intended geometry.

