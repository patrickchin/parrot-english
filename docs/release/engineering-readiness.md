# Engineering readiness — 2026-11-14

Assessment snapshot: detached worktree at `53f3d594020778c267c3e961b26e3ee4096e1b40`.
The test results below apply to that local snapshot, not the newer remote main.
Live operational reads are separately identified below. No production, cloud
configuration, remote Git refs, application code, or shared checkout changed.
Ponytail was used for the review: retain the established architecture and address
demonstrated release gaps before adding infrastructure.

## Verification run

Environment: Node `v24.19.0`, npm `11.17.0`, FFmpeg and FFprobe present on PATH.
Dependencies were initially absent; the first `npm test` and `npm run build`
attempts exited 127 at `tsc`. After authorized `npm ci` installed 287 locked
packages, both commands completed successfully:

| Check | Result |
| --- | --- |
| TypeScript (`npm run test:typecheck`) | Passed |
| App tests | 37 passed; 0 failed, cancelled, skipped or todo |
| Content tests | 14 passed; 0 failed, cancelled, skipped or todo; validates 111 internal-test scenes |
| App/content build boundary | 1 passed; 0 failed, cancelled, skipped or todo |
| `npm test` total | 52 tests passed, plus TypeScript |
| `npm run build` | Passed; 5 ESA assets, 0.44 / 4.00 MiB |
| Browser suite | Not run in this assessment; requires separate evidence |
| Physical devices and mainland network | Not exercised |
| Live ESA/health | Read-only evidence recorded below; no live learner journey exercised |

The build warns that the minified entry chunk is 710.19 kB (233.42 kB gzip).
This is a performance investigation candidate, not a demonstrated usability failure
or ESA size-budget blocker. Installation reported two pending `fsevents` install
scripts; no script approvals or dependency changes were made, and checks passed.
Command logs are temporary local files under `/tmp/parrotbook-engineering-*.log`.

## Readiness judgment

The tested snapshot has a passing logic/content/build baseline. It is suitable
for the next browser and physical-device validation stage. It has insufficient
evidence for a general phone release. A child release additionally needs the
planned guardian save/recording controls; adult IndexedDB autosave is explicitly
not the child-release design ([product plan](../product-plan.md:41)). Content
permissions and operator decisions remain separate release gates.

The existing architecture remains appropriate for this assessment: ESA serves
application code and health; OSS holds public catalogs, structured scene data,
and media; browser IndexedDB holds learner takes. No new backend or account
system is warranted by the evidence ([infrastructure](../infrastructure.md:218),
[storage implementation](../../src/dub-store.ts:28)).

## Findings and concrete next work

| Priority / scope | Finding and evidence | Acceptance criteria |
| --- | --- | --- |
| P0 before promising support on phones | Physical iPhone/Android microphone, routing, backgrounding, WeChat and mainland network behavior remain unverified; emulation explicitly cannot establish them ([testing guide](../testing.md:95)). | Select the first supported device/browser surface; record OS/browser versions and checks for first permission, denial/retry, record/listen/rerecord, reload/resume/delete, interruption recovery, Bluetooth/headphones and export. Exclude surfaces with unresolved blocking failures from the support claim. |
| P1 before the next player merge | The only checked-in workflow triggers after `main` pushes; ESA runs app tests and a build. The full browser requirement is documented as a manual pre-merge step, with no PR verification workflow in this snapshot ([workflow](../../.github/workflows/deploy-app.yml:3), [ESA configuration](../../esa.jsonc:5), [testing guide](../testing.md:97)). | Run and retain `npm run test:all` evidence for the candidate. Add a PR validation workflow or an explicitly owned equivalent that exercises app/content/boundary and browser checks without cloud credentials or publication. Confirm repository rules separately before claiming it is merge-enforced. Keep content-only publication independent of the player release gate. |
| P1 operational action before November 29 | Live ESA reads confirm the plan expires **2026-11-29 00:00 Asia/Shanghai**. `RenewalStatus` is `normal`, duration `0`, rather than `auto_renewal`; site and plan are currently active/online. | Confirm free-plan continuation/extension rules, assign an owner and establish continuation before expiry with any necessary cost approval. Do not assume the currently active service will continue automatically. No purchase or renewal change was made during this assessment. |
| P1 before beta rollout | Production revision, pack revision and browser behavior are independent. Passing a local build does not verify a live release. Deployment code correctly checks ESA build identity and health ([deployment](../../scripts/app-deployment.mjs:133)); catalog publication is separate. | A release record names merged source commit, successful ESA build/actual commit, matching `/api/health`, live catalog revision, and a live complete record/replay/save/reload/delete/export smoke result. Record the known-good recovery procedure and prove recovery from an approved merged revision without force-moving `release/player` or uploading local bundles. |
| P2 after device baseline | Large entry chunk may affect first use on mobile networks; there is no timing evidence here. | Measure cold load and first playable scene on target hardware/network before changing bundles. If materially slow, use the existing lazy export boundary or focused splitting and compare the same measurements. Do not add infrastructure based only on the compiler warning. |

