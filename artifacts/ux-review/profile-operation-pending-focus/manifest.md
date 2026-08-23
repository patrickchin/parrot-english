# Profile operation feedback and focus visual evidence

Captured: 2026-08-24

Branch: `codex/profile-operation-pending-focus`

Stacked product base: `codex/profile-answer-separate-labels` at `8eb3149`

Candidate implementation: `1625fff`

## Provenance and method

These are uncropped, full-viewport JPEG screenshots captured with the Codex
in-app Browser's Chromium runtime. The base and candidate ran simultaneously
from separate Git worktrees. The base product code was `8eb3149`; its evidence
worktree added fixture-only commits `5f91364`, `821d4cb`, and `1772603` so the
unchanged base UI could be held at deterministic phases. It was served at
`127.0.0.1:4219`. The candidate was served at `127.0.0.1:4214` with the same
fixture data.

The shared route used `parrotE2eProfile=viewport-stability`, held profile
operations, delayed microphone permission, and a query-selected visual phase.
The fixture uses the production six-question English/Chinese copy and saved
question audio metadata. Opening, recording, transcription, save, and skip
work were held rather than delayed by an arbitrary timer.

Candidate captures came from the working tree that became `1625fff`. Two final
review fixes after capture affect only Replay's owned ARIA state during active
audio and nearest scrolling when an error is inserted. Neither behavior is
active in the retained idle/pending screenshots, so their rendered pending
composition is the committed composition.

The Peppa image has an intentional float animation. Separate screenshots can
show a different instantaneous art position. Geometry claims below come from
DOM boxes and scroll extents, not pixel matching across animation phases.

## Visual result

At 280x568, the base's extra feedback row adds 52px in opening, listening, and
writing. Its duplicated long save copy makes the thinking card 104px taller
than idle and pushes both escape and primary actions below the fold. The
candidate keeps one status in the existing **Your answer** line; idle and all
five operation phases retain the same 562.5px card height and 23px main scroll
range.

At 640x360, the base grows from a 345px card and 13px scroll range to a 397px
card and 65px range, leaving only the top of the footer visible. The candidate
retains the 345px card, 13px range, complete footer, and focused owner.

At 320x640, the candidate removes the operation-induced 60px growth: writing
and thinking remain 724.5px with a 113px range instead of the base's 784.5px
and 173px. The pre-existing idle layout still requires vertical scrolling and
does not initially reveal **Next**. That discovery problem is explicitly a
separate follow-up, not hidden by this branch.

Independent original-resolution review found no current-branch visual blocker.
The status navy/sky pairing measured about 7.62:1, enabled pink action content
about 5.06:1, transparent text actions about 6.71:1, and the dark/white focus
treatment about 16.58:1. The owner stays full opacity while competing controls
recede.

## Geometry and focus measurements

| Viewport | Base idle                       | Base pending                                                                           | Candidate idle and every pending phase | Result                                                            |
| -------- | ------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------- |
| 280x568  | card 562.5px; scroll range 23px | opening/listening/writing card 614.5px, range 75px; thinking card 666.5px, range 127px | card 562.5px; range 23px               | 52–104px operation growth removed                                 |
| 320x640  | card 724.5px; range 113px       | writing/thinking card 784.5px; range 173px                                             | card 724.5px; range 113px              | 60px operation growth removed; base vertical-scroll debt retained |
| 390x844  | card 663px at y=90.5px; range 0 | base measurement added 60px and recentered by 30px                                     | card 663px at y=90.5px; range 0        | zero candidate phase delta                                        |
| 640x360  | card 345px; range 13px          | card 397px; range 65px                                                                 | card 345px; range 13px                 | 52px operation growth removed                                     |
| 1440x900 | card 538px at y=181px; range 0  | base measurement added 60px and recentered by 30px                                     | card 538px at y=181px; range 0         | zero candidate phase delta                                        |

The automated contract measures the card, prompt, answer label, textarea,
microphone, every footer action, and scroll range. Each differs by at most one
CSS pixel from candidate idle across opening, listening, writing, ready, and
thinking. Every child action remains at least 44x44 CSS pixels, horizontal
overflow is zero, and the complete owner focus paint is inside the viewport.

Error rows are intentionally not forced into the reserved one-line status.
Review found that an inserted error could push the still-focused retry below
short viewports. A red-then-green contract now verifies nearest scrolling
without focus mutation: 280x568 **Next** ends at 567.5px with `scrollTop=53`,
320x640 **Skip for now** ends at 639.5px with `scrollTop=71`, and 640x360
**Next** ends at 360px with `scrollTop=43`. Moving focus to Account leaves
focus and `scrollTop` untouched.

