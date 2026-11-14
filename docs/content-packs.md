# Content packs

Application releases and content releases are independent. ESA serves the player;
OSS serves the discovery catalog, packs, scene JSON, waveforms, and media. Learner
recordings remain in the browser. Both sources stay in this repository. Content
publication remains an explicit OSS operation; committing content alone does not
publish it. No database or new service is introduced.

For the owner-only stage, publish, and withdrawal commands, see the
[owner quickstart](release/owner-pack-quickstart.md). It includes the verified
128-scene staging result and explains its dependency on existing hosted media.
This workflow does not require a learner upload interface.

The current 128 scenes are packaged into Memes & clips, First English,
Ages 10–12, and Teenagers. Each pack owns its library summaries, searchable text,
scene manifests, timed English subtitles, Chinese hints, roles, portraits,
credits, and localized scene/role text. Existing media references continue to
use the current OSS `clips/` objects; packaging does not duplicate those files.

## Folder format

```text
content/
  catalog.json
  packs/
    pack_<opaque-id>/
      pack.json
      scenes/
        <scene-slug>/
          scene.json
          waveform-<revision>.json
          video.mp4           # optional: assets may instead use mediaBase
          poster.jpg
```

`catalog.json` is the discovery entry point:

```json
{
  "version": 1,
  "packs": [
    { "id": "pack_example", "manifest": "packs/pack_example/pack.json" }
  ]
}
```

`pack_example` is illustrative. Generate new IDs using opaque URL-safe randomness,
for example `pack_` plus `randomBytes(9).toString('base64url')` in Node. Keep IDs
stable when editing a pack or scene. Slugs are readable paths, not record IDs.

A pack has `version: 1`, `id`, `title`, `description`, `author`, `scenes`, and
`locales`. Each scene summary has:

- `id` matching the scene manifest, `slug`, and optional readable `routeSlug`.
- `title`, `english`, `note` (show or film), `source`, `cohort`, and `poster`.
- `tags` and `quotes` for library search.
- `manifest`, a path relative to `pack.json`, such as `scenes/greetings/scene.json`.

The current categories are `older-audience`, `younger-age-5`, `older-children`,
and `teens`. Scenes from different packs can appear in the same category.

Pack locales use the same record IDs as scenes and roles:

```json
{
  "en": {
    "scenes": {
      "scene_example": {
        "title": "Hello, Sam!",
        "licence": "Creator permission",
        "changes": "Trimmed and marked for dubbing."
      }
    },
    "roles": {
      "role_example": { "name": "Sam", "hint": "Two lines" }
    }
  }
}
```

Put this object under `pack.json`'s `locales`. Supported UI languages are `en`,
`zh-CN`, `es`, `ja`, and `ko`. Interface controls belong in the application's
locale files; scene and role translations belong in packs.

Each language may also provide `notices: { "library": "…", "scene": "…" }`
for pack-specific rights or suitability text. Packs without notices inherit none
of the existing film/meme notices. Notices render as plain text.

The scene format remains version 1, validated by `src/scene.ts`. It contains the
video filename, optional backing audio, poster and waveform filenames, duration,
roles, lines with English text and Chinese hints, optional word timings, and
credits. Asset filenames are safe relative filenames. Without `mediaBase`, media
loads beside the scene manifest. With an explicit HTTPS `mediaBase`, media loads
from that storage directory; the waveform still loads beside the scene manifest.
Runtime assets must share the catalog's HTTPS storage origin. Source and licence
links in credits may point to external sites.
Keep private rights evidence outside published packs. Preserve public credits,
usage terms, and existing rights-status notices.

## Validate and stage

```sh
npm run content:validate
npm run content:stage
```

An optional source directory can follow either command, for example
`npm run content:validate -- /absolute/path/to/a/content-folder`. The source
folder contains `catalog.json` and every referenced pack.

Validation checks pack and scene structure, safe paths, record IDs, duplicate
scene routes, referenced local files, and scene timings. External media remains
an explicit reference; check its accessibility and review audiovisual cuts before
publication. Packs contain data and media, never executable code or HTML.

