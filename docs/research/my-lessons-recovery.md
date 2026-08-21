# My Lessons Error Recovery

Last reviewed: 2026-08-21  
Branch: `codex/my-lessons-recovery-copy`  
Status: implemented; final commit pending  
Audience: a grown-up managing saved lessons inside a child-first lesson shelf

## Decision

Every failure to fetch or understand the saved-lesson list should produce the
same small, public recovery state:

- message: **We couldn't load My Lessons.**
- action: **Try again**
- retrying status: **Loading My Lessons…**

Do not display a JavaScript exception, response body, HTTP label, parser error,
or internal error code. Keep the ready-made lesson shelf and **Make a lesson**
available. This is a failure of one optional section, not a failure of the whole
page.

## Observed problem

Before this change, `loadMyLessons()` trusted a successful JSON response to be
an object with a `lessons` array. The list component then exposed any caught
`Error.message` in the grown-up panel. During the integrated browser review, a
missing mock endpoint returned `null`, so the panel displayed `Cannot read
properties of null (reading 'lessons')`.

This joins two concerns that should stay separate:

1. Developers need a useful cause, status, and code for diagnosis.
2. A grown-up needs to know which content is unavailable and what to do next.

The visible message should solve the second need. The application boundary
should retain the first need without putting it in the DOM.

## Implemented change

- Successful list responses are checked as an object, an array, and a complete
  set of playable descriptors before React sees them. Lesson content uses the
  same visual catalog as the player; duplicate, dot-segment, and unencodable
  IDs are rejected before route construction.
- JSON parser causes are reduced to fixed diagnostic text, so a future logger
  cannot accidentally serialize a response-body excerpt. Typed error status,
  code, and sanitized cause remain testable without adding a telemetry vendor.
- The panel owns an explicit loading / ready / error / retrying state rather
  than treating an arbitrary exception message as interface copy.
- One mounted polite, atomic status announces every state. **Try again** stays
  focusable but `aria-disabled` while pending, repeated activation is ignored,
  failure re-enables it in place, and success moves focus to the stable
  **Grown-up tools** heading instead of the document body.
- The panel now stays stacked below the `sm` breakpoint. At 390 px the former
  row compressed its text column to 105 px and wrapped the heading across three
  lines; the revised composition keeps at least 200 px for status text and the
  heading within 32 px across the automated targets.
- The normal E2E mock now returns an empty My Lessons list. Malformed JSON,
  null, technical 5xx, network failure, failed retry, and populated recovery
  remain explicit test cases instead of being an accidental mock omission.

## Product hypothesis

If the panel names the unavailable section in one short sentence, offers one
literal retry action, and leaves the working lesson paths alone, a grown-up can
recover without mistaking a data-shape bug for lost lessons or a child mistake.

The wording is deliberately narrow:

- **My Lessons** matches the product concept and identifies the affected area.
- **couldn't load** describes the observable result without guessing whether
  the cause was the network, server, session, or response shape.
- **Try again** is a familiar action and does not promise that retry will work.
- The copy does not say the saved lessons are safe. A failed list request alone
  cannot prove that.

## Proposed behavior

| State | Visible copy | Action and announcement |
| --- | --- | --- |
| Initial request | **Loading My Lessons…** | Polite status; ready-made lessons remain usable. |
| Valid list, no saved lessons | **No made-for-you lessons yet.** | No retry. Keep **Make a lesson**. |
| Valid list with saved lessons | Existing lesson count and cards | No change. |
| Network, HTTP, JSON, or response-shape failure | **We couldn't load My Lessons.** | Show **Try again**. Do not move focus. |
| Retry in progress | **Loading My Lessons…** | Give painted feedback within 100 ms, keep focus on the unavailable **Try again**, prevent duplicate requests, and keep the control area visually stable. |
| Retry succeeds | Empty or populated success state above | Announce the resulting status politely, remove **Try again**, and move focus to the stable **Grown-up tools** heading rather than the document body. |
| Retry fails | **We couldn't load My Lessons.** | Re-enable the same focused **Try again**; do not add escalating copy. |

