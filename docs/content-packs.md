# Content packs

Application releases and content releases are independent. ESA serves the player;
OSS serves the discovery catalog, packs, scene JSON, waveforms, and media. Learner
recordings remain in the browser unless the learner explicitly shares a dub.
The owner API runs on Alibaba Function Compute and is the sole writer of the
public catalog. Its native Bearer authentication protects uploads and management.
Content publication is explicit; committing content alone does not publish it.

For the owner-only stage, publish, and withdrawal commands, see the
[owner quickstart](release/owner-pack-quickstart.md). It includes the verified
128-scene staging result and explains its dependency on existing hosted media.
This workflow does not require a learner upload interface.

The current authoring catalog contains 128 scenes in **21 packs**: 20 franchise
collections, including SpongeBob SquarePants, Shrek, English Singsing, Young
Sheldon, Harry Potter, and Friends, plus one Memes collection. Internet meme clips
retain their original creator or source labels inside that pack. Pack titles
identify the public collections; optional `franchise` metadata helps internal
authoring. Different packs may share a franchise and retain their own opaque
IDs, titles, and authors. Audience/level remains scene metadata. The public
uploader is Patrick, assigned by the owner API separately from the pack's
authored creator credit.

Each pack owns its library summaries, searchable text,
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
    { "id": "pack_example", "manifest": "packs/pack_example/pack.json", "uploader": "Patrick" }
  ]
}
```

`pack_example` is illustrative. Generate new IDs using opaque URL-safe randomness,
for example `pack_` plus `randomBytes(9).toString('base64url')` in Node. Keep IDs
stable when editing a pack or scene. Slugs are readable paths, not record IDs.

A pack has `version: 1`, `id`, `title`, `description`, `author`, and `scenes`,
with optional `franchise` and `locales`. When provided, `franchise` is a nonempty
string of at most 200 characters naming the franchise or source collection.
`title` names this particular pack. `author` retains creator attribution; it
does not control the uploader shown in the public catalog.
Each scene summary has:

- `id` matching the scene manifest, `slug`, and optional readable `routeSlug`.
- `title`, `english`, `note` (show or film), `source`, `cohort`, and `poster`.
- `tags` and `quotes` for library search.
- `manifest`, a path relative to `pack.json`, such as `scenes/greetings/scene.json`.

The current categories are `older-audience`, `younger-age-5`, `older-children`,
and `teens`. These are audience filters, not pack destinations. Scenes from
different packs can appear in the same category.

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

Staging produces a local review snapshot under `content/local-packs/`. Each
pack has a content-derived revision in `releases/<pack-revision>/`, including
all local files it references. The aggregate revision identifies the source
catalog snapshot. These local revision paths are not promoted directly to OSS;
the owner API assigns the final immutable `releases/<upload-id>/packs/<pack-id>/`
paths when publishing.
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

Existing scenes retain their owning pack when the franchise is unchanged,
including when several packs share that franchise. New scenes select a pack by
their source summary's `note`, with the shared `franchiseGroup` rule routing
clips tagged both `internet` and `meme` into Memes. Other meme-tagged film clips
keep their film franchise. An unknown or ambiguous destination is an error. Create or
select the intended pack before authoring. Changing a scene's audience does not
move its files, while moving it to a different franchise moves its scene data,
search summaries, and translations together.

The initial franchise regrouping changes pack IDs and paths but preserves all
128 scene and waveform files byte-for-byte, together with scene/role/line IDs,
translations, notices, and explicit OSS media URLs. It adds no legacy pack aliases
or storage migration. The unchanged media identity allows existing local dubs
to resume through their scene IDs and slugs; the old four pack URLs are not kept.

`npm run test:content` runs authored-content and publishing checks. `npm test`
also runs app contracts, the full typecheck, and the app/content boundary check.
The ESA app gate uses `npm run test:app && npm run build`, with test-only pack
fixtures and application-only TypeScript/Tailwind inputs. It works with authored
content missing or invalid.

## Publish independently

Configure the deployed owner API URL and its native HTTP Bearer token in
`OWNER_API_URL` and `OWNER_API_TOKEN`, then run:

```sh
npm run content:publish
```

The CLI validates and stages the source, creates one private upload session per
pack, and sends only the API's signed headers to direct OSS PUT URLs. The owner
Bearer token is sent only to the owner API. After every file uploads, one atomic
batch publication validates all packs and media, copies referenced files to
immutable public release paths, and activates the catalog last. Failed validation
or copying leaves the previous catalog active. Default publication merges the
source packs into discovery and preserves unrelated published packs.

To explicitly replace the current discovery catalog, run:

```sh
npm run content:publish -- --replace-catalog
```

Replacement makes only this source catalog discoverable, so review its contents
before using the flag. The API validates the current catalog and does not read pack manifests removed
by the replacement. The initial content-only release must publish the new catalog
format before activating this API. Ordinary later publication should omit the flag.

The public entry point is the
[OSS catalog](https://parrotbook-media-f6e09412.oss-cn-hongkong.aliyuncs.com/content/catalog.json).
It uses `Cache-Control: no-store`; immutable release objects can be cached.
Upload new external `mediaBase` assets to public OSS `clips/` objects before
publishing their references. Existing public release media can also be referenced;
private upload drafts and shared recordings cannot. The API checks remote media
with HEAD requests and copies uploaded media within OSS without buffering it in
a function. The CLI does not build, commit, push, or deploy the player. It
restages current source rather than promoting an arbitrary staged directory.

The `Deploy player` GitHub workflow checks the complete diff of each `main` push.
Changes limited to `content/`, `docs/`, `README.md`, and known authoring scripts
leave `release/player` unchanged. Other paths, including package and unknown
files, advance this deployment pointer to an already merged main commit after
fast-forward and ancestry checks. ESA builds its Git source with both
`BuildBranches` and `ProductionBranch` set to `release/player`. Content-only main
commits do not move the pointer, so `/api/health` can report an older application
commit than the current `main`. Content publication still requires the explicit
owner API command above.

Publish the initial pack catalog before releasing the player change that reads
it. Afterward, changing only content requires this publishing workflow and a
browser refresh. Test a scene from each changed pack, its language switching,
search results, credits, waveform, and video playback.

## Withdraw a pack

```sh
npm run content:remove -- pack_ID
```

This deletes the pack from public discovery and the private owner management
list. It retains immutable pack files, shared media, recordings, and local
authoring sources. Remove the source catalog entry too if future publication
should keep it absent. Reupload the folder to publish it again.

The private owner page also provides Hide and Show. Hiding removes public
discovery while retaining the management record; showing validates current global
IDs and routes before restoring it. An already open learner tab can retain its
loaded catalog until refreshed. Local dubs remain visible and deletable; resuming
a removed scene reports that it is unavailable.

Discovery removal and object deletion are separate operations. Direct URLs to
retained public objects can still work. A complete media takedown requires
identifying affected objects, checking shared references, and deleting those
specific OSS objects separately. These management operations retain shared assets.
Do not edit immutable release objects in place.

Creators can prepare the same folder format, while only the owner can upload and
manage packs in this iteration. Learners do not need accounts. Public upload
accounts and Choicer Voicer pack compatibility are outside this iteration.
