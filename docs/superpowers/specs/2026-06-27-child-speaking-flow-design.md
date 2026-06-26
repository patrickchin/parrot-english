# Child Speaking Flow Design

## Context

Parrot English is a one-page English speaking practice prototype for children. The current app already supports a basic lesson loop: host audio, parrot model audio, child recording, speech evaluation, feedback, retry, and advance.

This design focuses on making the learning flow clearer and more effective for a child. The main requirement is repetition: the child should hear the target phrase multiple times, repeat it out loud, and receive audible feedback after every attempt. The moment when the child needs to speak must be unmistakable.

## Design Direction

Use a playful, kid-friendly claymorphism style that matches the existing bright stage and character-led layout. Keep controls large, tactile, and obvious. Use short, purposeful animations only when they explain state: listening, recording, evaluating, success, or retry.

Design priorities:

- Accessibility first: strong contrast, visible focus, screen-reader status text, and no color-only state changes.
- Touch clarity: all controls should be at least 44 by 44 px with clear pressed feedback.
- Voice-first guidance: audio prompts must align with visual state.
- Repetition without punishment: retry and repeat states should feel normal, not like failure.
- Purposeful motion: use 150 to 300 ms transitions for UI changes, and respect `prefers-reduced-motion`.

## Recommended Lesson Loop

The lesson should use this repeat-first sequence:

1. Watch
2. Listen
3. Repeat with Polly
4. Child speaks
5. Heard feedback
6. Repeat once more
7. Advance

### 1. Watch

Peppa sets the scene briefly. This should be short so the child reaches the speaking task quickly.

Visual state:

- Peppa is highlighted.
- Polly is visible but secondary.
- The lesson banner says `先听佩奇说`.

Audio:

- Chinese coach prompt: `先听佩奇说。`
- Peppa says the scene phrase.

### 2. Listen

Polly models the target phrase at normal speed.

Visual state:

- Polly is highlighted.
- The phrase appears in Polly's speech bubble.
- The child is not prompted to speak yet.
- The banner says `听多莉说`.

Audio:

- Chinese coach prompt: `再听多莉说一遍。`
- Polly says the target phrase.

### 3. Repeat With Polly

Polly says the phrase more slowly before the child speaks. This creates built-in repetition even before recording starts.

Visual state:

- The same target phrase remains visible.
- Optional word-by-word highlight follows the audio.
- The banner says `慢慢听一遍`.

Audio:

- Polly repeats the target phrase slowly.

### 4. Child Speaks

This is the most important UX state. The child must immediately understand that it is their turn.

Visual state:

- A large center badge says `轮到你说`.
- A big pulsing microphone ring appears.
- The target phrase is isolated and large: `Say: Thank you!`
- Peppa and Polly switch to listening poses.
- The rest of the UI becomes visually quiet.
- A short countdown can appear before recording starts.

Audio:

- Coach prompt: `轮到你了，请说：Thank you!`
- A short start chime or earcon plays just before recording starts.

Accessibility state:

- `aria-live` announces: `轮到你说。Target phrase: Thank you.`
- The recording state is not conveyed by color alone.

### 5. Listening

While the microphone is active, the app should show that it is hearing the child.

Visual state:

- The mic ring changes to a recording state.
- Show a simple waveform or pulsing audio bars.
- Text says `我在听...`
- Keep a fixed recording duration or visible progress ring so the child knows how long to speak.

Audio:

- Avoid speaking over the child's recording.
- Optional quiet start/end sounds are acceptable if they do not interfere with recognition.

### 6. Heard Feedback

After evaluation, always respond audibly. Silence after the child speaks will feel broken.

Feedback types:

- Success: praise, then one more repeat before advancing.
- Close attempt: supportive retry with slow model audio.
- No speech: gentle recovery that explains what happened.
- Technical error: clear adult-readable recovery while keeping the child-facing state calm.

Visual state:

- Success uses sparkle or check styling plus character celebration.
- Retry uses a warm `try again` state, not an error state.
- No speech uses a listening/retry state.
- Evaluation/loading uses visible progress if it takes more than 300 ms.

Audio examples:

- Success: `太棒了！我听到你说 Thank you!`
- One more repeat: `再说一遍，练得更棒！`
- Close attempt: `Good try. 我们慢一点再来一次。`
- No speech: `我没有听清楚，我们再试一次。`

### 7. Repeat Once More

Even after a correct attempt, ask the child to say the phrase once more before moving on. This makes repetition part of success, not only part of correction.

Recommended rule:

