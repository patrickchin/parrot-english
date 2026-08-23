# Profile setup plain-language visual evidence

Captured: 2026-08-24

Routes:

- `/profile/setup?parrotE2eProfile=viewport-stability`
- `/profile/setup?parrotE2eProfile=viewport-resume`

## Provenance

All ten files are full-viewport, uncropped JPEG captures from the genuine
in-app Chromium Browser. The viewport was explicitly set before each final
capture, and the rendered `innerWidth` and `innerHeight` matched the filename.
The files were checked independently with `file` and SHA-256.

The three **before** images show the predecessor at `eaaff12`. The seven
**after** images show `codex/profile-setup-plain-language` through final visual
polish `0c8df94`, served locally on port 4197 with the repository's
deterministic browser mock. The candidate fixture reads its question text from
the checked-in production questionnaire. It stubs audio timing and transport;
these images are visual evidence, not production-network evidence.

The setup comparison keeps the route, learner, art, viewport, Browser profile,
and capture procedure fixed. The resumed and bilingual-question images are
candidate-only state coverage added after independent review.

## Before and after

| Viewport | Baseline setup | Retained fresh setup |
| --- | --- | --- |
| 280x568 | [before](./before-setup-280x568.jpg) | [after](./after-setup-280x568.jpg) |
| 640x360 | [before](./before-setup-640x360.jpg) | [after](./after-setup-640x360.jpg) |
| 1440x900 | [before](./before-setup-1440x900.jpg) | [after](./after-setup-1440x900.jpg) |

The 280-pixel baseline uses a three-line heading and five-line explanation; its
card occupies approximately y=52…515. The retained fresh state uses a two-line
heading and three-line explanation; its card occupies y=93…475 and is 382 CSS
pixels high, approximately 82 pixels shorter. The heading, explanation, and
both actions remain complete without document overflow or owned-main scrolling.

At 640x360, the retained card is y=70…290 and 220 pixels high. Its heading uses
two lines, its explanation uses two lines, and **Start questions** and **Skip
for now** remain side by side. At 1440x900, the retained card is y=170…730 and
560 pixels high; the heading uses one line and the explanation two.

## Resume state

| Viewport | Evidence |
| --- | --- |
| 280x568 | [Answer 5 more questions](./after-resume-280x568.jpg) |
| 640x360 | [Answer 5 more questions](./after-resume-640x360.jpg) |

At 280x568, the resumed heading wraps to three lines and the wider **Continue
questions** action remains complete. The card is y=78…490 and 412 pixels high;
the primary action is approximately 206x52 pixels. At 640x360, the same state
fits in the 220-pixel-high card with the two actions side by side. Both images
show the heading's initial reading-position focus cue, zero horizontal
overflow, and a main scroll origin of zero.

## Bilingual first question

| Viewport | Evidence |
| --- | --- |
| 280x568 | [production-copy prompt](./after-question-bilingual-280x568.jpg) |
| 640x360 | [production-copy prompt](./after-question-bilingual-640x360.jpg) |

The exact production English and Mandarin prompt copy, answer field,
microphone, Skip, and Next remain contained at both sizes. The images also
preserve a high-priority defect rather than hiding it: **Account for Mia**
paints over **Replay question** by 44x9.25 CSS pixels at 280x568 and by
21.78125x24 CSS pixels at 640x360. This overlap predates the copy change and is
the next stacked responsive-layout branch. These images must not be cited as
evidence that the full question header is clear of obstruction.

## Integrity

| File | Pixels | SHA-256 |
| --- | ---: | --- |
| `after-question-bilingual-280x568.jpg` | 280x568 | `1afad906694df663469a655eaa3e71a1fc23385f29312c37ae22b7c5be3e783a` |
| `after-question-bilingual-640x360.jpg` | 640x360 | `0e7fb26618b1be466a62eb630dd283a3aaf6bf1e33562708446550beacb9f215` |
| `after-resume-280x568.jpg` | 280x568 | `0d9caa57e38b68f36a0b1b1bb69a4a04ea4fd0cec36fb0ba55db769590dbcffb` |
| `after-resume-640x360.jpg` | 640x360 | `23200c3d848b0adec004cb5cb628f10e52f2b328e37cff73ae4ea9e232924303` |
| `after-setup-1440x900.jpg` | 1440x900 | `eb7b43dc25defdab668dafc022641add6be77ac4ccce3cf8a9a9b9adbb4ba465` |
| `after-setup-280x568.jpg` | 280x568 | `f67f9a6c0c13643046d19ff33d814eba7e8f15efbc67e6c87a9973502e9430ae` |
| `after-setup-640x360.jpg` | 640x360 | `1fb76e9c18542408acfb19109043b3f2edf48d95d1ab288abc51c15023eb25e8` |
| `before-setup-1440x900.jpg` | 1440x900 | `1319cb2af8e70d7488cef9b84c2769d8c9e96e1b7f53db28826adb8f31a66393` |
| `before-setup-280x568.jpg` | 280x568 | `1a5b3f2754c9a8c68daa828f7e217ed11db6b06921a53b8e058b8fc942c7696e` |
| `before-setup-640x360.jpg` | 640x360 | `2e4d5f3a0e52bf1d491a4ad5e6c697202015a1928a4808c55bdc351e3036f2a0` |

## Evidence boundary

These captures establish local Chromium pixels and English left-to-right
composition. They do not establish comprehension by a 5–7-year-old beginner,
independent reading, the meaning of **save** or **grown-up**, caregiver
understanding, actual audio output, target assistive-technology announcements,
safe-area insets, zoom/text-spacing resilience, localization, right-to-left
layout, physical-device rendering, Safari, or Firefox.

The shortened card is a measured layout result, not evidence that less copy is
automatically better or that a child understands the remaining copy. The next
useful evidence is a moderated child/caregiver task in the learner's preferred
language, followed by target-device and assistive-technology checks.