Staging produces an uploadable release under `content/local-packs/`. Each pack
has its own content-derived revision in `releases/<pack-revision>/`, including
all local files it references. Editing or withdrawing another pack leaves an
unchanged pack's URLs stable, so its saved dubs can still reopen. The staging
folder's aggregate revision identifies the complete catalog snapshot.
Inspect staged output before uploading. Source packs remain outside `public/`
and are never imported into application JavaScript. `npm run build` rejects pack
folders, scene manifests, waveforms, and media accidentally copied into `dist/`.
Staging does not download `mediaBase` assets. The current release contains JSON
plus references to existing OSS media, rather than a standalone portable media
archive. No credentials or network requests are required to validate or stage.

Authoring scripts use `scripts/content-paths.mjs` to find scenes and update pack
summaries/search text. No generated catalog or search index is written to `src/`.
When adding a new scene, supply the scene summary and its pack translations as
well as the manifest and media. Existing recipe scripts are authoring tools,
not a public contribution interface.

`npm run test:content` runs authored-content and publishing checks. `npm test`
also runs app contracts, the full typecheck, and the app/content boundary check.
The ESA app gate uses `npm run test:app && npm run build`, with test-only pack
fixtures and application-only TypeScript/Tailwind inputs. It works with authored
content missing or invalid.

## Publish independently

Configure an authenticated Alibaba Cloud CLI with ossutil 2.0 integration
(`aliyun ossutil`, CLI 3.0.304 or later) for the existing account, then run:

```sh
npm run content:publish
```

The default destination is the existing `parrotbook-media-f6e09412` bucket in
`cn-hongkong`. The public entry point is:

`https://parrotbook-media-f6e09412.oss-cn-hongkong.aliyuncs.com/content/catalog.json`

Publishing validates and uploads a revisioned release before replacing the
catalog. The catalog uses `Cache-Control: no-store` so refreshes discover changes;
versioned objects can be cached. Upload new external `mediaBase` files before
publishing references to them. The command does not build, commit, push, or
deploy the player. A Git commit or push does not replace this publication step.
The publisher restages the current source rather than promoting an arbitrary
staged directory. If content changed since inspection, review the new revision.

The `Deploy player` GitHub workflow checks the complete diff of each `main` push.
Changes limited to `content/`, `docs/`, `README.md`, and known authoring scripts
leave `release/player` unchanged. Other paths, including package and unknown
files, advance this deployment pointer to an already merged main commit after
fast-forward and ancestry checks. ESA builds its Git source with both
`BuildBranches` and `ProductionBranch` set to `release/player`. Content-only main
commits do not move the pointer, so `/api/health` can report an older application
commit than the current `main`. Content publication still requires the explicit
OSS command above.

Publish the initial pack catalog before releasing the player change that reads
it. Afterward, changing only content requires this publishing workflow and a
browser refresh. Test a scene from each changed pack, its language switching,
search results, credits, waveform, and video playback.

## Withdraw a pack

```sh
npm run content:remove -- pack_ID
```

This updates the remote catalog only. New page loads and browser refreshes stop
discovering that pack. It does not delete pack files, shared media, recordings,
or local authoring sources. An already open tab keeps its loaded catalog until
refreshed; an open player may also retain its loaded scene data. Local dubs
remain visible and deletable; resuming a withdrawn scene reports that it is
unavailable.

Withdrawal and permanent object removal are different operations. Direct URLs
to retained public objects can still work after withdrawal. A complete media
takedown requires identifying the affected objects, checking shared references,
and deleting those specific OSS objects separately. This command deliberately
preserves data and avoids deleting shared assets.

To publish a later release with the pack still withdrawn, remove its entry from
the local source catalog as well; publishing that source catalog replaces the
remote discovery list. To restore a pack, include it in the source catalog and
publish again. Do not edit an existing immutable release in place.

Community creators can supply the same folder format. Invited-adult review and
publication remain the current workflow; no child upload flow, public marketplace,
or Choicer Voicer pack compatibility is implied.
