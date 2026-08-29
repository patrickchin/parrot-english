# Personalized Story Art

## Goal

Parrot English now implements one tightly bounded personalized-art slice for
children’s story content without turning the product into a general
photo-storage feature.

The implemented slice is:

- one generated derivative for **The Red Ball** page 1 (`the-red-ball` / `my-red-ball`);
- the same derivative reused as the lesson **"You"** speaking portrait during user turns;
- one story only and at most one current derivative per learner profile;
- explicit guardian attestation required every time art is generated;
- original learner photo never stored.

The Guardian account may own multiple learners, but this slice never shares art
between them. The server resolves the active learner from the current auth
session before every metadata, asset, generation, or deletion operation.

This record is grounded in the current story and lesson seams already referenced by:

- [src/stories/story-script-candidates.ts](../../src/stories/story-script-candidates.ts)
- [src/stories/StoryReader.tsx](../../src/stories/StoryReader.tsx)
- [src/stories/StoryArtwork.tsx](../../src/stories/StoryArtwork.tsx)
- [src/lessons/LessonPlayerUi.tsx](../../src/lessons/LessonPlayerUi.tsx)
- [tests/personalized-story-art-ui.test.mjs](../../tests/personalized-story-art-ui.test.mjs)
- [tests/personalized-story-art-client.test.mjs](../../tests/personalized-story-art-client.test.mjs)
- [tests/personalized-story-art-worker.test.mjs](../../tests/personalized-story-art-worker.test.mjs)
- [tests/e2e/personalized-story-art.spec.ts](../../tests/e2e/personalized-story-art.spec.ts)

## Why This Slice

The repository already treats stories and lessons as bounded presentation layers,
not general media stores:

- stories are durable route-backed reader content under `/stories/...`;
- learner lessons are profile-scoped JSON under `/api/lessons/my/*`;
- current public R2 media is only for approved non-personal background art, not
  for private learner media. See [background-media-r2.md](../deployment/background-media-r2.md).

The smallest useful personalized-art slice therefore is not "upload any photo
and use it everywhere". It is "generate one watercolor-style derivative for one
known story page, then reuse that derivative as the learner portrait in one
existing lesson seam."

## Investigated UI Seams

The current seam contracts already point to the intended first use sites:

1. **Story reader override**
   The tests expect page 1 of **The Red Ball** to prefer a private override image
   over the placeholder artwork, without mutating the checked-in story catalog.

2. **Lesson user portrait**
   The tests expect a learner speaking turn to render the same private image as
   an accessible storybook portrait for the `"user"` speaker path.

3. **Guardian-controlled opt-in panel**
   The tests expect a dedicated panel with:
   - a guardian consent checkbox;
   - learner photo upload;
   - generate state;
   - remove state.

These seams are sufficient for a vertical slice without inventing a new route
family or broad gallery UI.

The upload, attestation, generation, and deletion panel is Guardian-only and
appears in the URL-targeted learner's story settings with its page-local
`Editing settings for {learnerName}` context. Learner mode may render only an
already-ready derivative for the selected learner. It never renders the photo picker,
attestation, generation, deletion, roster, or a sibling name. Changing the
settings target aborts stale art work and reloads that sibling's independent
metadata without changing who will enter learner mode.

## Exact Vertical Slice

### Scope

- Story: `the-red-ball`
- Page: `my-red-ball`
- Story alt text: `You holding a bright red ball`
- Lesson portrait alt text: `You in storybook style`
- Provider: Cloudflare Workers AI `@cf/black-forest-labs/flux-2-klein-4b`
- Base scene reference: `public/assets/personalization/the-red-ball-scene-reference.webp`
- Consent version: `guardian-photo-cloudflare-v1`
- Prompt version: `red-ball-v1`
- Provider label stored in D1: `cloudflare-workers-ai`
- Storage: one private R2 derivative row per learner and story, backed by
  versioned object keys under `/versions/`

### Concept Preview

The current synthetic concept preview is embedded below:

![Synthetic personalized story art preview](assets/personalized-story-art-preview.png)

This preview uses a **fully synthetic learner reference**, not a real learner
photo. It is only a design aid for the record. The checked-in base scene input
for the implemented slice is:

