# Historical owner content packaging

This is the evidence for the four-pack release deployed in PR #274. Current
owner API, private page, and 21-pack instructions are in
[content packs](../content-packs.md) and the
[deployment runbook](../owner-upload-deployment.md). Do not run the historical
direct-OSS publisher alongside the serialized owner API.

Verified 2026-11-14 against source commit
`cc7deb2d1ac27c9cb0b3ed63501cfac0e157b3d7` for owner-directed testing with
friends and the existing scenes. Creator-permission work is deferred for this
scope; existing permission labels remain unchanged. This does not claim clearance.

The existing commands already package content separately from application code.
The owner prepares files locally and publishes through the authenticated Alibaba
CLI. No learner upload screen or additional packaging service is needed.
ESA serves application code; OSS serves catalog/pack/scene data and media;
adult recordings remain in browser IndexedDB.

## Prepare without publishing

From the repository root, using Node 24 and installed locked dependencies:

```sh
npm run content:validate
npm run content:stage
```

Neither command uploads files or requires cloud credentials. Validation checks
local content structure, IDs, paths, timings, referenced files, and waveforms.
Staging writes an ignored local release folder. It does not fetch remote media
or establish remote availability.

This run passed with **4 packs, 128 scenes, 260 referenced JSON files, and 513
existing OSS media references**. Its staged directory is:

```text
content/local-packs/9c6b6bfd65e9bca8b3aea0c8/
  catalog.json
  objects/
    releases/<pack-revision>/packs/<pack-id>/...
```

Aggregate revision: `9c6b6bfd65e9bca8b3aea0c8`. The directory contains 261 JSON
files including the activation catalog, totaling 5,567,468 bytes. Pack counts
are Memes & clips 84, First English 15, Ages 10–12 15, and Teenagers 14.

Each pack has its own revision. The staged catalog points to:

| Pack | Pack revision |
| --- | --- |
| `pack_YRpBbSh-Pqnw` | `1d6fa584ec64d7ccc42501a8` |
| `pack_-gi9JmjuIfy5` | `d8cbcf2f961a85874e2d8207` |
| `pack_lxanYMpMaUCq` | `cefb54576457a8eec3f0872b` |
| `pack_-1fxy3PBdgXT` | `780fc8d1b2f9190d7358a73c` |

The current artifact intentionally contains JSON only. The 513 media references
point to already hosted OSS objects; videos, audio, posters and portraits are
not downloaded or duplicated by staging. This is an uploadable release for the
existing OSS origin, **not a standalone offline or portable media archive**.
The general format can include local media when a scene does not use
`mediaBase`, but these authored packs use the existing hosted media. Moving to
another origin would require an explicit media-copy and URL-rewrite operation;
that is outside the current owner workflow.

## Publish when the owner chooses

Publication was **not run** for this packaging check. It changes the live content
catalog. Use the existing authenticated Alibaba Cloud CLI with ossutil 2.0
integration (`aliyun ossutil`, CLI 3.0.304 or later), configured for the intended
account and bucket. Keep credentials outside source and browser code.

For an actual release, use the intended merged content source, re-read the live
catalog to account for other authoring work, and upload any new `mediaBase`
objects first. Then:

```sh
npm run content:publish
```

The command **revalidates and restages the current source**; it does not promote
an arbitrary previously staged directory. If source changed after inspection,
inspect the new revision before publication. It checks remote media with HEAD
requests, uploads the immutable `objects/` tree into the existing bucket's
`content/` prefix, and replaces `content/catalog.json` last with `no-store`.

Destination: `parrotbook-media-f6e09412`, region `cn-hongkong`. The discovery
entry point is the [OSS content catalog](https://parrotbook-media-f6e09412.oss-cn-hongkong.aliyuncs.com/content/catalog.json).
Unchanged packs retain their URLs. The publisher does not build/deploy ESA,
commit/push Git, or upload learner recordings. Keep player deployment on its
existing merged-Git workflow.

After publication, refresh the app and test a scene from each changed pack:
discovery/search, role selection, language switching, captions/credits,
waveform/video, and a record/save/reload/replay loop. Record the actual content
revision separately from `/api/health`, which identifies application code.

## Withdraw a pack

The owner can remove a pack from live discovery with:

```sh
npm run content:remove -- pack_ID
```

Use an actual pack ID from the table. This fetches the live catalog and removes
that entry. It retains pack/media objects and recordings; direct object URLs
can still work, and existing tabs retain loaded data until refresh. Saved dubs
remain deletable, but resuming a withdrawn scene reports it unavailable.

Also remove the pack entry from source `content/catalog.json` before the next
full publish, or that publish will restore it. Restoring is an explicit source
catalog change followed by publication. Do not edit immutable release objects
in place. No withdrawal was performed during this check.

See [the complete content format](../content-packs.md) for authoring details.