## Files and integrity

All 38 files below were identified by `file` as baseline JPEG/JFIF. Dimensions
are encoded in each filename except the two explicitly marked 1280x720
supplementary captures.

### Base

| File                                                                      | State                            | SHA-256                                                            |
| ------------------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------ |
| [280x568-idle.jpg](./base/280x568-idle.jpg)                               | Idle                             | `bd95ec6098c2f039f755bbaa4af217e4db80db0ee31d77fa9ac2e07ce230bc65` |
| [280x568-opening.jpg](./base/280x568-opening.jpg)                         | Opening                          | `bdc8149c362a6d6f5eeebe7e1f599aab207fa5f4c89cda781f0967ebb456fbb9` |
| [280x568-listening.jpg](./base/280x568-listening.jpg)                     | Listening                        | `ad6040a95b1c4a72b57344247d438fa23147475957047a2d4303d61a6d927c2b` |
| [280x568-writing.jpg](./base/280x568-writing.jpg)                         | Writing                          | `6106203a345a9f353dad9147a7907e198e47f2583310536f29e5d216a6443c62` |
| [280x568-ready.jpg](./base/280x568-ready.jpg)                             | Ready/settled comparison         | `f128db17e90131ff1862a3362f4805ad3b051d3563eff9529dd3a4e07d11935c` |
| [280x568-thinking.jpg](./base/280x568-thinking.jpg)                       | Save pending                     | `3c9d0fe6ba165882cdd9d62ef70397134adbe94818a1619e496de43ef3f7fbf0` |
| [320x640-writing.jpg](./base/320x640-writing.jpg)                         | Writing                          | `0bcfa4fe877a273414b235a0ccf30d4aaa581e702d6b08e79c7d87089bb94658` |
| [320x640-thinking.jpg](./base/320x640-thinking.jpg)                       | Save pending                     | `6f85ed780bba6c37fe239ab254722eeb419731100b2e0ea026d333877d497ce8` |
| [640x360-idle.jpg](./base/640x360-idle.jpg)                               | Idle                             | `b58fe417208b2f70b8be32d5c29a08055ba09bb2e070c3b17922bbc682cdfb87` |
| [640x360-opening.jpg](./base/640x360-opening.jpg)                         | Opening                          | `4cef3a93a96c957439c585bfe48659757a3eb81e2d38a395c6423240526495b8` |
| [640x360-listening.jpg](./base/640x360-listening.jpg)                     | Listening                        | `b4ebfb290ce96ad9b56083bc6cd92c7cb0353ad64deeed0f0ef27ba8cd3588dd` |
| [640x360-writing.jpg](./base/640x360-writing.jpg)                         | Writing                          | `483875f75b1af2420a872533257294a819fb6f54c39dc5f1ab5877df30d846e5` |
| [640x360-ready.jpg](./base/640x360-ready.jpg)                             | Ready/settled comparison         | `3ca834cb21d347441b2e490aae875cc8bcc04a94566f9f51d1e4d19f4d50a231` |
| [640x360-thinking.jpg](./base/640x360-thinking.jpg)                       | Save pending                     | `e19ee2436e6a994789b449164a980edb67f176f134e2a36e924a4c5a83fdebc0` |
| [preserved-desktop-idle.jpg](./base/preserved-desktop-idle.jpg)           | Supplementary 1280x720 idle      | `b8bef4999b36650c0d84869767a66164934e61721bc714f6716f44639861a454` |
| [preserved-desktop-listening.jpg](./base/preserved-desktop-listening.jpg) | Supplementary 1280x720 listening | `a55eb5e0c5aadccfdafb80cac44588aa60b08cdac1c370f2e58d960f9df80b97` |

### Candidate

