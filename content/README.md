# Content authoring

Author packs under `content/packs/<pack_id>/`. Each `pack.json` owns its scene
summaries, search text, translations, and references to scene manifests. The
editable `content/catalog.json` lists the packs to publish. Review recipes in
this directory remain authoring inputs, separate from the player source.

Run the content workflow from the repository root:

```sh
npm run content:validate
npm run content:stage
npm run content:publish
```

Publication is explicit: committing pack changes does not publish them.
`content:publish` uploads content to Alibaba OSS and updates its catalog; it does
not build or deploy the player. Player releases use their separate application
workflow. `/api/health` reports the last deployed application commit and can lag
`main` after content-only changes; it does not identify the published content.

Keep source clips and generated media in ignored `content/local-dubbing/` while
authoring. Published videos, audio, posters, portraits, pack JSON, and waveforms
belong in OSS. Upload media referenced by `mediaBase` before publishing the pack;
media bytes never belong in the application function bundle.

See [the pack format and publishing guide](../docs/content-packs.md) for the
complete format, validation, staging, and withdrawal workflow.
