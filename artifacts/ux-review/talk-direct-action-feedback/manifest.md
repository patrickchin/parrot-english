# Talk direct-action feedback evidence

Captured 2026-08-21 (Asia/Shanghai) from commit
`feacfe1f2dedd55d5f50e5d5a1fe51443b030c49` on
`codex/talk-direct-action-feedback`.

All JPEGs in this directory are pre-implementation evidence. The implemented
state is commit `8e69386`; it is represented by rendered-behavior tests, not by
an after-state screenshot.

## Provenance

- Surface: Codex in-app Browser only.
- Local app: `http://127.0.0.1:4177/talk-to-peppa?parrotE2eConversation=audio-blocked`.
- Deterministic setup: `PARROT_E2E_MOCK_API=1`,
  `VITE_PARROT_E2E=1`, fixed frontend build metadata, and the repository's
  `audio-blocked` conversation transport.
- Viewports: 280×568, 390×844, 640×360, and 1440×900 at device pixel ratio 1.
- Motion preference reported by this Browser session:
  `prefers-reduced-motion: reduce = false`.
- Geometry was read from live rendered elements. Animation counts came from
  visible elements' computed animation names and play states because this
  in-app engine does not expose `document.getAnimations()`.

## Screenshots

| File | Viewport | Baseline moment |
| --- | ---: | --- |
| `before-starting-sound-280x568.jpg` | 280×568 | Sound-recovery request pending |
| `before-starting-sound-390x844.jpg` | 390×844 | Sound-recovery request pending |
| `before-starting-sound-640x360.jpg` | 640×360 | Sound-recovery request pending |
| `before-starting-sound-1440x900.jpg` | 1440×900 | Sound-recovery request pending |
| `before-opening-microphone-390x844.jpg` | 390×844 | Focused child action immediately before microphone activation |
| `after-microphone-390x844.jpg` | 390×844 | Listening endpoint immediately after microphone activation |

`after-microphone-390x844.jpg` is a **pre-implementation baseline endpoint**.
Here, “after” means after activating the existing control; it does not mean an
after-implementation comparison.

## Measured baseline

### Starting sound

- Four visible, case-insensitive copies of “Starting sound” appear at every
  viewport: status, caption eyebrow, caption sentence, and disabled action.
- Two visible spinners run at once: one in the status and one in the disabled
  action. They were the only two running animations in this state.
- Before and during pending, the action keeps the same box:

  | Viewport | Action box (x, y, width, height) |
  | ---: | --- |
  | 280×568 | 8, 512, 264, 48 |
  | 390×844 | 12, 776, 366, 56 |
  | 640×360 | 267.20, 304, 364.80, 48 |
  | 1440×900 | 432, 812, 576, 64 |

- The caption and complete control-group boxes also remain unchanged from the
  blocked state through pending and into the learner turn at all four sizes.
- When the learner turn becomes available, the main action narrows to make room
  for “Finish chat”; this is contained inside the stable control group.
- Focus is on “Tap for sound” immediately before activation, then moves to the
  document body while the button is disabled and remains on the body after the
  learner-turn action appears.
- No horizontal or vertical overflow was measured on the `<main>` element at
  any viewport.

### Opening microphone

- The pending “Opening microphone” frame was not observable through an in-app
  Browser action snapshot. The deterministic transport resolves
  `setMicrophoneEnabled` between post-click observations, so the UI jumps from
  “Tap, then talk” to “I’m done” / “Listening” in the captured evidence.
- The endpoint transition was checked at all four viewports. Caption and
  control-group boxes remain stable, and no `<main>` overflow appears.
- Focus is on “Tap, then talk” immediately before activation and is on the
  document body at the listening endpoint.
- The two 390×844 endpoint JPEGs preserve what was actually observable. No
  synthetic pending screenshot was created.

### Timing sample

One 390×844 pass measured 269 ms from initiating sound recovery until the
pending control was observable, 1,835 ms until the learner action was
observable, and 349 ms from microphone activation until “I’m done” was
observable. These are end-to-end in-app Browser measurements and include tool
round-trip and action-stability overhead; they are useful as audit upper bounds,
not production latency claims. The deterministic sound operation itself uses a
750 ms mock delay.

## Limits and follow-up

- This in-app Browser session reports normal motion and exposes viewport but no
  media-preference emulation. The reduced-motion alternate was therefore not
  visually exercised. The audit stayed on the requested Browser surface.
- The opening-microphone pending frame needs a deterministic delay hook or a
  real transport that remains pending long enough for a paint before it can be
  visually compared.
- These are implementation-review screenshots, not child usability evidence.
  The four repeated messages, duplicate spinners, and focus loss should be
  treated as design hypotheses to validate with keyboard/switch users and young
  learners.

## After-state validation

After commit `8e69386`, an in-app Browser comparison was attempted. The active
binding had disconnected, browser discovery returned no available browser, and
the retry reported the in-app Browser unavailable. In accordance with the
Browser workflow, no different screenshot tool or synthetic after image was
used. No file in this directory should be read as an after-implementation
capture.

The deterministic rendered-browser evidence passed on 2026-08-21:

- 10/10 focused Chromium direct-action cases;
- click-to-pending feedback below 100 ms for delayed sound and microphone
  operations;
- one visible pending label and one running animation at normal motion;
- zero running animations under reduced motion, including held Space;
- same-node focus retention and exactly-once pointer, Enter, Space,
  programmatic, and hook activation;
- explicit retry, next-action, and named-caption focus destinations; and
- stable containment with no main overflow at 280×568, 390×844, 640×360, and
  1440×900.

The complete run passed 676/676 unit, integration, lifecycle, and safety tests
and 193/193 Chromium browser tests. These results do not replace a visual
comparison, target-browser autoplay/permission check, assistive-technology
observation, or child/caregiver study.
