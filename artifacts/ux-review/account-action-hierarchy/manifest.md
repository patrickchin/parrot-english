# Account action hierarchy visual manifest

Date captured: 2026-08-24

Branch: `codex/account-action-hierarchy`

Baseline commit: `080dbbb`

Initial implementation commit: `b73a92c`

Final twelve-pixel candidate source: `8ab298a`

## Capture conditions

Every image is an uncropped viewport capture of the signed-in `/lessons`
route using the local E2E identity **Mia**. The dimensions in each filename are
CSS viewport pixels at device-pixel ratio 1. The ordinary candidate matrix was
captured with Playwright Chromium after network idle, font readiness, and image
settlement, with reduced motion requested. Its pointer-open, Delete-focus, and
Sign-out-focus states are separate captures of the same implementation.
The 1440x900 pointer capture additionally waits for the Account trigger's
transform animation to report finished so its chevron records the settled open
state rather than a transient frame.

The 640x360 forced-colors image uses Playwright's
`forcedColors: "active"` emulation. It demonstrates a Chromium fallback, not
every Windows High Contrast palette or physical device. The 390x844 dialog
image contains a non-production measurement password solely to enable the
existing final action; no request was submitted.

`candidate/account-menu-1280x720-in-app-first-item-focus.jpg` is a genuine
capture from the Codex in-app Browser with the menu's normal first-item focus.
That API returned JPEG bytes. The baseline and B3
prototype captures were also encoded as JPEG and therefore use `.jpg`; an
evidence audit corrected their earlier `.png` suffixes without changing their
bytes. B1, B2, and the deterministic candidate matrix are genuine PNG files.

The three prototypes came from isolated real-code worktrees stacked at
`080dbbb`:

- B1, `codex/prototype-account-neutral-signout` at `3427b6b`, makes only Sign
  out neutral and was rejected because Delete becomes the sole saturated row.
- B2, `codex/prototype-account-separated-delete` at `7581d5c`, separates a
  muted Delete row and escalates only the final confirmation; it was selected,
  then its eight-pixel break was refined to twelve pixels after visual review
  found the complete focus paint consumed the smaller gap.
- B3, `codex/prototype-account-neutral-delete` at `15fade6`, separates both
  actions but gives Delete no surface cue; it was rejected in favor of B2.

## Measured result

| Viewport | Candidate panel | Each action | Ordinary gap | Sign-out-to-Delete gap | Bottom clearance |
| --- | --- | --- | --- | --- | --- |
| 280x568 | 208x270 at `x=62, y=62` | 184x44 | 4px | 12px | 236px |
| 390x844 | 208x270 at `x=168, y=74` | 184x44 | 4px | 12px | 500px |
| 640x360 | 208x270 at `x=422, y=62` | 184x44 | 4px | 12px | 28px |
| 1440x900 | 208x270 at `x=1204, y=96` | 184x44 | 4px | 12px | 534px |

The panel is eight pixels taller than baseline because the new twelve-pixel
destructive break replaces an ordinary four-pixel row gap. Targets keep their
full baseline size. The focused row's complete paint leaves a visible four-
pixel navy separator from the adjacent exit action and remains contained at
every sampled viewport.

Rendered normal-state text contrast on the real menu is 5.73:1 for neutral
Sign out and 7.61:1 for muted Delete. The enabled final deep-rose/white action
is 4.67:1. Automated contracts also cover hover, active, focus, disabled, and
forced-color states rather than treating these normal-state figures as the
whole contrast result.

A 20-sample Chromium harness at 390x844 measured from a DOM click through two
`requestAnimationFrame` callbacks. Menu opening had a 13.8 ms median and
14.22 ms p95; deletion-dialog opening had a 12.6 ms median and 14.57 ms p95
(23.4 ms maximum). This is a deterministic local paint-settlement proxy, not
physical-device input latency, browser-event timing, assistive-technology
announcement latency, or field performance.

## Files and SHA-256

### Baseline

