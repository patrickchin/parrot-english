# Account action hierarchy guidance

Status: implemented and provisionally retained

Date: 2026-08-24

Branch: `codex/account-action-hierarchy`

Base branch / dependency: `codex/lesson-shelf-heading-reading-cue` at
`080dbbb`

## Question and scope

Can Parrot make routine **Sign out** visibly different from irreversible
**Delete account** without turning deletion into the Account menu's most
prominent action or making either control harder to find and operate?

This branch owns the order and visual hierarchy of those two menu entries, the
visual escalation of the existing final deletion confirmation, and rendered
behavior evidence. It does not change authentication requests, deletion data,
password verification, menu semantics, labels, icons, account identity,
errors, pending behavior, focus-management algorithms, routes, child activity
content, or audio.

The menu is a grown-up surface, but it is not behind a caregiver gate and is
visible from every child activity. The primary usability task is therefore for
a caregiver, while accidental child attention and activation remain safety
considerations. Neither color nor English reading can be the only safeguard.

## Reproduced baseline

At base `080dbbb`, the menu order is **Learner profile**, **AI and saved data**,
**Delete account**, and **Sign out**. The first two items use the neutral
surface treatment. The last two are adjacent bright-pink rows with the same
background, foreground, size, shape, typography, and four-pixel gap.

Fresh signed-in Chromium captures measured the same geometry at all four
viewports:

| Viewport | Panel | Action target | Bottom clearance |
| --- | --- | --- | --- |
| 280x568 | 208x262 at `x=62, y=62` | 184x44 | 244px |
| 390x844 | 208x262 at `x=168, y=74` | 184x44 | 508px |
| 640x360 | 208x262 at `x=422, y=62` | 184x44 | 36px |
| 1440x900 | 208x262 at `x=1204, y=96` | 184x44 | 542px |

The panel does not scroll or overflow in these ordinary-identity cases. The
pink/dark-text pair measures about 5.06:1 and the neutral-surface/blue-text
pair about 5.71:1. Keyboard focus adds a visible four-pixel white ring and
four-pixel dark outline without clipping. Thus the defect is hierarchy, not
target size, text contrast, focus visibility, or reachability: routine exit
and deletion read as one equally prominent category.

The behavioral consequences are already different. Sign out closes the menu
and starts the session request immediately. Delete account opens a 358x480
modal at 390x844, explains the retained deletion marker and removed data,
requires a password, disables its final action until the password is present,
contains focus, supports Cancel and Escape, guards duplicate submission, and
returns focus to the Account trigger when dismissed.

Baseline screenshots are preserved under
`artifacts/ux-review/account-action-hierarchy/base/`. They are deterministic
rendered evidence, not caregiver comprehension, child-attention, physical-
device, or assistive-technology evidence.

## Evidence and limits

| Evidence | Product inference | Limit |
| --- | --- | --- |
| WCAG 2.2 requires a visible alternative when color conveys meaning, visible keyboard focus, logical focus order, and a safeguard before user-controlled stored data is irreversibly deleted. See [A11Y-17, A11Y-22, A11Y-23, A11Y-26, and A11Y-31](./source-register.md). | Preserve literal labels, DOM/visual order, shared focus, 44px targets, and the password-confirmed deletion step. Use spacing and staged consequence in addition to hue. | The cited Understanding documents are informative, and this review is not a whole-product conformance audit. WCAG does not prescribe Parrot's colors or exact menu order. |
| WAI-ARIA APG describes a menu button whose open popup owns focus as a composite: arrows move between items, while Tab/Shift+Tab close it and move out; menu items use scripted focus rather than the ordinary Tab sequence. Disclosure is the alternative when the popup is not a menu. See [A11Y-30](./source-register.md). | Preserve the current declared roles and working first/last/arrow/Home/End/Escape behavior on this visual branch, but do not call the pattern complete. Audit roving focus plus Tab exit/close against an honest disclosure alternative separately. | APG is informative rather than WCAG itself. Current native menu-item buttons remain tabbable, and direct target assistive-technology behavior is untested. |
| GOV.UK recommends **Sign out** for leaving an account, a non-warning initial deletion trigger, a warning treatment only at final confirmation, and context in addition to red. See [UX-07](./source-register.md). | Make Sign out neutral, keep the initial Delete entry restrained, and reserve the filled danger treatment for **Delete account now**. | Public-service guidance is neither a web standard nor a Parrot caregiver study. |
| Apple distinguishes normal and destructive roles, warns against making a destructive action primary, and recommends explicit result labels, confirmation, Cancel, pressed feedback, and a 44x44-point hit region. See [UX-08](./source-register.md). | Do not leave Delete as the menu's sole saturated row. Retain the literal deletion label and existing confirmation escape path. | Apple platform conventions are informative for this web UI; points do not establish CSS-pixel physical size, and Apple platform ordering does not decide an ARIA menu's order. |
| USWDS asks teams to consider another structure when destructive and non-destructive actions would otherwise be mixed in one button group because grouping can increase input mistakes. See [UX-09](./source-register.md). | Put the routine action before deletion and add a visible grouping break before the last destructive entry. | The source discusses button groups, not ARIA menus. Exact order and spacing remain a product inference. |
| W3C COGA favors clear visible labels, familiar control affordances, consistent design, and direct testing. See [A11Y-01, A11Y-02, and A11Y-18](./source-register.md). | Keep bold, filled, button-like rows and visible words; do not replace **Sign out** with an icon or make neutral mean faint. | COGA is supplemental guidance and does not prove that a weak-English caregiver or young child predicts either result. |

