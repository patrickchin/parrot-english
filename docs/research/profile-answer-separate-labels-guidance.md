# Separate profile answer labels guidance

Last reviewed: 2026-08-24

Branch: `codex/profile-answer-separate-labels`

Base: `codex/profile-replay-account-clearance` documentation hand-off at
`4e3f9b8`

Status: researched implementation contract; it does not claim an implemented
result, WCAG conformance, exact assistive-technology speech, or child
comprehension

## Question and boundary

How should the profile question give its answer box and microphone separate,
short programmatic names without moving the visible field or changing the
learner's interaction?

The current explicit `<label>` contains both the `<textarea>` it names and the
microphone `<button>`. Chromium therefore exposes the text box as **Your answer
Speak your answer**, even though the microphone also remains a separate button
named **Speak your answer**. A child or assistive-technology user can encounter
the microphone phrase twice when reaching the two controls.

This branch is deliberately semantic and visually conservative. It may change
the local field wrapper and rendered behavior tests. It must not change visible
copy, question order, transcription, saved audio, persistence, timing, routes,
art, target sizes, responsive spacing, status messages, or dependencies.

## Reproduced baseline

The production-copy deterministic profile fixture was inspected at the stacked
base `4e3f9b8` in Chromium 149.0.7827.55 through Playwright 1.61.1 and the
genuine in-app Browser.

- The browser accessibility snapshot contains a textbox named **Your answer
  Speak your answer** followed by a button named **Speak your answer**.
- An exact textbox lookup for **Your answer** resolves zero elements. Existing
  substring locators resolve one and therefore conceal the defect.
- `label.control` points to the textarea and `textarea.labels.length` is one,
  but the same label contains two labelable descendants: the textarea and
  button.
- Clicking the visible **Your answer** text focuses the textarea. Native focus
  order after the programmatically focused heading is textarea, microphone,
  **Skip for now**, then **Next**. Replay remains reachable immediately before
  the textarea with reverse traversal.
- The disabled fieldset still disables both answer controls while recording,
  transcribing, or saving.

The markup violates the HTML label content model: a label may not contain a
labelable descendant other than its own labeled control, and both `textarea`
and `button` are labelable elements. The polluted Chromium name is a separately
observed consequence. This is a definite HTML authoring-conformance and product
quality defect.

It is not, by itself, a demonstrated failure of WCAG 2.2 SC 1.3.1, 2.5.3,
3.3.2, or 4.1.2. Both controls currently expose names and roles; the visible
textarea words remain at the beginning of its computed name. This memo does not
inflate a narrower browser defect into a page-level conformance claim.

## Baseline visual geometry

Independent browser review found no visual composition problem to redesign.
The textarea and fixed-width microphone form a clear row with an eight-pixel
horizontal gap. Short viewports use the existing four-pixel visible-label gap;
ordinary viewports use eight pixels.

| Viewport | Combined row | Textarea | Microphone | Existing vertical flow |
| --- | --- | --- | --- | --- |
| 280x568 | x=30, y=391.25, 220x80 | 160x80 | x=198, 52x80 | No overflow |
| 320x640 | x=42, y=444.5, 236x130 | 176x130 | x=226, 52x130 | 113px main scroll |
| 390x844 | x=42, y=489.5, 306x130 | 246x130 | x=296, 52x130 | No overflow |
| 640x360 | x=158, y=211, 420x80 | 360x80 | x=526, 52x80 | 13px main scroll |
| 1440x900 | x=428, y=469, 584x130 | 524x130 | x=960, 52x130 | No overflow |

The 320px and short-landscape vertical scroll extents predate this branch.
Ordinary vertical scrolling remains acceptable for this bounded fix; no state
has horizontal overflow.

## What authoritative sources support

| Topic | Supported claim | Parrot implication | Limit |
| --- | --- | --- | --- |
| Valid label content | The WHATWG HTML label content model permits no labelable descendant except the label's own labeled control. `button` and `textarea` are labelable. See [A11Y-27](./source-register.md). | Do not place the microphone button inside the textarea's label. | HTML conformance does not predict the exact output of every accessibility API or screen reader. |
| Native association | A label can explicitly associate with a control through `for` and the matching control ID. Clicking a properly associated visible label can focus or activate its control. See [A11Y-27](./source-register.md). | Keep one dedicated native `<label htmlFor={inputId}>` for the textarea and retain the existing click benefit. | User-agent behavior for additional interactive descendants is why those descendants should not be inside the label. |
| Concise names | W3C APG guidance recommends short names that identify purpose and distinguish controls, and recommends visible/native labeling when possible. Accessible-name computation recursively includes relevant label content. See [A11Y-27](./source-register.md). | Expose exactly **Your answer** for the textarea and **Speak your answer** for the button. | APG guidance is informative; a short English label is not proof that a Pre-A1 child understands it. |
| Label in Name | WCAG 2.2 requires a control's accessible name to contain its visible label text. See [A11Y-24](./source-register.md). | Keep the visible words as the textarea's complete name rather than adding a different ARIA-only name. | The current polluted name already contains **Your answer**, so this criterion alone does not establish the current defect. |
| Keyboard behavior | Native buttons are expected to activate with Enter and Space, and meaningful sequential focus should follow the page's logical control order. | Preserve heading, textarea, microphone, and following-action traversal; keep the microphone a native button. | Browser automation verifies Chromium behavior, not every input device, browser, or assistive technology. |