| File | Size / state | SHA-256 |
| --- | --- | --- |
| `base/account-menu-1440x900-delete-focus.jpg` | 1440x900, Delete focused | `e619d69672e65bad8ba707acdd91f2fb2e38fd9b6f62f7f7fb30e4747afc4393` |
| `base/account-menu-1440x900-pointer-open.jpg` | 1440x900, pointer open | `75a50aab6bcd45eefac9092212b2a718aad0d2a4489444c45b41194426a74e6f` |
| `base/account-menu-1440x900-sign-out-focus.jpg` | 1440x900, Sign out focused | `878d2c3fa177a0431393b8447cb32412279f74eb3755bce59446792fe603e679` |
| `base/account-menu-280x568-delete-focus.jpg` | 280x568, Delete focused | `de88fbf78ec0e7f09c110c949e3f47a4f89602accc31b196cdc5bdb6545a464b` |
| `base/account-menu-280x568-pointer-open.jpg` | 280x568, pointer open | `a9ad8c17e605e2f1397182c38919026089fa11b75bfad69e08bf0531974578ec` |
| `base/account-menu-280x568-sign-out-focus.jpg` | 280x568, Sign out focused | `8553483a1e7d1712e6d09d60a471296d6ba53f1e0c511d9615297cf49adc2282` |
| `base/account-menu-390x844-delete-focus.jpg` | 390x844, Delete focused | `8e326ddf47203f43a975da6ed8754f865bc00448825ce8aee6eaf4f2c0e1ed9d` |
| `base/account-menu-390x844-pointer-open.jpg` | 390x844, pointer open | `5527d0176639f43a78dd8684d9652f3284f74be2656423af48f8e31b3823b5f5` |
| `base/account-menu-390x844-sign-out-focus.jpg` | 390x844, Sign out focused | `5253e9b59b9252403f3b1ae49b14a11a6d50f1d47e4498356befdf934cc882c2` |
| `base/account-menu-640x360-delete-focus.jpg` | 640x360, Delete focused | `a728195cf963621c989a275759cbb654112db0e4e3680288763f5045bfc50f2d` |
| `base/account-menu-640x360-pointer-open.jpg` | 640x360, pointer open | `65d4958e00fc1f1fdfaf7dea5c6f3d6ddfcb0caac08c145d49cf25b0ab81b95c` |
| `base/account-menu-640x360-sign-out-focus.jpg` | 640x360, Sign out focused | `6c4edd7398901585027ff5b78e016ab8bf434104f3fef0a904fb725c5e1685c1` |
| `base/delete-confirmation-390x844-baseline.jpg` | 390x844, final action enabled | `17f2ebed81cbb89430fa499299f8fd0177963a39329bafc6df1ffd0ab42e9bc8` |

### Prototypes

| File | Size / state | SHA-256 |
| --- | --- | --- |
| `prototypes/b1-neutral-signout-1440x900.png` | 1440x900, rejected B1 | `d609787de0a72e243c5de8f9bb682e9c1a899d58f4b1dba92af3f1a6c4420fef` |
| `prototypes/b1-neutral-signout-280x568.png` | 280x568, rejected B1 | `a9767e2cf261f34b957fd958ead51465a77fc61f2a31606c60af93aac9eb7d25` |
| `prototypes/b1-neutral-signout-390x844.png` | 390x844, rejected B1 | `3a43d773db140025c33d4dfbabc09be463fe485dcbc68cba8a0ea16f7413aa0f` |
| `prototypes/b1-neutral-signout-640x360.png` | 640x360, rejected B1 | `42f52fab01febe7a660b79fd503c4098ccde8c90b9dbfedf486e4f1e16b42a0e` |
| `prototypes/b2-delete-confirmation-390x844.png` | 390x844, selected B2 confirmation | `71fa77ebbce4d7bea465c720f2ec2c6201366245450329a33847d1fbe0d6e389` |
| `prototypes/b2-separated-delete-1440x900.png` | 1440x900, selected B2 | `a5572f2d60e49a29b81a088a189c7a670ac0bae212ec11d2ab43d066f6aa6cb1` |
| `prototypes/b2-separated-delete-280x568.png` | 280x568, selected B2 | `1433ec908a05bca17dd49f770ec7be3abb0d96e15d385dd098c6469f30357c36` |
| `prototypes/b2-separated-delete-390x844.png` | 390x844, selected B2 | `cb8dce51f8d40c8492e38db0f1250710c5d31d543b0e97287f22c0704cb849f1` |
| `prototypes/b2-separated-delete-640x360.png` | 640x360, selected B2 | `cbb81987f754e0c42c366db03fe7d4ecfcd8a0152f7db462ff4e3c5410b069a8` |
| `prototypes/b3-neutral-delete-1440x900.jpg` | 1440x900, rejected B3 | `ababf9a57f4687c7ee7feac9fdf7cd8df502d69cd450d95c015c92fbf84e1c75` |
| `prototypes/b3-neutral-delete-280x568.jpg` | 280x568, rejected B3 | `cd6f85e56cc2d1080709470e9abd233619f7c89a9377a42474d7b1ee4ff34c55` |
| `prototypes/b3-neutral-delete-390x844.jpg` | 390x844, rejected B3 | `68e995a04f59823399717c8b17fae6987d8d8c910b9e2bedefb42fda5eb4f8c7` |
| `prototypes/b3-neutral-delete-640x360.jpg` | 640x360, rejected B3 | `97074a254436e35de7631b86382bb7c91713aad59a8da626b322154374a9efe9` |

