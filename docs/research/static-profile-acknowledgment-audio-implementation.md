# Saved profile acknowledgment audio implementation

- Status: implemented and retained provisionally
- Branch: `codex/static-profile-acknowledgment-audio`
- Stacked on: `codex/deterministic-profile-acknowledgments` (`a94fc9c`)
- Research commit: `a7f6cd7`
- Implementation commit: `41bb210`
- Research decision: [saved profile acknowledgment audio](./static-profile-acknowledgment-audio-guidance.md)

## Outcome

Every successful form-profile answer now returns the checked-in static-audio
descriptor for the deterministic visible confirmation `Thank you!`:

```json
{
  "text": "Thank you!",
  "audio": {
    "id": "peppa-thank-you",
    "src": "/assets/audio/peppa-thank-you.mp3",
    "text": "Thank you!"
  }
}
```

The acknowledgment audio ID is owned beside the selected public text. The
Worker resolves it through the existing catalog and checks speaker metadata and
the exact registered transcript before serializing it. Single-answer saves,
unchanged-answer retries, and changed bulk answers all use the same resolver;
bulk descriptors remain in questionnaire order.

The runtime acknowledgment-TTS module, dependency injection, Worker environment
fields, provider fetch, timeout, response-size guard, and inline base64 payload
were removed. ElevenLabs remains an offline saved-audio generation tool only.

## Child-perceived timing boundary

Before this branch, a successful answer followed the serial
Groq → D1 persistence/reload → ElevenLabs acknowledgment-TTS path. Runtime
acknowledgment synthesis had a 10-second default timeout and a 30-second
configuration cap, and bulk profile edits synthesized each changed
acknowledgment in sequence.

The retained architecture has **zero runtime acknowledgment-synthesis calls or
waits**. That is a structural result, not a claim that a profile save is a fixed
number of milliseconds faster. Groq factual enrichment and D1 persistence
remain on the critical path. The browser must still fetch and decode the saved
MP3 before sound can start, and autoplay may be rejected.

Visible `Thank you!` feedback and the enabled **Next** action do not use media
completion as a gate. The focused browser contract holds the shared player's
operation open indefinitely and confirms that the heading and action remain
usable. Audio completion, media error, synchronous or asynchronous `play()`
failure, and abort cleanup are separately exercised.

## Browser and payload boundary

The browser now gives the validated same-origin source directly to the shared
`playAudioLine` helper. It accepts a saved descriptor only when:

- `audio` is a non-null object;
- the ID contains only lowercase letters, digits, and hyphens;
- the source is exactly `/assets/audio/{id}.mp3`; and
- the catalog transcript exactly matches the visible acknowledgment.

It performs no acknowledgment base64 decoding, byte-array construction,
`Blob` allocation, object-URL allocation, or object-URL revocation. One
step-scoped `AbortController` stops pending playback through the shared player
when **Next** is chosen, the acknowledgment changes, or the component unmounts.
Playback failure is optional feedback failure and never becomes navigation.

The API type and runtime guard deliberately accept `audio` as omitted or null.
Malformed same-origin descriptors, old inline-base64 descriptors, mismatched
transcripts, protocol-relative URLs, and third-party URLs are skipped without a
timer or fallback navigation.

## Compatibility and rollback

- A new browser receiving an old inline-base64 Worker response skips the
  unrecognized optional audio and retains the visible confirmation and **Next**.
- An old browser receiving the new descriptor encounters its missing `base64`
  inside the old guarded setup path; optional audio fails while the visible
  confirmation and **Next** remain.
- A response that omits `audio` is explicitly covered and does not throw.
- No D1 table, stored response snapshot, profile version, question order, or
  migration changed.
- Reverting `41bb210` restores runtime synthesis without transforming stored
  data.

## Asset and visual evidence

The selected file is 17,598 bytes with SHA-256
`4b90bc530f89e28e972d0c8ea92faad4728266523dca56a4719c94cf2f3abc8a`.
Repository and browser checks establish its exact bytes, MP3 response type,
catalog metadata, and approximately 1.071-second media duration. They do not
establish its audible words, perceived voice, output level, physical playback,
or whether a child heard it.

Two genuine in-app Browser captures are indexed in the [visual evidence
manifest](../../artifacts/ux-review/static-profile-acknowledgment-audio/manifest.md):

| Viewport | Observed visual state |
| --- | --- |
| 390×844 | Focused `Thank you!`, visible enabled 144×52 **Next**, main scroll origin 0, no horizontal overflow |
| 640×360 | Same focused confirmation and action in the retained two-column short-wide layout, main scroll origin 0, no horizontal overflow |

The images are visual-regression evidence only. They show no audio-loading
treatment but cannot establish when the UI appeared relative to media loading
or any audible outcome.

## Automated verification

- Focused player/profile/API/Worker/infrastructure/static-audio tests: 88/88
  passed.
- Full Node, integration, and mounted lifecycle suite: 677/677 passed.
- Focused acknowledgment Chromium suite: 8/8 passed; its two new audio tests
  also passed 20/20 across ten repeated runs during independent review.
- Full responsive Chromium suite: 238/238 passed in 47.0 seconds.
- Production TypeScript and Vite build passed.
- ESLint passed with zero errors and the two pre-existing warnings in the
  generated Worker declaration file.
- `git diff --check` passed.

The tests specifically prove exact single/retry/bulk descriptors, catalog
identity, no runtime provider call or secret read, no bulk synthesis loop,
direct-source browser use, omitted/null/legacy/malformed-media tolerance,
shared-player completion/error/rejection/abort cleanup, child-controlled
navigation, native Chromium metadata loading, MIME/status handling, focus,
containment, and long legacy-copy tolerance.

## Independent review

Three read-only agents reviewed code/compatibility, tests/evidence, and visual
UX/content. Their final verdicts found no product-code blocker. Their findings
produced these pre-commit corrections:

- tolerate an omitted `audio` member at runtime and in the API type;
- test the shared player's real media-error and play-rejection cleanup;
- make Chromium assertions independent of exact StrictMode effect counts and
  browser request counts;
- align the bulk API fixture with the current descriptor;
- forbid the removed injection name in the runtime-source assertion;
- distinguish catalog metadata and still-image evidence from human listening
  or timing evidence; and
- use a direct file-media WebKit source and the current WHATWG document date.

## Remaining validation and operations

Retain provisionally. Before treating the sound itself as reviewed evidence, a
human should listen on target devices and record whether the file contains the
exact words, uses an appropriate friendly voice, has no clipping or leading or
trailing silence, and sits at a comfortable level beside lesson audio. Test
iOS Safari, Android Chrome, installed/embedded contexts, screen-reader overlap,
switch/keyboard use, and direct child/caregiver comprehension and repetition.

The repository no longer requires the secret at runtime, but it cannot prove
or mutate deployed Cloudflare secret state. After the new Worker is deployed
and the chosen rollback window closes, an authorized operator should verify
that no other runtime path needs the key and, if present, remove it with:

```bash
npx wrangler secret delete ELEVENLABS_API_KEY
```

That external deletion was not performed or verified in this branch. Keep the
local `.dev.vars` value used by `npm run generate:audio`; it is a separate
offline content-generation dependency.

The programmatically focused profile heading still uses a tight rectangular
cue that can resemble a text field. It is a separate visual semantics issue,
not a reason to restore runtime TTS. A subsequent 122-page short-wide inventory
found the Story Reader's speaking prompt partly or wholly hidden on 75 pages,
so `codex/story-reader-join-in-visibility` is the next stacked branch. The
profile heading cue remains queued behind that functional visibility repair.
