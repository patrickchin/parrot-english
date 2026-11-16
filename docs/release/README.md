# Parrotbook release board

Updated 2026-11-16, Asia/Shanghai. Codex leads implementation, specialist agents,
integration, and verification in this chat. Patrick owns participant contact and
business decisions. [Product plan](../product-plan.md) owns the broader scope.

## Current direction

Build working software for testing with friends. Creator-permission work is
deferred for this iteration; retain factual credits and notices. Friend testing
is separate from a child release or public launch.

The owner selected one public catalogue named **Packs**. The former tag groups
become 21 packs containing the same 128 scenes, labelled **Uploaded by Patrick**.
No separate tag/franchise catalogue is shown. Only the owner uploads for now,
through both an authenticated API and private browser page. The owner can hide,
show, or delete a pack independently of the player release. Delete removes its
catalogue and management entry; immutable/shared media remains stored.

Learners practice and share without an account. Support both a video file using
the device share sheet/download and an optional unlisted playback link. Hosted
sharing requires an explicit upload action, private OSS storage, seven-day link
expiry, and a removal capability kept on the creator's device. No public feed or
automatic recording upload is part of this iteration.

## Current release

The public player is live with **21 packs / 128 scenes**, all uploaded by Patrick.
The pack/sharing implementation and deployment diagnostic follow-ups are merged.
The latest verified player source is
`ee6fc7ab7322a98ddef302c89f8bc94cb7e21280`: deployment workflow
[43809621843](https://github.com/patrickchin/parrot-english/actions/runs/43809621843)
and native ESA build `189354688290940` succeeded; independent `/api/health`
readback matched at 2026-11-16 05:24:47 UTC. Live 390px gallery/search/detail
and 320/390px notices checks passed.

The focused browser matrix passes **48/48 engine/scenario pairs, zero skips**:
16 each in Chromium, WebKit and Firefox, across phone/tablet viewport shapes.
This includes actual synthetic recording and MP4 encoding, with an AAC fallback
when native encoding is unavailable. It does not establish physical-phone
microphone, backgrounding, audio-route or native-share reliability.

Both native APIs are deployed from the same merged `ee6fc7ab` source. API workflow
[43809621870](https://github.com/patrickchin/parrot-english/actions/runs/43809621870)
passed native role, concurrency-one, source-revision and unchanged owner-auth
readbacks. The earlier failure was the CLI's 10-second read timeout against a
successful 11.5-second provider request; its native read limit is now 30 seconds.
A live synthetic guest-share smoke passed private signed upload,
publication, ranged playback, wrong-token rejection and creator removal. Both
apex/www API and OSS upload preflights pass; a foreign API origin returns 403.
Native owner Bearer authentication is saved and read back, with one protected
trigger and concurrency one; missing/invalid token requests return 403 and
apex/www preflights return 204. Real Chromium/WebKit guest UI upload, fresh-browser
playback and creator removal also pass; both disposable uploads were removed.
See [hosted share evidence](hosted-share-verification.md). The player endpoints
remain disabled pending custom HTTPS and owner CRUD acceptance. Patrick chose
to leave automatic cleanup disabled: seven-day link expiry and creator removal
still apply; expired private objects remain stored until removed. No hosted-upload
availability claim follows from the player release.

## Earlier released evidence

PR [#274](https://github.com/patrickchin/parrot-english/pull/274) was explicitly
approved by Patrick, merged, and deployed through the normal Git workflow.

| Item | Observed result |
| --- | --- |
| Merged application revision | `c527d8cf5028d78e26f18617b132f835d51eb7e2` |
| GitHub deployment workflow | [43581842759](https://github.com/patrickchin/parrot-english/actions/runs/43581842759), succeeded |
| ESA build | `189032977639548`, succeeded for the same commit on `release/player` |
| Public health | Matching commit at `2026-11-14T09:44:59.072Z` |
| Live browser | Pack gallery, scoped search, scene preview playback, return to pack, and deep reload verified |
| Live content | Four packs / 128 scenes read at `2026-11-14T09:47:25.677Z`; publication was unchanged by that application release |

The initial automatic approval rejection was resolved by the owner's explicit
approval of that merge and deployment. It is no longer a release blocker.

The previous full browser run selected 597 cases: 558 passed, 24 skipped, and
15 failed. Twelve stale assertions were corrected and their focused follow-ups
passed. Three native WebKit timing interruptions remain recorded; each passed
follow-up, including a final four-case capture/stress/replay sequence. This is
not a claim of a clean full run or physical-phone reliability. The application
120 ms synchronization guard and original timing assertions were preserved.
See [engineering evidence](engineering-readiness.md).

## Active increment

Implementation PRs are merged; released recording recovery
from main `edcbc125` was integrated as `860cfcfb` before the mobile checks. Other sessions' edits in the shared checkout remain untouched.
Review steps: [content PR #275](https://github.com/patrickchin/parrot-english/pull/275)
and [implementation PR #276](https://github.com/patrickchin/parrot-english/pull/276).
New source, content, cloud setup, and publication are separate milestones.
Nothing in this section implies the new API is hosted.

| Work | Owner | State / next action |
| --- | --- | --- |
| One Packs catalogue and Patrick attribution | Delivery + content + UI | Content PR #275 merged as e8f9878b and published at 2026-11-14T17:26:27Z: 21 packs / 128 scenes, all uploaded by Patrick. All 277 JSON objects and 513 media references verified. Flat Packs UI merged in PR #276 and deployed; live 390px gallery/search/detail smoke passed. |
| Owner API + private management page | Backend + UI | Implemented and independently reviewed; local API/browser checks cover upload/retry, staging, publication, hide/show/delete. Native Bearer trigger saved/read back; missing/invalid-token rejection and apex/www preflight pass. Authenticated hosted CRUD acceptance remains. |
| Owner CLI uses the same serialized API | Content/backend | Implemented: default merge preserves unrelated packs; explicit replacement is available. Publish the initial uploader-complete catalogue before enabling the new API. |
| Guest file and link sharing | Backend + UI + delivery | Implemented and locally verified. Live API smoke confirms private raw/published media, signed ranged playback, wrong-token rejection and removal/revocation. Real Chromium/WebKit UI upload/playback/removal pass. Custom HTTPS remains before endpoint enablement. Patrick explicitly left automatic cleanup disabled; no rule was applied. |
| Hosted API setup | Operations + delivery | API workflow 43809621870 succeeded on merged ee6fc7ab, verifying source, scoped runtime roles, quotas one and unchanged owner Bearer authentication. Post-deploy missing/invalid tokens return 403, apex/www preflights 204, removed test share 410. Both API DNS-only CNAMEs are verified. The approved ¥0 order provisioned two free certificate instances; CA contact/location and issuance remain before custom HTTPS and endpoint enablement. Patrick chose to leave lifecycle cleanup disabled. [Decision](api-deployment-decision.md), [runbook](../owner-upload-deployment.md). |
| Candidate verification/review | QA + independent reviewer | Earlier source 20479f33: TypeScript, app/content/boundary/API, player/API packaging, and 316 browser passes / 16 intentional skips. Physical phones and hosted provider behavior remain separate. |
| New release and catalogue publication | Delivery | Catalogue publication complete: 21 packs / 128 scenes. Player and API releases both verified at ee6fc7ab. Custom HTTPS, authenticated owner CRUD and endpoint enablement remain. |
| Mobile browser verification | QA + engineering | 48/48 passes, zero skips: Chromium/WebKit/Firefox each 16 cases across five shapes. Fixed clipped recovery text, missing native AAC export and notice wrapping. [Evidence and real-phone sequence](mobile-browser-verification.md). |
| Physical-device friend test | Patrick + QA | Test complete recording/replay, sharing, resume/delete, mic deny/retry, app switching, audio routes, and network on actual phones. No device row has passed yet. |
| WebKit timing investigation | Engineering + QA | Gather physical-device evidence before weakening guards or changing the audio model. Preserve diagnostics. |
| ESA continuation | Patrick + operations | Site plan expires **2026-11-29 00:00 Asia/Shanghai**, renewal normal / duration 0. Confirm continuation and cost before that date; no purchase or billing change authorized or made. |

Architecture: ESA serves the player and private owner UI; dedicated native Node
FC APIs handle serialized pack publication and guest sharing; OSS stores media,
scene/catalog JSON, and private share state. Browser IndexedDB retains drafts
and the creator's share-removal capability. No media bytes belong in code
bundles. Owner and anonymous guest APIs have separate triggers and execution
roles. The dedicated APIs address ESA's four-fetch execution limit and ten-second
gateway response wait; they do not introduce a database or learner accounts.

Latest [candidate verification](pack-management-verification.md): TypeScript,
39 app / 17 content / 1 boundary / 30 API tests pass. Focused browser coverage
resolves to 316 passes / 16 intentional skips after targeted reruns and the final
23 built-player / 30 visual checks. Network exhaustion cleared before the new
checks; Git pushes succeeded. No unrelated process or OS setting was changed. Earlier assessments are
historical evidence, not checks of this increment:
[product](product-readiness.md), [engineering](engineering-readiness.md),
[content](content-readiness.md).

## Device evidence

Keep contact information, recordings, private consent, and rights evidence out of
Git. Record one row per actual device/browser/output/network combination.

| Device / OS / browser / date | Source and catalogue | Mic deny/retry | Record/replay/sync | Reload/resume/delete | Native share/link/removal | Background/audio route/network | Result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Pending | Pending | Untested | Untested | Untested | Untested | Untested | No physical-device support claim |

## Delivery practice

Use [the management skill](skills/parrotbook-manager/SKILL.md) for bounded agent
waves, integration, independent review, and release evidence. The repository
copy is the portable source for the installed personal skill. Specialist agents
own exclusive files; the lead resolves shared decisions and keeps this board
current. No unattended worker or recurring schedule is configured.

After release, prioritize lost work, privacy-control failures, and broken
recording; then use completion, voluntary retry, return use, and direct feedback
to choose the next increment. Child use still requires its planned guardian,
storage, and content work. A broader public launch remains a separate decision.
