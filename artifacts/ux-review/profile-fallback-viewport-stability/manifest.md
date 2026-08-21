# Profile Fallback Viewport-Stability Evidence

Captured 2026-08-21 (Asia/Shanghai) for
`codex/profile-fallback-viewport-stability`.

## Provenance

- Every image is a genuine Codex in-app Browser JPEG whose pixel dimensions
  match its filename.
- Before-state source: `codex/profile-acknowledgment-control` at `7a89a39`,
  served from `http://127.0.0.1:4179` with `VITE_PARROT_E2E=1` and the opt-in
  `parrotE2eProfile=acknowledgment` fixture.
- After-state source: the production and test tree committed at `1152866`,
  served from `http://127.0.0.1:4180` with `VITE_PARROT_E2E=1` and the opt-in
  `viewport-stability` or `long-acknowledgment` fixture.
- The browser viewport was explicitly overridden only for each capture and was
  reset after review. No production account, profile, or child data was used.
- Focus outlines are intentional evidence: each new same-route step moves
  focus to its `h1`, while the visible action remains the next ordinary tab
  stop.

## Captures

| File | Viewport | Evidence moment |
| --- | ---: | --- |
| [before-setup-280x568.jpg](./before-setup-280x568.jpg) | 280×568 | Loaded base setup; **Skip for now** is below the captured viewport |
| [before-question-280x568.jpg](./before-question-280x568.jpg) | 280×568 | Base English-only first question before compact portrait treatment |
| [before-setup-640x360.jpg](./before-setup-640x360.jpg) | 640×360 | Loaded base setup; only art and the top of the heading are visible |
| [before-setup-to-question-640x360.jpg](./before-setup-to-question-640x360.jpg) | 640×360 | Base question immediately after Playwright scrolls to and activates the hidden setup action; the new heading remains above the viewport |
| [after-setup-280x568.jpg](./after-setup-280x568.jpg) | 280×568 | Compact portrait setup with both choices visible at origin |
| [after-question-280x568.jpg](./after-question-280x568.jpg) | 280×568 | Stacked portrait question with complete answer and action row visible |
| [after-setup-640x360.jpg](./after-setup-640x360.jpg) | 640×360 | Short-wide setup using the available horizontal space |
| [after-question-640x360.jpg](./after-question-640x360.jpg) | 640×360 | Short-wide first question after a zero-scroll, focused transition |
| [after-acknowledgment-640x360.jpg](./after-acknowledgment-640x360.jpg) | 640×360 | Child-paced acknowledgment with a balanced 52 px **Next** action |
| [after-next-question-640x360.jpg](./after-next-question-640x360.jpg) | 640×360 | Second question restored to the visible/focused origin after **Next** |
| [after-long-acknowledgment-280x568.jpg](./after-long-acknowledgment-280x568.jpg) | 280×568 | Exact 160-character boundary case, untruncated with **Next** visible |
| [after-long-acknowledgment-1440x900.jpg](./after-long-acknowledgment-1440x900.jpg) | 1440×900 | Same boundary case with length-aware desktop type |

## Measured states

The base 640×360 setup-to-question capture retained `scrollTop = 216`; the new
question heading occupied y −45.5 to −0.5 and was entirely above the viewport.
The after-state transition begins at `scrollTop = 0` and focuses the heading.

| After state | Heading | Primary content/action | Main client / scroll / top |
| --- | --- | --- | ---: |
| Setup, 280×568 | reviewed wholly in frame | **Set up profile** y 396–448; **Skip for now** y 452–496 | 568 / 568 / 0 px |
| Setup, 640×360 | y 77–137 | **Set up profile** y 231–283; **Skip for now** y 235–279 | 360 / 360 / 0 px |
| Question, 640×360 | y 103.25–140.75 | textarea y 168.75–248.75; Skip/Next y 256.75–300.75 | 360 / 360 / 0 px |
| Acknowledgment, 640×360 | y 117.5–147.5 | **Next** y 190.5–242.5 | 360 / 360 / 0 px |
| 160-character acknowledgment, 280×568 | y 148–448 | **Next** y 456–508 | 568 / 568 / 0 px |
| 160-character acknowledgment, 1440×900 | y 401–671 | **Next** y 691–743 | 900 / 900 / 0 px |

At 640×360 the account control occupied x 556.22–630 and y 10–54. The setup
heading ended at x 535 and began at y 77, leaving the shared header clear. All
reviewed after states had zero main horizontal overflow.

## Automated evidence

- Four flow tests cover setup, question, acknowledgment, and next-question
  geometry at 280×568, 390×844, 640×360, and 1440×900.
- Four image tests exercise delayed decode for setup, question,
  acknowledgment, and editor art at each viewport: 16 surface/viewport checks
  require at most 1 CSS px of movement.
- Four maximum-length tests preserve the exact 160-character acknowledgment,
  focus, scroll origin, header clearance, explicit pacing, and visible
  **Next** action.
- The complete Chromium suite passed 207/207.

## Visual decision and limits

Retain the short-wide setup/question/acknowledgment compositions and the
stacked 280 px question. They preserve one calm reading sequence without
hiding controls or shrinking targets below 44×44 CSS px.

The 160-character phone image is deliberately retained even though it is not a
good content target. It proves the valid technical boundary no longer removes
the action, and it makes the separate beginner-language problem visible: ten
lines of acknowledgment are too dense to call child-friendly without direct
comprehension evidence.

These screenshots do not establish WCAG conformance, child comprehension,
learning benefit, localization safety, assistive-technology announcement
quality, real-device safe-area behavior, or production latency. The delayed
image result is a local geometry contract, not a field CLS measurement.