## Security, privacy and data durability

Positive controls observed in code: read-only GET/HEAD worker routes, `nosniff`,
explicit app routes and missing-asset 404s ([worker](../../server/worker.mjs:4));
content JSON size limits, schema validation, same-origin storage URLs,
credential omission and redirect rejection ([loader](../../src/content-pack.ts:74));
short-lived deployment credentials, main ancestry and fast-forward release checks
([workflow](../../.github/workflows/deploy-app.yml:54),
[promotion](../../scripts/app-deployment.mjs:42)); build rejection of media/content
in the function bundle ([builder](../../scripts/build-edge.mjs:10)).

Learner media is saved as binary IndexedDB records, deletion removes the attempt
and its media, save errors remain visible with retry, and persistence requests
are best-effort ([store](../../src/dub-store.ts:112),
[autosave](../../src/app/useDubAutosave.ts:19),
[save-error UI](../../src/App.tsx:222)). Export uses a local Blob download
([download](../../src/app/DubDownload.tsx:35)). This supports the adult local-only
design, not a guarantee against browser eviction or shared-device exposure.
Maintain clear local-storage and backup guidance. Do not add recording upload
or analytics as a prerequisite for the beta.

No exploit was demonstrated in this bounded review. No dependency vulnerability
scan, provider IAM audit, private-data inspection or live security audit was run;
passing tests do not establish those outcomes. Server authentication is not a
missing feature for a static player with no server learner records.

## Read-only operational evidence

Collected directly through the Alibaba connector on **2026-11-14 at approximately
16:40 Asia/Shanghai** using `GetSite --SiteId 186011743148252` and
`ListUserRatePlanInstances --InstanceId esa-site-bw0qh5c3nc3k`, region
`cn-hangzhou`; output was filtered to this site/instance:

| Field | Live response |
| --- | --- |
| Site | `parrotbook.com`, ID `186011743148252`, `active`, CNAME |
| Actual site acceleration coverage | `overseas` |
| Plan instance | `esa-site-bw0qh5c3nc3k`, `entranceplan`, `online`, `PREPAY` |
| Expiry | `2026-11-28T16:00:00Z` = **2026-11-29 00:00 Asia/Shanghai** |
| Renewal status / duration | `normal` / `0`; response does not report `auto_renewal` |
| Plan-permitted coverages | `global,overseas,domestic`; this is not the site's actual coverage |

These reads establish current fields, not free-plan extension eligibility or a
promise of continued service. No billing or configuration action was requested.

Separately, the coordinating agent supplied the following remote release evidence
from its own read-only checks on the same date. It was not established by this
engineering agent's test run:

