# AI Lesson Director Interface Design

## Context

Parrot English currently runs a deterministic lesson loop from a hardcoded
JavaScript lesson array. The frontend decides which character speaks next,
which bubble text appears, which saved audio asset plays, and when the child is
recorded.

The next version should let an AI adapt the lesson while still following a
structured script. The AI should not be a freeform chat character. It should act
as a lesson director that decides the next few character responses, scene
presentation, and child prompt. The packet should stop as soon as the child
needs to speak, so the app can record and evaluate the child before asking the
director for the next packet.

## Design Direction

Use a single AI lesson director prompt.

The app sends the director:

- A structured lesson JSON document.
- The available backgrounds, character poses, and other UI assets.
- The current runtime state.
- The most recent child transcript and speech-evaluation result, when present.

The director returns:

- The current scene and background.
- The next few character turns.
- The selected pose for each speaking character turn.
- Segmented speech text for TTS.
- Visible bubble text for the UI.
- A child prompt that tells the frontend when to start recording.
- Lesson-control metadata for continuing, advancing, retrying, or finishing.

This keeps "who speaks next" in one place while giving the frontend a strict
contract to render and play.

## Goals

- Follow the lesson script and target phrase order.
- Adapt Polly's coaching and feedback to the child's answer.
- Allow short extra turns when useful, such as encouragement, retry, slow model,
  or a brief explanation.
- Let the AI choose scene background and character poses from the available
  asset lists.
- Return a turn packet that stops before the child speaks.
- Make mixed Chinese-English lines TTS-safe by segmenting speech by language.
- Keep the UI deterministic after it receives a packet.

## Non-Goals

- Do not make the frontend a freeform chat app.
- Do not let the AI invent new lesson targets outside the supplied lesson JSON.
- Do not let the AI invent unavailable scenes, poses, characters, or asset IDs.
- Do not rely on prompt text alone for safety-critical state transitions.
- Do not play character speech while the microphone is recording.
- Do not require one AI call per character. A single director owns turn order.

## Current Lesson Format

The current lesson source is `LESSON_STEPS` in `lib/lesson-data.js`.

Current step shape:

```js
{
  id: "hello",
  sceneTitleZh: "多莉打招呼",
  exampleLine: "Hi, Bella! How are you?",
  parrotPromptZh: "轮到你了，跟着佩奇说。",
  childTarget: "Hi, Bella! How are you?",
  tipZh: "先听佩奇打招呼，再跟着说。",
  durationHintSeconds: 30
}
```

This shape is useful for a deterministic prototype, but it is too small for an
AI-directed lesson. It does not include structured scene goals, available
assets, turn history, multilingual speech segmentation, or director output.

## Proposed Lesson JSON

The lesson JSON should be data, not prompt prose. It should describe what must
be taught and which assets may be used.

