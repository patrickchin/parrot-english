# Content readiness and owner packaging

Initially assessed 2026-11-14 from the older checkout, then refreshed against GitHub main
`cc7deb2d1ac27c9cb0b3ed63501cfac0e157b3d7` without changing the checkout.
This is repository evidence, not a new legal opinion or private-rights-register
inspection. The remote-state appendix separates newer source and publication
records from the initial local validation results.

## Current owner-directed scope

The owner subsequently chose **testing with friends using the existing scenes**,
with software and content distributed separately, and deferred creator-permission
work for now. That direction supersedes this report's earlier proposal to make
three cleared scenes a prerequisite. Permission work is **deferred**, not a
blocker for the current friend-testing task and not a claim of clearance.
Existing credits and status labels remain intact.

The existing owner CLI is sufficient. After this isolated checkout was advanced
to `cc7deb2d1ac27c9cb0b3ed63501cfac0e157b3d7`, both `content:validate` and
`content:stage` passed: **4 packs / 128 scenes / 260 referenced JSON files /
513 existing OSS media references**. The staged release is
`content/local-packs/9c6b6bfd65e9bca8b3aea0c8/`, aggregate revision
`9c6b6bfd65e9bca8b3aea0c8`. It contains 261 JSON files including its catalog,
5,567,468 bytes, and intentionally relies on existing OSS media. No new packaging
capability or learner upload interface is needed for this scope. It is not a
standalone portable media archive.

See the [owner quickstart](owner-pack-quickstart.md) for concrete authenticated
publish/remove commands and limits. Publication and withdrawal were not run.
Current content recommendations are to retain the existing pack/media boundary,
use owner-only publication, and test the complete recording loop on friends'
actual devices. New original scenes and permission enforcement remain future
release work if the owner selects that scope. The remainder preserves the
initial assessment and evidence; its rights-gated release proposals are not the
active friend-testing plan.

## Local snapshot: catalog and clearance

The following counts and validation run apply to local commit
`53f3d594020778c267c3e961b26e3ee4096e1b40`, not the current live catalog.

| Local pack | Scenes | Roles | Non-selectable supporting roles |
| --- | ---: | ---: | ---: |
| Memes & clips | 67 | 164 | 13 |
| First English | 15 | 45 | 3 |
| Ages 10–12 | 15 | 33 | 0 |
| Teenagers | 14 | 36 | 4 |
| Total | 111 | 278 | 20 |

Read-only inspection of every referenced manifest found:

- All 111 have `rightsStatus: redistribution-not-cleared` and
  `credit.licence: 未确认再分发许可` (redistribution permission unconfirmed).
- All have five-language scene and role metadata, including notices in each
  pack. All have word-timing provenance. No scene manifest carries a
  `reviewStatus` or `ageGuidance` field; review detail lives in recipes and prose.
- `npm run content:validate` passed: 4 packs, 111 scenes, 226 files, 457 existing
  OSS media references. This command does not fetch or listen to those media.

The four source pack manifests are selected by
[`content/catalog.json`](../../content/catalog.json:1). The actual source status
is visible, for example, in the
[`corn-corntastic-day` manifest](../../content/packs/pack_YRpBbSh-Pqnw/scenes/corn-corntastic-day/scene.json:169).
The local historical publication record reports 111 live scenes on November 12;
that is documented historical evidence, not a current live count
([social meme batch](../social-meme-scenes.md:81)).

The product plan calls for original or permitted starter scenes and a private
rights register covering the relevant works, adaptation, delivery, and allowed
exports ([product plan](../product-plan.md:155)). No matching clearance evidence
was supplied in this assessment. Source credits, public uploads, and existing
hosting cannot substitute for it; the existing source record explicitly preserves
that distinction ([clip sources](../clip-sources.md:3)).

## What validation enforces

Scene validation enforces entity IDs, duration and ordered timings, role
references, optional non-selectable roles, word timing consistency, safe asset
names, and credit strings/HTTPS credit links
([scene validator](../../src/scene.ts:11)). It requires a playable role with
dialogue, but cannot establish the real speaker or whether a final syllable was
cut. `rightsStatus` is present in authored JSON but is not a typed or validated
release decision ([scene contract](../../src/scene.ts:4)).