- `public/assets/personalization/the-red-ball-scene-reference.webp`

### Out of Scope

- storing the original learner photo;
- multi-story support;
- multiple derivatives or history;
- admin review tooling;
- background jobs or queues;
- sharing across users or accounts;
- public URLs;
- multi-story account-wide artwork reuse beyond the current slice.

## Data Flow

The implemented flow is:

1. **Browser normalization**
   The browser accepts one learner photo and normalizes it to one metadata-free
   centered PNG before upload.

   Current contract anchor:

   - `480 x 480` centered PNG
   - EXIF, ICC, XMP, and IPTC removed

   This matches the current client test seam in
   [tests/personalized-story-art-client.test.mjs](../../tests/personalized-story-art-client.test.mjs).

2. **Authenticated upload**
   The browser `POST`s multipart form data to:

   - `/api/stories/the-red-ball/personalized-art`

   with:

   - normalized learner PNG
   - `guardianConsentAccepted=yes`
   - `guardianConsentVersion=guardian-photo-cloudflare-v1`

   The request must have a live Guardian unlock. The browser does not send a
   learner profile ID; the Worker resolves the current session's owned learner
   and uses that identity for the complete operation.

3. **Worker critical-chunk sanitizer**
   The Worker must not trust the browser-normalized upload as final.

   The Worker revalidates the uploaded PNG signature, critical-chunk order,
   checksums, dimensions, and supported image structure, then rewrites only the
   required critical chunks. It rejects corrupt or ambiguous files and drops
   ancillary metadata rather than forwarding camera-roll chunks.

   Requirements:

   - enforce bounded multipart read through the shared request-body helper;
   - reject any source image whose dimensions exceed the provider input cap;
   - strip any remaining metadata again server-side;
   - never persist the uploaded original bytes;
   - never log the uploaded bytes, object URLs, or prompt payloads.

4. **Scene reference selection**
   The Worker loads one checked-in base watercolor reference for **The Red Ball**
   page 1 from:

   - `public/assets/personalization/the-red-ball-scene-reference.webp`

   This reference is product-owned art, not user content.

5. **Generation**
   The Worker sends only:

   - the sanitized learner PNG;
   - the checked-in scene reference;
   - the constrained prompt version for this slice

   to Cloudflare Workers AI FLUX.2 [klein] 4B.

   Current implementation anchors:

   - provider model: `@cf/black-forest-labs/flux-2-klein-4b`
   - output dimensions: `1152 x 768`
   - returned artifact must pass server-side JPEG, PNG, or WebP signature checks

6. **Private derivative storage**
   The Worker stores only the generated derivative in private R2 under a
   learner-scoped, versioned key such as:

   - `personalized-story-art/<encoded_auth_user_id>/learners/<encoded_learner_profile_id>/<encoded_story_id>/versions/<object_id>.<ext>`

   For example:

   - `personalized-story-art/user-1/learners/learner-a/the-red-ball/versions/generation-2.png`

   Regeneration stages a new object under a fresh versioned key, deletes the old
   object, then updates the one learner/story audit row to the new key. The
   original upload is discarded after generation.

   Existing migrated rows retain their exact historical R2 keys. Only the
   profile marked `legacy_storage_owner` may attach and use a compatibility row
   whose `learner_profile_id` is still null; nonlegacy siblings never probe it.

7. **Authenticated metadata read**
   The browser `GET`s:

   - `/api/stories/the-red-ball/personalized-art`

   and receives metadata only for the active learner.

8. **Authenticated asset read**
   The browser `GET`s:

   - `/api/stories/the-red-ball/personalized-art/asset`

   The Worker reads the private R2 object and returns it with:

   - `Cache-Control: private, no-store`
   - `X-Content-Type-Options: nosniff`

   Metadata adds the row update time as a same-origin `?v=` query so React
   reloads the one stable object immediately after regeneration. The browser
   rejects any artwork URL outside this authenticated route shape.

   This learner's derivative is the only private image used in that learner's
   story page and lesson portrait. Selecting a sibling resolves a separate row
   and asset.

## Current Activation State

The shared worktree now reflects an activated implementation path:

