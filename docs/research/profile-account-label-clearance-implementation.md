# Shared account-label clearance implementation

Status: implemented and provisionally retained

Branch: `codex/profile-account-label-clearance`

Stacked base: `codex/profile-compact-primary-action` at `f83e7ce`

Research: `65fc082`

Red contract: `f0df20f`

Implementation: `3d96aa0`

Review hardening: `1db0a3e`, `1fd1242`

Research date: 2026-08-24

Guidance:
[`profile-account-label-clearance-guidance.md`](./profile-account-label-clearance-guidance.md)

Visual evidence:
[`artifacts/ux-review/profile-account-label-clearance/manifest.md`](../../artifacts/ux-review/profile-account-label-clearance/manifest.md)

## Outcome

An arbitrary account name or fallback email can no longer determine the width
of Parrot's fixed header control. Below the existing `wide` breakpoint, Account
is the same square shared control as route navigation. At `wide`, it adds the
stable word **Account** and a chevron. Its accessible name remains
`Account for ${userLabel}` and its menu-button semantics and keyboard behavior
remain intact.

The full identity now appears in the existing menu. Name and email are separate
`dir="auto"` rows; the email is not repeated when it is already the fallback
label. Both rows can shrink inside the menu grid and wrap rather than clip.

The open panel is bounded to the available dynamic viewport height. It owns
vertical scrolling for exceptional identity length, contains overscroll, and
gives each menu action enough scroll margin for the complete authored focus
paint. A failed account-action alert becomes a normal-flow row inside the open
panel; while closed, it remains directly below Account. This replaces a fixed
menu-open alert offset that could cover actions as identity height grew.

At `md` widths below `wide`, the shared route and account headers use mirrored
16px edge insets. The established 28px inset returns at `wide`. This creates
enough room for the complete eight-pixel focus paint at the 768x621 lesson HUD
and profile Replay seams without route-specific offsets or a new breakpoint.

The removed `headerAccount` size was a special control whose width depended on
identity content. Account now uses the existing shared `header` size, so the
global control primitive has one fewer exception.

## Test-first evidence

The red contract intercepted only the E2E session payload and exercised a long
hyphenated name plus a whitespace name that forces the long-email fallback. On
base `f83e7ce`, four focused groups failed for the intended reasons:

- the Account trigger covered Back at compact route widths;
- it covered profile Replay or Replay's focus paint;
- it covered the active lesson HUD at the 768x621 seam; and
- the closed trigger still rendered arbitrary identity instead of the selected
  functional label.

Coverage spans 280, 320, 359, 360, 390, 640x360, 768 boundary, 1359, 1360, and
1440 CSS-pixel layouts as appropriate. It checks complete target and focus-paint
geometry, pointer ownership, horizontal overflow, compact square sizing, wide
functional text, menu identity, direction metadata, and existing accessible
names.

Screenshot review found one issue after those tests first passed: the menu
container stayed inside the viewport, but its identity grid track used the
child's max-content width, so glyphs escaped the 280px menu. A new assertion on
each identity row's rendered border box failed at `x + width = 417.125` in a
280px viewport. Adding `min-w-0` to the rows made the grid shrink and the exact
test pass. This closes the difference between document overflow and local
paint containment rather than relying on the screenshot alone.

Independent code, visual, and test reviewers all reproduced a remaining
vertical boundary. Before review hardening, the ordinary long identity produced
a panel ending at y=369 in a 640x360 viewport. A 200-character CJK name pushed
Sign out below a fixed 280x480 viewport, and reopening after a failed sign-out
painted the fixed alert over Delete account and Sign out. New red contracts now
cover Latin landscape, long CJK/emoji, long RTL, failed sign-out, menu-owned
scroll, computed direction, End-key reachability, pointer ownership, and both
viewport and overflow-clip focus containment.

The first scroll implementation moved the Sign out border into view but still
clipped its eight-pixel focus paint: the expanded bottom was 354 while the
panel client clip ended at 346. Menu-item scroll margin now brings the complete
paint to that clip edge. The exact regression failed before and passes after
the correction. A whitespace-name fallback test also locks the single email
row promised by the design.

## Rendered geometry

Measurements use the deterministic E2E fixtures, Chromium at device-pixel
ratio 1, reduced motion, loaded fonts, and synthetic stress identities.