```json
{
  "lessonId": "helping-peppa-001",
  "title": "Helping Peppa",
  "learner": {
    "displayName": "Bella",
    "nativeLanguage": "zh-CN",
    "learningLanguage": "en-US",
    "ageBand": "young_child"
  },
  "characters": [
    {
      "id": "peppa",
      "displayName": "Peppa",
      "role": "scene_speaker",
      "defaultLanguage": "en-US",
      "allowedPurposes": ["scene_dialogue", "model_phrase", "feedback_success"]
    },
    {
      "id": "polly",
      "displayName": "Polly",
      "role": "tutor",
      "defaultLanguage": "zh-CN",
      "allowedPurposes": [
        "context_explain",
        "model_phrase",
        "prompt_repeat",
        "feedback_success",
        "feedback_retry",
        "feedback_no_speech",
        "slow_model",
        "transition",
        "completion"
      ]
    }
  ],
  "availableAssets": {
    "backgrounds": ["meadowDay", "meadowEvening", "reward"],
    "poses": {
      "peppa": ["wave", "talk", "listen", "clap"],
      "polly": ["idle", "talk", "laugh", "flap"]
    }
  },
  "teachingPolicy": {
    "packetStopsAtChildPrompt": true,
    "maxTurnsBeforeChildPrompt": 4,
    "maxRetriesPerScene": 2,
    "successRequiresRepeat": true,
    "silenceDuringRecording": true,
    "keepTutorLinesShort": true
  },
  "scenes": [
    {
      "id": "greeting",
      "titleZh": "打招呼",
      "backgroundPreference": "meadowDay",
      "goal": "Teach Bella to answer Peppa's greeting.",
      "mode": "reply",
      "sceneLine": {
        "speaker": "peppa",
        "text": "Hello, Bella!",
        "lang": "en-US"
      },
      "tutorCueZh": "佩奇在和你打招呼。我们回答佩奇。",
      "modelLine": {
        "speaker": "polly",
        "text": "Hello, Peppa!",
        "lang": "en-US"
      },
      "childTarget": "Hello, Peppa!",
      "successCriteria": {
        "mustContainMeaning": ["hello", "peppa"],
        "allowClosePronunciation": true
      }
    },
    {
      "id": "ask-help",
      "titleZh": "请求帮助",
      "backgroundPreference": "meadowDay",
      "goal": "Teach Bella to ask for help politely.",
      "mode": "mimic",
      "sceneLine": {
        "speaker": "peppa",
        "text": "Can you help me, please?",
        "lang": "en-US"
      },
      "tutorCueZh": "佩奇在请求帮助。跟我说。",
      "modelLine": {
        "speaker": "polly",
        "text": "Can you help me, please?",
        "lang": "en-US"
      },
      "childTarget": "Can you help me, please?",
      "successCriteria": {
        "mustContainMeaning": ["help", "please"],
        "allowClosePronunciation": true
      }
    }
  ]
}
```

## Director Request

The frontend or Worker should send the director a request object that combines
the lesson definition with current runtime state.

```json
{
  "schemaVersion": "lesson-director.request.v1",
  "lesson": {
    "lessonId": "helping-peppa-001",
    "title": "Helping Peppa",
    "scenes": [
      {
        "id": "greeting",
        "mode": "reply",
        "childTarget": "Hello, Peppa!"
      }
    ]
  },
  "runtimeState": {
    "sessionId": "session-123",
    "currentSceneId": "greeting",
    "phase": "start_scene",
    "attemptNumber": 0,
    "successfulRepeats": 0,
    "previousTurnSummary": [],
    "lastChildResult": null
  }
}
```

After the child speaks, `lastChildResult` should be populated:

```json
{
  "phase": "after_child_answer",
  "attemptNumber": 1,
  "successfulRepeats": 0,
  "lastChildResult": {
    "targetText": "Hello, Peppa!",
    "transcript": "hello peppa",
    "passed": true,
    "similarity": 0.92,
    "reason": "matched_target"
  }
}
```

The speech evaluator still owns transcript scoring. The director should use
`passed`, `similarity`, `transcript`, and `reason` to choose feedback and the
next lesson action.

## Director Response

The response is a packet the UI can execute in order.

```json
{
  "schemaVersion": "lesson-director.response.v1",
  "packetId": "greeting-001",
  "sceneId": "greeting",
  "background": "meadowDay",
  "characters": {
    "peppa": { "pose": "listen" },
    "polly": { "pose": "talk" }
  },
  "turns": [
    {
      "turnId": "greeting-001-t1",
      "speaker": "peppa",
      "purpose": "scene_dialogue",
      "visibleText": "Hello, Bella!",
      "speech": [
        { "lang": "en-US", "text": "Hello, Bella!" }
      ],
      "pose": "talk"
    },
    {
      "turnId": "greeting-001-t2",
      "speaker": "polly",
      "purpose": "context_explain",
      "visibleText": "佩奇在和你打招呼。我们回答佩奇。",
      "speech": [
        { "lang": "zh-CN", "text": "佩奇在和你打招呼。我们回答佩奇。" }
      ],
      "pose": "talk"
    },
    {
      "turnId": "greeting-001-t3",
      "speaker": "polly",
      "purpose": "model_phrase",
      "visibleText": "Hello, Peppa!",
      "speech": [
        { "lang": "en-US", "text": "Hello, Peppa!" }
      ],
      "pose": "talk"
    },
    {
      "turnId": "greeting-001-t4",
      "speaker": "polly",
      "purpose": "prompt_repeat",
      "visibleText": "轮到你说：Hello, Peppa!",
      "speech": [
        { "lang": "zh-CN", "text": "轮到你说：" },
        { "lang": "en-US", "text": "Hello, Peppa!" }
      ],
      "pose": "flap"
    }
  ],
  "childPrompt": {
    "shouldListen": true,
    "targetText": "Hello, Peppa!",
    "displayText": "轮到你说：Hello, Peppa!",
    "recordingSeconds": 4.2
  },
  "lessonControl": {
    "status": "prompt_child",
    "nextSceneId": null,
    "reason": "waiting_for_repeat"
  }
}
```