- `PERSONALIZED_STORY_ART_ENABLED="1"` in [wrangler.jsonc](../../wrangler.jsonc)
- `PERSONALIZED_STORY_ART_DATA_APPROVED="1"` in [wrangler.jsonc](../../wrangler.jsonc)
- private R2 bucket binding:
  `parrot-english-personalized-story-art`
- dedicated rate limiter:
  `PERSONALIZED_STORY_ART_RATE_LIMITER`

This document records the code and configuration state only. It does **not**
claim that legal approval, production rollout approval, or guardian-facing user
acceptance has been independently verified in this document.

## Storage Contract

The implemented storage contract is one row per learner/story slice, with a
status-driven delete lifecycle.

Minimum row fields:

- `id`
- `auth_user_id`
- `learner_profile_id`
- `story_id`
- `status`
  Allowed first-pass states:
  - `ready`
  - `deleting`
- `r2_object_key`
- `content_type`
- `guardian_consent_version`
- `guardian_consent_at`
- `provider`
- `prompt_version`
- `created_at`
- `updated_at`

The row exists to prove:

- which Guardian account and learner profile own the derivative;
- which story it belongs to;
- which consent version authorized it;
- which provider and prompt version produced it;
- whether reads must be blocked during deletion.

The row must not contain:

- original image bytes;
- original image URL;
- EXIF or device metadata;
- face embeddings;
- biometric inferences;
- moderation prompt content;
- provider response payloads beyond the final derivative metadata.

The current unique key is `(learner_profile_id, auth_user_id, story_id)`. The
account ID remains for efficient account deletion and staged-migration
compatibility; normal reads require both it and the active learner ID. A
profile-scoped generation lease keyed by learner plus story prevents siblings
from blocking or replacing one another's generation. The old account/story
lease remains only as a compatibility authority for an outstanding migrated
legacy lease.

## Consent Contract

Generation requires a live Guardian unlock and explicit attestation every time
for the active learner.

The first-pass checkbox copy should remain close to the current test seam:

- `I confirm I am the child's guardian or have permission to use this photo.`

Implemented rules:

- generation stays disabled until the box is checked;
- the Worker requires both the attestation and the current consent version;
- the consent version is stored with the derivative row and R2 object metadata;
- changing the approved consent copy or legal meaning requires a new
  `guardianConsentVersion`.

Current implementation note:

- the Worker and tests now use `guardian-photo-cloudflare-v1`;
- this version string is evidence of the current code contract, not evidence
  that legal approved the underlying text or that guardians accepted it in
  production.

## Privacy Rules

### Original never stored

The original learner photo must never be persisted to:

- D1
- R2
- local build artifacts
- analytics
- logs
- error reporting payloads

The only persisted user-derived artifact is the final private derivative.

### No public delivery

Do not reuse the public immutable background-art pattern from
[background-media-r2.md](../deployment/background-media-r2.md). Personalized
story art is private learner media and must not use:

- public buckets;
- custom public domains;
- immutable cache headers;
- direct static URLs.

### No cross-account or cross-learner leakage

Metadata and asset reads must remain account- and learner-scoped:

- other authenticated users should see empty metadata;
- a sibling selected in the same account should see empty metadata unless that
  sibling has generated a separate derivative;
- other authenticated users should receive `404` for asset reads;
- a sibling must also receive `404` for another learner's asset row;
- anonymous requests should fail before static asset fallback.

## Deletion Contract

Deleting personalized art affects only the active learner's row and object. It
is implemented as a tombstone-plus-purge flow, not an optimistic row delete.

Required order:

1. mark row `deleting`
2. block reads immediately
3. purge the R2 object
4. delete the database row only after purge succeeds

If R2 purge fails:

- keep the row in `deleting`
- keep asset reads blocked
- allow a retry to finish the purge later

This matches the current worker and account-deletion test expectations.

### Account deletion integration

Account deletion is now implemented as a separate tombstone-and-sweep path:

1. persist an opaque `account_deletion_tombstone` outside the user-row cascade;
2. enumerate every owned learner profile and persist those storage identities
   in the tombstone before the account row can cascade;
