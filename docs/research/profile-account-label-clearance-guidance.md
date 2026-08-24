# Shared account-label clearance guidance

Status: implemented and provisionally retained
Date: 2026-08-24  
Branch: `codex/profile-account-label-clearance`  
Base branch / dependency: `codex/profile-compact-primary-action` at `f83e7ce`

## Question and scope

How should Parrot keep its persistent Account control useful without allowing an
arbitrary name or email address to cover the child's route action, profile
Replay action, progress, or active lesson HUD?

This change owns the closed Account trigger, the identity summary revealed by
its existing menu, and the compact shared-header spacing needed by that fixed
trigger. It does not redesign authentication, add account switching, change
saved identity data, translate the application, or claim physical-device
safe-area support.

The primary audience remains young beginners, including children under five
who may not read English. A caregiver or older learner still needs to identify
the signed-in account, but that secondary fact must not displace the current
learning task.

## Deterministic observation

Chromium `149.0.7827.55` was run headlessly at device-pixel ratio 1, with a
desktop browser context, light color scheme, reduced motion for the design
probe, and document fonts awaited. The Vite E2E API fixture was retained by
intercepting `/api/auth/get-session`, fetching its response, and changing only
the session name and email. The two stress identities were:

- name: **Alexandria-Montgomery-Washington**;
- whitespace name, forcing the fallback email
  **family.account.for.alexandria.montgomery@example.test**.

This is deterministic synthetic evidence. It is not a field distribution of
real account names or devices.

### Reproduced failures

| Surface and viewport | Current Account border | Obscured content | Result |
| --- | --- | --- | --- |
| `/lessons`, 280x568 | `x=10..270`, `y=10..54` with either stress identity | Back, `x=10..54`, `y=10..54` | Account covers the complete route action and owns all five sampled pointer points. |
| `/lessons`, 320x640 | `x=14..306`, `y=14..66` with the email fallback | Back, `x=14..66`, `y=14..66` | Account covers the complete route action. |
| `/lessons`, 390x844 | `x=14..376`, `y=14..66` with the email fallback | Back, `x=14..66`, `y=14..66` | Account still covers the complete route action; the long name covers part of it. |
| Profile question, 280x568 | `x=10..270`, `y=10..54` | Replay, `x=142.56..186.56`, `y=44.75..88.75` | Borders intersect by `44x9.25`; Account steals Replay's top pointer strip. |
| Profile question, 320x640 | `x=14..306`, `y=14..66` | Replay, `x=142.56..190.56`, `y=47.75..95.75` | Borders intersect by `48x18.25`; Account also covers progress. |
| Profile question, 359x640 | `x=14..345`, `y=14..66` with the long name | Replay focus paint, expanded eight pixels | Borders clear, but the authored focus paint intersects by `64x7.5`. A border-only test would miss this defect. |
| Profile question, 640x360 | `x=193.69..630`, `y=10..54` with the email fallback | Replay and progress | Replay has only its bottom sampled pointer strip left; main has 13px vertical range but no horizontal overflow. |
| Active lesson, 768x621 | `x=636.83..740`, `y=24..88` even for **Mia** | Lesson HUD, `x=96..672`, `y=20..94` | Borders intersect by about `35.17x64`. At 768x620, the `short` layout moves the HUD and the collision disappears. |
| Active lesson, 1440x900 | up to the existing 576px Account cap with a 120-character label | Centered lesson HUD | The arbitrary label can still reach the HUD at desktop width. |

The current fixed `z-40` Account layer is capped to nearly the whole compact
viewport and 576px at `md`. Its inner `truncate` only starts after that parent
has consumed the available width. The route header, profile question header,
and lesson HUD independently occupy the same top band. Raising another
`z-index` would only change which action is broken.

The primary reproduction scripts took 4.6 seconds for 18 states and 9.9
seconds for the 60-state breakpoint scan on this machine. Those totals measure
test automation, not child-perceived response time. The defect is stable after
session load and profile audio settlement; this design adds no request, timer,
transition delay, or feedback state.

## Evidence and limits

