# Product Experience Design

## Summary

Parrot English is a one-page, full-screen English speaking practice prototype
for young children. The experience should feel like a short interactive episode:
the child watches a simple scene, hears an English model line, hears a Chinese
coach prompt, repeats out loud, and receives audible feedback.

The core product rule is that the child should never have to guess who is
speaking or when it is their turn. The app uses character focus, speech bubbles,
a large speak-now panel, recorded audio, and state-specific feedback to make the
lesson flow explicit.

## Audience

The primary learner is a young child practicing spoken English with adult help
nearby. The app should not assume the child can read dense instructions. Visual
state, character attention, and audio are the main instructional channels.

The secondary user is the parent or teacher who starts the lesson, grants
microphone permission when needed, and understands technical recovery states.

## Character Roles

The lesson has two visible characters:

- Peppa-style pig: speaks the English example line.
- Polly the parrot: acts as the Chinese coach and feedback voice.

There is no separate host character. Earlier versions used host/parrot language
internally, but the current design treats Peppa as the example speaker and Polly
as the guide.

Polly should not model the English phrase in the main loop. Polly tells the
child what to do in Chinese, prompts the child to repeat after Peppa, and gives
feedback after the app evaluates the recording.

## Current Lesson Loop

The current implemented loop is:

1. Idle/start screen.
2. Peppa speaks the English example.
3. Polly gives the Chinese coaching prompt: `轮到你了，跟着佩奇说。`
4. The app records the child.
5. The app evaluates the recording.
6. Polly gives feedback.
7. On success, the feedback audio completes and the app automatically continues
   to the next routed page. The child/adult can also click scene Next while the
   feedback is visible.
8. On retry, Polly's feedback audio completes, then the phrase restarts.
9. After the last successful phrase, Polly plays the completion line.

The lesson catalog lives in `lib/lesson-data.js`. Each lesson entry owns its
list metadata and its ordered script steps, so the UI can render any playable
lesson without lesson-specific JSX. The current default lesson phrase set is:

- `Hello, Peppa!`
- `Oh! I can't reach it.`
- `Can you help me, please?`
- `Here you are!`
- `Thank you!`

## Speak-Now State

The most important UX state is when the child needs to speak. The app currently
renders a dedicated centered mic panel during `listening` and `evaluating`.

Listening state requirements:

- Show `轮到你说`.
- Show `麦克风正在听，请说：`.
- Show the target English phrase in large text.
- Show a microphone symbol, animated bars, and recording progress.
- Use an assertive live region so assistive tech announces the turn.
- Do not play character speech over the recording.

Evaluating state requirements:

- Keep the panel in the same location so the app does not look frozen.
- Switch the title to `我听到了`.
- Show `正在检查发音`.
- Keep the target phrase visible.

## Navigation Rules

The lesson catalog and player use addressable routes:

- Each lesson page has a one-based URL, such as `/lessons/1/pages/2`.
- Playable lesson cards open page 1.
- Scene controls update the URL when they move between pages.
- Browser Back and Forward restore the page addressed by the URL in its idle
  phase.
- The URL owns lesson and page selection; the lesson state machine owns the
  speaking phase within that page.

The scene back/next controls navigate lesson scenes. Successful feedback remains
visible and audible while its saved audio plays; completion dispatches the
routed lesson `NEXT` event, updates the URL, and starts the next example.
Clicking scene Next while successful feedback is visible dispatches the same
transition without waiting for the audio to finish.

## Feedback Rules

Feedback must be audible and visible. Silence after recording feels broken.

Current feedback copy is static and mapped to saved audio:

- Success: `太棒了！我们继续下一句。`
- Retry: `差一点点，听多莉慢慢说，再试一次。`
- No speech: `我没有听清楚，我们慢一点再试一次。`
- Missing target: `请先设置要练习的句子。`
- Finished: `太棒啦，今天练习完成。`

The flow banner should not duplicate the full Polly feedback sentence. It uses
short phase labels such as `准备再试一次` or `准备下一句`, while Polly's bubble owns
the complete spoken feedback.

## Visual Design

The app uses a fixed full-screen stage with a bright episode-like background,
large character sprites, rounded speech bubbles, and tactile controls. Current
assets are raster PNGs for the two characters and SVGs for volume/nav controls.

Design constraints:

- Keep the stage full-screen and child-readable.
- Keep primary controls large enough for touch.
- Keep speech bubbles near the speaking character.
- Use character highlighting to show the active speaker.
- Avoid small-only or color-only state changes.
- Keep waits visibly active with progress or motion.
- Respect reduced motion where CSS animations are added.

## Open Product Questions

The implemented flow currently has one retry before advancing after a failed
second attempt. The existing child-speaking spec recommends more repetition,
including a possible success repeat. That is not fully implemented in the
current state machine and should be treated as a future product decision, not
current behavior.

The current visual character states reuse one image per character. The scene
asset map already names future poses such as talk, listen, clap, laugh, and
flap, but those point to the same current PNG assets.
