# Deterministic profile acknowledgment implementation

- Status: implemented and locally verified
- Branch: `codex/deterministic-profile-acknowledgments`
- Stacked on: `codex/story-reader-page-focus-visibility` (`1fb33b6`)
- Implementation commit: `77916ca`
- Research decision: [deterministic profile acknowledgments](./deterministic-profile-acknowledgments-guidance.md)

## Outcome

Every successful form-profile answer now produces exactly `Thank you!` as the
child-visible and runtime-TTS text. Groq still performs factual summary and
canonical name/age enrichment, but it is no longer asked to write public copy.

The boundary is enforced in three places:

1. The checked-in questionnaire contains the reviewed phrase for all six
   questions, and validation rejects drift from that product constant.
2. `writeV2Response` derives the stored acknowledgment from the trusted
   question definition rather than accepting it from enrichment.
3. Worker responses and TTS select the current question phrase, while profile
   reads project the current constant over historical stored prose.

This means a mocked or future provider result containing a name, address,
markup, prompt-injection text, or a full 160-character acknowledgment cannot
control what is newly stored, shown, or spoken. Existing version-two rows remain
readable and are not rewritten just because they are read.

## Compatibility

- The public `{ text, audio }` response shape is unchanged on this branch.
- The persisted `responses[*].acknowledgment` field remains required and bounded
  to 160 characters, so existing version-two data remains valid.
- `enrichmentStatus` is retained and now describes summary/canonical enrichment
  only.
- Identical-answer retries still avoid another Groq call, but no longer replay a
  historical generated acknowledgment.
- The existing 160-character UI fixture remains as defensive rendering
  coverage for legacy or old-client input, not as a current server-output case.
- Realtime profile conversation is a separate, purpose-specific speech surface
  and is not changed or claimed deterministic here.

## Prompt and schema change

The Groq structured-output schema now has exactly three fields:

- `summary`
- `canonicalName`
- `canonicalAge`

The system prompt says that the question and answer are untrusted data rather
than instructions. It contains no request for a friendly response or public
acknowledgment. Strict JSON remains useful for shape, while public wording is
kept outside the model boundary.

## Responsive visual review

Genuine in-app Browser screenshots are indexed in the [artifact
manifest](../../artifacts/ux-review/deterministic-profile-acknowledgments/manifest.md).
The reviewed phrase was exercised in the real mounted flow rather than rendered
as an isolated component.

| Viewport | Heading box | Next box | Horizontal overflow | Main scroll origin |
| --- | --- | --- | --- | --- |
| 280×568 | 127.375×30 at y=283 | 144×52 at y=321 | 0 px | 0 |
| 390×844 | 159.219×37.5 at y=457.25 | 144×52 at y=514.75 | 0 px | 0 |
| 640×360 | 127.375×30 at y=117.5 | 144×52 at y=190.5 | 0 px | 0 |
| 1440×900 | 254.742×60 at y=506 | 144×52 at y=586 | 0 px | 0 |

At every size the heading owned focus, the Next target exceeded the 44-pixel
project minimum, content stayed at the main scroll origin, and both document
and main horizontal overflow were zero. The short landscape retained the
picture/text two-column composition.

For comparison, the retained 160-character legacy fixture occupies 300 pixels
of heading height at 280×568, compared with 30 pixels for the selected phrase.
Both remain usable, but the comparison makes the normal reading-load reduction
visible without presenting it as a measured comprehension result.

The visual review also logged one non-blocking follow-up: the programmatically
focused, noninteractive heading uses a tight rectangular focus cue that can
resemble a text field now that the phrase is short. Preserve heading focus, but
test the established external reading-position marker pattern for profile-step
headings, including forced-colors behavior, in a separate visual branch.

## Automated verification

- Focused domain/enrichment/worker/infrastructure tests: 53/53 passed.
- Full Node and mounted lifecycle suite: 680/680 passed.
- Responsive Chromium suite: 236/236 passed in 47.6 seconds.
- Production TypeScript and Vite build passed.
- ESLint passed with zero errors and the two pre-existing generated declaration
  warnings.
- `git diff --check` passed.

The worker tests specifically cover Unicode, markup, private-address,
prompt-injection-like, and exact-500-character answers; an exact-160-character
provider acknowledgment; generated and fallback enrichment statuses; new
stored copy; the text sent to runtime TTS; client metadata rejection; explicit
historical projection reads through both profile endpoints; an unchanged retry
that leaves old D1 data intact; bulk-order behavior; repeated identical public
copy with renewed heading focus; and atomic validation failure with no TTS.

## Timing boundary

This branch makes public text deterministic but intentionally retains runtime
ElevenLabs synthesis for review compatibility. The request still has the serial
Groq → persistence → acknowledgment-TTS path. The next stacked branch will use
the existing checked-in `peppa-thank-you` asset, change the browser to play its
same-origin source directly, and remove runtime acknowledgment synthesis and
its production secret from this path.

## Rollback

Reverting the implementation commit restores generated acknowledgments without
a database migration. New rows written by this branch contain a valid short
acknowledgment that older code can read. Historical generated text has not been
deleted or rewritten, so rollback does not depend on reconstructing data.
