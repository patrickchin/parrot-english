# Lesson Start Experience Design

## Goal

Make the lesson entry action obvious for a young learner. Before the lesson
begins, the scene presents one large centered Start button instead of requiring
the small bottom playback action. Starting the lesson must not trigger a
microphone permission dialog, and no persistent Play/Pause or volume control is
shown.

## User Experience

- In the idle phase, show a large `Start lesson` button centered over the lesson
  scene.
- Clicking `Start lesson` immediately transitions to the first lesson line and
  removes the button.
- Do not request microphone permission from the Start action. The browser may
  request permission later, when the learner presses and holds the speaking
  control for the first time.
- Do not render a Play/Pause action in the bottom lesson controls.
- Do not render the top-right volume/mute control at any point in the lesson.
- In the finished phase, reuse the same centered primary-control treatment for
  a `Replay lesson` action.
- During active lesson phases, keep the existing compact progress status,
  previous/next navigation, speech presentation, press-and-hold microphone
  action, and automatic audio sequencing unchanged.

## Implementation Boundaries

`LessonPlayer` continues to own the lesson reducer and existing phase
transitions. A new centered action dispatches `PLAY_SCENE` while idle and
`REPLAY_LESSON` when finished through the existing control boundary, which
cancels stale work before moving the state. The microphone remains owned by the
existing press-and-hold flow through `startSpeechRecording`.

A stage-sized `lesson-start-layer` centers the Start/Replay action without
adding a modal or dialog. The layer is pointer-transparent outside its button so
it does not become an invisible interaction blocker. The bottom controls keep
their status and previous/next actions, but no longer include playback.

The Play, Pause, Replay, Volume, and Muted icons and their control markup are
removed. The persistent volume state, muted timing branch, playback-label
derivation, and obsolete control CSS are removed as well. Lesson audio therefore
follows the existing automatic sequence whenever an audio phase is active.

The reducer's paused state and playback events remain in the domain model for
compatibility and are outside this focused UI change. They are no longer
reachable through the rendered lesson controls.

## Error Handling

Starting has no asynchronous preparation state and cannot display a
microphone-setup error. Existing microphone and recording errors remain visible
when the learner presses and holds the speaking control.

## Verification

Automated tests will verify that:

- the large Start/Replay action dispatches the correct existing lesson events;
- the action container uses centered stage-overlay styling;
- Play/Pause and volume/mute controls are absent from the lesson UI;
- automatic audio no longer has a muted bypass; and
- existing listening-state microphone behavior remains covered.

Run the focused UI tests first, then the project test, lint, and build commands.
Finally, inspect the idle and started states in a browser at desktop and narrow
viewport sizes.