### Response Field Rules

- `schemaVersion` identifies the contract version.
- `packetId` must be stable enough for logging and replay.
- `sceneId` must be one of the supplied lesson scene IDs.
- `background` must be one of `lesson.availableAssets.backgrounds`.
- `characters` describes the resting pose after the packet is rendered.
- `turns` is the ordered list of lines to play and render before listening.
- `speaker` must be a supplied character ID.
- `purpose` is a non-spoken control label for the frontend.
- `visibleText` is the bubble text.
- `speech` is the TTS-ready sequence and must be segmented by language.
- `pose` must be one of the available poses for that speaker.
- `childPrompt.shouldListen` is the only field that starts recording.
- `childPrompt.targetText` is the exact string sent to speech evaluation.
- `lessonControl.status` tells the app whether to prompt, continue, advance,
  finish, or recover.

## Purpose Values

`purpose` is not spoken. It tells the frontend why a turn exists.

Allowed values:

- `scene_dialogue`: a character line that sets up the scene.
- `context_explain`: a tutor explanation, usually Chinese.
- `model_phrase`: a character or tutor models the English target.
- `slow_model`: a slower repeat for retry or reinforcement.
- `prompt_repeat`: the final line before recording starts.
- `feedback_success`: praise after a correct attempt.
- `feedback_retry`: supportive retry after a close or incorrect attempt.
- `feedback_no_speech`: recovery after no transcript or no audible speech.
- `transition`: short line moving to the next scene.
- `completion`: final lesson celebration.

The frontend can use `purpose` for styling, analytics, animation, audio routing,
or debugging without parsing child-facing text.

## Multilingual Speech Handling

The director may use mixed-language `visibleText`, because a child-facing bubble
often needs Chinese instruction plus an English target phrase:

```text
轮到你说：Hello, Peppa!
```

The director must not put mixed-language text into a single TTS field. It must
segment speech:

```json
[
  { "lang": "zh-CN", "text": "轮到你说：" },
  { "lang": "en-US", "text": "Hello, Peppa!" }
]
```

This keeps options open:

- The app may send the segments to one multilingual TTS model if quality is
  acceptable.
- The app may generate separate audio per language and concatenate playback.
- The app may route English phrases to the English character voice and Chinese
  coaching to the Mandarin tutor voice.

For this product, segmented audio is preferred because pronunciation quality
matters. English target phrases should sound like clear English, and Chinese
coaching should sound like native Mandarin.

## Lesson-Control Status Values

Allowed `lessonControl.status` values:

- `prompt_child`: play packet turns, then start recording.
- `continue_current_scene`: play packet turns, then request another director
  packet without recording. This should be rare.
- `advance_scene`: move to `nextSceneId` after packet turns complete.
- `finish_lesson`: show completion state after packet turns complete.
- `recover_error`: show a calm recovery state and avoid recording until the
  user retries.

Most director responses should end with `prompt_child`, `advance_scene`, or
`finish_lesson`.

## Runtime Flow

Recommended flow:

1. Frontend starts or resumes a lesson scene.
2. Frontend sends the lesson JSON and runtime state to the Worker.
3. Worker calls the AI director and validates the JSON response.
4. Frontend receives a director packet.
5. Frontend renders the selected scene and character poses.
6. Frontend plays each turn in order.
7. If `childPrompt.shouldListen` is true, frontend records the child.
8. Worker transcribes and scores the child response.
9. Frontend sends the updated runtime state and `lastChildResult` to the
   director.
10. Director returns feedback, retry, repeat, advance, or completion packet.

