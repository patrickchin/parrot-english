# Separate profile answer labels implementation

Status: implemented and provisionally retained

Branch: `codex/profile-answer-separate-labels`

Base: `codex/profile-replay-account-clearance` documentation hand-off
`4e3f9b8`

Research commit: `828acc9`

Rendered contract commit: `b739796`

Implementation commit: `fbf7ef2`

Review date: 2026-08-24

## Outcome

The profile textarea now has one dedicated visible native label named exactly
**Your answer**. The microphone remains a separate native button named exactly
**Speak your answer**. Chromium no longer folds the microphone name into the
textbox name.

The production correction changes only two local element tags: the original
grid label becomes a neutral grid wrapper, and its visible text child becomes
the explicit label associated through the textarea's existing ID. The flex
row, classes, textarea, microphone, callbacks, fieldset, DOM/control order, and
all visible copy remain unchanged.

The result is visually identical at the measured viewports. It adds no text,
sound, state, request, timer, transition, dependency, route, persistence, or
transcription change.

## Reproduced baseline

At the stacked base, one `<label htmlFor={inputId}>` enclosed both its textarea
and the microphone button. Both are labelable elements. The browser exposed:

```text
textbox "Your answer Speak your answer"
button "Speak your answer"
```

An exact rendered lookup for a textbox named **Your answer** returned zero.
Existing substring lookups returned the polluted textbox and hid the defect.
The label still associated with the textarea and its visible words still
focused that field, but it contained two labelable descendants in violation of
the HTML label content model.

This establishes an HTML authoring-conformance defect and a reproducible
Chromium accessible-name problem. It does not, on its own, establish a failure
of WCAG 2.2 SC 1.3.1, 2.5.3, 3.3.2, or 4.1.2: the controls already exposed
roles and names, and the visible textarea words occurred at the start of the
polluted name. The evidence, source limits, rejected options, and exact
acceptance contract are in the [guidance memo](./profile-answer-separate-labels-guidance.md).

## Implemented boundary

`LearnerProfileQuestionView` now renders this semantic structure:

```text
neutral answer wrapper
├── label "Your answer" → textarea ID
└── existing flex row
    ├── textarea
    └── button "Speak your answer"
```

The dedicated label contains no labelable descendants. `textarea.labels` has
one item whose control is the textarea; the microphone has no associated HTML
labels and is outside every label. The native button remains `type="button"`.

The only intentional hit-area change is the blank eight-pixel space between
the textarea and microphone. It is no longer part of the textarea label area.
The visible **Your answer** text still focuses the textarea, and the two controls
retain their own complete targets.

## Test-first and interaction evidence

Before production changed, the new exact-name contract failed as intended:

```text
Locator: getByRole('textbox', { name: 'Your answer', exact: true })
Expected: 1
Received: 0
```

The rendered contract now requires:

- exactly one textbox named **Your answer** and zero with the combined name;
- exactly one button named **Speak your answer**;
- one explicit textarea label, zero labelable descendants in that label, and
  zero microphone labels;
- native `label.control` association and visible-label click focus;
- initial question-heading focus, then textarea → microphone forward traversal
  and the reverse local path;
- no microphone request from textarea pointer interaction;
- exactly one request from microphone click, Enter, and Space in isolated
  deterministic scenarios; and
- inherited native fieldset disabling for the textarea and microphone while
  **Listening…** is active.

Every profile textbox locator in the three affected browser suites now uses an
exact name, so responsive, delayed-art, acknowledgment, focus, and transition
coverage cannot silently accept the combined name again.

The focused semantic contract passed. Ten parallel repeats passed 10/10, and
the three directly affected Playwright files passed 54/54. The request counter
wraps the deterministic fixture's `getUserMedia`; each activation scenario
starts with a full navigation, so wrappers and counts do not stack between
Enter, Space, and pointer cases.

## Visual and timing evidence

This branch has no asynchronous feedback change to benchmark. It preserves the
existing native event and recording path. Its value is clearer programmatic
control identification, not faster microphone permission, transcription, or
saving.

Eight uncropped genuine in-app Browser JPEGs compare 280x568 and 640x360 base
and candidate states, then guard the candidate at 390x844 and 1440x900. The
[artifact manifest](../../artifacts/ux-review/profile-answer-separate-labels/manifest.md)
records provenance, exact dimensions, states, geometry, SHA-256, pixel-analysis
limits, accessibility snapshots, and evidence boundaries.

The answer row, textarea, microphone, visible label, neutral wrapper, and
control gaps have zero CSS-pixel branch delta at 280x568 and 640x360. An
independent DOM-only probe also found zero-pixel deltas at 360x640, 390x844,
and 1440x900. Horizontal overflow remains zero. The pre-existing 13px
short-landscape focus scroll and 113px 320x640 vertical flow remain unchanged.

Independent original-resolution review found no changed component pixels above
the raster threshold around the label, textarea frame, microphone, or actions.
The visible before/after pixel differences are limited to the floating Peppa
animation phase and blinking text caret.

## Automated evidence

| Check | Result |
| --- | --- |
| Focused semantic contract | 1/1 passed; 10/10 parallel repeats independently passed |
| Changed responsive/focus/acknowledgment Chromium set | 54/54 passed |
| Full component/lifecycle/integration/safety suite | 680/680 passed |
| Full Chromium suite | 293/293 passed |
| TypeScript and production build | Passed |
| Lint | 0 errors; 2 generated-worker warnings |
| Diff hygiene | Passed after review caught one terminal blank line |
| Research links | 636 local links across 96 Markdown files; 0 missing |
| Visual artifacts | 8/8 JPEG types, dimensions, and SHA-256 digests verified |

## Independent review decision

Three independent reviewers examined production scope, rendered semantics,
keyboard and pointer behavior, disabled behavior, original-size images, and
research claims. All three returned **RETAIN** with no production or test
defect.

Code review confirmed that the tag split is the smallest root fix and that the
counter cannot stack across the isolated activation scenarios. Accessibility
review confirmed exact names, native relationships, label activation, native
disabled behavior, and the memo's narrow conformance claims. Visual review
found no branch-induced layout, typography, density, focus-paint, or overflow
regression at the paired and guard sizes.

The reviews did produce two useful hand-off corrections:

1. a terminal blank line in the implementation plan made a base-to-HEAD
   `git diff --check` fail; the documentation hand-off removes it; and
2. disabling the fieldset while the microphone is focused still moves focus to
   `BODY`, just as saving can. This predates the branch and is not caused by the
   label split, but backlog item 24 now covers recording and transcription as
   well as saving.

Retain the branch provisionally. It fixes the reproduced invalid label and
combined Chromium name without inventing a layout or language redesign.

## Limits and next questions

The evidence is local deterministic Chromium in English left-to-right. It does
not establish Safari/Firefox behavior; exact VoiceOver, TalkBack, NVDA, or JAWS
speech; switch or voice-control operation; physical-device rendering or
microphone permission; safe-area, zoom, text-spacing, localization, or RTL
behavior.

Most importantly, separate valid labels do not prove that a young Pre-A1
learner understands **Your answer**, **Speak your answer**, or the microphone
symbol. Direct child/caregiver observation should compare the existing compact
icon action with one carefully tested visible-label alternative before adding
more English to the question.

The next high-value branch should address profile-operation feedback and focus
ownership. Recording, transcription, and saving all disable the active
fieldset; the microphone path can drop focus immediately, while saving can
also duplicate **Peppa is thinking…**. Research one stable pending owner,
focus-preserving non-duplicate activation, success/error hand-off, retry,
route-exit cleanup, and stale settlement across all three phases.
