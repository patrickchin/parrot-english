# Lesson Controls and Typography Design

## Goal

Make the lesson controls feel lighter and more intentional by separating scene
navigation from the blue action dock. At the same time, normalize the
lesson-screen type hierarchy so dialogue remains dominant and controls remain
consistent and readable for children and adults.

## Scope

This change is limited to the lesson player. It does not alter lesson data,
playback behavior, recording behavior, authentication, or the lesson list.

## Control Layout

The lesson controls remain one semantic `nav`, but its three visual parts become
siblings:

1. a previous-scene button;
2. a centered blue action dock; and
3. a next-scene button.

The previous and next buttons sit outside the blue dock. Both are pink circular
buttons with white borders, tactile shadows, and the existing Lucide
`ChevronLeft` and `ChevronRight` icons. No text-character arrow is used. Disabled
buttons retain the same form and color family with reduced opacity.

The blue action dock contains only the playback button and either the lesson
status or learner microphone prompt. The complete control group uses a centered
three-column grid capped at `min(86vw, 1320px)` on desktop. This makes the blue
dock materially narrower than the existing nearly full-width bar while leaving
room for long learner prompts.

On narrow screens, the control group expands to the available safe width. The
navigation buttons remain separate and at least 52 pixels square. The center
dock uses two internal rows for the learner prompt and playback action. On
short-height screens, controls compact to a minimum 44-pixel touch target while
remaining separate.

## Typography Hierarchy

The lesson screen uses a small role-based scale:

- spoken dialogue and narrator text: `clamp(1.5rem, 2.5vw, 2.625rem)`
  (24–42px);
- scene title: `clamp(1.05rem, 1.55vw, 1.5rem)` (17–24px);
- scene number: retain the current 22–32px scale;
- speaker label: `clamp(0.875rem, 1vw, 1rem)` (14–16px);
- character label: `clamp(0.9rem, 1vw, 1.05rem)` (14–17px);
- Back to lessons: `clamp(1rem, 1.25vw, 1.2rem)` (16–19px);
- playback label and dock status: `clamp(1rem, 1.3vw, 1.2rem)` (16–19px);
- learner target phrase: `clamp(1.15rem, 1.7vw, 1.5rem)` (18–24px);
- hold-to-talk label: `clamp(0.95rem, 1.3vw, 1.15rem)` (15–18px);
- checking label: `clamp(0.9rem, 1.2vw, 1.05rem)` (14–17px); and
- signed-in user and logout text: 15px and 14px, respectively.

The build-version badge remains intentionally small because it is developer
metadata rather than a child-facing instruction.

The primary correction is consistency: Play no longer inherits an implicit
16-pixel body size while adjacent status and microphone controls use unrelated
larger scales.

## Behavior and Accessibility

All existing aria labels, disabled states, keyboard behavior, playback logic,
recording logic, and scene navigation dispatches remain unchanged. The control
group remains a single `nav` labelled `Lesson controls`. Existing focus-visible
outlines remain prominent against both pink and blue surfaces.

No new runtime error path is introduced. Existing error messages and recording
states continue to render above the reserved control safe area.

## Verification

Automated layout tests will verify that:

- the previous and next buttons are outside the blue action dock;
- the navigation buttons keep Lucide chevrons and accessible labels;
- the navigation buttons use the pink lesson-control styling;
- the center dock has a bounded width instead of spanning both viewport edges;
- the normalized type rules are explicit; and
- narrow and short viewport rules preserve separate navigation controls and
  minimum touch-target sizes.

After the focused tests pass, run the full unit suite, lint, and production
build. Finally, inspect the lesson at the screenshot's desktop aspect ratio and
at narrow and short viewport sizes in the in-app browser.