- Remote `main`: `cc7deb2d1ac27c9cb0b3ed63501cfac0e157b3d7`, reported as 16 commits
  ahead of the locally tested snapshot.
- Remote `release/player` and public `/api/health` revision:
  `4a20e2466c0891f304c32e32d9fb9e07dc092086`.
- Successful ESA build: `188843348652148`, created
  `2026-11-13T16:00:11+08:00`; health server time `2026-11-14T08:37:58Z`.

The matching release pointer/health is useful publication evidence, but does not
transfer the local 52-test result to that different commit. A complete live smoke
and target-device evidence still need to be attached to the release candidate.

## Checkout and evidence hygiene

README directs routine work to the shared `main` checkout
([instructions](../../README.md:154)), while this task was launched in an isolated
detached worktree. At inspection, cached `origin/main` equals assessed HEAD;
local `main` at `ca6776e2` is **15 commits behind** assessed HEAD. No remote fetch
was performed by this engineering agent; the coordinator's later remote reads
above supersede cached refs as evidence of GitHub state. Do not move
checkouts or edit the shared tree to reconcile this automatically. Reconcile
the intended base and existing shared edits before implementation/merge, and
keep future release evidence attached to the exact tested commit.

## QA follow-up: stale library count assertion

Read-only diagnosis of QA's Chromium failure in
`tests/browser/library.spec.ts:107` (`:127` failing assertion): the test opens
`/library/older-audience` (67 scenes), keyboard-opens Patrick, clicks the player's
Back control, reloads, then still expects 67 scenes. The trace shows the actual
sequence `/zh/library/older-audience` → `/zh/scenes/patrick` →
`/zh/library/all` → reload at `/zh/library/all`. The error-context snapshot
shows the rendered heading **全部片段**, **111 个片段**, and 111 listitems.

This is a stale expectation introduced with the franchise directory change,
not evidence that the 67-scene route ignores its filter. Commit `9914400a`
explicitly changed player Back from the scene's audience folder to `all`
([navigation](../../src/app/useSceneNavigation.tsx:82)); companion navigation
tests already assert `/library/all` and the all-scenes heading
([test](../../tests/browser/navigation.spec.ts:41)). Browser-history Back and the
player's labelled Back control are separate behaviors and must not be conflated.

Minimal correct fix recommendation: retain the keyboard/layout assertions and
add an initial `filmCount` assertion on the audience route. After clicking the
player Back control, assert `/zh/library/all`, the **全部片段** heading, and
`clips.length` listitems; reload and repeat those destination assertions. This
ties the count to the correct rendered collection instead of merely relaxing it.
Do not change runtime navigation or replace all `filmCount` assertions globally.

GitHub reads pinned to coordinator-selected main
`cc7deb2d1ac27c9cb0b3ed63501cfac0e157b3d7` confirm that the same Back implementation
and stale final assertion remain. That main additionally passes whole clips to
`franchiseGroup`, whereas this snapshot passes `clip.note`; the narrow count fix
needs neither grouping implementation and should be applied/retested on the
chosen candidate base. The shared checkout's local library test edits target an
older shelf shape and were inspected only to identify overlap; none were copied.
No runtime/test file was changed, and no separate browser process was started
during QA's run. Evidence: ignored
`test-results/library-the-scene-shelf-stays-a-keyboard-accessible-grid-chromium/`
`trace.zip` and `error-context.md`.

The coordinator subsequently authorized the narrow regression updates in
`library.spec.ts` and `social-memes.spec.ts`. The latter replaces its retired
`Scene categories`/pressed-category locator with the actual accessible
`Browse tags` → `Memes` directory link, collection URL and heading; its original
discovery, source credit, playback, roles, recording and reload assertions remain.
The initial focused run could not bind a local server in the sandbox (`EPERM`).
Its authorized escalated retry was interrupted at the coordinator's request
before test execution while the candidate base is reconciled. These edits are
**not yet browser-verified**. No passing focused result is claimed.
