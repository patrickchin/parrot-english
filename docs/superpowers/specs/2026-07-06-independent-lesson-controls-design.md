# Independent Lesson Controls and Pill System Design

## Goal

Make the lesson screen feel open and intentional by removing the shared bottom
action bar, presenting every action or status as its own pill, and standardizing
the page's pill geometry and normal interface text. Rebalance the header so
navigation sits at the top-left and the lesson identity is visually centered.

## Scope

This change is limited to the lesson player. It does not alter lesson data,
playback, recording, evaluation, authentication, or navigation behavior. The
lesson list and onboarding screens remain unchanged.

## Header Layout

The lesson header uses three fixed visual anchors:

- `Back to lessons` sits at the top-left.
- The scene number, lesson title, and scene-progress dots form one centered
  title cluster.
- The volume button remains at the top-right.

The build-version badge sits below the Back control so developer metadata does
not interfere with the centered title. The complete centered title cluster,
not only its text pill, is centered against the viewport. Responsive rules may
compact spacing and truncate the title, but do not move the Back control into
the center.

## Independent Lesson Controls

The bottom controls remain inside one semantic `nav` labelled `Lesson
controls`, but that navigation wrapper has no visible background, border,
radius, padding shell, or shadow. It exists only to align and wrap its children.

Each visible item owns its own surface:

1. previous-scene button: pink circular pill with a Lucide left chevron;
2. playback button: yellow pill with its current Play, Pause, or Replay icon;
3. lesson status: blue pill during non-learner turns;
4. learner target phrase: white pill during learner turns;
5. microphone button: green pill, becoming pink while recording;
6. evaluation status: blue pill while speech is being checked; and
7. next-scene button: pink circular pill with a Lucide right chevron.

There is no blue dock behind these items and no white prompt container wrapped
around the microphone. Conditional states replace only the applicable
individual pill. Existing disabled states, event handlers, live-region
announcements, and keyboard/pointer recording behavior remain intact.

On wide screens the pills form one centered row with content-sized items and a
bounded target-phrase width. On narrow screens they wrap into two centered rows
without introducing a group background. On short landscape screens they use
the compact token values while keeping at least 44-pixel touch targets.

## Standardized Pill and Type Tokens

The lesson player defines shared CSS custom properties so ordinary UI does not
drift between one-off sizes:

- normal interface text: `clamp(1rem, 1.3vw, 1.2rem)` (16–19px);
- standard pill height: 64px on regular screens;
- compact pill height: 52px on narrow screens and 44px on short screens;
- standard horizontal padding: 20px;
- standard border: 4px solid white;
- standard radius: `999px`;
- standard font weight: 950; and
- standard tactile shadow depth: 5px.

The shared normal interface size applies to the Back label, lesson title,
character name tags, playback label, lesson status, learner target phrase,
microphone label, and evaluation status. The signed-in user controls also use
this normal size when shown over the lesson player.

Circular icon controls use the same height token for width and height, the same
border thickness, and consistent icon sizing. Content pills share padding,
radius, line height, and shadow depth while retaining semantic colors.

Necessary hierarchy exceptions are explicit:

- spoken dialogue and narrator copy remain larger because they are the lesson's
  primary content;
- the scene number remains larger inside its circle;
- speaker labels may remain compact uppercase metadata; and
- the build-version badge remains smaller because it is developer metadata.

## Accessibility and Behavior

All controls retain their accessible labels, disabled states, focus-visible
outlines, and semantic buttons. The control navigation remains one logical
region even though it has no visible container. The learner phrase remains an
assertive live status, while the microphone button remains independently
focusable and operable by pointer and keyboard.

The layout continues to reserve enough bottom space for characters and error
messages. Responsive wrapping must not overlap characters, speech bubbles, the
header, or the system safe area.

## Verification

Source-contract tests will be updated before production code to verify that:

- the shared blue action dock no longer exists;
- each playback, status, phrase, microphone, and navigation element is an
  independent pill;
- the semantic navigation wrapper has no visible group surface;
- Back is anchored top-left and the title cluster is centered;
- normal lesson UI and character names use the shared font token;
- pill geometry comes from shared tokens; and
- narrow and short viewport rules preserve independent controls and minimum
  touch-target sizes.

After focused tests pass, run the full unit suite, lint, and production build.
Inspect the real lesson screen in the in-app browser at desktop, narrow mobile,
and short landscape sizes, including a learner speaking turn.
