# Poster-Style Speaking Script Design

## Context

The current lesson script asks Bella to repeat every Peppa line exactly. That is confusing when Peppa says Bella's name, because Bella should not repeat a line addressed to herself. The lesson should stay close to the supplied poster: Peppa creates the scene, the parrot coaches in Chinese, the parrot models the English, then Bella speaks.

## Script Rule

Use two patterns:

- Greeting or name-addressed lines use a reply pattern. If Peppa says Bella's name, the parrot models a reply that says Peppa's name, and Bella repeats the reply.
- All other lesson lines use mimic practice. Peppa says the scene line, the parrot explains it briefly in Chinese, the parrot says to repeat, then the parrot models the same English line for Bella to repeat.

The child should never be asked to repeat her own name when the line is addressed to her.

## Approved Lesson Script

| Page | Peppa line | Parrot Chinese cue | Parrot English model | Bella target |
| --- | --- | --- | --- | --- |
| Greeting | `Hello, Bella!` | `佩奇在和你打招呼。我们回答佩奇。` | `Hello, Peppa!` | `Hello, Peppa!` |
| Problem | `Oh! I can't reach it.` | `佩奇够不到。跟我说。` | `Oh! I can't reach it.` | `Oh! I can't reach it.` |
| Ask Help | `Can you help me, please?` | `佩奇在请求帮助。跟我说。` | `Can you help me, please?` | `Can you help me, please?` |
| Give Item | `Here you are!` | `多莉把东西给佩奇。跟我说。` | `Here you are!` | `Here you are!` |
| Thanks | `Thank you!` | `佩奇在说谢谢。跟我说。` | `Thank you!` | `Thank you!` |

## Lesson Flow

Each page should run in this order:

1. Peppa says the English scene line.
2. The parrot gives the short Chinese meaning or context cue.
3. The parrot models the English target line.
4. The app listens while Bella repeats the target.
5. The app gives feedback and then continues or retries using the existing retry behavior.

The parrot should give the Chinese cue before listening starts. No character should speak while recording is active.

## Data Model

The lesson data should distinguish these fields:

- `exampleLine`: the line Peppa says to set up the scene.
- `parrotPromptZh`: the short Chinese cue before the parrot model.
- `parrotModelLine`: the English line the parrot models.
- `childTarget`: the line Bella is expected to say.

For mimic pages, `exampleLine`, `parrotModelLine`, and `childTarget` can be the same English sentence. For the greeting page, `exampleLine` is `Hello, Bella!`, while `parrotModelLine` and `childTarget` are `Hello, Peppa!`.

## Audio Requirements

Static audio should cover the new parrot coaching sequence:

- Peppa example audio for each `exampleLine`.
- Chinese parrot prompt audio for each `parrotPromptZh`.
- English parrot model audio for each `parrotModelLine`.
- Existing feedback and finished audio.

Chinese parrot prompt assets should continue to use `voiceStyle: "energetic-character"` and `ttsText` performance tags while keeping visible `text` clean.

## UI Requirements

The speech bubbles should make the speaker roles clear:

- Peppa bubble shows only Peppa's scene line.
- Parrot bubble shows the Chinese cue during coaching.
- During listening, the microphone panel and parrot bubble should show Bella's target line.

The greeting page should visibly prompt Bella to say `Hello, Peppa!`, not `Hello, Bella!`.

## Testing

Add or update focused tests for:

- The greeting target differs from Peppa's name-addressed example.
- Non-greeting pages keep mimic targets aligned with the Peppa scene line.
- Parrot coaching audio includes both the Chinese cue and English model before listening.
- Static audio coverage includes the new parrot model lines.
- Scene presentation shows the correct bubble text in example, coaching, and listening states.

## Acceptance Criteria

- Bella is not asked to repeat a line addressed to Bella.
- The greeting page prompts `Hello, Peppa!`.
- Every non-greeting page follows `Peppa line -> Chinese parrot cue -> English parrot model -> Bella repeats`.
- The parrot gives a short Chinese instruction before every listening prompt.
- The app remains silent during recording.
