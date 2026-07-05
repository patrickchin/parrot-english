# Lesson List Navigation Design

## Summary

Parrot English opens on a lesson list after authentication instead of mounting
the lesson player immediately. Every validated JSON lesson discovered by Vite
is playable. Three static preview cards demonstrate upcoming lessons and use
native disabled controls. A separate Back to lessons control inside the player
returns to the catalog and discards the active lesson state, so reopening a
lesson starts at scene 1.

This design preserves the current scene-script architecture, authentication
gate, playback dock, hold-to-talk behavior, and automatic lesson discovery. It
does not add a router, duplicate JSON lesson metadata, or change lesson audio.

## Goals

- Make the lesson catalog the first authenticated screen.
- Render discovered JSON lessons as playable cards without hard-coded IDs.
- Show three clearly disabled upcoming-lesson examples.
- Keep Back to lessons distinct from the playback dock's Previous scene action.
- Reset lesson progress when leaving and reopening a lesson.
- Preserve authentication, scene playback, speech recording, and evaluation.

## Architecture

`App` continues to own `AuthGate`. Inside the gate, `LessonExperience` owns a
small navigation reducer whose state is either the catalog (`activeLessonId` is
`null`) or a discovered lesson ID. Unknown IDs are ignored.

`LessonList` reads available entries from the existing `LESSONS` Vite catalog
and resolves each card image through `VISUAL_CATALOG`. Upcoming previews are
presentational metadata only and do not create JSON scripts, audio, or player
states.

`LessonPlayer` receives the selected validated lesson and an `onBack` callback.
It no longer owns the lesson-picker `<select>`. Returning to the list unmounts
the player, which cancels active playback/recording through the existing effect
cleanup. Reopening mounts a fresh player reducer at scene 1.

## User Interface

The English lesson list uses the current bright, rounded visual language:

- heading: `Choose a lesson`;
- one card per discovered playable lesson;
- three muted cards with `Coming soon` badges and disabled buttons;
- story title, summary, scene count, and background artwork;
- a responsive two-column grid that becomes one column on narrow screens.

The authenticated session bar remains available above the list. The list owns
its vertical scrolling because the application body remains fixed for the
full-screen player.

Inside the player, a labeled `Back to lessons` button occupies the top-center
space previously used by the lesson-picker select. The bottom playback dock
continues to own Previous scene, Play/Pause, and Next scene.

## State Flow

1. `AuthGate` resolves the current session.
2. `LessonExperience` starts with `activeLessonId: null` and renders the list.
3. An enabled card dispatches `OPEN_LESSON` with a discovered lesson ID.
4. The selected lesson mounts in a fresh `LessonPlayer`.
5. `Back to lessons` dispatches `BACK_TO_LIST` and unmounts the player.
6. Reopening any lesson mounts fresh state at scene 1.

Disabled cards never dispatch navigation events. Unknown IDs leave navigation
state unchanged.

## Accessibility and Responsive Behavior

- The list has one descriptive `h1` and an `aria-label` on the card region.
- Playable cards use enabled buttons with lesson-specific accessible names.
- Preview cards use native disabled buttons and visible `Coming soon` copy.
- All controls retain the project's strong focus-visible treatment.
- The list has no horizontal overflow and scrolls vertically on short screens.
- Back to lessons has visible text and a distinct accessible label.
- Player controls remain large and do not overlap the auth/session surfaces.

## Error Handling

The list consumes only lessons that have already passed the existing startup
validation. If navigation receives an unavailable ID, the reducer returns its
existing state. If a selected lesson disappears after a catalog change, the
experience falls back to the list.

Existing microphone, evaluation, playback, and authentication errors remain
owned by their current components.

## Verification

- Unit-test initial navigation, valid lesson opening, unknown-ID rejection,
  and Back to list.
- Server-render the list and verify one playable card plus three native
  disabled previews with the current fixture catalog.
- Add source contracts for AuthGate ownership, player Back wiring, removal of
  the old `<select>`, and responsive CSS.
- Run the focused tests red then green, followed by the full test suite, lint,
  TypeScript/Vite build, and browser checks at desktop and mobile sizes.
