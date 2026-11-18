# Page-loading performance — 2026-11-18

Baseline: public player `2be60d01a2bff681346bdbfc57c6ba64cc76c821`.
Fresh Chromium measurements used real ESA/OSS requests without routing or
network interception. Timings reflect the test network, not a device guarantee.

| Observed baseline | Result |
| --- | --- |
| Cold Packs page | 3.03–4.30 seconds |
| Same-context reload | About 1.03 seconds; all 21 manifests downloaded again (166 KB compressed) |
| Home wordmark from a pack | About 1.67 seconds; full document/catalog/manifest reload |
| Pack → scene list | About 53 milliseconds |

The browser was explicitly forbidden from caching every metadata request,
including immutable release files. Initial discovery also downloaded unrelated
player/management code. Native lazy images fetched several screens ahead;
thumbnail requests queued selected video behind the OSS HTTP/1.1 connection
limit. No main-thread tasks over 50 ms were observed.

## Changes

- Keep the mutable catalog `no-store`; honor native HTTP cache headers for
  versioned pack and scene metadata. Publication creates new immutable URLs;
  every discovery refresh still checks current catalog membership.
- Use existing SPA navigation for the Home wordmark.
- Defer player, owner, saved-dub and shared-playback modules. Fetch player code
  alongside selected scene metadata. Keep the primary scene library eager.
  Chunk failures retain localized recovery and native page reload.
- Skip public catalog discovery on owner, shared-playback and unknown routes;
  entering public browsing starts it when needed.
- Preconnect to the existing content origin. Load gallery posters near the
  viewport using native IntersectionObserver, keeping the first two eager and
  the first at high priority. Keep loaded images assigned while scrolling.

The initial entry bundle is 687,408 bytes / 223,911 bytes gzip, compared with
768,550 / 249,440 before (about 10% less compressed JavaScript). Code and storage
boundaries are unchanged: ESA code, native FC APIs, OSS metadata/media/private
state, and browser IndexedDB drafts. No content publication, cloud resource,
authentication, cleanup policy or media encoding change is included.

## Verification

- TypeScript, 41 app tests, 17 content tests and the application boundary test
  pass; all 32 API tests pass.
- 24 focused production checks pass, including deferred-module requests,
  localized failed-chunk recovery, and all supported language routes.
- 29 focused Chromium browser cases and 58 phone Chromium/WebKit cases pass:
  publication/withdrawal, navigation, cold media start, saved resume, owner
  uploads/visibility and account-free playback/removal. After the final thumbnail
  change, 30 poster/navigation checks pass across desktop Chromium, phone
  Chromium and phone WebKit, including offscreen requests and scrolling.
  The final sticky-image correction passes nine focused poster cases across
  those engines and three production bundle/recovery cases.
- A local production build with real OSS responses confirms 21/21 manifests
  come from the browser cache on reload with zero transferred bytes. Home
  navigation makes no document, catalog or manifest request. Localhost timings
  are not used as production speed comparisons.
- With the same local-build/real-OSS flow, tighter poster loading reduces image
  requests before video metadata from 54 to 22 and image transfer from 673 KB
  to 307 KB. Sample video queue delay falls from 2.2–2.5 seconds to 144–149 ms.
  This isolates the thumbnail change; it is not a production cold-page claim.

Production rollout and timing verification are recorded after the release.
These browser checks do not establish physical-phone microphone reliability.
