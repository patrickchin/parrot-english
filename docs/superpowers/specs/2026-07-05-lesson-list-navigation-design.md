# Lesson List Navigation Design

## Summary

Parrot English will open on a lesson list instead of entering the current
lesson immediately. The list will contain the current garden/helping lesson as
the only playable item and three disabled example lessons marked as coming
soon. A separate back-to-list control inside the lesson will return to the
catalog and reset lesson progress.

This change is intentionally limited to in-app screen state. It will not add a
routing dependency, URL-based routes, persistence, new lesson scripts, or new
audio assets.

## Goals

- Make the lesson list the first screen a learner sees.
- Let the learner open the existing five-scene lesson from a clear lesson card.
- Show several disabled lesson cards to demonstrate how the catalog can grow.
- Provide an obvious way to return from the lesson to the list.
- Restart the lesson from scene 1 every time it is reopened.
- Preserve the existing lesson state machine, audio, recording, and scene
  navigation behavior.

## Architecture

### App-level screen state

A new `App` component will own a small screen state with two possible values:
the lesson list and the active lesson. The lesson list is the initial state.
Selecting the enabled lesson changes the screen state and mounts
`LessonPlayer`. Selecting Back changes the screen state to the list and
unmounts `LessonPlayer`.

Unmounting the player discards its reducer state. Reopening the lesson creates
a new player instance through the existing `createInitialLessonState` path, so
the lesson begins at scene 1 without adding reset-specific coordination.

### Component boundaries

- `App` owns top-level navigation between the catalog and player.
- `LessonList` renders catalog content and reports an enabled lesson selection.
- `LessonPlayer` retains all existing speaking-flow responsibilities and gains
  only an `onBack` callback for returning to the catalog.
- Lesson catalog metadata is separate from `LESSON_STEPS`, because card-level
  information and scene-level lesson scripts serve different purposes.

The implementation may keep these small components in the existing frontend
module or extract focused modules if that is clearer while preserving a small
diff.

## Lesson Catalog

The catalog will include four cards:

1. The current garden/helping lesson, enabled and playable.
2. A disabled example lesson marked `即将开放`.
3. A second disabled example lesson marked `即将开放`.
4. A third disabled example lesson marked `即将开放`.

Catalog metadata will include a stable identifier, Chinese title, short
description, availability, and display details such as scene count or topic.
Only the current lesson identifier is accepted by the initial selection
handler. Disabled entries will not trigger navigation.

The example lesson names and descriptions are presentational previews only.
They do not require scripts, audio, scoring data, or placeholder lesson-player
states.

## User Interface

### Lesson list

The list uses the existing bright, rounded, child-friendly visual language. It
will include:

- A prominent `选择课程` heading.
- A responsive card grid that works on desktop and narrow screens.
- One colorful enabled card for the current lesson.
- A large `开始课程` action on the enabled card.
- Three visually muted disabled cards with `即将开放` labels.

Each card must remain readable without relying on color alone. The enabled
lesson uses a real interactive button or equivalent accessible control. The
coming-soon actions use native disabled controls so they cannot be activated by
pointer or keyboard and expose their disabled state to assistive technology.

### Lesson back control

The player will add a labeled `课程列表` control near the top-left of the
lesson stage. It is separate from the existing bottom-left previous-scene arrow
and uses a distinct accessible label. The scene title may shift horizontally as
needed to keep both top controls legible without overlap.

Selecting `课程列表` immediately returns to the lesson list. No confirmation
dialog and no progress preservation are required.

## Data and State Flow

1. `App` renders `LessonList` on first load.
2. The user activates the enabled lesson card.
3. `App` records the active screen and renders a fresh `LessonPlayer`.
4. The existing lesson reducer controls all scene and speaking states.
5. The user activates `课程列表`.
6. `App` renders `LessonList`, unmounting the player.
7. Reopening the lesson mounts a fresh player at scene 1.

Disabled lesson cards never change app state.

## Accessibility and Responsive Behavior

- The lesson list has a descriptive main heading and a clear catalog label.
- Card controls expose descriptive names rather than depending on artwork.
- Disabled lessons use the native disabled state and visible coming-soon copy.
- Focus indicators match the strong focus treatment already used in the
  lesson player.
- Touch targets remain large enough for young learners and accompanying adults.
- The card grid collapses cleanly for phones without horizontal scrolling.
- The new lesson back control has visible text so it cannot be confused with
  the previous-scene arrow.

## Error Handling

No network or data-loading path is introduced. The catalog is static local
metadata. Selection logic ignores unavailable or unknown lesson identifiers,
leaving the user on the list rather than rendering an invalid player state.

Existing microphone, speech-evaluation, and audio-playback errors remain owned
by `LessonPlayer` and are unchanged.

## Testing and Verification

Implementation will follow test-driven development:

1. Add a focused failing test for catalog availability and disabled selection.
2. Add a focused failing navigation contract test for list-first rendering,
   opening the enabled lesson, and returning through the back callback.
3. Implement the minimum catalog and app navigation needed to pass.
4. Confirm that remounting continues to use the existing initial lesson state,
   which starts at scene 1.
5. Run the focused tests, the full unit suite, lint, and the production build.

The change is complete when the app opens on the lesson list, only the current
lesson can be opened, Back returns to the list, and reopening starts at scene 1
without regressions in the existing lesson flow.