| Surface | Base | Candidate | Result |
| --- | --- | --- | --- |
| Lesson list, 280x568 | Account width 260 at `x=10`; Back width 44 at `x=10` | both controls width 44 at `x=10` and `x=226` | complete overlap removed |
| Profile, 320x640 | Account width 292; Replay lies inside its paint | Account width 52 at `x=254`; Replay unchanged | progress, border, focus, and pointer clear |
| Profile, 359x640 | long name intersects expanded Replay paint | Account width 52 at `x=293` | the prior focus-only failure clears |
| Active lesson, 768x621 | Account width 517.5 overlaps HUD through `x=672` | Account `x=688...752`; HUD `x=96...672` | 16px border gap; 8px focused gap |
| Open menu, 640x360 | panel ended at y=369; focused paint ended at y=365 | panel ends y=350; inner clip and focused paint end y=346 | complete target and paint reachable by End |
| Failed sign-out, 280x568 | alert could paint over the variable-height menu | alert y=169...226; actions y=230 onward | one bounded, non-overlapping flow |
| Lesson list, 1440x900 | identity could consume the old 576px cap | stable Account width 173.19 | functional label remains predictable |

The closed trigger change adds no request, storage access, timer, animation,
observer, resize listener, or interaction gate. Menu content is already in the
same synchronous React disclosure path. Automation duration is recorded only
for reproducibility and is not presented as learner-perceived latency.

## Visual review

Before/after captures show that secondary caregiver identity no longer covers
Back, progress, Replay, or the active lesson HUD. The compact icon mirrors the
route action's size and chrome, leaving a calm empty center band for the current
task. The wide layout retains the literal **Account** word so the control is not
icon-only when space is abundant.

The open 280px menu is intentionally denser because it is the caregiver-owned
detail surface. Full identity wraps above the four existing actions, all menu
targets remain full width, and the panel remains inside the viewport. The
short-landscape capture shows the last action's complete focus paint after
owned scrolling; the failed-sign-out capture shows a separate high-contrast
error row without covering an action. The panel may
cover lesson cards while open, which is normal temporary disclosure behavior;
closing it restores the child-first shelf without content shift.

This does not establish that a pre-reader understands the account icon. The
trigger is secondary to the learning task, retains an accessible name and a
browser title, and exposes visible **Account** at wide widths. Recognition must
still be checked with children and caregivers rather than inferred from icon
familiarity guidance.

## Verification

Observed checks through review commit `1fd1242`:

| Check | Result | Observed wall time |
| --- | --- | ---: |
| New menu-row containment regression | 1/1 passed | 1.3 s suite time |
| Header suite after review hardening | 37/37 passed | 7.8 s |
| `npm test` | 686/686 passed | 2.63 s |
| `npm run build` | TypeScript and production Vite build passed | 4.7 s combined final static/unit tool call |
| `npm run lint` | 0 errors; 2 unchanged warnings in generated `worker-configuration.d.ts` | 4.7 s combined final static/unit tool call |
| `PLAYWRIGHT_PORT=4229 npm run test:browser` | 318/318 passed | 1.4 min |

## Retain, rollback, and remaining uncertainty

Retain provisionally: the repair acts at the shared source of the arbitrary
width, preserves caregiver account functions, reduces a special control style,
adds no runtime wait, and passes the focused behavior and rendered-geometry
contracts.

Rollback or revise if direct assistive-technology testing finds the compact
button ambiguous, physical iOS/PWA layouts expose a safe-area collision,
enlarged text makes the open menu unusable, or another persistent top-band
surface is obscured by the bounded control or its focus paint.

Independent review approved the account-clearance result after the two
hardening commits. It retained physical safe-area/browser-chrome validation as
a nonblocking gap and recorded two separate visual-hierarchy follow-ups in the
backlog rather than expanding this branch.

Still unknown:

- child and caregiver recognition of the chosen person/account symbol;
- VoiceOver, TalkBack, switch-control, and zoom/reflow experience;
- representative Android/iOS browser and installed-app safe areas;
- whether translated visible **Account** needs a wider breakpoint; and
- whether a very long identity should gain an optional copy affordance for
  caregivers without adding clutter for children.

The next cheapest evidence is a short caregiver-assisted comparison at 280px
and wide layouts, followed by real-device enlarged-text and screen-reader
checks. Measure correct account-menu discovery, accidental task interruption,
time to identify the active account, and adult intervention—not engagement.
