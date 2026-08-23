# Profile Replay and Account clearance visual evidence

Captured: 2026-08-24

Route:

- `/profile/setup?parrotE2eProfile=viewport-stability`

## Provenance

All ten files are full-viewport, uncropped JPEGs from the genuine in-app
Chromium Browser. The two **before** files are byte-for-byte copies of the
predecessor branch's captures at the same route, learner, scenario name,
Browser profile, and viewport. Their original provenance remains in the
[profile setup plain-language manifest](../profile-setup-plain-language/manifest.md).
That predecessor fixture used `audio: null`, so Replay is disabled in the
copied images. The enabled-predecessor obstruction is established by the red
Browser tests and measured boxes, not by treating the two fixture states as
identical.

The eight **after** files show `codex/profile-replay-account-clearance` at
implementation commit `e78f7fd`, served locally on port 4210 with the
repository's deterministic Browser fixture. The fixture derives saved question
audio from the checked-in production questionnaire, while audio timing and
transport remain stubbed. Viewports were explicitly set before capture.

Focused captures use the real keyboard route: the question heading receives
initial programmatic focus, then `Shift+Tab` moves focus to **Replay question**.
They are not composited or simulated focus treatments.

## Before and after

| Viewport | Obstructed baseline | Retained idle state | Retained focused Replay |
| --- | --- | --- | --- |
| 280x568 | [before](./before-idle-280x568.jpg) | [after](./after-idle-280x568.jpg) | [focus](./after-focus-280x568.jpg) |
| 640x360 | [before](./before-idle-640x360.jpg) | [after](./after-idle-640x360.jpg) | [focus](./after-focus-640x360.jpg) |

At 280x568, the baseline Account layer covers the top-right portion of Replay.
The retained utility row keeps **Question 1 of 6** then Replay together at the
card start. The progress box ends at x=134.53125, Replay occupies
x=142.53125…186.53125, and the focused action's eight-pixel paint expansion
occupies x=134.53125…194.53125. Account begins at x=196.21875, leaving
1.6875 CSS pixels between the authored focus paint and Account. The paint meets
but does not cover the progress box.

At 640x360, the baseline intersection is removed without adding to the existing
13-pixel main scroll extent. Progress occupies x=158…280.5390625 and Replay
x=288.5390625…332.5390625. The 8-pixel gap prevents focus paint from covering
the progress label, while Account begins at x=556.21875.

## Responsive guards

| Viewport | State | Evidence |
| --- | --- | --- |
| 360x640 | Idle | [compact phone](./after-idle-360x640.jpg) |
| 360x640 | Keyboard-focused Replay | [compact focus](./after-focus-360x640.jpg) |
| 390x844 | Idle | [regular phone](./after-idle-390x844.jpg) |
| 1440x900 | Idle | [desktop](./after-idle-1440x900.jpg) |

At 360x640, progress and Replay remain grouped with the same eight-pixel gap;
the complete focus paint clears both progress and Account. At 390x844, the
compact composition remains intentionally grouped even though the taller screen
does not need collision avoidance. This makes the audio action read as part of
the progress/question context, at the cost of more unused room on that row.

At 1440x900, the `sm`-and-up split composition is unchanged: progress stays at
the left and Replay at the right of the card header. The prompt, translation,
art, answer field, microphone, Skip, and Next keep their predecessor geometry
across all reviewed states.

## Integrity

| File | Pixels | SHA-256 |
| --- | ---: | --- |
| `after-focus-280x568.jpg` | 280x568 | `5d4310e69b983e2791dd62c9973ac813dc6e9eae2c8b21d481f28cb6d6bc4943` |
| `after-focus-360x640.jpg` | 360x640 | `b0854ea511f77076540ba22ef8bacac92e60871e1b9de7e11778fac95456fa93` |
| `after-focus-640x360.jpg` | 640x360 | `c209a4fa91033efe02fda8af741e4ae00652341d0913c3d77fadd83f5dccb819` |
| `after-idle-1440x900.jpg` | 1440x900 | `9c9a84f9f2850c8bb7018fcf9c69b729dec38db099483082c94f9ab88e00a28f` |
| `after-idle-280x568.jpg` | 280x568 | `2889cc2b99339d4b167339288cbec4ac9fecc5f090d59221c400f2e80cdb2ba3` |
| `after-idle-360x640.jpg` | 360x640 | `676d2658f91d4a963992cfed7a6ae9c706858754c374e95ccc9ac47c19b5a885` |
| `after-idle-390x844.jpg` | 390x844 | `fb2f6b739d96b6cf8e3469c6dffed6e9a8b31736dce873c4905b62cbb8036611` |
| `after-idle-640x360.jpg` | 640x360 | `8d7f46471d1d8eec3a965f60c034831026682888dff0d64bc797a7a408ebf3c1` |
| `before-idle-280x568.jpg` | 280x568 | `1afad906694df663469a655eaa3e71a1fc23385f29312c37ae22b7c5be3e783a` |
| `before-idle-640x360.jpg` | 640x360 | `0e7fb26618b1be466a62eb630dd283a3aaf6bf1e33562708446550beacb9f215` |

`file` verified all ten JPEG types and exact dimensions. SHA-256 was computed
from the checked-in bytes after capture/copy.

## Evidence boundary

These images establish local Chromium pixels for the current short **Mia**
account label and English left-to-right composition. They do not establish
arbitrary account-label clearance, safe-area insets, zoom/text-spacing
resilience, localization or right-to-left layout, physical-device rendering,
Safari/Firefox, real audio, target assistive-technology behavior, or child
understanding of the speaker symbol.

The screenshots support a rendered-layout decision. They are not a WCAG
conformance audit or evidence that a 5–7-year-old beginner can identify Replay
without demonstration.
