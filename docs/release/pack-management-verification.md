# Pack management and guest sharing verification

Date: 2026-11-14. Candidate source: `e31ffb59068109f24868f6e9bcf8da73f5449f52`
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

## Remaining verification

Additional visual and built-player checks encountered immediate localhost
`ERR_ADDRESS_INVALID`/blank navigation across multiple engines, ports, and a
single-worker retry. An independent Git push also failed with “Can't assign
requested address.” Read-only diagnostics found about 16,250 TCP TIME_WAIT
sockets in a 16,384-port ephemeral range. Nearly all traffic targets a temporary
Node listener for another project. Our test servers were stopped; the pool
continued filling. No OS settings or unrelated processes were changed.

The delivery lead asked the owner whether that other temporary test server may
be stopped. Final decoded-gallery screenshots and the remaining built-player
checks will resume after the local network pool recovers. These interrupted
checks are not recorded as application passes.

The [deployment runbook](../owner-upload-deployment.md) records the cloud setup
and mandatory hosted checks. No new FC service, role, authentication token,
custom domain, upload CORS rule, cleanup rule, or production endpoint has yet
been created or enabled by this increment.