- First successful attempt: praise and prompt one more repeat.
- Second successful attempt: celebrate and advance.
- Failed first attempt: slow model, then retry.
- Failed second attempt: praise effort, advance only if the product goal prioritizes flow over mastery.

## Proposed State Model

The current state machine can evolve from:

`HostSpeaking -> ParrotSpeaking -> Listening -> Evaluating -> Feedback -> Retry or Next`

To:

`HostSpeaking -> ParrotNormal -> ParrotSlow -> ChildPrompt -> Listening -> Evaluating -> Feedback -> SuccessRepeat or Retry -> Next`

State responsibilities:

- `HostSpeaking`: Peppa introduces the phrase in context.
- `ParrotNormal`: Polly models at normal speed.
- `ParrotSlow`: Polly models slowly for repetition.
- `ChildPrompt`: the UI and audio clearly ask the child to speak.
- `Listening`: microphone is actively recording.
- `Evaluating`: upload/transcription/scoring is in progress.
- `Feedback`: audible praise, correction, or recovery.
- `SuccessRepeat`: success still leads to one more repetition.
- `Retry`: retry after close/no speech, with slow model audio first.

## UI Requirements

The speaking prompt should include all of these signals at once:

- Large text: `轮到你说`
- Large target phrase
- Mic ring or waveform
- Listening character poses
- Coach audio prompt
- Recording progress indicator

The recording and evaluation states must not look frozen. Any wait longer than 300 ms needs a visible loading or progress state.

Controls and navigation:

- Keep volume, previous, and next buttons large and labeled for assistive tech.
- Avoid letting scene navigation interrupt active recording without a clear state reset.
- Keep the primary action singular. During the lesson, the primary action is either start, speak, retry, or continue.

## Audio Requirements

Audio should be treated as part of the UI, not as an enhancement.

Required audio moments:

- Instruction before host line.
- Host line.
- Instruction before parrot line.
- Parrot normal model.
- Parrot slow model.
- Clear child-turn prompt.
- Audible feedback after every child attempt.
- Completion praise.

Optional audio moments:

- Soft start-recording chime.
- Soft end-recording chime.
- Short celebratory cue after success.

Do not play character speech while recording the child.

## Feedback Copy

| Situation | Child-Facing Text | Audio Behavior |
| --- | --- | --- |
| Child should speak | `轮到你说：Thank you!` | Coach prompt, then record |
| Recording | `我在听...` | No spoken audio during recording |
| Evaluating | `我来听一听...` | Optional short thinking cue |
| Success first pass | `太棒了！再说一遍。` | Praise, then repeat prompt |
| Success second pass | `太棒啦，我们继续。` | Celebrate, then next |
| Close attempt | `差一点点，慢慢再来。` | Polly slow model, then retry |
| No speech | `我没有听清楚，再试一次。` | Gentle retry prompt |
| Technical error | `声音暂时不可用，请再试一次。` | Avoid child-blaming language |

## Implementation Notes

Likely app touch points:

- `lib/lesson-state.js`: add explicit prompt, slow-repeat, and success-repeat states.
- `lib/lesson-audio.js`: expand audio sequencing for normal model, slow model, child-turn prompt, and feedback.
- `lib/lesson-scene.js`: add stronger visual presentation for child prompt, listening, evaluation, success, and retry.
- `src/App.tsx`: render mic/waveform/progress states and keep recording/evaluation feedback visible.
- `src/styles.css`: add stable responsive dimensions, large prompt styling, recording animation, and reduced-motion behavior.
- `lib/static-audio.js`: add or map static audio for new prompts and praise lines.

Existing static audio already covers many required moments, including turn prompts, retry, no-speech, success, and finished feedback. New audio may be needed for explicit success-repeat and slow-repeat prompts.

## Acceptance Criteria

- A child can tell when to listen and when to speak without reading small text.
- The app gives audible feedback after every recording attempt.
- Success includes at least one additional repeat before advancing.
- Retry starts with supportive audio and a slow model, not only another recording.
- Listening and evaluating states have visible progress or motion.
- The UI remains usable on small mobile widths and landscape.
- All interactive controls have accessible names and visible focus states.
- Reduced-motion users still receive clear non-animated state changes.

## Recommended Defaults

- Require one successful attempt plus one effort repeat before advancing. If the second attempt is not perfect, praise effort and continue so the child does not get stuck.
- Disable previous and next scene navigation during active recording and evaluation. Re-enable navigation after feedback.
- Use a short countdown after the child-turn audio prompt, then start recording. This gives the child a predictable moment to begin speaking.
- Use the existing slow playback path first for slow-repeat audio. Generate separate static assets only if the slow playback quality is not child-friendly.