### Selected candidate

| File | Size / state | SHA-256 |
| --- | --- | --- |
| `candidate/account-menu-1280x720-in-app-first-item-focus.jpg` | 1280x720, live in-app, first item focused | `3cbef1da8e34a2dc73c3c7fd4b2136bcd12303511ef659b827e1747001c61a7f` |
| `candidate/account-menu-1440x900-delete-focus.png` | 1440x900, Delete focused | `b1c060548b65123f562a67b5ba4987f013e8c91438e51268c3da87edbf6f3280` |
| `candidate/account-menu-1440x900-pointer-open.png` | 1440x900, settled pointer open | `fd5621b09dbe0a4e11c745f08efe3627dc341ee0f88144ccdbc35f53dcb5f9e0` |
| `candidate/account-menu-1440x900-sign-out-focus.png` | 1440x900, Sign out focused | `598ae6488700d3cea7e3555a149d4b7ac8120326f05c82beda7369e2607ecf9c` |
| `candidate/account-menu-280x568-delete-focus.png` | 280x568, Delete focused | `f10dadf4ea6bb173f829664177c0841a3362206b4a4a05d51cbe023e842bb37d` |
| `candidate/account-menu-280x568-pointer-open.png` | 280x568, pointer open | `935636520f32f724db05f3b463fdfd15328ee4ae0ba60a5dc217e58145f9b5b5` |
| `candidate/account-menu-280x568-sign-out-focus.png` | 280x568, Sign out focused | `c351389de65bd02078e9bd48c5b11eaa940eb570c4e0b186ca53ac32cdddc08b` |
| `candidate/account-menu-390x844-delete-focus.png` | 390x844, Delete focused | `d47dd0a16c19d1ed8100791d5a48ec9c457c5cc9388419162d379ad4f78acb4e` |
| `candidate/account-menu-390x844-pointer-open.png` | 390x844, pointer open | `36f2538d02e6e48efabe3be5336cd7d5bcd88e0941f7ada98af75ce6f54e7cd9` |
| `candidate/account-menu-390x844-sign-out-focus.png` | 390x844, Sign out focused | `4c767e07e9957b3c133caae58ad1663f87170769942958c36ff3d19d11e52c4f` |
| `candidate/account-menu-640x360-delete-focus.png` | 640x360, Delete focused | `d4ff832e74074501469169af52d7e093023972108f3486dc5f9bb874c0481940` |
| `candidate/account-menu-640x360-forced-colors-delete-focus.png` | 640x360, forced colors, Delete focused | `95f9520e898d493f2b3544c3fd0312103a4a85bc03acfaca03b9a800a27ebe85` |
| `candidate/account-menu-640x360-pointer-open.png` | 640x360, pointer open | `10c68d9c8535fe73996dac25f1f08d3418aa748f51a7a3e8e166c600487c073e` |
| `candidate/account-menu-640x360-sign-out-focus.png` | 640x360, Sign out focused | `57342219565e7ad3992045a0ea75320fb39fbb6f1d03e2f6a21d68baae889f05` |
| `candidate/delete-confirmation-390x844-enabled.png` | 390x844, final action enabled | `4ddfb764da7c9b17bc01234262c89c844442f154f4d26a182e231e01d8c8743a` |

## Evidence boundary

These files establish rendered hierarchy, geometry, focus paint, and local
settlement timing in Chromium. They do not establish caregiver comprehension,
first-gaze attention, accidental activation by a child, screen-reader or voice
control behavior, localization, Safari/Firefox parity, physical forced-colors
behavior, physical touch size, or low-end-device latency.
