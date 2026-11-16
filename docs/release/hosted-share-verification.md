# Hosted guest-sharing browser verification

Latest public custom-domain checks completed 2026-11-17, Asia/Shanghai.
Earlier provider-endpoint evidence is retained separately below.

## Public custom-domain verification, 2026-11-17

Both the real production player and Hong Kong guest API used merged source
`8e40e5b2826892afa209e2d2409d114511938da3` from
[PR #288](https://github.com/patrickchin/parrot-english/pull/288).
Native ESA Git build `189456526729324` published that source from
`release/player`, with `SHARE_API_URL=https://share-api.parrotbook.com`.
Public health and sharing config returned 200 with the expected revision/URL;
owner config remained 503 and its variable was absent.

The first custom-domain enablement exposed duplicate CORS headers on actual
browser GET responses. Sharing was disabled by publishing an empty
`SHARE_API_URL`; it was not deleted. PR #288 removed function-generated CORS
headers so native FC emits them once, while preserving origin/preflight
rejection before storage. After API workflow
[43935531075](https://github.com/patrickchin/parrot-english/actions/runs/43935531075)
and player workflow
[43935531177](https://github.com/patrickchin/parrot-english/actions/runs/43935531177)
succeeded, both apex/www actual GETs and OPTIONS had one exact origin value.
Fresh Chromium pages at both origins read the API JSON successfully; foreign
and malformed preflights still returned 403. Sharing was re-enabled only after
these browser checks passed.

Chromium and WebKit then each passed the full public flow at 390 × 844 with
**no network interceptions**. Each used generated 660 Hz learner takes with the
actual published `corn-corntastic-day` source footage and original audio outside
replaced turns. No microphone or human recording was used.

| Operation | Result in both browsers |
| --- | --- |
| Export and download actual MP4 | Valid MP4; SHA-256 matched the later published video |
| Prepare video and open upload consent | No share created |
| Confirm upload and create link | Create 201, OSS PUT 200, publish 200 |
| Creator and fresh-context playback | Video time advanced; ranged GET 206, 1,024 bytes |
| Fresh viewer permissions | No creator-removal control |
| Remove through creator confirmation UI | DELETE 204 |
| Fresh viewer and API after removal | 410 |

Exactly two test shares were created and removed. Published source credits were
preserved. The public catalogue SHA-256 remained
`c69b801a2ce982b92a9043348a61b5c8bd549389b2f17761b2f7881a86660acf`.
All contexts and browsers closed; the runner exited successfully. The browser
run did not independently re-read OSS ACLs or enumerate deleted objects; earlier
backend smoke evidence covers those checks. Native device sharing, physical
microphones, backgrounding and in-app browsers remain untested here.

Status/hash-only receipts and scratch runners:

- `/private/tmp/parrotbook-hosted-acceptance/public-results.json`
- `/private/tmp/parrotbook-hosted-acceptance/public-run.log`
- `/private/tmp/parrotbook-hosted-acceptance/hosted-public.mjs`
- `/private/tmp/parrotbook-hosted-acceptance/cors-public-results.log`

The four `hosted-guest-{chromium,webkit}-{created,removed}.png` screenshots in
`~/Pictures/Screenshots/Codex/parrot-english/` now show this latest public run,
replacing the same filenames from the earlier provider-endpoint check.
Creator capabilities and signed URLs stayed in ephemeral browser/runner memory;
they were not written to the status receipts or screenshots.

## Earlier provider-endpoint verification, 2026-11-16

Completed at approximately 04:08 UTC against the live production player and
real Hong Kong guest API. Chromium and WebKit both passed.

## Environment and boundaries

- Playwright 1.61.1, bundled Chromium 149.0.7827.55 (revision 1228) and WebKit
  26.5 (revision 2311), isolated desktop-browser contexts at 390 × 844.
- Production player: `https://parrotbook.com`. A post-run `/api/health` check at
  04:11:02 UTC returned revision
  `67485f08b978097531da8f6e2d6708bdff8f9f43`. A health revision was not captured
  separately for every browser navigation.
- Guest function: `parrotbook-guest-shares`, deployed from
  `75cd550d2f778033816f2262d14398f95082e2f3`, using its provider testing HTTPS
  endpoint. Custom-domain TLS was not tested here.
- The only intercepted network route was `/api/share-config`, returning the
  real guest endpoint. API, OSS PUT, signed playback, published content, and
  application requests used their real transports.
- A completed IndexedDB draft was seeded with generated 660 Hz WAV learner
  takes for the existing `corn-corntastic-day` scene. No microphone or human
  learner recording was used. The normal remote-scene export retained the
  published source footage and audio outside replaced turns: this was **not**
  a wholly synthetic audiovisual upload. A generated source-video fixture was
  seeded too, but remote scenes do not use that saved source override.

## Results

Each browser created one disposable share, for two in total. Neither preparing
the video nor opening its consent dialog created a share. Confirmation then
completed the real network flow:

| Operation | Result in both browsers |
| --- | --- |
| Create share from the app | 201 |
| Browser PUT to private OSS staging | 200 |
| Publish with creator capability | 200 |
| Creator and fresh-context viewer metadata | 200 |
| Actual video playback from OSS | 206; playback time advanced |
| Creator removal through confirmation UI | 204 |
| Fresh viewer after removal, and API verification | 410 |

The fresh viewer had no creator-removal control. Both disposable shares were
removed through the intended creator UI. No additional share was created.
The browser check did not independently re-read OSS object ACLs or list deleted
objects; separate backend smoke testing covers those properties.

A separate read-only burst of 12 simultaneous requests to a nonexistent share
returned one application 404 and eleven provider 429 responses. This observes
the configured single-invocation admission cap without creating tickets or
uploads. It does not exercise the daily creation limit at its boundary.

All contexts, browsers, and the initial isolated CLI browser were closed. No
preview server was started. No cloud administration or Git mutation occurred.

## Evidence

Redacted status-only audit and scratch harness:

- `/private/tmp/parrotbook-hosted-acceptance/results.json`
- `/private/tmp/parrotbook-hosted-acceptance/hosted.mjs`

Screenshots under `~/Pictures/Screenshots/Codex/parrot-english/`:

- `hosted-guest-chromium-created.png`
- `hosted-guest-chromium-removed.png`
- `hosted-guest-webkit-created.png`
- `hosted-guest-webkit-removed.png`

The four screenshots were visually checked. They contain no signed OSS URL or
creator capability; the creation dialogs show only unsigned application
playback links. Scratch text files were checked for actual capability-token
patterns and signed-URL parameters, with no matches. Capabilities and signed
URLs were not written to the audit or terminal output; creator authority was
held in the ephemeral browser/runner memory only.

## Later deployment verification

Deployment readback is now green under the scoped CI role: workflow
[43809621870](https://github.com/patrickchin/parrot-english/actions/runs/43809621870)
verified `ee6fc7ab7322a98ddef302c89f8bc94cb7e21280`, runtime roles, both
concurrency caps and unchanged owner authentication. Post-deploy owner
missing/invalid tokens return 403, both website preflights return 204, and
the removed synthetic share still returns 410. These are later operational
checks, not a rerun of the earlier two-browser upload scenarios.

## Remaining release gates

- Guest API custom-domain DNS/TLS and public browser sharing verification are
  complete as recorded above.
- Owner custom HTTPS, authenticated management methods and browser acceptance
  remain. Native Bearer
  setup/readback and apex/www unauthenticated OPTIONS checks passed separately;
  missing and invalid credentials return 403 before the handler.
- Automatic OSS lifecycle cleanup is deliberately disabled by Patrick's
  2026-11-16 decision. API access still expires after seven days, and creators
  can remove shares; expired private objects remain stored and billed until
  removed. Do not treat lifecycle setup as a pending approval or release gate.
- Physical-phone and in-app-browser coverage remains separate from these
  desktop browser-engine checks.
