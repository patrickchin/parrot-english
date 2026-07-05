# Lesson Start Experience Design

## Goal

Make the lesson entry action obvious for a young learner. Before the lesson
begins, the scene presents one large centered Start button. Starting the lesson
must not trigger a microphone permission dialog, and no persistent playback or
volume control is shown.

## User Experience

- In the idle phase, show a large `开始` button centered over the lesson scene.
- Clicking `开始` immediately transitions to the first lesson line and removes
  the button.
- Do not request microphone permission from the Start action. The browser may
  request permission later, when the lesson reaches its first speaking turn and
  recording actually begins.
- Do not render the top-right volume/mute control at any point in the lesson.
- In the finished phase, reuse the same centered primary-control treatment for
  the existing `再来一次` action.
- During active lesson phases, keep the existing compact progress banner,
  navigation, speech bubbles, recording panel, and audio sequencing unchanged.

## Implementation Boundaries

`LessonPlayer` continues to own the lesson reducer and existing phase
transitions. Its Start handler becomes a direct `START` dispatch with no
microphone-preparation state. The microphone remains owned by the existing
listening effect through `recordSpeechClip`.

The existing `lesson-flow-banner` remains the progress container. Its
`has-action` variant becomes a stage-sized, pointer-transparent centering layer,
while the Start button itself remains interactive. This keeps active progress
layout separate from the idle/finished primary action without adding a modal or
new component.

The persistent volume state, button markup, icons, muted timing branch, and
button-specific CSS are removed. Lesson audio therefore follows the existing
automatic sequence whenever an audio phase is active.

## Error Handling

Starting has no asynchronous preparation state and cannot display a
microphone-setup error. Existing microphone and recording errors remain visible
when the listening phase requests access or records speech.

## Verification

Automated tests will verify that:

- the Start handler dispatches `START` without requesting microphone access;
- the large action container uses centered stage-overlay styling;
- the volume/mute control is absent from the lesson UI; and
- existing listening-state microphone behavior remains covered.

Run the focused UI tests first, then the project test, lint, and build commands.
Finally, inspect the idle and started states in a browser at desktop and narrow
viewport sizes.