| Evidence | Design implication | Limit |
| --- | --- | --- |
| WCAG Reflow permits responsive relocation when information and function remain available. See [A11Y-15](./source-register.md). | Move identity detail into the existing disclosure instead of letting it determine persistent header width. | WCAG does not prescribe Parrot's breakpoint, icon, or menu copy. The 280px case is stricter than the criterion's 320 CSS-pixel reference width. |
| WCAG Label in Name requires visible control text to occur in its accessible name. WAI-ARIA APG recommends short, useful names and accurate menu-button state. See [A11Y-24 and A11Y-30](./source-register.md). | Keep **Account** as the stable functional word at wide widths and at the start of `Account for …`; preserve `aria-haspopup="menu"` and `aria-expanded`. | An icon-only compact presentation has no visible text for this criterion. Browser and assistive-technology behavior still needs direct testing. |
| WCAG Focus Not Obscured and Target Size support protecting focus and the existing 44px child baseline. See [A11Y-26](./source-register.md). | Treat the complete target and its eight-pixel authored focus paint as the collision boundary. Do not shrink below 44x44. | Complete clearance and 44px align with enhanced criteria and are Parrot product goals, not an AA conformance claim or a physical-size guarantee. |
| W3C COGA recommends stable common controls, clear visible labels, important actions first, and manageable content. See [A11Y-02, A11Y-12, A11Y-18, and A11Y-20](./source-register.md). | Keep Account in one predictable corner but let the current child task dominate the top band. | COGA is supplemental guidance using cognitive-disability personas, not a trial with five-year-old multilingual learners. |
| Google's official children's-app guidance recommends familiar icons, large targets, simple consistent interaction, important content first, and testing with children and parents. It says most children under five cannot read. See [UX-04](./source-register.md). | Pair the compact trigger with one familiar person/account symbol; expose the literal word **Account** when space is abundant. | The guidance is practitioner material and does not prove that Parrot's chosen icon or word is understood by the target audience. |
| User identity and translated UI strings do not have a useful finite width bound; direction is also runtime data. See [DEV-05](./source-register.md). | Never size the closed trigger from a name/email. Render the complete menu identity with wrapping and `dir="auto"`; test long unbroken, CJK, RTL, emoji, and empty/fallback values. | W3C's translation expansion examples describe translated interface strings, not maximum user-name lengths. |
| WebKit says `viewport-fit=cover` requires explicit safe-area padding. See [DEV-06](./source-register.md). | Keep this branch on CSS viewport geometry. Record physical iOS/PWA safe-area validation separately because Parrot does not request `viewport-fit=cover`. | Browser screenshots do not represent notches or installed-app chrome. Adding safe-area padding now could double-inset Safari's default layout. |

## Audience interpretation

- **Pre-readers and weak-English beginners:** one person/account symbol creates
  less competing text beside the current task. This is a hypothesis for child
  testing, not proof of comprehension.
- **Early readers:** the same symbol gains the visible word **Account** in the
  wide layout rather than an unpredictable person's name.
- **Caregivers and older learners:** the full name and email remain one
  activation away, wrap rather than truncate, and preserve their own text
  direction. This branch does not address multiple-account switching.

## Options considered

| Option | Decision | Reason |
| --- | --- | --- |
| Keep visible identity and lower `max-width` | Reject | Any finite cap either collides at some surface or truncates identity in the persistent control. It also keeps secondary text visually competitive. |
| Limit name length or destructively shorten email | Reject | The database and authentication boundary accept arbitrary text; validation would not bound external identity sources or localization, and it would change data policy to repair presentation. |
| Add offsets route by route | Reject | It leaves new and untested account-owning surfaces vulnerable and encodes the current stress strings rather than the shared invariant. |
| Hide Account on child routes | Reject | It removes sign-out, deletion, data information, and profile access rather than preserving those caregiver functions. |
| Use only an icon at every width | Revise | Compact screens need the bounded icon, but abundant wide space can add the literal functional word without allowing identity to grow. |
| Stable icon plus **Account**, with identity in the menu | Select | The closed footprint becomes deterministic, matches the shared header-control system, keeps the child task dominant, and preserves identity on activation. |

