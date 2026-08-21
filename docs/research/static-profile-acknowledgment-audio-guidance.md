# Saved profile acknowledgment audio

Status: selected for implementation  
Research date: 2026-08-22  
Audience in scope: children around age five who may be pre-readers or Pre-A1
English learners, plus the grown-ups helping them

## Decision

Form-profile saves will return a reference to the existing checked-in Peppa
audio asset for the reviewed confirmation `Thank you!`. The Worker will no
longer call ElevenLabs at request time for this confirmation, and the browser
will play the same-origin asset URL directly.

The selected response is:

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

The visible confirmation and **Next** action must render without waiting for
the media request, playback, completion, error, or autoplay permission. Audio
remains optional feedback; the child's action remains the only navigation
owner.

## Product question and scope

The preceding deterministic-copy branch made every form-profile
acknowledgment exact `Thank you!`, but the save handler still synthesizes that
known phrase after every answer. The current critical path is sequential:

1. Groq enriches the raw answer. Its request timeout defaults to 15 seconds and
   is capped at 60 seconds.
2. D1 persists the successful answer.
3. The Worker asks ElevenLabs to synthesize `Thank you!`. Its timeout defaults
   to 10 seconds and is capped at 30 seconds.
4. The Worker base64-encodes the MP3 into JSON.
5. The browser decodes the base64, allocates a `Blob` and object URL, then asks
   the media element to play it.

Step 3 can therefore add a full timeout after the answer is already safely
stored, even though the repository contains the final audio. Bulk profile
edits repeat this synthesis loop sequentially for every changed answer.

This change removes only runtime synthesis of the form acknowledgment. It does
not remove Groq enrichment, change profile questions or persistence, alter the
Realtime conversation path, regenerate any audio, or claim that every browser
will allow audible autoplay.

## Repository-verified baseline

The existing asset is registered in
[`lib/static-audio.js`](../../lib/static-audio.js) as
`peppa-thank-you`, spoken by Peppa in English, with exact text `Thank you!` and
source `/assets/audio/peppa-thank-you.mp3`.

Inspection on 2026-08-22 found:

| Property | Observed value |
| --- | --- |
| Source file | `public/assets/audio/peppa-thank-you.mp3` |
| Container / encoding | MP3, MPEG layer III, 128 kbps, 44.1 kHz mono |
| Estimated duration | 1.071020 seconds |
| File size | 17,598 bytes |
| SHA-256 | `4b90bc530f89e28e972d0c8ea92faad4728266523dca56a4719c94cf2f3abc8a` |
| Registered visible/spoken text | exact `Thank you!` |

The saved-audio generator is ElevenLabs-only and the asset is already checked
in. No local or macOS text-to-speech substitute is needed or allowed.

The current runtime path lives in
[`worker/learner-profile-acknowledgment-audio.ts`](../../worker/learner-profile-acknowledgment-audio.ts).
It accepts an ElevenLabs API key, sends the public confirmation to the provider,
waits up to the configured bound, reads up to one megabyte, and embeds a base64
copy in each JSON response. The browser path in
[`LearnerProfileAcknowledgment.tsx`](../../src/learner-profile/LearnerProfileAcknowledgment.tsx)
reconstructs the same media bytes as a temporary object URL.

## Why the saved reference is preferable

### Child-perceived response time

Removing synthesis makes the successful response structurally independent of
the acknowledgment TTS provider and its timeout. The reliable claim is **zero
runtime acknowledgment-synthesis calls or waits**, not a universal millisecond
saving. Groq enrichment and D1 persistence remain on the answer's critical
path, and the browser still has to fetch and decode the static file before
sound can begin.

### Reliability and pacing

One deployed asset has a stable ID, URL, text, speaker, and duration. A provider
failure can no longer turn a successful answer into a silent response after a
long wait. A static media request can still fail, be slow, or be blocked by
autoplay policy, so visible feedback and **Next** remain independent.

The HTML media specification defines the `play()` promise and media readiness;
it does not prove that a child heard physical output. Chrome and WebKit also
document user-activation restrictions on audible autoplay. Parrot should catch
playback rejection and preserve the screen instead of treating playback as a
completion or navigation signal.

### Data minimisation and operations

The phrase contains no child answer, but sending an already-known constant to a
provider is still an unnecessary production request, credential dependency,
failure mode, and cost. Removing that request is consistent with a
purpose-specific, minimum-data design. This is a product inference from child
privacy guidance, not a legal conclusion.

The ElevenLabs key remains a local build-time content-generation dependency for
new saved audio. It is no longer a production Worker secret solely for form
acknowledgments.

### Payload and browser work

The response changes from an inline base64 media copy to three short metadata
strings. The browser can give the same-origin URL directly to `Audio`, avoiding
base64 decoding, byte-array construction, a `Blob`, object-URL allocation, and
object-URL revocation. Normal media caching may reduce later transfers, but no
cache-hit or network-duration guarantee is claimed.

## Contract and ownership

The acknowledgment audio ID is owned beside the deterministic acknowledgment
text in the questionnaire domain. The Worker resolves that ID through the
existing static-audio registry and verifies the expected speaker and exact
text before serializing it. This keeps the public text and spoken asset from
drifting silently.