The director should not score pronunciation itself. It reacts to the speech
evaluator result.

## System Prompt Script

Use this as the initial director system prompt.

```text
You are the AI lesson director for a child English-speaking lesson app.

You control turn order for the visible lesson characters, but you are not a
freeform chat assistant. You must follow the supplied lesson JSON, current
runtime state, available assets, and output schema.

Primary job:
- Choose the next few character turns.
- Choose the scene background and character poses from the available asset IDs.
- Adapt tutor feedback to the child transcript and speech-evaluation result.
- Stop the packet as soon as the child should speak.

Character rules:
- Use only characters provided in the lesson JSON.
- Peppa is the English scene speaker unless the lesson JSON says otherwise.
- Polly is the tutor. Polly may explain in Chinese, model short English target
  phrases, prompt the child, and give feedback.
- Do not invent new characters.
- Do not mention that you are an AI.

Lesson rules:
- Follow the current scene and target phrase from the lesson JSON.
- Do not skip required targets.
- Do not introduce new target phrases unless they are already in the lesson JSON.
- If the scene mode is "reply", prompt the child to answer the scene speaker.
- If the scene mode is "mimic", prompt the child to repeat the model line.
- Keep child-facing lines short and concrete.
- Use warm, supportive feedback.
- Never shame the child for mistakes.
- If the child answer passed and the teaching policy requires a success repeat,
  praise the child and prompt one more repeat before advancing.
- If the child answer failed, provide brief supportive feedback and prompt a
  retry, unless the retry limit has been reached.
- If no speech was detected, tell the child you did not hear clearly and prompt
  another try.

Audio and language rules:
- Output visibleText for the speech bubble.
- Output speech as an array of language-specific segments.
- Do not place Chinese and English in the same speech segment.
- Use "zh-CN" for Mandarin Chinese.
- Use "en-US" for English target phrases unless the lesson JSON specifies a
  different learning language.
- No character may speak while the child is recording.

Asset rules:
- background must be one of lesson.availableAssets.backgrounds.
- Every turn pose must be one of lesson.availableAssets.poses[speaker].
- The final resting character poses must also use available pose IDs.

Output rules:
- Return valid JSON only.
- Return exactly one object matching schemaVersion
  "lesson-director.response.v1".
- Do not include Markdown.
- Do not include comments.
- Do not include extra keys outside the schema.
- The turns array must contain only turns that happen before the next child
  recording or lesson transition.
- If the child should speak next, set childPrompt.shouldListen to true and set
  lessonControl.status to "prompt_child".
- childPrompt.targetText must exactly match the intended child answer.
```

## First Scene Example

Request state:

```json
{
  "phase": "start_scene",
  "currentSceneId": "greeting",
  "attemptNumber": 0,
  "successfulRepeats": 0,
  "lastChildResult": null
}
```

Response:

```json
{
  "schemaVersion": "lesson-director.response.v1",
  "packetId": "greeting-start-001",
  "sceneId": "greeting",
  "background": "meadowDay",
  "characters": {
    "peppa": { "pose": "listen" },
    "polly": { "pose": "flap" }
  },
  "turns": [
    {
      "turnId": "greeting-start-001-t1",
      "speaker": "peppa",
      "purpose": "scene_dialogue",
      "visibleText": "Hello, Bella!",
      "speech": [{ "lang": "en-US", "text": "Hello, Bella!" }],
      "pose": "talk"
    },
    {
      "turnId": "greeting-start-001-t2",
      "speaker": "polly",
      "purpose": "context_explain",
      "visibleText": "佩奇在和你打招呼。我们回答佩奇。",
      "speech": [
        { "lang": "zh-CN", "text": "佩奇在和你打招呼。我们回答佩奇。" }
      ],
      "pose": "talk"
    },
    {
      "turnId": "greeting-start-001-t3",
      "speaker": "polly",
      "purpose": "model_phrase",
      "visibleText": "Hello, Peppa!",
      "speech": [{ "lang": "en-US", "text": "Hello, Peppa!" }],
      "pose": "talk"
    },
    {
      "turnId": "greeting-start-001-t4",
      "speaker": "polly",
      "purpose": "prompt_repeat",
      "visibleText": "轮到你说：Hello, Peppa!",
      "speech": [
        { "lang": "zh-CN", "text": "轮到你说：" },
        { "lang": "en-US", "text": "Hello, Peppa!" }
      ],
      "pose": "flap"
    }
  ],
  "childPrompt": {
    "shouldListen": true,
    "targetText": "Hello, Peppa!",
    "displayText": "轮到你说：Hello, Peppa!",
    "recordingSeconds": 4.2
  },
  "lessonControl": {
    "status": "prompt_child",
    "nextSceneId": null,
    "reason": "waiting_for_first_attempt"
  }
}
```