Use a stable `role="status"` region with atomic, polite announcements for this
sequence. WAI-ARIA reserves `alert` for important and usually time-sensitive
information; this optional subsection does not justify interrupting a screen
reader while the rest of the lesson page still works. The live region should
exist before its text changes. Retry must not move focus to the message. Its
control keeps focus while work is pending or fails; after success removes that
control, focus moves to the nearby **Grown-up tools** heading.

Visually, retain the existing muted grown-up card. Do not turn the whole shelf
red, open a modal, add character distress art, or rely on color alone. The
message, action label, and normal button affordance carry the meaning.

## Diagnostic boundary

Validate the successful response before the list reaches rendering code. Cover
at least the response object, the `lessons` array, and the descriptor fields the
shelf dereferences. A corrupt descriptor must fail the optional My Lessons
section rather than crash the route.

Normalize list failures to the fixed public copy in `LessonList`; retain a typed
internal error with a low-cardinality code such as `invalid_response` or the
existing HTTP code. Preserve a sanitized cause for local tests or an existing
diagnostic channel, but do not retain or log response-body snippets or lesson
content merely to support this state. This proposal does not require a new
telemetry vendor.

## Validation criteria

### Automated contract

- A `200` response containing `null`, `{}`, a non-array `lessons` value, or an
  invalid descriptor rejects with a typed internal error.
- Invalid JSON and representative `4xx` and `5xx` responses take the same public
  path, even when the server provides a technical `message`.
- The rendered panel contains exactly **We couldn't load My Lessons.** and a
  keyboard-operable **Try again** button; it contains no supplied server text,
  JavaScript exception, status number, or internal code.
- Ready-made lesson links and **Make a lesson** remain present during the
  failure.
- One retry activation starts one request, produces visible feedback within
  100 ms, and cannot be multiplied by repeated activation while pending.
- Retry success covers both an empty list and a populated list. Retry failure
  returns to the same recovery state.
- The live region is present before asynchronous text updates and uses polite,
  atomic status semantics. Pending and failed retries preserve button focus;
  success uses the stable grown-up heading instead of dropping focus to the
  document body.

### Responsive and manual review

- Review the scrolled grown-up panel at 280×568, 390×844, and 640×360. The
  message, retry control, and create action must not overlap, clip, or create
  horizontal page overflow.
- Test at 200% zoom and with increased text spacing.
- Spot-check the sequence with VoiceOver and one additional screen-reader/browser
  combination when available: loading, failure, retrying, and success should
  each be understandable without moving focus to the status.
- Hold the request pending for at least three seconds. The page must show a
  stable loading state rather than appearing frozen, and the ready-made shelf
  must remain operable.

### Audience check

In a later caregiver usability session, ask the participant what failed, what
they would do next, and whether they think the child's lessons were deleted.
The hypothesis passes only if the copy is understood without facilitator
explanation. This memo does not claim that standards guidance proves
Parrot-specific comprehension.

## Rejected alternatives

- **Expose `caughtError.message`.** It leaks implementation detail, makes copy
  depend on failure source, and could render untrusted server text.
- **Check your internet and try again.** The client has not established that
  the internet is the cause, so this can blame the user's setup incorrectly.
- **Something went wrong.** Calm but too vague; it does not identify the broken
  subsection.
- **Your lessons are safe.** Reassuring but unsupported by a failed read.
- **No made-for-you lessons yet.** This turns an unknown state into a false empty
  state and removes recovery.
- **A modal or full-page error.** It blocks ready-made lessons that still work.
- **Assertive `role="alert"`.** The saved shelf is not urgent enough to
  interrupt other speech; a polite status still makes the dynamic result
  programmatically determinable.
- **Automatic retry as the only recovery.** It hides agency, can prolong a
  spinner, and can amplify an outage. A future bounded background retry can be
  evaluated separately if field evidence supports it.
- **A large red warning or humorous character apology.** Both overstate a
  recoverable grown-up-tools failure and compete with the child lesson shelf.

## Visual evidence