The browser consumes the existing `LearnerProfileAudio` shape used by question
prompts:

- `id` identifies the reviewed asset;
- `src` is the same-origin public path; and
- `text` is the exact speech transcript.

`audio` remains nullable as a defensive client contract. A malformed, missing,
slow, blocked, or failed optional media item must never hide the confirmation,
disable **Next**, schedule navigation, or prevent cleanup.

## Rolling-deploy and rollback analysis

Changing the wire representation from inline base64 to a saved reference is
not byte-for-byte compatible between old and new clients, but both directions
fail safely for the optional sound with the current UI boundary:

- A new browser receiving an old Worker response will not find a valid `src`.
  It should skip optional playback while retaining the visible text and Next
  action.
- An old browser receiving a new Worker response will try to decode a missing
  `base64` value. That throws inside its guarded playback setup, which already
  catches failure and retains the visible text and Next action.

This is acceptable for an optional, non-navigation medium during an atomic
static-site/Worker rollout. Rollback restores runtime synthesis without a data
migration. No D1 row or stored profile schema changes.

## Alternatives considered

### Keep runtime synthesis but cache provider output

This preserves a provider request on cache miss, requires cache invalidation
and storage ownership, and duplicates a versioned asset already in the build.

### Keep both base64 and URL response forms indefinitely

A union would add parsing and test surface solely to preserve optional sound
during a short rolling-deploy window. Existing failure guards preserve the
essential visual interaction in either mismatch direction. The static shape is
the smaller durable contract.

### Embed or import the MP3 bytes into the Worker response

This repeats the old payload and browser reconstruction costs and gives up the
ordinary asset-serving path.

### Generate a new confirmation asset

The existing approved Peppa asset matches the exact selected text. Generating
another asset adds cost and an unnecessary voice/content review without
changing the user-facing contract.

### Remove acknowledgment sound

Audio supports learners who cannot yet read the confirmation. The problem is
the runtime dependency, not the existence of the spoken cue.

## Acceptance and evidence plan

The implementation should prove that:

- every single-answer and bulk changed-answer response returns the exact
  `peppa-thank-you` ID, source, and transcript;
- the registered audio transcript exactly equals the visible acknowledgment;
- unchanged-answer retries return the current reference without enrichment or
  synthesis;
- the Worker has no runtime acknowledgment TTS module, dependency, fetch,
  timeout setting, or production secret requirement;
- a legacy injected `synthesizeAudio` promise is never read or awaited;
- bulk edits return references in questionnaire order without a per-answer
  synthesis loop;
- the browser passes `audio.src` directly to the media element and performs no
  base64, `Blob`, or object-URL work;
- playback end, error, rejection, unmount, missing media, and malformed legacy
  media remain idempotent cleanup paths and never navigate;
- delaying or failing the MP3 request does not delay the visible `Thank you!`,
  focused heading, or enabled Next action; and
- ultra-narrow, short-landscape, and desktop layouts preserve their previous
  containment, scroll origin, focus, and target geometry.

Tests can prove call boundaries, response shape, direct source ownership,
event cleanup, and rendered state. A screenshot cannot prove audible output,
media timing, cache behavior, or child comprehension. Production latency,
device/browser autoplay behavior, and direct child/caregiver testing remain
follow-up evidence.

## Retain, revise, or roll back

Retain if the response never calls runtime acknowledgment TTS, all profile save
paths preserve their persistence and ordering contracts, and optional media
failure leaves immediate child-controlled progression.

Revise the browser recovery affordance if target-device observation shows that
autoplay is commonly blocked and children do not understand the visible
confirmation without sound. Do not restore media-controlled navigation.

Roll back if the saved reference prevents successful profile saves, produces a
text/audio mismatch, or breaks the visible Next path during deployment. Since
storage is unchanged, rollback is code-only.

## Sources and limits

Related stable entries in the [source register](./source-register.md) are
AI-01, PRIV-06, VOICE-04, and VOICE-09.

- [WHATWG, HTML Living Standard: media
  elements](https://html.spec.whatwg.org/multipage/media.html), last updated
  2026-08-20 and accessed 2026-08-21, defines media and `play()` behavior. It
  does not prove audible physical output or a child's perception.
- [Chrome autoplay policy](https://developer.chrome.com/blog/autoplay/) and
  [WebKit WebRTC/media guidance](https://webkit.org/blog/7763/a-closer-look-into-webrtc/)
  document user-activation restrictions. Exact embedded or installed-app
  behavior still requires target-device testing.
- [UK ICO Children's Code: data
  minimisation](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/age-appropriate-design-a-code-of-practice-for-online-services/8-data-minimisation/),
  accessed 2026-08-21, supports minimum necessary data use. Removing this
  provider request is Parrot's engineering inference; applicability and lawful
  basis require legal review.
- [UNICEF Innocenti, *Guidance on AI and children
  3.0*](https://www.unicef.org/innocenti/reports/policy-guidance-ai-children),
  December 2025, provides a child-centred privacy and accountability frame. It
  does not prescribe this architecture or certify the product.

