# Profile acknowledgment control evidence

Captured 2026-08-21 (Asia/Shanghai) from implementation commit `4dd2ad3` on
`codex/profile-acknowledgment-control`.

## Provenance

- Surface: Codex in-app Browser only.
- Local app:
  `http://127.0.0.1:4179/profile/setup?parrotE2eProfile=acknowledgment`.
- Environment: `PARROT_E2E_MOCK_API=1`, `VITE_PARROT_E2E=1`, fixed frontend
  build metadata, and the opt-in `acknowledgment` browser fixture.
- Flow: open form setup, choose **Set up profile**, enter `Mia`, choose the
  question **Next**, and wait more than 2,200 ms before the first reviewed
  capture.
- Fixture audio is deliberately `null`. On the base branch that exact branch
  automatically left after 1,800 ms; at `4dd2ad3` the acknowledgment remained.
- The URL and fixture are test-only. No production profile, account, or child
  data was used.

## Screenshots

| File | Viewport | Evidence moment |
| --- | ---: | --- |
| `acknowledgment-280x568.jpg` | 280×568 | Child-paced acknowledgment at initial scroll position |
| `acknowledgment-390x844.jpg` | 390×844 | Child-paced acknowledgment after more than 2,200 ms |
| `acknowledgment-640x360.jpg` | 640×360 | Honest initial short-landscape view; heading and action continue below the fold |
| `acknowledgment-scrolled-640x360.jpg` | 640×360 | Same state after the profile main scrolls 216 px to reveal the heading and action |
| `acknowledgment-1440x900.jpg` | 1440×900 | Child-paced acknowledgment on desktop |

All five files are JPEGs with dimensions matching their names.

## Measured state

The 390×844 state remained at the fixture URL after more than 2,200 ms. Its
focused element and heading both contained **Mia is a lovely name!**. The
heading occupied y 438.5–513.5, **Next** occupied y 533.5–585.5, and `<main>`
had zero horizontal and vertical overflow.

| Viewport | Image box | Heading box | **Next** box | Main overflow x / y |
| ---: | --- | --- | --- | ---: |
| 280×568 | y 97.5–257.5 | y 281.8–394.3 | y 414.3–466.3 | 0 / 0 px |
| 390×844 | reviewed visually; centered card | y 438.5–513.5 | y 533.5–585.5 | 0 / 0 px |
| 640×360 initial | y 85.8–309.8 | y 336–456 | y 476–528 | 0 / 260 px |
| 1440×900 | y 259.1–483.1 | y 506–566 | y 586–638 | 0 / 0 px |

At 280×568, 390×844, and 1440×900, the character, message, and single action
are ordered, contained, and free of page overflow. The visible outline belongs
to the deliberately focused acknowledgment heading; **Next** remains the next
sequential control.

At 640×360, the screenshot intentionally records a remaining issue rather than
cropping it away: the current tall `sm:` profile composition places most of the
focused heading and all of **Next** below the initial viewport. The profile main
can scroll and the second frame proves that the complete state is reachable,
but it is not initially discoverable. This is the source-proven next stacked
branch, `codex/profile-fallback-viewport-stability`, not a reason to restore
automatic advancement.

After the captures, activating **Next** navigated to `/`; the home heading
**Tap a picture.** received focus. No timer or media outcome was used to leave
the acknowledgment.

## Automated evidence

- 92/92 focused component and lifecycle tests passed.
- 2/2 focused profile-acknowledgment Chromium tests passed.
- 679/679 full unit, integration, lifecycle, and safety tests passed.
- 195/195 full Chromium tests passed.
- TypeScript and the production build passed.
- Lint passed with zero errors and two generated-file warnings.

## Limits

- The fixture uses no acknowledgment audio, so the screenshots do not review a
  real autoplay policy, voice duration, physical output, or audio failure UI.
  Unit tests inject ended, error, rejected-play, decode, object-URL, and audio
  setup outcomes.
- The in-app Browser and automated suite use local deterministic data, not a
  deployed service, real device, safe-area inset, slow decode, or production
  latency distribution.
- VoiceOver, TalkBack, NVDA, switch input, increased text spacing, 200% zoom,
  localization, and heading-focus/live-region announcement order remain
  untested.
- No child, caregiver, teacher, or accessibility practitioner participated.
  The captures prove rendered state and timing ownership, not comprehension or
  learning benefit.
