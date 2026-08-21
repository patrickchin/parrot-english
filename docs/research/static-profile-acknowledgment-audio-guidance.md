# Saved profile acknowledgment audio

Status: implemented and retained provisionally
Research date: 2026-08-22
Audience in scope: children around age five who may be pre-readers or Pre-A1
English learners, plus the grown-ups helping them

Implementation and verification are recorded in [saved profile acknowledgment
audio implementation](./static-profile-acknowledgment-audio-implementation.md).

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
`peppa-thank-you`, with speaker metadata `peppa`, language metadata `en-US`,
the transcript `Thank you!`, and source
`/assets/audio/peppa-thank-you.mp3`.

Inspection on 2026-08-22 found:

| Property | Observed value |
| --- | --- |
| Source file | `public/assets/audio/peppa-thank-you.mp3` |
| Container / encoding | MP3, MPEG layer III, 128 kbps, 44.1 kHz mono |
| Estimated duration | 1.071020 seconds |
| File size | 17,598 bytes |
| SHA-256 | `4b90bc530f89e28e972d0c8ea92faad4728266523dca56a4719c94cf2f3abc8a` |
| Registered transcript | exact `Thank you!` |

The saved-audio generator is ElevenLabs-only and the asset is already checked
in. No local or macOS text-to-speech substitute is needed or allowed.

At the research baseline (`a94fc9c`), the runtime path lived in
`worker/learner-profile-acknowledgment-audio.ts`; this implementation removes
that file. It accepted an ElevenLabs API key, sent the public confirmation to
the provider, waited up to the configured bound, read up to one megabyte, and
embedded a base64 copy in each JSON response. The baseline browser path in
[`LearnerProfileAcknowledgment.tsx`](../../src/learner-profile/LearnerProfileAcknowledgment.tsx)
reconstructed the same media bytes as a temporary object URL.

## Why the saved reference is preferable

### Child-perceived response time

Removing synthesis makes the successful response structurally independent of
the acknowledgment TTS provider and its timeout. The reliable claim is **zero
runtime acknowledgment-synthesis calls or waits**, not a universal millisecond
saving. Groq enrichment and D1 persistence remain on the answer's critical
path, and the browser still has to fetch and decode the static file before
sound can begin.

### Reliability and pacing

One deployed asset has a stable ID, URL, catalog transcript and speaker
metadata, byte identity, and duration. A provider failure can no longer turn a
successful answer into a silent response after a long wait. A static media
request can still fail, be slow, or be blocked by autoplay policy, so visible
feedback and **Next** remain independent.

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
catalog transcript before serializing it. This keeps the public text and asset
metadata from drifting silently. It does not verify the audible words encoded
in the MP3.

The browser consumes the existing `LearnerProfileAudio` shape used by question
prompts:

- `id` identifies the selected checked-in asset;
- `src` is the same-origin public path; and
- `text` is the exact speech transcript.

`audio` remains optional and nullable as a defensive client contract. A
malformed, missing, slow, blocked, or failed optional media item must never hide
the confirmation, disable **Next**, schedule navigation, or prevent cleanup.

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

The existing checked-in catalog asset has the exact selected transcript.
Generating another asset adds cost and another voice/content review without
changing the user-facing contract. A human must still listen to the retained
file to confirm its exact audible words, voice and clarity, clipping or silence,
and level.

### Remove acknowledgment sound

Audio can support learners who cannot yet read the confirmation. The problem is
the runtime dependency, not the existence of the saved cue.

## Acceptance and evidence outcome

The implementation and tests establish that:

- every single-answer and bulk changed-answer response returns the exact
  `peppa-thank-you` ID, source, and transcript;
- the registered audio transcript exactly equals the visible acknowledgment;
- unchanged-answer retries return the current reference without enrichment or
  synthesis;
- the Worker has no runtime acknowledgment TTS module, dependency, fetch,
  timeout setting, or production secret requirement;
- a legacy injected `synthesizeAudio` function is never invoked;
- bulk edits return references in questionnaire order without a per-answer
  synthesis loop;
- the browser passes `audio.src` directly to the media element and performs no
  base64, `Blob`, or object-URL work;
- playback end, error, rejection, unmount, missing media, and malformed legacy
  media remain idempotent cleanup paths and never navigate;
- a pending or failed playback operation does not hide the visible `Thank
  you!`, focused heading, or enabled Next action; and
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
AI-01, PRIV-06, VOICE-04, VOICE-09, and VOICE-11.

- [WHATWG, HTML Living Standard: media
  elements](https://html.spec.whatwg.org/multipage/media.html), last updated
  2026-08-21 and accessed 2026-08-22, defines media and `play()` behavior. It
  does not prove audible physical output or a child's perception.
- [Chrome autoplay policy](https://developer.chrome.com/blog/autoplay/) and
  [WebKit's iOS media policy](https://webkit.org/blog/6784/new-video-policies-for-ios/)
  document user-activation restrictions, including direct `<audio>` playback
  on iOS. Exact current embedded or installed-app behavior still requires
  target-device testing; the WebKit article dates from 2016.
- [W3C WAI, Understanding SC 1.4.2: Audio
  Control](https://www.w3.org/WAI/WCAG22/Understanding/audio-control.html),
  updated 2025-09-16 and accessed 2026-08-22, explains the three-second
  control threshold and why automatic sound can interfere with screen-reader
  speech. The 1.071-second asset is below that duration threshold, but target
  assistive-technology testing remains necessary and the page is informative,
  not a conformance certificate.
- [UK ICO Children's Code: data
  minimisation](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/age-appropriate-design-a-code-of-practice-for-online-services/8-data-minimisation/),
  accessed 2026-08-21, supports minimum necessary data use. Removing this
  provider request is Parrot's engineering inference; applicability and lawful
  basis require legal review.
- [UNICEF Innocenti, *Guidance on AI and children
  3.0*](https://www.unicef.org/innocenti/reports/policy-guidance-ai-children),
  December 2025, provides a child-centred privacy and accountability frame. It
  does not prescribe this architecture or certify the product.
