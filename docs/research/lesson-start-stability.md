# Lesson Start State Stability

Last reviewed: 2026-08-21  
Status: implemented on `codex/lesson-start-stability`  
Implementation commit: `783da0f`
Audience: young learners starting a ready-made or generated lesson

## Question and scope

Can the first tap on **Start lesson** always enter the activity without losing
the tap, shifting to an unrelated loading screen, repeating the lesson request,
or returning the learner to the introduction?

This memo covers the observed React loading boundary, the bundle trade-off, the
single-action regression test, and adjacent browser-test findings. It does not
claim a field-performance improvement; no real-user Core Web Vitals or network
distribution was available.

## Observed problem

During the 280×568 personalized-story-art browser review, a generated lesson
loaded to its introduction and focused **Start lesson**. The first tap then:

1. removed the complete lesson screen;
2. showed the route-level **Loading…** placeholder;
3. issued the same My Lesson API request again; and
4. returned to the introduction instead of entering the learner turn.

A second tap worked because the lesson-player presentation chunk had finished
loading by then. This made success depend on an invisible warm-cache state. For
a young learner, the visible result of the first action was “nothing happened”
plus a large content shift.

The browser trace and a request counter in the regression test established the
repeated mount/fetch. The issue was especially easy to see on a personalized
lesson whose first step was the learner's turn, but the loading boundary applied
to every lesson-player presentation component.

## Root cause

`ApplicationRoutes` has one `Suspense` boundary around the complete `Routes`
tree. `LessonPlayer` was mounted below it, while each named export from
`LessonPlayerUi.tsx` was wrapped in its own `lazy()` component. The first state
transition from the already visible introduction to a not-yet-loaded player
panel suspended inside that route-wide boundary. The fallback replaced the
whole route subtree, including the component that owned lesson and request
state.

This matches the current React documentation: a lazy component suspends while
its code loads, the closest Suspense boundary renders its fallback, and React
does not preserve state for a tree that suspends before completing its initial
mount. See React's official [`<Suspense>` reference](https://react.dev/reference/react/Suspense)
and [`lazy` reference](https://react.dev/reference/react/lazy), accessed
2026-08-21. The exact repeated fetch and lost action are repository-specific
observations, not claims made by those documents. See [TECH-01 and
TECH-02](./source-register.md) for the durable source notes and limits.

## Decision implemented

Import the small, core lesson-player presentation module statically from
`App.tsx`:

- stage and full-scene frame;
- introduction and completion;
- HUD, characters, speech, learner prompt, and feedback;
- speaking/playback controls; and
- the lesson error banner.

Lesson creation, editing, story shelves, story reading, personalized-art setup,
and LiveKit conversation code remain split into deferred chunks. This puts the
state-preserving lesson frame in the core application bundle while retaining
larger route-level code splitting.

The production build changed as follows:

| Output | Before | After | Difference |
| --- | ---: | ---: | ---: |
| Core JS, raw | 462.16 kB | 474.58 kB | +12.42 kB |
| Core JS, gzip | 140.42 kB | 143.46 kB | +3.04 kB |
| Deferred `LessonPlayerUi` chunk | 13.00 kB / 3.84 kB gzip | removed | folded into core |

The lesson route's combined JavaScript is slightly smaller because it no
longer carries a separate chunk wrapper. The home route pays about 3.04 kB
gzip. That is an explicit trade: a small predictable transfer is preferable to
discarding a child's primary action and refetching the activity.

## Alternatives rejected

- **Ask the child to tap again:** rejected because the interface gave no reason
  to believe the first action was discarded.
- **Add a test-only wait or prefetch:** rejected because it would hide the
  cold-chunk behavior instead of protecting state.
- **Keep the route-wide fallback and show a better spinner:** rejected because
  clearer copy would not prevent unmounting, refetching, or action loss.
- **Add a separate Suspense boundary around every lesson panel:** deferred. It
  could preserve the route owner, but switching between blank/skeleton panels
  during a fast lesson adds repeated content shifts and substantially more
  boundary-state complexity for only about 3.04 kB gzip saved on the core
  route.
- **Make every feature eager:** rejected. The observed defect was in the core
  lesson interaction; creator, editor, story, and voice-chat bundles retain
  their existing lazy boundaries.

## Regression contract

The personalized speaking-turn browser test now:

1. serves a generated My Lesson through a counted route mock;
2. waits for the naturally focused **Start lesson** button;
3. records the request count;
4. clicks once, with no retry and no test-only delay;
5. requires the learner prompt, speaking controls, and saved portrait to fit a
   280×568 viewport; and
6. requires the My Lesson request count to remain unchanged.

The architecture test also prevents reintroducing the named lazy-wrapper
factory for `LessonPlayerUi`.

## Validation findings beyond the root cause

Running the broader browser suite exposed three stale or inaccessible test/UI
contracts. They were corrected while preserving behavior-based locators:

- the grown-up chat-style label no longer includes its help paragraph in the
  accessible name;
- choosing a chat style closes the floating panel, returns focus to its visible
  disclosure, and shows the current choice, so the panel cannot cover **Talk to
  Peppa**; and
- transcript and lesson-feedback tests now follow the semantic transition from
  live words to a final answer and from feedback to the next scene, instead of
  requiring an obsolete DOM node or an artificial intermediate delay.

These findings do not change the lesson-start hypothesis, but recording them
explains why the branch touches adjacent accessible browser tests.

## Visual evidence

The manual in-app browser check used a cold generated-lesson route at 280×568.
One click reached the active learner turn; the portrait, prompt, and controls
remained inside the viewport, and the browser console had no errors.

- [`first-tap-active-280x568.jpg`](../../artifacts/ux-review/lesson-start-stability/first-tap-active-280x568.jpg)

Final branch validation:

- 610 unit and mounted-lifecycle tests passed;
- 109 Chromium browser tests passed with four workers in 35.9 seconds;
- the TypeScript and production Vite build passed; and
- lint reported zero errors and the two pre-existing unused-disable warnings in
  generated `worker-configuration.d.ts`.

## Measurement and rollback guardrails

Retain the eager lesson frame while all of these remain true:

- one Start action always enters the activity;
- no duplicate lesson request occurs at that transition;
- the core gzip increase stays near the measured 3 kB rather than growing with
  editor, media, or conversation dependencies; and
- home/start responsiveness does not regress in field data.

Revisit the boundary if representative low-end devices or field navigation
data show a meaningful home-route regression. If code splitting is restored,
the replacement must keep the lesson owner mounted, preserve the action, avoid
duplicate requests, and provide a stable child-facing intermediate state.

## Open questions

- What are p50/p95 Start-to-visible-turn times on representative low-end Android
  devices and constrained networks?
- Should the static lesson list prefetch the core lesson route after idle, or is
  the current eager frame already sufficient?
- Which remaining lazy route boundaries can replace an entire user-owned state
  tree after an action?
- Can navigation tests simulate a truly cold production chunk without coupling
  to generated filenames?