No authoritative source establishes whether **Sign out** or **Log out** is
universally clearer for second-language English speakers. Preserve the existing
literal label on this branch and compare it with a localized caregiver-language
label in future research instead of guessing from English alone.

The irreversible dialog has a clear title, warning, loss paragraph, password
step, Cancel, and named final action, but its initial focus is the password and
the warning copy is not currently its accessible description. Those safeguards
do not prove a screen-reader user perceives the consequence before entering
data or pressing Enter. A separate assistive-technology review must compare
initial focus on Cancel or concise static warning/title content, and test any
`aria-describedby` association for useful rather than overwhelming output.

## Real-code prototype comparison

Runtime style mutation was rejected by the in-app Browser's security boundary.
Three real-code prototypes were therefore rendered in isolated Git worktrees,
all stacked from `080dbbb`. They changed no production branch and introduced no
dependency.

| Candidate | Branch / commit | Result | Decision |
| --- | --- | --- | --- |
| B1: neutral Sign out only | `codex/prototype-account-neutral-signout` at `3427b6b` | Sign out looks enabled and routine, but Delete becomes the only saturated control and dominates first glance at every viewport. The original fused four-pixel gap remains. | Reject alone. It fixes false equivalence by creating a more concerning destructive primary. |
| B2: separated muted Delete | `codex/prototype-account-separated-delete` at `7581d5c` | Routine rows share the neutral surface. Sign out moves before Delete. An eight-pixel total break precedes a pale-rose/dark-red Delete row. The filled deep-rose treatment appears only on the enabled final confirmation. | Select provisionally. It conveys increasing consequence without a magnetic menu action. |
| B3: separated neutral Delete | `codex/prototype-account-neutral-delete` at `15fade6` | Order and spacing match B2, but Delete shares the routine background and differs mainly through red text and its words. | Reject in favor of B2. It is calm, but the subtle background cue in B2 adds a second visible distinction without approaching B1's dominance. |

B1, B2, and B3 retained 184x44 targets. B2 adds only four pixels to total
panel height because its eight-pixel Sign-out-to-Delete gap replaces a normal
four-pixel grid gap. At 640x360, its panel still retains about 32 pixels of
bottom clearance. Its final deep-rose/white confirmation measures about 4.67:1
for normal text. Complete prototype screenshots remain in
`artifacts/ux-review/account-action-hierarchy/prototypes/`.

Independent original-resolution review selected B2's hierarchy but noticed
that the complete keyboard focus paint exactly consumed its eight-pixel
break. A review-driven red contract therefore required twelve pixels. The
final implementation adds eight pixels of top margin to the ordinary four-
pixel grid gap, leaving four visible navy pixels between focused Sign out and
Delete. The panel is 208x270 and retains 28 pixels of bottom clearance at
640x360. This final refinement was recaptured at every target viewport.

These comparisons establish relative rendered hierarchy, not first-gaze eye
tracking, action prediction, or emotional response. Descriptions such as
“dominates” and “calm” are expert visual judgments to be tested with people.

## Selected design contract

1. Preserve the Account popup's existing declared roles, native buttons,
   visible labels, focus entry, arrow/Home/End behavior, and Escape return on
   this visual branch. Do not treat that preservation as proof of a complete
   APG composite-menu Tab pattern.
2. Keep **Learner profile** and **AI and saved data** first. Move routine
   **Sign out** before deletion and keep it on the existing neutral surface.
3. Put **Delete account** last in the DOM and visual order. Give it a twelve-
   pixel total break from Sign out plus a quiet pale-rose surface and dark-red
   text. Keep its full filled row, bold label, pressed state, and 44px target so
   “muted” cannot look disabled or become plain text.
