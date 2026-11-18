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

## Production rollout

[PR #296](https://github.com/patrickchin/parrot-english/pull/296) merged as
`8735bf1b78262227983464687f0c207ea34d1ee0`. The
[player workflow](https://github.com/patrickchin/parrot-english/actions/runs/44226539267)
passed; native ESA Git build `189690527187084` succeeded at that exact source
on `release/player`, matching public `/api/health`. The
[API workflow](https://github.com/patrickchin/parrot-english/actions/runs/44226539286)
also passed exact-source, scoped-role, concurrency-one and unchanged owner-auth
readbacks. Sharing config returns 200 with the expected HTTPS API; owner config
remains disabled (503). No content publication or cleanup change was performed.

Required [PR Firefox QA](https://github.com/patrickchin/parrot-english/actions/runs/44225951181)
and [merged-main Firefox QA](https://github.com/patrickchin/parrot-english/actions/runs/44226539200)
both pass.

The same 1365 × 900 desktop flow was repeated against the public site using a
fresh Chromium context followed by a same-context reload. Health before and
after remains `8735bf1b`; all 21 pack URLs match the baseline. There is no
network interception or artificial throttling.

| Same live flow | Before `2be60d01` | After `8735bf1b` |
| --- | --- | --- |
| Cold Packs visible | 3,028 ms | 2,376 ms |
| Full reload | 1,028 ms | 418 ms |
| Pack → Home | 1,669 ms, document reload | 40 ms, no document/catalog/manifest request |
| Pack → scene list | 53 ms | 52 ms |
| Selected video metadata | 982 ms | 806 ms |
| Reload manifest transfer | 166,308 bytes, no cache hits | 0 bytes, 21/21 cache hits |
| Images requested before video metadata | 54 | 22 |

These are single unthrottled comparison samples; network latency is variable.
The unchanged pack-navigation time and reduced requests/cache transfers are
more repeatable signals than a general promise about first-visit speed.

A separate fresh 390 × 844 Chromium viewport check passes visible-poster and
mobile-header inspection with no page errors. It records 2,160 ms cold Packs,
317 ms reload (21 cached manifests / zero bytes), 874 ms selected-video metadata
and 41 ms Home navigation. This phone-shaped viewport is not a physical device.
The screenshot is saved locally under the project's Codex screenshots folder.

These browser checks do not establish physical-phone microphone reliability.