No ResizeObserver, collision JavaScript, new dependency, new breakpoint token,
network request, or persistent state is needed.

## Selected design contract

1. The closed Account trigger uses the shared `header` size and a
   `CircleUserRound` icon. Below `wide` it is a square. At `wide`, it adds the
   visible word **Account** and a disclosure chevron.
2. Its complete accessible name remains `Account for ${userLabel}`. The wide
   visible word occurs at the start of that name. Existing menu-button
   semantics, Arrow keys, Escape, focus return, sign-out, deletion, profile,
   and data-information actions remain unchanged.
3. Arbitrary identity text never renders in the closed trigger or determines
   its width. The menu shows the full `userLabel` and, when different, the full
   email. Both wrap within the viewport and use `dir="auto"`.
4. Compact `md` headers move their mirrored edge inset from 28px to 16px until
   the `wide` layout begins. With a 64px control and eight-pixel focus paint,
   this leaves the active 768px lesson HUD clear and separates the 768px
   profile Replay target without changing either child task. The wide layout
   restores the established 28px inset.
5. Account and route controls remain at least 44x44, remain completely inside
   the CSS viewport with their focus paint, and retain shared color, shadow,
   hover, active, and forced-colors behavior.
6. The persistent Account border and active focus paint must not obscure route
   controls, Profile Replay/progress, or the active lesson HUD. Pointer samples
   inside a child action must resolve to that action.

An in-browser geometry prototype using the bounded Account footprint passed
the requested 280, 320, 359, 360, 390, and 640x360 profile states. At the
768x621 seam, the 16px compact edge inset produces a 12px border gap between
Account and Replay and a 16px border gap between Account and the lesson HUD;
that leaves at least four and eight pixels respectively after expanding the
focused Account or Replay by the authored eight-pixel paint boundary. This
prototype changed only runtime styles and is not implementation evidence.

## Acceptance and rollback

Automated coverage must use both a long name and the whitespace-name email
fallback, not only **Mia**, and verify:

- shared route headers at 280x568, 320x640, 359/360x640, 390x844, 640x360,
  768x621, 1359x900, 1360x900, and 1440x900;
- the profile question at the same narrow and short boundary states, including
  the 359px focus-only case;
- the active lesson HUD at 768x620, 768x621, 768x641, and wide desktop;
- stable Account geometry across identity fixtures, no horizontal overflow,
  full target and focus containment, no border/focus obstruction, correct
  pointer ownership, and unchanged keyboard menu behavior;
- the complete name/email visible after activation, wrapping within the menu,
  with `dir="auto"` and no duplicate email fallback;
- compact screenshots before and after opening the menu plus the exact 768x621
  lesson/profile boundary and a wide layout.

Rollback if the shared trigger or its focus paint covers another persistent
control/content surface, the menu loses identity or keyboard behavior, the
icon is not distinguishable in direct child/caregiver testing, or the compact
inset causes a new edge/central-content collision.

## Hand-off record

```text
Branch: codex/profile-account-label-clearance
Base branch / dependency: codex/profile-compact-primary-action at f83e7ce
Commits: 3d96aa0, 1db0a3e, 1fd1242
Hypothesis: a stable functional Account trigger plus disclosed identity keeps secondary account text from obscuring the child's current task without removing caregiver access
Changed: bounded shared Account trigger, functional wide label, wrapped and viewport-scrollable identity menu, in-flow open-menu errors, complete scrolled focus paint, and mirrored compact insets
Not changed: authentication, identity storage, account switching, network timing, global translation, physical safe-area behavior
Tests: arbitrary Latin/CJK/emoji/RTL identity; route, profile, lesson-HUD, viewport and overflow-clip focus paint, pointer, boundary, menu/error, fallback deduplication, and accessible-name coverage
Screenshots / traces: artifacts/ux-review/profile-account-label-clearance/manifest.md
Measured result: deterministic failure and runtime geometry prototype recorded above
Risks / limitations: icon comprehension and physical-device/screen-reader behavior remain untested
Retain, revise, or reject: retain provisionally after implementation and focused verification
Next question: can a small child/caregiver comparison confirm the icon-plus-Account model across the supported languages and devices?
```
