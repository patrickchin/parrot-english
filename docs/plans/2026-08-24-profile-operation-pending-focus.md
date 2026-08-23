# Profile question operation feedback and focus implementation plan

Date: 2026-08-24

Branch: `codex/profile-operation-pending-focus`

Base: `8eb3149`

Research contract:
[`profile-operation-pending-focus-guidance.md`](../research/profile-operation-pending-focus-guidance.md)

## Goal

Give every active profile-question operation one truthful, stable, abortable
pending owner without duplicate work, lost focus, repeated feedback, or layout
shift.

## Task 1: create deterministic held-operation fixtures

Files:

- `src/testing/e2e-browser-mocks.ts`
- `tests/e2e/learner-profile-operation-feedback.spec.ts`

Steps:

1. Add a query-selected profile-operation controller for microphone permission,
   recorder completion, transcription, answer save, optional question skip,
   and question-screen **Skip for now**.
2. Expose exact request, abort, resolve/reject, and stopped-track counts plus
   one-at-a-time settlement methods.
3. Make each held fetch reject with `AbortError` when its signal aborts, while
   documenting that this only models client cancellation.
4. Keep the fixture isolated from ordinary profile and Lesson Player tests.
5. Prove fixture ownership before relying on any intermediate-state assertion.

## Task 2: encode the failing interaction contract

Files:

- `tests/e2e/learner-profile-operation-feedback.spec.ts`
- `tests/e2e/learner-profile-viewport-stability.spec.ts`
- `tests/learner-profile-ui.test.mjs`
- `tests/speech-recorder.test.mjs`

Checks:

1. Exact **Opening mic…**, **Listening…**, **Writing…**, **Thinking…**, and
   **Ready.** boundaries with one mounted status and one visible phrase.
2. Same focused node and unchanged accessible name for microphone, Next,
   optional Skip question, and question-screen Skip for now.
3. Native disabled non-owners and `aria-disabled` owner with inert pointer,
   Enter, Space, synthetic click, and form-submit behavior.
4. One request for twelve same-task activations and every mixed-action burst;
   no stranded pending UI.
5. Failure/retry without focus theft; destination heading focus after
   successful save/skip.
6. Abort and stale-settlement quarantine on question change, learner-route
   exit, and unmount, including exact late-stream stop behavior.
7. Recorder-start callback occurs only after actual `MediaRecorder.start()`.
8. Idle control names, native label relationship, forward/reverse Tab order,
   target size, and existing acknowledgment behavior remain unchanged.

Run the focused browser contract against `8eb3149` and record the expected red
focus, phase, duplicate, cleanup, and geometry failures before production
changes.

## Task 3: implement the operation boundary

Files:

- `src/media/speech-recorder.ts`
- `src/learner-profile/LearnerProfileGate.tsx`
- `src/learner-profile/LearnerProfileQuestion.tsx`
- `src/shared/ui.tsx` only if the shared text control needs the existing
  `aria-disabled` visual behavior

Steps:

1. Add a recorder-start callback at the point `MediaRecorder.start()` succeeds.
2. Add one learner-question operation ref that synchronously owns an action,
   phase, operation generation, and AbortController.
3. Reject every competing entry point while ownership exists.
4. Pass the signal through recording, transcription, answer save, question
   skip, and question-screen skip.
5. Abort and invalidate on active-question change, learner-route exit, and
   unmount without setting state after unmount.
6. Keep the owner focusable/inert with `aria-disabled`; native-disable every
   non-owner individually and leave the fieldset enabled.
7. Render one always-mounted label-line status and remove the full-width pending
   row and save-button copy change.
8. Clear **Ready.** when the learner edits or begins another operation.

## Task 4: verify responsive and timing invariants

At 280x568, 320x640, 390x844, 640x360, and 1440x900, measure idle plus every
pending phase:

1. card, prompt, answer label, textarea, microphone, footer actions, and main
   scroll range differ by no more than one CSS pixel;
2. focused owner and complete focus paint remain visible;
3. every child action retains at least a 44x44 CSS pixel target;
4. horizontal overflow remains zero;
5. exact pending state exists before the next measured animation-frame callback
   and within 100 ms locally; and
6. reduced motion retains the complete state and meaning with no new animation.

## Task 5: capture, review, and hand off evidence

Create:

- `artifacts/ux-review/profile-operation-pending-focus/manifest.md`;
- base and candidate 280x568 idle/opening/listening/writing/thinking images;
- base and candidate 320x640 writing/thinking images;
- base and candidate 640x360 idle/opening/listening/writing/thinking images;
- candidate 390x844 and 1440x900 representative pending images; and
- a separate timing/geometry table so screenshots are not asked to prove DOM,
  request-count, focus, or accessibility behavior.

Use only genuine in-app Browser captures for visual evidence. Record viewport,
route, state, provenance, bounding boxes, scroll range, SHA-256, and image
dimensions. Obtain independent code, accessibility, behavior, and
original-resolution visual review.

## Task 6: full verification

Run separately:

```sh
npm test
npm run test:browser
npm run build
npm run lint
git diff --check
```

Also verify every local Markdown link, every evidence file's type/dimensions/
hash, the branch diff from `8eb3149`, and a clean worktree. Write an
implementation evidence memo, update the research index/source register/
backlog, make reviewable commits, and then select the next stacked improvement.
