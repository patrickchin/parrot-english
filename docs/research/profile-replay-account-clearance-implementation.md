# Profile Replay and Account clearance implementation

Status: implemented and provisionally retained

Branch: `codex/profile-replay-account-clearance`

Base: `codex/profile-setup-plain-language` documentation hand-off `22cbc9b`

Research commit: `9321fbf`

Rendered contract commit: `bb93711`

Implementation and review hardening: `e78f7fd`

Review date: 2026-08-24

## Outcome

The profile question's progress label and Replay action now form one compact
left-side group below `sm` and in `short-wide`. Their source and visible order
remain **Question _n_ of _n_** then Replay. Narrow progress text drops only its
decorative tracking; its words, font size, weight, color, case, accessible
order, and one-line presentation remain intact.

An eight-pixel gap protects both sides of Replay's shared focus treatment. At
280x568, the complete four-pixel outline plus four-pixel offset meets the end of
the progress box without covering it and ends 1.6875 CSS pixels before the
fixed Account border box. Replay and Account retain separate native buttons,
names, pointer ownership, focus, and minimum 44x44 targets.

The change adds no copy, state, timer, request, dependency, route, audio asset,
or playback behavior. It changes only local question-header composition and a
decorative narrow tracking value.

## Reproduced baseline

With truthful saved audio enabled in the viewport fixture, the predecessor
placed Replay at the question card's right edge under the fixed `z-40` account
header:

| Viewport | Account box | Replay box | Intersection |
| --- | --- | --- | --- |
| 280x568 | x=196.21875…270, y=10…54 | x=206…250, y=44.75…88.75 | 44x9.25 |
| 360x640 | x=260.828125…346, y=14…66 | x=270…318, y=46.5…94.5 | 48x19.5 |
| 640x360 | x=556.21875…630, y=10…54 | x=534…578, y=30…74 | 21.78125x24 |

At intersecting points, Account won hit testing. Raising Replay would only have
reversed which control was lost. Hiding or shrinking a control would have
removed useful access for a young learner or caregiver.

The evidence, standards boundary, options, and exact acceptance contract are
in the [guidance memo](./profile-replay-account-clearance-guidance.md).

## Implemented boundary

`LearnerProfileQuestionView` keeps its markup and uses responsive utilities on
the existing header:

- below `sm`: start alignment, eight-pixel item gap, and normal progress
  tracking;
- `short-wide`: existing grid placement plus start alignment and an eight-pixel
  gap; when both conditions apply, normal tracking remains; and
- tall `sm`-and-up/desktop: existing split placement and tracked label.

The 390x844 phone intentionally uses the compact group. Independent visual
review called the extra open row space a mild polish tradeoff, not a functional
regression. Retaining one simple `max-sm` rule avoids an ungrounded one-device
breakpoint and strengthens the visual relationship between progress and its
question-audio action.

The deterministic Browser fixture now constructs saved question audio from
each production questionnaire record's `audioId` and `promptEn`. It points to
the checked-in `/assets/audio/{audioId}.mp3` and contains no copied Mandarin.
This exposes the real enabled Replay state without claiming production
transport or physical audio evidence.

## Test-first and review evidence

The first rendered contract failed only at the four reproduced overlap sizes:
280x568, 320x640, 360x640, and 640x360. Thirteen neighboring state/viewport
cases passed before production changed. The compact candidate then passed all
17 viewport cases.

Independent visual and accessibility review found a keyboard-only flaw missed
by that contract: the first four-pixel item gap let Replay's eight-pixel focus
paint cover the final progress digit at 280 and 360. A new expanded-rectangle
assertion failed with **Progress text overlaps the Replay focus paint**. The
retained eight-pixel gap made that test pass while preserving 1.6875 pixels of
Account clearance at the tightest viewport.

Review also expanded behavior evidence beyond static hit testing:

- one centered pointer activation starts exactly one replay;
- Enter on focused Replay starts exactly one additional replay;
- Account opens independently and Escape closes it and restores Account focus;
- Replay's center/top/right inset points resolve to Replay;
- initial heading focus, `Tab` to the answer, and `Shift+Tab` to Replay remain;
- normal and forced-colors focus paint clears both progress and Account;
- every question action can be reached with one-axis scrolling at 320x640;
- all tested targets keep their 44px floor and horizontal overflow stays zero;
  and
- the 640x360 main scroll extent remains at its 13px predecessor baseline.

The profile textbox's current accessible name still includes the nested
microphone label. That is separately recorded backlog item 23 and was not
silently bundled into this visual-layout branch.

## Timing and visual evidence

This branch changes synchronous layout only. It adds no wait state or async
boundary, so it does not claim a latency improvement. Pointer and keyboard
activation retain the existing immediate native event path; deterministic
tests count playback starts rather than treating a screenshot as audio proof.

Ten uncropped genuine in-app Browser JPEGs preserve two obstructed baselines,
idle before/after comparison at 280x568 and 640x360, actual keyboard focus at
280x568, 360x640, and 640x360, and 390x844/1440x900 layout guards. The
[artifact manifest](../../artifacts/ux-review/profile-replay-account-clearance/manifest.md)
records provenance, state, geometry, dimensions, SHA-256, and evidence limits.

## Automated evidence

| Check | Result |
| --- | --- |
| Final Replay/focus responsive set | 45/45 passed |
| Full component/lifecycle/integration suite | 680/680 passed |
| Full Chromium suite | 292/292 passed |
| TypeScript | Passed |
| Production build | Passed |
| Lint | 0 errors; 2 generated-worker warnings |
| Diff hygiene | Passed |
| Research links | 619 local links across 92 Markdown files; 0 missing |
| Visual artifacts | 10/10 JPEG types, dimensions, and SHA-256 digests verified |

## Independent review decision

Three independent reviewers examined code scope, accessibility semantics,
responsive geometry, focus treatment, activation behavior, and original-size
Browser images.

The first candidate was revised, not retained blindly. Visual and accessibility
review both found the four-pixel focus/progress collision. Code review required
real activation counts, Account/Escape interaction, broader 320px reachability,
generic obstacle disjointness, and documentation of overlapping media rules.
All were incorporated into `e78f7fd` and the final evidence.

Retain this branch provisionally for the current bounded Account label. The
change fixes the reproduced target/focus obstruction without pretending to
solve arbitrary label widths or prove symbol comprehension.

## Limits and next questions

Deterministic local Chromium does not establish Safari/Firefox, safe-area,
zoom/text-spacing, localization/RTL, physical-device audio or rendering,
VoiceOver/TalkBack/NVDA, switch/voice-control behavior, or child/caregiver
understanding.

The current **Mia** contract is intentionally bounded. A longer account label
can extend farther left and requires shared-header arbitration rather than more
local question offsets. Separately, the 320x640 question has 113 CSS pixels of
vertical main scroll range: every action is one-axis reachable, but direct
child observation should determine whether the initially hidden lower action
needs a denser composition.

The next cheapest high-confidence improvement is the already reproduced shared
label defect: give the answer textarea and microphone independent accessible
names without moving either control. After that, investigate stable save-state
feedback and focus ownership because it directly addresses the user's timing
and feedback priorities.
