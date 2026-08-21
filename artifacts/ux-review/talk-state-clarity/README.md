# Talk State Clarity Visual Evidence

Last reviewed: 2026-08-21

Branch: `codex/talk-state-clarity`

Baseline: `b0f6147`

Implementation: `17c1711`

Geometry evidence follow-up: `b5c00b4`

## Capture provenance

These are baseline JPEG screenshots captured in the in-app browser against the
deterministic local conversation transport before the presentation change.
They are evidence of the observed problem, not after-state evidence and not a
real LiveKit, autoplay-policy, screen-reader, or child session.

| File | State | Viewport | SHA-256 |
| --- | --- | --- | --- |
| [before-ready-280x568.jpg](./before-ready-280x568.jpg) | Ready | 280×568 | `c2baf09f413b2922ef5e4c92ebd1cc3b11582df5a3162e58e74b7b78671bfdf9` |
| [before-starting-sound-390x844.jpg](./before-starting-sound-390x844.jpg) | Starting sound | 390×844 | `3553574fb78f21d26ad912b493e156c1ac050e86be598f1e9a95b112dba973f6` |
| [before-terminal-lesson-280x568.jpg](./before-terminal-lesson-280x568.jpg) | Repeated-failure lesson route | 280×568 | `12add4853e5b6f38a6c90b8c6ece384fb7c5430758b702bfb813f1e0d9096c1f` |
| [before-thinking-mid-280x568.jpg](./before-thinking-mid-280x568.jpg) | Ordinary Thinking wait | 280×568 | `7d78f22f5d1b637b524a37eb8b48c0cc19432576b3a646bcb634ca7110f588e2` |
| [before-thinking-mid-640x360.jpg](./before-thinking-mid-640x360.jpg) | Ordinary Thinking wait | 640×360 | `a41368ee683f8b3c5235a4f3967dc1f3641a08c787171db1cfa72453df6b7735` |
| [before-thinking-mid-1440x900.jpg](./before-thinking-mid-1440x900.jpg) | Ordinary Thinking wait | 1440×900 | `9b95e251710ca97010b30d50ac09158cf6b416f558abcd4a0b881c6f132f7094` |

Each file was verified as JFIF JPEG with the dimensions encoded in its name.
The ordinary Thinking baseline visibly contains the phase spinner, floating
Peppa, a repeated wait caption, and a second spinner inside an unavailable
wait-shaped control. The Starting sound baseline contains the next deferred
direct-action problem: four visible copies of the state and three simultaneous
animations.

## After-state evidence gap

No after-state screenshot is stored. After implementation, the existing
in-app browser session lost its local-page binding during a server restart and
then rejected the local navigation under its URL security policy. No alternate
capture surface was substituted, so the visual acceptance requirement remains
open rather than being represented by misleading evidence.

Current rendered behavior is instead covered programmatically at 280×568,
390×844, 640×360, and 1440×900: one running animation in each ordinary remote
wait; none in its Peppa image or control slot; zero with reduced motion; stable
caption and control-slot boxes across wait, Peppa speech, learner turn, and
terminal recovery; no outer-page overflow; and no disabled wait/listen control.
Those checks do not replace visual inspection, real assistive technology, or a
representative child/caregiver session.
