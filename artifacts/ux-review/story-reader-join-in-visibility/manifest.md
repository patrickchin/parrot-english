# Story Reader join-in visibility evidence

Captured 2026-08-23 (Asia/Shanghai) for
`codex/story-reader-join-in-visibility`.

## Provenance

- All three images are genuine Codex in-app Browser JPEGs at the filenames'
  exact 640×360 viewport.
- Baseline source: `codex/static-profile-acknowledgment-audio` documentation
  hand-off `6ca36e7`, served locally from the isolated implementation worktree.
- Candidate source: `codex/story-reader-join-in-visibility` implementation
  commit `5464b9d`, served from the same isolated worktree.
- The route used the repository's opt-in deterministic E2E account/session
  fixture. No production account, child, microphone, transcript, or story data
  was used.
- Baseline capture used page-arrival focus and scroll origin. Candidate captures
  were taken after the local browser's English device narration reached
  **Your turn**; the focused action was **Listen again**.
- JPEGs are qualitative review evidence. Quantitative visibility uses live DOM
  bounding rectangles rather than compressed pixels.

## Baseline capture

| File | Viewport | Evidence moment | SHA-256 |
| --- | ---: | --- | --- |
| [before-kite-page-4-640x360.jpg](./before-kite-page-4-640x360.jpg) | 640×360 | Kite, Come Back! page 4 at arrival; only the top yellow edge is exposed and neither prompt label nor phrase is visible | `837827ab161063ad5cdf466d5d6e549c0d0a7a62d17ed2bc23dff21ef9ad3f87` |

At baseline, the inner pane was 161 px high (`top = 80`, `bottom = 241`) with
`scrollTop = 0`. The Kite prompt was about 67.5 px high and only about 4 px
intersected the pane.

## Candidate captures

| File | Viewport | Evidence moment | SHA-256 |
| --- | ---: | --- | --- |
| [after-your-turn-kite-page-4-640x360.jpg](./after-your-turn-kite-page-4-640x360.jpg) | 640×360 | Kite, Come Back! page 4 after device narration; the complete 67.5 px **Your turn / Stop and ask!** card is exposed at `scrollTop = 63.5` | `1f5d72e4274ba9184f40084feb9401c1c1621190e425ee8e54974a9f9206e467` |
| [after-your-turn-picnic-page-1-640x360.jpg](./after-your-turn-picnic-page-1-640x360.jpg) | 640×360 | The Picnic Blanket Search page 1 after device narration; the baseline-hidden 95 px **Your turn / Look, look—where can it be?** card is fully exposed at `scrollTop = 121` | `84713a65006c4f157c10338776c09949e6b4d328eb0e5c1da169dbee43266845` |

In both candidate captures the art and bottom controls remain in their original
fixed panes, the outer Story Reader and document remain at scroll origin, and
the child-directed yellow card is complete. The title and upper sentence can
leave the small inner pane at this later participation phase; page arrival and
the first narration phase keep the complete current sentence at origin.

The live Browser completed device speech too quickly to retain an exact
**Listen and say it** screenshot. Deterministic browser coverage therefore owns
the stronger timing assertion: the second utterance is captured only after the
complete prompt is inside its behavioral overflow owner. Screenshots do not
prove that boundary by themselves.

## Limits

These images demonstrate local Chromium presentation only. They do not prove
audible words, device volume, narration timing, keyboard or assistive-technology
behavior, child comprehension, physical-device behavior, or another browser.
Each retained filename matches its checked JPEG payload.
