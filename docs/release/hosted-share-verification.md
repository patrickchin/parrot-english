# Hosted guest-sharing browser verification

Completed 2026-11-16 at approximately 04:08 UTC against the live production
player and real Hong Kong guest API. Chromium and WebKit both passed.

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

- Dedicated API custom-domain DNS/TLS and hosted verification before enabling
  endpoint configuration for general friend testing.
- Owner authenticated management methods and browser acceptance. Native Bearer
  setup/readback and apex/www unauthenticated OPTIONS checks passed separately;
  missing and invalid credentials return 403 before the handler.
- Automatic OSS lifecycle cleanup is deliberately disabled by Patrick's
  2026-11-16 decision. API access still expires after seven days, and creators
  can remove shares; expired private objects remain stored and billed until
  removed. Do not treat lifecycle setup as a pending approval or release gate.
- Physical-phone and in-app-browser coverage remains separate from these
  desktop browser-engine checks.