3. mark all `personalized_story_art` rows for that account as `deleting`;
4. list and purge the encompassing user R2 prefix, including unreferenced art
   objects and dub objects, while excluding every required closure key;
5. persist one terminal marker plus 24 same-generation non-audio fences for the
   marked legacy learner and each nonlegacy learner namespace, plus the legacy
   v1 marker and nine slots once for the legacy owner;
6. only then allow the Better Auth user deletion cascade to remove the account,
   all learner profiles, and dependent D1 rows.

The tombstone and tiny non-audio dubbing closures intentionally outlive the user
row. The closure grows by 25 keys for each learner and includes ten additional
legacy-v1 keys once. Concurrent deletion hooks merge learner identities into
the persisted tombstone and converge on the same closures, fencing in-flight
uploads and resets without retaining recording bytes.

## Feature Flags and Current Gates

The capability still gates on both feature variables, but the current shared
worktree has both gates enabled:

- `PERSONALIZED_STORY_ART_ENABLED="1"`
- `PERSONALIZED_STORY_ART_DATA_APPROVED="1"`

Runtime behavior still requires both values to be `1`; neither flag alone is
sufficient.

The implementation also depends on:

- the private R2 bucket binding;
- the AI binding;
- the dedicated low-volume upload limiter.

## Provider Choice and Terms Review

### Current provider choice

The implemented slice uses Cloudflare Workers AI FLUX.2 [klein] 4B because:

- the current repository test seam already targets that exact model;
- the model is positioned for fast interactive image generation/editing paths;
- it keeps the first implementation on one Worker-adjacent path with one private
  R2 store and one provider review packet.

Official references:

- Cloudflare Workers AI data usage:
  <https://developers.cloudflare.com/workers-ai/platform/data-usage/>
- Cloudflare FLUX.2 [klein] 4B model page:
  <https://developers.cloudflare.com/workers-ai/models/flux-2-klein-4b/>
- Cloudflare R2 Workers API:
  <https://developers.cloudflare.com/r2/get-started/workers-api/>
- Cloudflare R2 object lifecycles:
  <https://developers.cloudflare.com/r2/buckets/object-lifecycles/>

### OpenAI comparison rationale

This is not a claim that OpenAI image generation is unusable. It is a first-pass
governance choice.

OpenAI’s official under-18 guidance says developers serving minors should add
extra safeguards, and that organizations should not use OpenAI services to
process personal data of children under 13 or the applicable age of digital
consent without first implementing Zero Data Retention.

Official references:

- OpenAI Under 18 API Guidance:
  <https://developers.openai.com/api/docs/guides/safety-checks/under-18-api-guidance>
- OpenAI data controls / Zero Data Retention:
  <https://developers.openai.com/api/docs/guides/your-data>
- OpenAI usage policies:
  <https://openai.com/policies/usage-policies/>

Cloudflare also exposes OpenAI image models with Zero Data Retention labeling,
including:

- <https://developers.cloudflare.com/ai/models/openai/gpt-image-1.5/>

Even so, the implemented slice stays on the existing FLUX.2 [klein] 4B seam
rather than moving child-photo-derived content to OpenAI image generation.

### Current provider review record

The current official-provider review findings are:

- Cloudflare states that it does not use Workers AI Customer Content to train
  models or improve Cloudflare or third-party services unless it receives
  explicit consent.
- Cloudflare also states that Workers AI models are third-party services and may
  be subject to separate provider license terms.
- The Cloudflare FLUX.2 [klein] model page links to Black Forest Labs terms, but
  no explicit **model-level** zero-data-retention guarantee was found on the
  Cloudflare model page itself.
- The linked Black Forest Labs terms grant a broader license over Input, Output,
  and Tasks to provide, develop, train, and improve its services and
  technologies.
- Black Forest Labs says future training use can be opted out of by contacting
  `legal@blackforestlabs.ai`, but the license continues for content already used
  for training and for retained safety, security, legal-compliance, and feedback
  cases.

This document records those published terms. It does **not** claim that those
terms are acceptable for production child-photo use, nor that any separate legal
review has approved them.

## Logging and Metrics

This slice needs operational metrics, but not content logging.

Allowed metrics:

