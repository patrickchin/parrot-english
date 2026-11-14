# Parrotbook release board

Updated: 2026-11-14, Asia/Shanghai. Delivery lead: Codex in this project chat;
founder owns business inputs and participant contact. Product scope remains in
[the product plan](../product-plan.md). This board records delivery decisions and
evidence rather than changing that scope.

## Release recommendation

The owner selected a **software friend test using the existing scenes as
owner-published content packs**. Users browse packs and select scenes; only the
owner can publish packs through the authenticated command. There is no user
pack-upload interface. Creator permissions are deferred for this work and do
not block software implementation/testing. This supersedes the initial proposal
to require three newly cleared scenes before the next test.

The current implementation cycle adds pack browsing and scoped selection to
the existing independent content pipeline. It keeps the 128 current scenes and
existing permission metadata. Friend testing is distinct from a child release
or broader public launch. There is no committed launch date yet.

## Current evidence

| Evidence | Result and limit |
| --- | --- |
| Assessed local source | `53f3d594020778c267c3e961b26e3ee4096e1b40`, isolated worktree. No shared-checkout edits incorporated. |
| Current implementation base | `cc7deb2d1ac27c9cb0b3ed63501cfac0e157b3d7`, isolated `codex/owner-content-packs` branch. The session's documentation and narrow browser assertion fixes were reapplied; shared working files were left intact. |
| Historical local baseline | On the old assessed source, TypeScript, 37 app tests, 14 content tests, 1 boundary test, and build passed. Its browser run was stopped with 146 passed / 4 stale-assertion failures / 2 interrupted / 355 not run; see the product report's dated appendix. |
| Current branch verification | TypeScript, 38 app tests, 15 content tests, 1 boundary test, and production build pass. Canonical full browser run selected 597 tests and is in progress. Pack gallery/detail visual checks pass at 390/768/1440; independent review's saved-dub context finding is fixed and its Chromium regression passes. |
| Local content snapshot | 4 packs / 111 scenes validate. All 111 manifest permission labels are unconfirmed; zero release-cleared scenes established by this snapshot. Structural validation is independent of permission/editorial approval. |
| GitHub read-only check | `main` at `cc7deb2d1ac27c9cb0b3ed63501cfac0e157b3d7`, 16 commits beyond assessed source. Comparison includes 17 added scenes and small player/library changes. Local checks do not certify these changes. |
| Remote authored catalog | At that main revision, 128 scenes are documented; all 17 added manifests also retain unconfirmed permission labels, and the previous 111 manifests are unchanged. The content report establishes no cleared scene in that authored set. |
| Live OSS catalog | Read at `2026-11-14T08:42:50Z`: four packs / 128 scenes (84 + 15 + 15 + 14). Manifest release paths are `1d6fa584ec64d7ccc42501a8`, `d8cbcf2f961a85874e2d8207`, `cefb54576457a8eec3f0872b`, and `780fc8d1b2f9190d7358a73c`, respectively. These are independent pack versions, not one application or catalog revision. No media playback or rights verification is implied by this read. |
| Live application | `release/player` and public `/api/health` both report `4a20e2466c0891f304c32e32d9fb9e07dc092086`. ESA build `188843348652148` succeeded for that commit and release branch. Health sampled at `2026-11-14T08:37:58Z`. This verifies revision identity, not a live recording smoke test. |
| Shared checkout | Has existing edits from other work. It was inspected read-only and left intact. Reconcile work/base before implementation or integration. |
| External backlog | GitHub connector returned no open PRs or issues at assessment time; this is a point-in-time search, not a claim that other chats contain no work. |
| Physical devices / network | Intended iPhone/Android, WeChat, audio routing, backgrounding, and mainland network behavior remain unverified. |
| Current ESA plan | Read-only provider check confirms site active, actual coverage overseas, expiry **2026-11-29 00:00 Asia/Shanghai**, renewal `normal` / duration `0`, not automatic renewal. Extension rules and continuation still need an owner decision; see engineering report. |

Supporting reports: [product](product-readiness.md),
[engineering](engineering-readiness.md), [content](content-readiness.md).
These record source observations and proposed acceptance criteria. They are not
legal clearance or new verification of every historical infrastructure claim.

## Ordered work

Statuses are `ready`, `active`, `needs input`, `blocked`, or `done`. Proposed
owners are roles, not claims of an assigned employee. Keep this table current;
promote only a small number of independent tasks into a wave.

