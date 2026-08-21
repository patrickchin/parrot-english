# Enabled Pink Action Contrast Evidence

Captured 2026-08-21 (Asia/Shanghai) for
`codex/contrast-safe-child-actions`.

## Provenance

- Every image is a genuine Codex in-app Browser JPEG whose pixel dimensions
  match its filename.
- Before-state source: `codex/profile-fallback-viewport-stability` at
  `e2cf42a`, served from `http://127.0.0.1:4183` by Vite with the repository's
  opt-in E2E session/API mocks.
- After-state source: the production tree committed at `c5fa0f6`, served from
  `http://127.0.0.1:4184` with the same mocks.
- Profile captures use the opt-in
  `parrotE2eProfile=viewport-stability` fixture. Shelves and the account menu
  use the standard local E2E learner, Mia. No production account, profile, or
  child data was used.
- The browser viewport was explicitly overridden for each capture and reset
  after review.
- Focus captures target the same accessible role/name and use a non-activating
  key press to render `:focus-visible`; the active element and pseudo-class
  match were checked before capture. They document appearance, not every
  possible adjacent-background ratio.

## Captures

| File | Viewport | Evidence moment |
| --- | ---: | --- |
| [before-profile-setup-280x568.jpg](./before-profile-setup-280x568.jpg) | 280×568 | Base **Set up profile** with white content on bright pink |
| [after-profile-setup-280x568.jpg](./after-profile-setup-280x568.jpg) | 280×568 | Same setup and geometry with deep-navy action content |
| [after-profile-setup-focus-visible-280x568.jpg](./after-profile-setup-focus-visible-280x568.jpg) | 280×568 | Selected setup action; the existing ring is clear on the light card |
| [before-profile-question-640x360.jpg](./before-profile-question-640x360.jpg) | 640×360 | Base short-wide microphone and **Next** with white content |
| [after-profile-question-640x360.jpg](./after-profile-question-640x360.jpg) | 640×360 | Same short-wide layout with deep-navy microphone and **Next** content |
| [before-story-shelf-390x844.jpg](./before-story-shelf-390x844.jpg) | 390×844 | Base story **Listen** cue with white content |
| [after-story-shelf-390x844.jpg](./after-story-shelf-390x844.jpg) | 390×844 | Same story card with deep-navy **Listen** content |
| [after-story-shelf-focus-visible-390x844.jpg](./after-story-shelf-focus-visible-390x844.jpg) | 390×844 | Selected story card; the existing ring is clear on the light/sky edge |
| [before-lesson-shelf-1440x900.jpg](./before-lesson-shelf-1440x900.jpg) | 1440×900 | Base visible **Play** words/icons across the desktop shelf |
| [after-lesson-shelf-1440x900.jpg](./after-lesson-shelf-1440x900.jpg) | 1440×900 | Same shelf with deep-navy **Play** words/icons |
| [before-account-menu-390x844.jpg](./before-account-menu-390x844.jpg) | 390×844 | Base white brand content in the grown-up account menu and icon-only lesson cues |
| [after-account-menu-390x844.jpg](./after-account-menu-390x844.jpg) | 390×844 | Same shared consumers with deep-navy content; layout and pink/rose hierarchy are retained |
| [after-account-menu-focus-visible-390x844.jpg](./after-account-menu-focus-visible-390x844.jpg) | 390×844 | Selected **Delete account** preserves the known low-contrast ink outline against the navy menu |

## Measured enabled treatment

The regression test evaluates browser-computed colors and applies each
supported element/ancestor `brightness()` filter in rendered order. The
screenshots are visual evidence; they are not used as the numeric contrast
calculator.

| Pair/state | Contrast |
| --- | ---: |
| Base white / `#ff467b`, rest | 3.274:1 |
| Base, `brightness(1.05)` | 3.213:1 in the browser baseline |
| Base, `brightness(0.95)` | 3.224:1 in the browser baseline |
| Selected `#061f3b` / `#ff467b`, rest/focus | 5.063:1 |
| Selected, `brightness(1.05)` | 5.066:1 |
| Selected, `brightness(0.95)` | 4.685:1 |

The source branch failed seven of eleven new routed cases as expected. The
implementation passes all eleven, including the parent-card hover filter on
**Listen** and **Play**.

## Review decision and limits

Retain the deep-navy enabled content. The matched images preserve the bright
pink primary cue, white frame, deep shadow, target geometry, and layout while
making small labels/icons easier to distinguish.

Do not infer from the two clear child-surface focus images that the shared
indicator works everywhere. The account-menu focus capture intentionally
retains the discovered failure: `#173c67` against `#204c7f` is only 1.278:1.
The selected label foreground does not fix that ring.

Likewise, these images do not establish disabled-label contrast, WCAG
conformance, child comprehension, learning benefit, localization safety,
forced-colors behavior, target assistive-technology quality, or physical-device
readability. The existing 60% inactive opacity remains a documented separate
design problem.