Primary pages checked for this decision, accessed 2026-08-24:

- WHATWG, [the `label` element](https://html.spec.whatwg.org/multipage/forms.html#the-label-element) and [labelable elements](https://html.spec.whatwg.org/multipage/forms.html#category-label), HTML Living Standard;
- W3C, [Accessible Name and Description Computation 1.2](https://www.w3.org/TR/accname-1.2/#computation-steps), Working Draft;
- W3C WAI, [Labeling Controls](https://www.w3.org/WAI/tutorials/forms/labels/) and [Technique H44](https://www.w3.org/WAI/WCAG22/Techniques/html/H44), informative guidance;
- W3C WAI-ARIA APG, [Names and Descriptions](https://www.w3.org/WAI/ARIA/apg/practices/names-and-descriptions/) and [Button Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/button/); and
- W3C, [WCAG 2.2](https://www.w3.org/TR/WCAG22/) and [Understanding Label in Name](https://www.w3.org/WAI/WCAG22/Understanding/label-in-name).

## Options considered

### 1. Neutral wrapper plus a dedicated native label — selected

Change the current outer label to a neutral wrapper with the same grid classes.
Change its first text child to `<label htmlFor={inputId}>Your answer</label>`.
Leave the existing flex row, textarea, microphone button, IDs, classes, and DOM
order untouched.

This is the smallest root correction. A browser-only tag-swap probe produced
the exact independent names, preserved visible-label click focus and native Tab
order, and changed the wrapper, label, row, textarea, and microphone bounding
boxes by a maximum of zero pixels at 280x568, 360x640, 390x844, 640x360, and
1440x900.

One interaction intentionally narrows: blank gap pixels between the textarea
and microphone stop being part of the textarea label hit area. The visible
**Your answer** text remains the label target, and each control keeps its own
full target.

### 2. Add an ARIA label while retaining the nesting — rejected

An `aria-label="Your answer"` could mask Chromium's computed name, but it would
leave invalid HTML and two labelable controls inside one label. It would also
duplicate a native label relationship without addressing the cause.

### 3. Remove the explicit label and name a group — rejected

A named group would describe the pair but would not give the textarea its own
native visible label. It could introduce extra announcement and a new grouping
concept without helping a young learner distinguish typing from speaking.

### 4. Add visible microphone copy — deferred

A text label could improve icon comprehension for some learners, but it changes
layout and language density and needs direct child/caregiver evidence. The
current branch only makes existing semantics truthful and separate.

## Exact acceptance contract

### Semantics and interaction

1. The textarea has exactly one explicit HTML label whose visible and computed
   name is exactly **Your answer**.
2. The microphone is not inside that label, has no associated HTML label, and
   remains a native `button type="button"` named exactly **Speak your answer**.
3. No textbox is exposed as **Your answer Speak your answer** or otherwise
   contains the microphone name.
4. Clicking the visible **Your answer** label focuses the textarea. Clicking or
   typing in the textarea does not start transcription. Clicking the microphone
   starts transcription once without activating the textarea.
5. Initial programmatic focus stays on the question heading. Tab reaches the
   textarea, then microphone, then the existing following actions; Shift+Tab
   reverses that local sequence. Replay remains before the textarea.
6. Enter and Space on the focused microphone each initiate one transcription
   attempt in deterministic isolated scenarios.
7. During recording, transcription, and saving, the existing fieldset disables
   both native controls, removes them from sequential focus, and prevents
   activation. Status ownership and text do not change in this branch.

### Visual and responsive stability

1. Visible copy, typography, wrapper/row spacing, textarea, microphone, and
   action order remain unchanged.
2. Wrapper, label, row, textarea, and microphone geometry changes by no more
   than one CSS pixel at 280x568, 320x640, 360x640, 390x844, 640x360, and
   1440x900.
3. The microphone keeps its current 52px width and at least 44px target height;
   the answer row keeps its eight-pixel control gap and four/eight-pixel
   viewport-dependent label gap.
4. No state gains horizontal overflow. Existing 320px and 640x360 vertical
   scroll ranges are not increased by the semantic tag change.
5. Existing focus paint, forced-colors behavior, delayed-art stability, account
   clearance, and question/action containment continue to pass rendered tests.

## Evidence and measurement plan

- First make exact-name and native-association assertions fail against the
  current markup. Substring locators are not evidence for this defect.
- Verify the tag-only correction in rendered Chromium, including label click,
  forward/reverse keyboard order, pointer/keyboard microphone activation, and
  disabled-fieldset behavior.
- Re-run the existing responsive and focus suites with exact textbox locators.
- Compare measured boxes with the recorded baseline and capture genuine in-app
  Browser evidence at 280x568 and 640x360, plus regular-phone and desktop
  guards. Screenshots support visual stability only; the accessibility snapshot
  and behavior tests support programmatic exposure.
- Request independent code, accessibility, and original-resolution visual
  review before retaining the branch.

## Remaining questions

- Do target VoiceOver, TalkBack, NVDA, and JAWS combinations speak both names
  concisely and preserve a useful local sequence?
- Do Pre-A1 learners understand **Your answer**, **Speak your answer**, and the
  microphone symbol, or would picture/audio-supported directions work better?
- Should the microphone eventually gain a visible action label at the cost of
  more compact-layout density?
- Should the pre-existing 113px vertical flow at 320x640 be reduced after
  direct task-discovery testing?