Pack validation checks recognized cohort values, structure, paths, and the
shape of supplied locale entries. Locales and notices are optional at the
general format level; the authored-content tests separately check that every
current scene/role has five-language entries
([pack validator](../../src/content-pack.ts:37),
[translation coverage test](../../tests/content/i18n.test.mjs:6)). These checks
establish coverage, not translation accuracy. Cohort labels organize the library;
they do not encode an age-suitability approval or permission decision.

Publication validates and stages referenced content, checks remote media with
HEAD requests, uploads immutable content objects, then activates the catalog
last ([publisher](../../scripts/content.mjs:109)). It has no release-rights,
review-completion, export-permission, or child-suitability gate. That supports
the documented internal prototype workflow, but a public release needs an
explicit content selection and approval step.

## Editorial evidence and remaining limits

Recent recipes preserve source intervals, hashes, role assignments, and checks
against surrounding uncut audio. The social recipe records how captions and
independent recognition corrected dialogue and how the end release was retained
([recipe](../../content/social-meme-review-scenes.json:95)). The batch notes
retain off-screen questions and an insulting incidental line under a
non-selectable role, and explicitly stop short of child-pilot approval
([social review](../social-meme-scenes.md:25)). Automated tests retain several
supporting-speaker regressions
([content scene tests](../../tests/content/scene.test.mjs:36)).

This is useful provenance, not a fresh human audiovisual review. Source files
and generated media are ignored and are not guaranteed to exist in another
checkout ([discovery workflow](../meme-discovery.md:119)). No full-source
listening or translation-quality sign-off was performed in this assessment.
The First English selections are editorial beginner choices rather than formal
CEFR or age ratings; learner-fit listening remains pending
([First English review](../first-english-review.md:10)).

The discovery workflow already separates dated recognition evidence, source
verification, language fit, human listening, and rights review, and deduplicates
meme families. Continue that workflow without claiming an unattended process or
current popularity from old observations
([discovery workflow](../meme-discovery.md:66)). More discoveries increase the
research queue; they do not resolve the release catalog's clearance gap.

## Earlier release-content proposal — deferred

Use the plan's three original/permitted starter exchanges as the default
production brief: Bob and Mary order a snack; Jack and Rose find a lost bag;
Ben and Sam plan a game. These are proposals, not completed media or an
owner-approved commissioning budget ([starter proposals](../product-plan.md:169)).
One cleared exchange can unblock an early technical check; use three before
evaluating choice and repeat play in a beta. Prepare human guide performances,
complete natural turns, bilingual dialogue, timed words, waveforms, source-based
portraits/posters, five-language metadata, and explicit allowed-use notices.
Keep media and structured packs in OSS and player code in ESA. No new account,
recording upload, database, or service is needed.

Select the beta catalog explicitly. The ordinary publisher replaces the shared
catalog and therefore must not be used as an isolation mechanism without a
reviewed publication plan. Retain internal research separately from the
release-selected content. An adult beta can precede a child pilot; the latter
still requires the guardian, suitability, operator, and physical-device work
described in the product plan.

## Earlier release proposals — deferred beyond current friend testing

The following proposals describe the initial broader release assessment. Their
P0/P1 labels are historical; they do not assign current friend-testing blockers.
The release board owns active priorities.

| Priority / ticket | Owner | Completion evidence |
| --- | --- | --- |
| P0: Clear the first release content | Founder + content lead | For every selected scene, a private evidence reference identifies permission holder, exact source/media, permitted edits/dubbing, territories, duration, attribution and export/sharing limits. Unknown or excluded uses stay explicit. A release selection lists only the approved scenes. |
| P0: Make the release selection checkable | Engineering + content lead | A small release manifest/check, distinct from technical validity, rejects selected scenes with unknown/uncleared rights or incomplete approval. Private documents stay outside published packs. Tests demonstrate rejection before any upload and acceptance for a permitted fixture. The existing internal-test catalog remains clearly labelled. |
| P1: Produce and sign off three complete scenes | Content lead + human reviewer | Reviewed full-source playback establishes speakers including off-screen/incidental lines, complete final syllables, no next speaker in prompts, accurate English/Chinese text, five-language metadata, learner-fit notes, and recorded reviewer/date. Each scene records its media checksum and content revision. |
| P1: Tie export behavior to selected scene terms | Product + engineering | Every beta scene expressly permits the enabled export use, or the corresponding flow communicates and enforces the applicable restriction. Test at least one allowed and one disallowed case if mixed permissions are introduced. Do not infer permission from the presence of an MP4 download control. |
| P1: Rehearse publication and removal | Release lead + content lead | Stage the approved selection; verify hashes/media access; activate catalog last; test changed scenes, search, languages, credits and playback. Record the independent content revision. Rehearse withdrawal in an isolated fixture and document that retained direct object URLs are not removed. |
| P2: Keep discovery useful after beta | Content lead | Retain deduplicated candidates with dated evidence and separate review/rights states. Promote new batches only after the same approval and publication checks; use tester feedback to prioritize practice fit over catalog size. |

