# Pack management and guest sharing verification

Date: 2026-11-15. Candidate source: `20479f33ffd5c3ea2f988927e9ef5c62d5eb299f`
on `codex/franchise-pack-uploads`. The previous production release remains
`c527d8cf5028d78e26f18617b132f835d51eb7e2`; these are separate revisions.

## Confirmed checks

- TypeScript passes. Final `npm test` passes: 39 application tests, 17 content
  tests, and one application/content boundary test.
- `npm run test:api` passes 28 compiled API tests. Real installed OSS SDK signing
  and conditional-copy request construction are tested without network calls.
- Player build and standalone API packaging succeed. The ESA code budget remains
  below 4 MiB; media and content data remain outside both code bundles.
- Source validates: 21 packs / 128 scenes / 277 referenced files / 513 existing
  OSS references. All 256 scene and waveform files are byte-identical to the
  prior release. Pack credits, scene notices, and permission labels remain;
  105 localized library notices now accurately describe opt-in video uploads.
- An isolated checkout of the content-only PR passes the unchanged current-main
  validate/stage commands. Its staged catalogue preserves Patrick as uploader
  on all 21 entries. Current content revision: `2cffc4b3d39c6ce21bd3c273`.
- Focused browser coverage resolves to 281 passed / 16 intentional WebKit
  microphone skips out of 297 unique cases, after targeted reruns. The initial
  run was 255 passed / 16 skipped / 26 failed. Fixes cover stale catalogue
  assertions, native File/Blob body instrumentation, dialog close synchronization,
  and a real practice-height regression from hidden result sharing controls.
  The fit assertions were retained.
- Owner and guest UI screenshots at 390/768/1440 were reviewed. Shared playback
  works independently of catalogue load, preserves source credits, rejects
  foreign media URLs, handles unavailable/expired links, and exposes removal
  only when the creator capability exists on this device.

These checks use mocked object storage/API services for browser flows. They do
not establish hosted permissions, native authentication, provider concurrency,
actual OSS CORS/signed-length behavior, cleanup rules, or physical-phone sharing.
The existing synchronization guard is unchanged. Previous WebKit timing evidence
remains in [engineering readiness](engineering-readiness.md).

## Follow-up after network recovery

On 2026-11-15, the socket pool had cleared to 19 TIME_WAIT entries and the
previous Puptime listener was absent. Nothing was stopped in that other project.
The old preview from this Parrotbook chat on port 19317 was identified and closed.
The final checks resumed against the exact candidate source above:

- Built-player checks: **23/23 pass** (22.7 seconds), including gallery reload,
  device-local video handling without upload, and routes in five languages.
- Visual/privacy checks: **30/30 pass** (1.6 minutes), with all 21 actual cover
  images decoded before screenshot inspection at 390/768/1440.
- Deduplicated total: **332 unique cases, 316 passed / 16 intentional skips**.
  The extra checks add 35 unique cases; 18 visual cases repeat existing coverage.
- Servers on 20337/20339 stopped after the run. Logs:
  `/private/tmp/parrotbook-production-final.log` and
  `/private/tmp/parrotbook-visual-final.log`.

The earlier socket failures below are retained as historical diagnostics; they
no longer block testing or Git pushes.

## Historical network interruption

Additional visual and built-player checks encountered immediate localhost
`ERR_ADDRESS_INVALID`/blank navigation across multiple engines, ports, and a
single-worker retry. An independent Git push also failed with “Can't assign
requested address.” Read-only diagnostics found about 16,250 TCP TIME_WAIT
sockets in a 16,384-port ephemeral range. Nearly all traffic targets a temporary
Node listener for another project. Our test servers were stopped; the pool
continued filling. No OS settings or unrelated processes were changed.

The delivery lead asked whether that other temporary server could be stopped.
No permission was inferred from the owner’s follow-up question. It had already
stopped when rechecked, and the checks above then passed without intervention.

The [deployment runbook](../owner-upload-deployment.md) records the cloud setup
and mandatory hosted checks. No new FC service, role, authentication token,
custom domain, upload CORS rule, cleanup rule, or production endpoint has yet
been created or enabled by this increment.

## Catalogue publication

Content-only PR #275 merged as `e8f9878ba4858a8ba74197f300b6de9af0ea00be`;
workflow 43614028659 succeeded and skipped player deployment. A clean isolated
checkout staged revision `2cffc4b3d39c6ce21bd3c273` with 21 packs / 128 scenes,
all with uploader Patrick.

Published `content/catalog.json` at **2026-11-14T17:26:27Z**. Public readback
verified 3,459 bytes, SHA-256
`c69b801a2ce982b92a9043348a61b5c8bd549389b2f17761b2f7881a86660acf`,
JSON content type, and `Cache-Control: no-store`. All 277 referenced JSON objects
were compared byte-for-byte with the staged source and checked for immutable
caching; all 513 existing media references returned the expected MIME and size.
The live player loaded all 128 scenes after reload. Its UI is still the prior
released application; this publication does not deploy PR #276.

Operator transport differed from the normal local CLI: the local Alibaba CLI
and credentials were unavailable, while the connected presign helper returned
an unusable temporary key. An authenticated native OSS-console folder upload
sent only the staged release JSON. A dry run matched exactly the 277 new keys
before native remote ossutil updated their metadata. The bulk tool response
timed out, so success was established by full public byte/header readback.
RunScript staged the catalogue separately, native ossutil assigned no-store,
then CopyObject activated it last with a source ETag condition after checking
the old live catalogue and new staged bytes. No local `content:publish` command
was run, no existing media was uploaded, and no credentials were exported.

The private operator receipt and previous catalogue backup remain in
`/var/folders/x_/vg780c193vv2kvpwn43xxcr00000gn/T/parrotbook-bootstrap-RxpPfV/`.
The disposable transport helper's two safety tests pass. It requests identity
encoding on GET so OSS retains ETags during verification.