4. Add the muted destructive treatment through the shared control primitive;
   do not duplicate the whole menu-control style in `AppHeader` or change
   global color tokens.
5. Keep deletion's existing warning, loss explanation, password requirement,
   disabled-until-complete state, duplicate guard, focus trap, Cancel, Escape,
   and focus return. Change only the enabled final action from the general
   bright brand treatment to the existing filled deep-rose treatment.
6. Preserve Sign out's immediate request, duplicate suppression, failure alert,
   names, and routes. Add no confirmation friction to routine exit.
7. Add no icon, explanatory sentence, sound, animation, timer, request,
   dependency, or child-facing content.

## Test-first acceptance contract

Playwright must locate controls by accessible role and name and inspect rendered
behavior, not Tailwind source or class strings.

1. A baseline-red contract requires the visual/DOM order **Learner profile**,
   **AI and saved data**, **Sign out**, **Delete account**.
2. Rendered Sign out chrome must equal the existing neutral account-action
   chrome and differ from Delete. Delete must use a distinct muted surface and
   text, and the gap before it must exceed the ordinary inter-row gap.
3. Sign out and Delete remain at least 44x44 CSS pixels at 280x568, 390x844,
   640x360, and 1440x900. The menu, expanded focus paint, trigger, and route
   header remain inside the viewport without horizontal overflow.
4. Arrow, Home, End, wrapping, Escape, and focus return follow the new DOM
   order. End reaches Delete; ArrowUp then reaches Sign out. Focus never moves
   automatically to Delete when the menu opens normally.
5. Sign out still performs direct session exit. Delete still opens the named
   password dialog, Cancel remains available, and the final action remains
   disabled until password entry.
6. The enabled final confirmation must render differently and more strongly
   than both the muted menu entry and Cancel while retaining at least 4.5:1
   normal-text contrast through rest, hover, active, and focus.
7. Normal and forced-colors keyboard focus remains visible on both menu actions;
   color override may erase authored hierarchy, but literal labels, order,
   spacing where retained, confirmation, and real outlines remain.
8. Existing short arbitrary-identity scrolling, failed-sign-out alert,
   account-label clearance, deletion, surrounding-route, shared focus, full
   unit, and full browser suites remain green.

## Timing, measurement, and rollback

The change adds no new request, event handler, timer, animation, or programmed
wait and does not alter post-activation authentication or deletion request
logic. Shared controls retain their existing interaction transitions. The
reviewed version changes panel geometry by eight CSS pixels and can still
change human finding and selection time.

A candidate-only 20-sample local Chromium two-`requestAnimationFrame`
settlement proxy at 390x844 measured a 13.8 ms median and 14.22 ms p95 for menu
opening, and a 12.6 ms median and 14.57 ms p95 for the deletion dialog. Without
a paired baseline, this is neither a paint timestamp nor evidence of equal
latency or field performance; see the visual manifest for method and limits.

The current sign-out flow closes the menu before its **Signing out…** label can
be seen. That separate response-feedback concern belongs in the next timing
branch; it must not be hidden inside this visual hierarchy change.

For the first formative comparison, recruit exactly eight caregivers and
screen for actual difficulty or comfort reading account-settings English;
record preferred language and English-as-an-additional-language status without
using EAL status as the weak-English proxy. Compare baseline and candidate
within participant, counterbalancing order four/four. Use synthetic resettable
accounts, identical unprimed tasks, narrow phones, and instructions in each
participant's preferred language so task misunderstanding is not mistaken for
label failure. Ask participants to leave an account and, in a separate reset
state, to remove the account and learning data. Define finding time from the
menu becoming fully visible to first selection. Record first selection,
predicted result, hesitation, completion, and whether any neutral row looks
disabled. Do not expose a child to an executable deletion task.

Revise or roll back if any rendered target shrinks, focus clips, the short menu
loses an action, Sign out looks unavailable, Delete again becomes the first-
gaze primary action, deletion loses its confirmation, or forced colors loses a
real indicator. The formative cutoffs are provisional product guardrails, not
validated population thresholds: revise if anyone chooses Delete for the sign-
out task, two or more of eight caregivers overlook Sign out or call it
disabled, or paired median sign-out finding time increases by more than two
seconds against baseline.

Remaining evidence includes weak-English caregiver comprehension, child
attention, localization and RTL, dialog-entry announcements, screen readers,
switch and voice control, Safari, Firefox, real Windows High Contrast palettes,
zoom/text spacing, and physical devices.