## Success Feedback Example

If the child says `hello peppa` and passes:

```json
{
  "schemaVersion": "lesson-director.response.v1",
  "packetId": "greeting-success-001",
  "sceneId": "greeting",
  "background": "meadowDay",
  "characters": {
    "peppa": { "pose": "clap" },
    "polly": { "pose": "flap" }
  },
  "turns": [
    {
      "turnId": "greeting-success-001-t1",
      "speaker": "polly",
      "purpose": "feedback_success",
      "visibleText": "太棒了！你回答了佩奇。",
      "speech": [
        { "lang": "zh-CN", "text": "太棒了！你回答了佩奇。" }
      ],
      "pose": "laugh"
    },
    {
      "turnId": "greeting-success-001-t2",
      "speaker": "polly",
      "purpose": "prompt_repeat",
      "visibleText": "再说一遍：Hello, Peppa!",
      "speech": [
        { "lang": "zh-CN", "text": "再说一遍：" },
        { "lang": "en-US", "text": "Hello, Peppa!" }
      ],
      "pose": "talk"
    }
  ],
  "childPrompt": {
    "shouldListen": true,
    "targetText": "Hello, Peppa!",
    "displayText": "再说一遍：Hello, Peppa!",
    "recordingSeconds": 4.2
  },
  "lessonControl": {
    "status": "prompt_child",
    "nextSceneId": null,
    "reason": "success_repeat_required"
  }
}
```

If the success repeat has already happened, the director should return a short
celebration and `advance_scene`.

## Retry Example

If the child says something unrelated or pronunciation scoring fails:

```json
{
  "schemaVersion": "lesson-director.response.v1",
  "packetId": "greeting-retry-001",
  "sceneId": "greeting",
  "background": "meadowDay",
  "characters": {
    "peppa": { "pose": "listen" },
    "polly": { "pose": "flap" }
  },
  "turns": [
    {
      "turnId": "greeting-retry-001-t1",
      "speaker": "polly",
      "purpose": "feedback_retry",
      "visibleText": "差一点点，我们慢慢再来。",
      "speech": [
        { "lang": "zh-CN", "text": "差一点点，我们慢慢再来。" }
      ],
      "pose": "talk"
    },
    {
      "turnId": "greeting-retry-001-t2",
      "speaker": "polly",
      "purpose": "slow_model",
      "visibleText": "Hello, Peppa!",
      "speech": [{ "lang": "en-US", "text": "Hello, Peppa!" }],
      "pose": "talk"
    },
    {
      "turnId": "greeting-retry-001-t3",
      "speaker": "polly",
      "purpose": "prompt_repeat",
      "visibleText": "轮到你说：Hello, Peppa!",
      "speech": [
        { "lang": "zh-CN", "text": "轮到你说：" },
        { "lang": "en-US", "text": "Hello, Peppa!" }
      ],
      "pose": "flap"
    }
  ],
  "childPrompt": {
    "shouldListen": true,
    "targetText": "Hello, Peppa!",
    "displayText": "轮到你说：Hello, Peppa!",
    "recordingSeconds": 4.2
  },
  "lessonControl": {
    "status": "prompt_child",
    "nextSceneId": null,
    "reason": "retry_current_target"
  }
}
```

## Frontend Consumption Rules

The frontend should treat the director response as data to execute, not text to
interpret.

Recommended frontend responsibilities:

- Validate the response schema before rendering.
- Reject unknown speakers, poses, backgrounds, purposes, or lesson statuses.
- Render `visibleText` in the appropriate character bubble.
- Use `purpose` for styling and state labels.
- Use `speech` to request or play audio.
- Move through `turns` in order.
- Apply each turn's speaker pose while that line is active.
- Apply the packet-level resting poses after turns complete.
- Start recording only when `childPrompt.shouldListen` is true.
- Send `childPrompt.targetText` to speech evaluation.
- Store a compact turn summary for future director requests.

The frontend should not parse `visibleText` to decide recording, scoring, or
scene transitions.

## Worker Responsibilities

The Worker should own AI calls and response validation.

Recommended Worker responsibilities:

- Receive director requests from the frontend.
- Attach the system prompt.
- Call the selected LLM.
- Parse JSON.
- Validate schema and asset IDs.
- Enforce maximum turn counts and maximum text lengths.
- Return a normalized packet to the frontend.
- Return a fallback deterministic packet if the AI response is invalid.

The Worker should not expose provider keys to the browser.

## Validation Rules

The app should reject or repair packets when:

- JSON is invalid.
- `schemaVersion` does not match.
- `sceneId` is not in the lesson.
- `background` is not available.
- A speaker is unknown.
- A pose is unavailable for that speaker.
- `turns` is empty when speech is expected.
- `turns.length` exceeds `teachingPolicy.maxTurnsBeforeChildPrompt`.
- `visibleText` is too long for the speech bubble.
- A speech segment mixes Chinese and English.
- `childPrompt.targetText` does not match the current scene's expected target
  or allowed target.
- `lessonControl.status` conflicts with `childPrompt.shouldListen`.

When validation fails, use a deterministic recovery packet such as:

```json
{
  "turns": [
    {
      "speaker": "polly",
      "purpose": "feedback_retry",
      "visibleText": "我们再试一次。",
      "speech": [{ "lang": "zh-CN", "text": "我们再试一次。" }],
      "pose": "talk"
    }
  ],
  "childPrompt": {
    "shouldListen": true,
    "targetText": "Hello, Peppa!",
    "displayText": "轮到你说：Hello, Peppa!"
  },
  "lessonControl": {
    "status": "prompt_child",
    "reason": "director_fallback"
  }
}
```

## Migration Plan

1. Keep the current deterministic lesson loop as the baseline.
2. Introduce the lesson JSON shape alongside the existing `LESSON_STEPS`.
3. Add a pure schema validator for director requests and responses.
4. Add a mock director that returns static packets for tests.
5. Teach the frontend to render director packets without calling an LLM.
6. Add a Worker route for `/api/lesson-director`.
7. Add the real AI call behind the Worker route.
8. Add TTS generation or playback support for `speech` segments.
9. Gradually switch scenes from deterministic flow to director packets.
10. Keep deterministic fallback packets for failed AI calls.

## Testing Plan

Unit tests:

- Lesson JSON validates required scenes, characters, and assets.
- Director response rejects unknown backgrounds, poses, and speakers.
- `childPrompt.targetText` must match the current scene target.
- Mixed-language speech must be segmented.
- `prompt_child` requires `childPrompt.shouldListen === true`.
- `advance_scene` must include a valid `nextSceneId`.
- Fallback packet is produced when validation fails.

Integration tests:

- Start-scene request returns turns ending in a child prompt.
- Successful child answer returns praise and success repeat when required.
- Second successful repeat advances the scene.
- Failed answer returns supportive retry and prompt.
- No-speech answer returns no-speech recovery and prompt.
- Completion scene returns `finish_lesson`.

Browser flow tests:

- Character bubble text follows the current packet turn.
- Active speaker pose changes per turn.
- Recording starts only after the final prompt line.
- No character audio plays while recording.
- The target sent to speech evaluation equals `childPrompt.targetText`.

## Acceptance Criteria

- The app can request a director packet from structured lesson data.
- The director can choose only available scenes and poses.
- The response packet contains the next few character turns and stops at the
  child prompt.
- The child prompt clearly identifies the exact phrase to record.
- Mixed Chinese-English lines use `visibleText` for display and segmented
  `speech` for TTS.
- The frontend does not need to decide which character speaks next.
- The frontend validates director output before rendering or recording.
- The deterministic lesson flow can remain as a fallback.
- Speech evaluation remains separate from lesson direction.