- [Recovery at 280×568](../../artifacts/ux-review/my-lessons-recovery/recovery-280x568.jpg)
- [Recovery at 390×844](../../artifacts/ux-review/my-lessons-recovery/recovery-390x844.jpg)
- [Recovery at 640×360](../../artifacts/ux-review/my-lessons-recovery/recovery-640x360.jpg)
- [Pending retry at 390×844](../../artifacts/ux-review/my-lessons-recovery/retrying-390x844.jpg)

The three failure captures preserve the final ready-made lesson as context,
then keep the quiet grown-up panel and both actions fully visible. The pending
capture has the same panel height and hierarchy; only the status and retry
availability change.

## Validation results

- All 626 unit, lifecycle, safety, language, route, response-contract, and asset
  tests pass.
- All 163 Chromium tests pass with four workers, including three responsive
  malformed-response cases and one network → failed retry → populated success
  sequence.
- The in-page click-to-status measurement stays below the 100 ms immediate
  feedback threshold at 280×568, 390×844, and 640×360. The pending request is
  held so the loading state, focus, duplicate suppression, and geometry can be
  tested independently of response speed.
- Production type-check and build pass across 1,886 modules. Lint passes with
  zero errors and the two existing generated-file warnings.
- Two independent final reviews found no remaining API, privacy, focus, or
  responsive-layout defect after route-ID, sanitized-cause, focus, and retry
  coverage corrections.

Direct VoiceOver/additional-screen-reader observation, 200% zoom, increased
text spacing, and caregiver comprehension remain follow-up work; automated
semantics and geometry are evidence, not a claim that the copy has been
understood by caregivers.

## Sources

- `A11Y-01` — W3C WAI, [Use Clear Words](https://www.w3.org/WAI/WCAG2/supplemental/patterns/o3p01-clear-words/),
  supplemental cognitive-accessibility pattern, first published 2021, UI 2022,
  accessed 2026-08-21. Supports common, literal words in error messages; it is
  not a WCAG conformance criterion.
- `A11Y-03` — W3C WAI, [Provide Feedback](https://www.w3.org/WAI/WCAG2/supplemental/patterns/o4p10-status-feedback/),
  supplemental cognitive-accessibility pattern, first published 2021, UI 2022,
  accessed 2026-08-21. Supports rapid, visible, programmatically determinable
  feedback for success and failure.
- `A11Y-07` — W3C, [WAI-ARIA 1.2: `alert` and `status`](https://www.w3.org/TR/wai-aria/#alert),
  Recommendation 2023, accessed 2026-08-21. Distinguishes assertive,
  time-sensitive alerts from polite advisory status updates.
- `A11Y-08` — W3C WAI, [ARIA22: Using `role=status` to present status messages](https://www.w3.org/WAI/WCAG22/Techniques/aria/ARIA22),
  updated 2026-01-12, accessed 2026-08-21. Supports a pre-existing polite,
  atomic live region for dynamic application status. Techniques are sufficient
  examples, not the only route to WCAG conformance.
- `UX-01` — GOV.UK Design System, [There is a problem with the service pages](https://design-system.service.gov.uk/patterns/problem-with-the-service-pages/),
  accessed 2026-08-21. Supports concise non-technical copy, a useful next step,
  preservation of entered state, and avoiding labels such as `500` or `bad
  request`. Its whole-service pattern is adapted here to a non-blocking panel.
- `UX-02` — GOV.UK Service Manual, [Writing for user interfaces](https://www.gov.uk/service-manual/design/writing-for-user-interfaces),
  accessed 2026-08-21. Supports short, direct, non-humorous failure copy and not
  relying on color or position alone.

## Open questions

- Does **My Lessons** match the name caregivers use, or do they call these
  “made-for-you lessons” after seeing the shelf?
- Should **Make a lesson** remain enabled during a confirmed My Lessons service
  outage, or only during an unknown list failure? The current failure provides
  no reliable outage classification.
- Is there a privacy-safe existing diagnostic channel where the internal code
  is useful, or are typed errors and test evidence sufficient for now?
- Which real screen-reader/browser pairs reliably announce repeated status text
  after loading changes back to the same failure message?
