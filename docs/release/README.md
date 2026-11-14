# Parrotbook release board

Updated 2026-11-14, Asia/Shanghai. Codex leads implementation, specialist agents,
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

## Released evidence

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

Source is isolated on `codex/franchise-pack-uploads`, based on the released
commit above. Other sessions' edits in the shared checkout remain untouched.
Review steps: [content PR #275](https://github.com/patrickchin/parrot-english/pull/275)
and [implementation PR #276](https://github.com/patrickchin/parrot-english/pull/276).
New source, content, cloud setup, and publication are separate milestones.
Nothing in this section implies the new API is hosted.

| Work | Owner | State / next action |
| --- | --- | --- |
| One Packs catalogue and Patrick attribution | Delivery + content + UI | Implemented locally: 21 packs / 128 scenes; scene/waveform bytes preserved. Verify integrated navigation and browse/search. |
| Owner API + private management page | Backend + UI | Implemented locally; validate upload/retry, private staging, publication, hide/show/delete, and independent review. |
| Owner CLI uses the same serialized API | Content/backend | Replace direct catalog writes with the owner API; retain local validate/stage. Bootstrap with an explicit catalogue replacement. |
| Guest file and link sharing | Backend + UI + delivery | Private sharing backend implemented; integrate native file share, explicit upload, playback, expiry, and creator removal. |
| Hosted API setup | Operations + delivery | No FC functions or roles exist yet. Native Git pipeline, roles, owner Bearer trigger, HTTPS domains, OSS PUT CORS, concurrency caps, and guest cleanup remain to configure and smoke-test. [Runbook](../owner-upload-deployment.md). |
| Candidate verification/review | QA + independent reviewer | Run TypeScript/app/content/boundary/API/build and rendered browser checks against the final source. Record actual failures and limits. |
| New release and catalogue publication | Delivery | Prepare reviewable source and deployment evidence; merge only through normal Git deployment. New UI must not require the new catalogue schema before that catalogue is published. |
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
39 app / 17 content / 1 boundary / 28 API tests pass. Focused browser coverage
resolves to 281 passes / 16 intentional skips after targeted reruns. Extra visual
and built-player checks are awaiting recovery from independently diagnosed local
network-port exhaustion; Git pushes are affected too. No unrelated process or
OS setting was changed. Earlier assessments are
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
