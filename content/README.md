# Content authoring

Author packs under `content/packs/<pack_id>/`. Each `pack.json` owns its scene
summaries, search text, translations, and references to scene manifests. The
editable `content/catalog.json` lists the packs to publish. Review recipes in
this directory remain authoring inputs, separate from the player source.

`meme-discovery.json` tracks deduplicated social-video candidates, source links,
dated popularity evidence, language fit, and the next authoring step. It is a
research queue, separate from the playable catalog. Follow the
[meme discovery workflow](../docs/meme-discovery.md) for ongoing
discovery, source verification, local review cuts, and pack publication.

Run the content workflow from the repository root:

```sh
npm run content:validate
npm run content:stage
npm run content:publish
```

Validation and staging are local operations without cloud credentials. The
owner's authenticated CLI is used only for publication or withdrawal. See the
[owner pack quickstart](../docs/release/owner-pack-quickstart.md) for the verified
128-scene artifact and commands. Staging packages referenced local files and
retains existing OSS media URLs; it does not download a portable media archive
or add a learner upload flow.

Publication is explicit: committing pack changes does not publish them.
`content:publish` uploads content to Alibaba OSS and updates its catalog; it does
not build or deploy the player. Player releases use their separate application
workflow. `/api/health` reports the last deployed application commit and can lag
`main` after content-only changes; it does not identify the published content.

Keep source clips and generated media in ignored `content/local-dubbing/` while
authoring. Published videos, audio, posters, portraits, pack JSON, and waveforms
belong in OSS. Upload media referenced by `mediaBase` before publishing the pack;
media bytes never belong in the application function bundle.

To check a content-only merge, record the `release/player` commit and
`/api/health` revision beforehand. After its **Deploy player** workflow finishes,
confirm that the deployment job was skipped and both recorded values remain
unchanged. This checks application deployment only; publishing reviewed pack
changes still requires the separate `npm run content:publish` step.

See [the pack format and publishing guide](../docs/content-packs.md) for the
complete format, validation, staging, and withdrawal workflow.