The withdrawal behavior is documented at
[content publishing](../content-packs.md:167): it removes discovery entries while
retaining stored objects and existing tabs. Permanent removal is a separate,
specific object operation. Do not describe catalog withdrawal as a complete
media takedown.

## Inputs for a later release-content decision

The founder needs to identify existing permission evidence or choose the first
original/licensed sources and any commissioning budget; identify the intended
operator and proposed audience; arrange human source/translation review; and
confirm the first beta's permitted export/sharing scope. These decisions cannot
be inferred from repository metadata. PRC classification and qualification
questions remain with the qualified review already called for in the product
plan; this assessment makes no new determination on them.

## Remote-state refresh

Read-only GitHub connector inspection on 2026-11-14 compared local commit
`53f3d594020778c267c3e961b26e3ee4096e1b40` with remote main
`cc7deb2d1ac27c9cb0b3ed63501cfac0e157b3d7`. Remote main is 16 commits ahead;
the checkout and its validation results were left intact.

The pinned [remote README](https://github.com/patrickchin/parrot-english/blob/cc7deb2d1ac27c9cb0b3ed63501cfac0e157b3d7/README.md)
and [remote product plan](https://github.com/patrickchin/parrot-english/blob/cc7deb2d1ac27c9cb0b3ed63501cfac0e157b3d7/docs/product-plan.md)
describe 128 authored internal-test scenes: 84 Memes & clips, 15 First English,
15 Ages 10–12, and 14 Teenagers. The
[comparison](https://github.com/patrickchin/parrot-english/compare/53f3d594020778c267c3e961b26e3ee4096e1b40...cc7deb2d1ac27c9cb0b3ed63501cfac0e157b3d7)
adds 17 scene manifests and their waveforms; it does not modify the prior 111
scene manifests. All 17 added scene JSON files were fetched at the pinned remote
commit and independently inspected: every one has
`rightsStatus: redistribution-not-cleared` and
`credit.licence: 未确认再分发许可`. Combined with the unchanged original 111,
**all 128 authored scenes still explicitly record unconfirmed redistribution
permission**. Catalog growth therefore does not change the clearance finding.

The current [remote publication record](https://github.com/patrickchin/parrot-english/blob/cc7deb2d1ac27c9cb0b3ed63501cfac0e157b3d7/docs/social-meme-scenes.md)
reports five batches, with the fifth published and live-verified on November 13
at 128 scenes, including 20 under the shared Memes tag. It records content
revision `9c6b6bfd65e9bca8b3aea0c8`, 260 JSON objects, 513 media references,
and successful player build commit
`4a20e2466c0891f304c32e32d9fb9e07dc092086`. Those are fetched publication
records; this content assessment did not independently fetch the current OSS
catalog or rerun the newer media tests. The coordinating agent separately
verified `release/player` and public health against that player commit and
successful ESA build `188843348652148`. A player revision does not establish a
content revision or count.

The newer authoring rules also supersede the local discovery document's earlier
exchange-only assumptions: social memes now support short solo performances and
single-line quotes, down to a one-second source beat, while preserving longer
conversation guards for other cohorts. Ten of the 17 added scenes have one
selectable practice role; this is documented format evolution, not by itself a
defect or evidence that a speaker is missing. Continue source-by-source speaker
verification rather than imposing the earlier two-speaker minimum. Newer browse
behavior groups internet sources under one Memes tag while retaining creator
credits and searchable metadata.

The active isolated checkout was subsequently advanced to that remote revision
for the owner-packaging check recorded above. Do not use the earlier 111-scene
tests, old authoring thresholds, or historical production records as proof of
current release readiness.
