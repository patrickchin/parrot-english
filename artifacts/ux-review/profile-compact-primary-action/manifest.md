# Profile compact primary-action visual evidence

Captured: 2026-08-24

Base: `7e6d75a` from
`/Users/patchin/.codex/worktrees/cba5/parrot-english-profile-operation-pending-focus`

Candidate: `5b2fa73` from
`/Users/patchin/.codex/worktrees/cba5/parrot-english-profile-compact-primary-action`

Fixture: `/profile/setup?parrotE2eProfile=viewport-stability`, after activating
**Start questions**, with production bilingual question copy, mocked same-origin
APIs, loaded fonts, and reduced motion.

## Capture methods and limits

- Exact narrow screenshots are one-device-pixel JPEGs from Playwright Chromium
  against separate running base and candidate worktrees. They are deterministic
  rendered evidence, not genuine hardware or a production account.
- `candidate/in-app-1280x720-idle.jpg` is a genuine screenshot from the Codex
  in-app Browser against the candidate worktree. The in-app surface did not
  expose exact viewport emulation, so it is a wide-layout preservation check,
  not the narrow acceptance gate.
- Screenshots do not establish physical target size, screen-reader output,
  browser permission behavior, or child comprehension.

## Files

| File | Purpose | SHA-256 |
| --- | --- | --- |
| `base/320x640-idle.jpg` | Reproduced baseline: Next is wholly below the initial viewport | `369608bb6e84ddccc3946794415eade0ad1772bea995da4cae5c5b6d35c2d90c` |
| `candidate/280x568-idle.jpg` | Existing `short` composition guard | `877f35b136d36524e1fce38a1a07cd5ec603ba197f6f7e8fd087e234ac806767` |
| `candidate/320x640-idle.jpg` | Required question with complete initial Next | `143d61113ad628f7fa8f7899780d7a4da02872686f065f7943a3b2e90f19c6c4` |
| `candidate/320x640-next-focused.jpg` | Required question with complete keyboard focus paint | `a8aa8e296dab476019b9e25826e2798ebc839646ca1099da03cb29af073f0f57` |
| `candidate/320x640-optional-idle.jpg` | Harder two-skip footer, all actions visible at origin | `b493f3c91e60005384c1bf29c0cf2cbe4d6c888f1176e839711ab39aa8d5d277` |
| `candidate/320x640-thinking.jpg` | Optional pending layout without authored keyboard focus paint | `267b4fdb221a72b77f38a560587f1f6800745d6335a15ee0f37dc16a776f0230` |
| `candidate/320x640-thinking-focused.jpg` | Optional pending owner with complete keyboard focus paint | `8056d6f4c4b1987f88f64183127f5f700d09d75fd6d64df042b10348039830c9` |
| `candidate/340x640-idle.jpg` | Intermediate compact-width visual guard | `3c34dd06c079e319a641e6b2480ef4df8da500305e45ed5d9e65073815aab488` |
| `candidate/359x640-idle.jpg` | Last compact pixel after the boundary correction | `aa5bf0c012cb84c5f5cae33101236eeed30f838caba12b747e5592c32f4d8de1` |
| `candidate/360x640-idle.jpg` | First excluded width; prior roomy composition remains complete | `06a19e14ed6e5ab8e7f6bfd39652afdf365e57e609cbfc8d10e8d9016c15345d` |
| `candidate/390x844-idle.jpg` | Regular-phone preservation guard | `143216222605804df15750bf059c7cb18489a1bc36b5aafe7a840ddff75af390` |
| `candidate/in-app-1280x720-idle.jpg` | Genuine in-app Browser wider-layout preservation check | `f582fe99423e6bafc0a0c7e7fd5b5d7a8d8c5b722fb41de829fb913780be1a8c` |

## Rendered verdict

The candidate keeps Next and its complete focus paint in view at 320x640,
including the optional two-skip pending state. It preserves the full answer
area and control sizes, introduces no nested or sticky scroll owner, and keeps
the 280, 360, 390, and wide compositions usable. The selected layout is
retained provisionally pending physical-device, enlarged-text, assistive-
technology, and direct child/caregiver testing.