- upload attempts
- validation failures by reason
- generation attempts
- generation latency buckets
- provider failures by class
- delete attempts
- delete retry counts
- successful story reads
- successful portrait reads

Do not log:

- prompts
- source image bytes
- generated image bytes
- alt text containing learner identity
- object keys
- consent checkbox free-form notes
- raw provider request or response bodies

If request tracing is needed, use opaque IDs only.

## Residual Non-Atomic Crash Risk

The implementation is fail-closed in the ordinary handled-error paths, but it is
not globally atomic across D1 and R2.

The remaining honest risk is a process crash or runtime termination between
storage steps that cannot be wrapped in one transaction across both systems. The
most important residual race is:

1. new versioned object is written to R2;
2. old object is deleted from R2;
3. process crashes before the D1 row is updated to the new key.

In that window:

- the existing row can still point at an object that has already been deleted;
- the new candidate object can exist in R2 without being referenced by D1;
- reads can fail until regeneration, deletion retry, or account-deletion sweep
  repairs the state.

The code includes compensating cleanup on handled exceptions, and account
deletion sweeps the whole user prefix, but a hard crash between R2 and D1 steps
still leaves a non-atomic recovery gap.

## Current Checklist Status

The implementation now satisfies the core technical slice in code and tests:

- The Red Ball page 1 override path exists
- lesson `"user"` portrait reuse exists
- account- and learner-scoped metadata and private asset reads exist
- sibling rows, R2 keys, and generation leases are isolated
- original photo is not persisted as an application object
- delete tombstone/purge/retry exists
- account deletion tombstone plus every-learner full-prefix sweep exists
- dedicated R2 bucket binding exists
- dedicated rate limiter exists
- both runtime gates are currently set to `1` in the shared worktree

What this document does **not** verify:

- legal approval;
- guardian-facing copy approval;
- production rollout approval;
- separate vendor review acceptance.

### Remaining non-code approvals and operational checks

- guardian attestation copy approved
- consent version string approved
- privacy-policy and guardian-facing disclosure approved
- provider terms and data-handling review completed
- explicit decision recorded for under-13 handling and applicable age-of-digital-consent handling
- lifecycle rules reviewed for abandoned multipart uploads and any delayed cleanup policy
- operations runbook and on-call expectations recorded

### Verification anchors

- unit tests for client normalization pass
- unit tests for provider image pipeline pass
- worker tests for auth, sibling ownership, legacy-key compatibility, delete,
  and retry pass
- worker tests for account deletion and tombstone sweep pass
- e2e tests for story panel, story override, lesson portrait, and account deletion pass
- observability confirms counters and latency without content logging

## Follow-on Work After the First Slice

After the single-story synchronous slice is proven, the next steps can expand in
this order:

1. **Multi-story support**
   Add a controlled mapping for more story/page anchors, one approved scene
   reference per page.

2. **Async generation**
   Move generation off the blocking request path into a job model with explicit
   pending and failed states.

3. **Regeneration and versioning**
   Allow replacing one derivative while preserving safe delete semantics.

4. **Broader portrait reuse**
   Reuse the same derivative across more `"user"` speaking-turn contexts only
   after the initial story/lesson pair is stable.

5. **Admin tooling**
   Add orphan detection, purge verification, and support-safe diagnostics without
   exposing learner media.

6. **Crash-recovery hardening**
   Reduce the remaining R2/D1 non-atomic window with stronger resumable repair
   logic, explicit staged-object scavenging, or a job model that can reconcile
   incomplete transitions.

## Summary

The implemented scope remains intentionally narrow:

- one private derivative for **The Red Ball** page 1;
- one independent derivative row and object namespace per learner profile;
- reuse of that derivative as the lesson **"You"** portrait;
- no stored original learner photo;
- explicit guardian attestation with `guardian-photo-cloudflare-v1`;
- versioned private R2 objects plus learner-scoped D1 audit rows, with exact
  legacy object keys preserved for migrated data;
- completed delete and account-deletion purge flows, with one remaining
  non-atomic crash window across R2 and D1;
- published provider-review caveats recorded without claiming legal approval or
  guardian-facing acceptance.