| Priority / task | Status | Proposed owner | Acceptance / next action |
| --- | --- | --- | --- |
| P0: Build browsable/selectable content packs | Active | Delivery + UI + QA agents | Add metadata-driven gallery and pack-scoped scene search/selection, preserve chosen pack through recording/save/reload/back/language, handle unknown/empty packs, and verify phone/keyboard behavior. |
| P0: Package the current scenes for owner upload | Done | Content lead | Validated 4 packs / 128 scenes / 260 files / 513 existing OSS references; staged uploadable content at `content/local-packs/9c6b6bfd65e9bca8b3aea0c8/`. [Owner quickstart](owner-pack-quickstart.md) documents publish/remove; no publication performed in this cycle. |
| P1: Gather real-device friend-test results | Ready after software verification | Founder + QA | Friends exercise the complete loop on their phones, using the matrix below to capture device, OS/browser and blocking failures. This test supplies the device evidence; it is not a separate gate preventing the requested friend test. |
| P1: Reconcile latest candidate and overlapping work | Done | Delivery lead | Implementation base is current main `cc7deb2d`; shared local edits remain untouched. Historical audit results remain attached to their old snapshot. |
| P1: Verify pack UI and related navigation | Active | QA + delivery | Run new pack tests and relevant existing browser coverage on the current branch, plus TypeScript/app/content/boundary/build checks. The initial old-snapshot run was stopped after 146 passed / 4 stale-assertion failures / 2 interrupted / 355 not run; it was not a full pass. Narrow assertions were corrected to documented behavior. |
| P1: Arrange ESA continuation before November 29 | Needs input | Founder + operations | Live provider check confirms expiry November 29 at 00:00 Shanghai time and no automatic renewal. Determine extension rules, accountable owner, and any cost before selecting continuation. No billing or configuration change has been made. |
| P1: Protect candidate validation before merge | Ready after base reconciliation | Engineering lead | Prepare PR validation for TypeScript/app/content/boundary/build/browser checks without production credentials or content publication. Verify runner media dependencies and report artifact handling. Check branch rules separately before claiming merge enforcement. |
| P1: Make friend-test expectations understandable | Ready | Product + engineering | Preserve local saving/deletion, site-data-loss guidance, live statuses, errors and recording notice while adding pack navigation. All new interface text uses the five current UI languages. |
| P1: Record release candidate evidence | Active | Delivery + QA | Record candidate commit, canonical tests, independent review, successful ESA build and matching health revision, unchanged catalog/pack versions, and live smoke result. Actual phone results follow from friend testing; creator-permission work is deferred for this scope. |
| P1: Test with friends | Ready after software verification | Founder + product/QA | Friends can browse a pack, select a scene, record and replay, resume saved work, and return to the pack. Record device and blocking failures. The earlier cohort protocol is optional research guidance, not an owner-imposed gate on this test. |
| P2: Measure first-use performance | Ready after device selection | Engineering + QA | Measure cold app load and time to first playable scene on target hardware/network. Optimize the 710 kB entry chunk only if measurements justify it. |

Do not promote child release until its guardian setup, storage/save/export policy,
appropriate content and responsible operator review are recorded. Public launch
also requires a working support/removal process and the relevant release review
already called for in the product plan. Expand into accounts, scoring, or a
marketplace only after observed demand justifies that work.

## Device evidence sheet

Record one row per actual device/browser/output/network combination, outside
participant-identifying notes. No physical-device row has passed yet.

| Device / OS / browser / date | Source + catalog revision | Entry / audio / network | Permission deny + retry | Record / retry / stop / sync | Reload / resume / delete | Interruption / export if permitted | Result / issue |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Pending device selection | Pending | Pending | Untested | Untested | Untested | Untested | No support claim |

Include interruption by app switching/screen lock and a routed-output check
where supported. Bluetooth and WeChat require their own evidence; desktop
emulation cannot substitute. Put reproduction steps and aggregate outcomes in
Git; keep contact details, recordings, and consent records in founder-controlled
private storage.

## How delivery runs

Codex owns prioritization, bounded agent briefs, integration, verification, and
this board. Agents own a defined question or deliverable with exclusive edit
paths. Use the environment's available concurrency, typically a lead plus three
specialists, and stage further roles as needed. Product, QA, engineering,
content, design, and operations are task roles rather than permanent idle agents.

A cycle selects the leading uncertainty or release blocker, delegates independent
work, resolves recommendations, implements available work, and verifies the
result. Assign an independent review when it materially improves confidence.
When founder evidence blocks one task, continue an independent ready task.
Do not repeat an assessment when enough evidence exists to execute.

Use [the management skill](skills/parrotbook-manager/SKILL.md) for future delivery
cycles, with existing coding, Playwright, design, and writing skills selected
only for the work being done. The repository copy is the portable source for
the personal installed skill at `~/.codex/skills/parrotbook-manager/`. The standard
skill validator and an independent simulated delivery cycle passed. Invocation:
`$parrotbook-manager`.

After release, prioritize data loss, privacy-control failures, and broken
recording; then use observed completion, voluntary repeat use, and feedback to
choose the next increment. The product report contains the initial research
protocol and unvalidated success hypotheses. Keep a dated decision and outcome
for each cycle here; retain exact release/test revisions.

Work proceeds during active sessions. No unattended worker or recurring schedule
has been configured. Participant contact, private rights evidence, original
performances, and actual device handling require the founder or designated people;
agents can prepare the materials and coordinate the work.

## Decision log

- **2026-11-14 — Founder request:** Codex to take a delivery-management role,
  orchestrate specialist subagents, and identify supporting skills. Founder
  requested the release-target recommendation after assessment.
- **2026-11-14 — First assessment:** Product, engineering, and content agents
  completed separate reviews; QA and operations followed as a second wave.
  Lead recommends invited adult beta. Existing product scope is unchanged.
- **2026-11-14 — Owner steering:** prioritize working software and current
  owner-uploaded packs for testing with friends; defer creator permissions.
  Implementation started from current main. The earlier three-cleared-scene
  proposal does not gate this cycle.
- **2026-11-14 — Architecture retained:** ESA serves application code/APIs;
  OSS serves catalogs, structured scene data, and media; browser IndexedDB holds
  adult learner recordings. No infrastructure change is proposed by this cycle.