| File                                                                                 | State                         | SHA-256                                                            |
| ------------------------------------------------------------------------------------ | ----------------------------- | ------------------------------------------------------------------ |
| [280x568-idle.jpg](./candidate/280x568-idle.jpg)                                     | Idle                          | `76d7dd151e927487d4c1c0283de66adcef9fdfa3bf7050e2ced36a0f914f3b20` |
| [280x568-opening.jpg](./candidate/280x568-opening.jpg)                               | Opening, microphone owner     | `574c6f5c4f9ee03e74ee68217d746eb73f170d6e0ce4cff14c4999fcdc513826` |
| [280x568-listening.jpg](./candidate/280x568-listening.jpg)                           | Listening, microphone owner   | `67d29c37a1d81737d1a66a3ee794cab9e0245a5d3fb4c3a9311cc68bb6594c6a` |
| [280x568-writing.jpg](./candidate/280x568-writing.jpg)                               | Writing, microphone owner     | `9b3bd82928139fc86a41f9ec03661f8fff0202abaa47f90148167f0dca8e0e4d` |
| [280x568-ready.jpg](./candidate/280x568-ready.jpg)                                   | Ready                         | `b5121cb4e1a70fe9aac5f152a9fb2c6bfe276cc3c11014fb96c62015d80289f5` |
| [280x568-thinking.jpg](./candidate/280x568-thinking.jpg)                             | Thinking, Next owner          | `3287e69f18a239f5eb25ff40bce73a0e4fef1acb356657fd7f63c5873e18bb2e` |
| [280x568-thinking-skip-question.jpg](./candidate/280x568-thinking-skip-question.jpg) | Thinking, Skip question owner | `a1590365cff1f3778b5b673c62ab927a3dd3ae0cab72e84e24da95298fcace17` |
| [280x568-thinking-skip-for-now.jpg](./candidate/280x568-thinking-skip-for-now.jpg)   | Thinking, Skip for now owner  | `f1aed2ced6312e8767d188adb4429804e1bb8174725a56f21ac4923ec39d2bd8` |
| [320x640-writing.jpg](./candidate/320x640-writing.jpg)                               | Writing                       | `2b3a38ff952b8fd45f6518fefc95157b90de8f0845d72ad634cdf27e205c92dd` |
| [320x640-thinking.jpg](./candidate/320x640-thinking.jpg)                             | Thinking                      | `4adab02364e099f5760a095ef11160cfe821e4d6e53a40078250db93152c3356` |
| [390x844-opening.jpg](./candidate/390x844-opening.jpg)                               | Opening                       | `133e4620c6d3f4b8f37b5b7f78ff3e6bab85add65909436a6f34f36d3e152dcc` |
| [390x844-writing.jpg](./candidate/390x844-writing.jpg)                               | Writing                       | `d51cb0db4de4bccce697def4164ffc2ab884ddf36f369bdc663918247d40f216` |
| [390x844-thinking.jpg](./candidate/390x844-thinking.jpg)                             | Thinking                      | `95e4f24b3da764d0052a58268a93c3f368fa74ef17c0ec3edcad6ffdc1b06066` |
| [640x360-idle.jpg](./candidate/640x360-idle.jpg)                                     | Idle                          | `025822bf10ddda1976babc103a4ee0e935208e15e3396503e159703788ca660f` |
| [640x360-opening.jpg](./candidate/640x360-opening.jpg)                               | Opening                       | `3473994adcee736a77767e5ac4ac5fd0e1cfece4e4c103664b4403bd9e6e7d60` |
| [640x360-listening.jpg](./candidate/640x360-listening.jpg)                           | Listening                     | `28fb850a449788bc1ce0cce20171541a5b4e7a401c28519e98f7f8a8a79217bb` |
| [640x360-writing.jpg](./candidate/640x360-writing.jpg)                               | Writing                       | `56dc7e9a8524ac67b9e4e6c2ad83d0ce92711e4aae0d1fa71b76a19ba0f0fd0c` |
| [640x360-ready.jpg](./candidate/640x360-ready.jpg)                                   | Ready                         | `68956884f47d77e77e7ac4413facb41f1ae80847b2d320ba10636e6a1e9fab7b` |
| [640x360-thinking.jpg](./candidate/640x360-thinking.jpg)                             | Thinking                      | `8f93d0fc1015e9581ca5c2eacc43200ee919b9963e4a2a876f0aa4e4c6855687` |
| [1440x900-listening.jpg](./candidate/1440x900-listening.jpg)                         | Listening                     | `c8813b0156644a3dbb9651e1a818f69b8e8f27066fe58cfa1d9063557f33060b` |
| [1440x900-ready.jpg](./candidate/1440x900-ready.jpg)                                 | Ready                         | `52a09031b29ab9ceb633fd57f7c0a17306fb120622c4a697353b6dc5c18bbb5b` |
| [1440x900-thinking.jpg](./candidate/1440x900-thinking.jpg)                           | Thinking                      | `f6e98489f5374dc23685049240a12b11f276492f6a708d616ab0e9323a80f7de` |

## What screenshots do not prove

The screenshots establish rendered composition, visible copy, relative
contrast, clipping, and the presence of focus paint at one Chromium paint.
They do not establish request count, DOM identity, accessible names, live-region
speech, keyboard suppression, abort behavior, stale-result quarantine, actual
microphone permission, physical recording, server rollback, or child
comprehension. Those claims are paired with rendered/unit/browser contracts,
and direct target-AT, device, browser, localization, and participant research
remain required.
