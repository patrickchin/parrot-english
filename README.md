# Parrotbook

An English dubbing player for children, designed for independent use on phones
and tablets and delivery through Chinese infrastructure.

Choose a scene and character, hear each line, record your version, and watch
the finished scene with your own voice. The player and scene content are
separate. Guardian consent and save/share controls belong in the grown-up area;
the first product has no teacher workflow.

Read the [product plan](docs/product-plan.md) for scope, content permissions,
hosting, domain options, and the pilot sequence. The earlier application remains
archived; the current player and GitHub deployment configuration are on `main`.

The first player is live at <https://parrotbook.com/>. Choose a scene and role,
listen to the original dialogue, record each turn, then replay with your voice.
The adult POC autosaves partial and completed attempts in this browser's
IndexedDB. **My dubs** reopens a saved session with its role, current line,
recordings, and progress. Starting over preserves the previous attempt;
individual attempts can be deleted from My dubs. Nothing is uploaded. Clearing
site data removes saved dubs; download important finished videos as backups.

The header's language menu offers English, 简体中文, Español, 日本語, and 한국어. It remembers only
the interface preference on this browser; switching languages keeps the current
scene and recordings. English dialogue/audio and the optional Chinese meaning
hints are independent of the UI language.

The Playhouse interface uses forest green and lime, starting in light mode
regardless of the device theme. The header's sun/moon button switches appearance
and remembers that choice on this browser, including across scene navigation.
Changing appearance preserves the current scene and recordings.

The warm player shows detailed teal original-audio and coral learner waveforms
with a synchronized playhead during listening, capture, and replay. Dialogue
captions show the current turn. This is timing and emphasis feedback, not
pronunciation scoring. See
[the UI and waveform notes](docs/ui-design.md).

The internal-test shelf has four folders: **38 film/animation scenes**,
**15 First English conversations**, **12 Young Sheldon/Harry Potter conversations for
ages 10–12**, and **14 Friends/HIMYM/Big Bang Theory conversations for teens**.
The First English folder uses language level, with five foundational English Singsing
conversations and ten playful Gogo stories built from short, concrete phrases;
see [the beginner review](docs/first-english-review.md).
See [the latest 12 scenes](docs/clip-expansion-2026-11-11-c.md) and
[the earlier TV scenes](docs/tv-review.md) for sources and content notes. The 21 short meme excerpts have been expanded or replaced with complete
exchanges; Patrick, Chocolate, and Onions retain their original edits.
The category tabs show scene previews and counts, and keep the selected folder
across playback, language changes, and reloads.
See [the meme re-edits](docs/meme-review.md) and
[the younger scenes](docs/preschool-review.md) for the current cuts.
Browse the thumbnail grid or search within the selected folder by title, series,
character, topic tag, or any English dialogue/Chinese meaning hint. Fuse.js provides
typo-tolerant matching across query words; title and tag matches rank ahead of
dialogue-only matches. Every scene opens directly from Alibaba
OSS, with an original-audio waveform, aligned words, and Chinese meaning hints.
See [clip sources](docs/clip-sources.md) and [the 20 additional scenes](docs/extra-clips.md)
for YouTube links, source offsets, credits, and redistribution status.

```sh
npm ci
npm run dev
npm run build
npm test
npm run test:browser
```

Content is authored separately under `content/packs/`. The existing 79 scenes
are grouped into four packs, each containing its scene manifests, subtitles,
word timings, search data, credits, and five-language scene/role text.
`content/catalog.json` lists the available packs. The player fetches that catalog
and its packs at runtime; adding or withdrawing content does not rebuild the app.
See [the pack format and publishing guide](docs/content-packs.md).

```sh
npm run content:validate
npm run content:stage
npm run content:publish
npm run content:remove -- pack_ID
```

Publishing requires an authenticated OSS CLI. It uploads a versioned release
first, then replaces the discovery catalog. Removing a pack withdraws it from
the catalog; it preserves the stored files. Videos and images already in OSS
keep their current URLs.

Alibaba ESA holds application code, HTML/CSS, and interface translations.
Alibaba OSS holds content catalogs, packs, scene manifests, waveforms, video,
audio, and scene images. `npm run build` emits only the application in
`build/edge-worker.mjs` and rejects content packs or media in the public build.
No content upload runs as part of an application build or deployment.

Original downloads and authoring outputs remain ignored under
`content/local-dubbing/`; the earlier licensed sample remains an internal test
fixture only. Learner recordings remain in browser storage. No account,
database, voice generation, or speech scoring is involved. Microphone capture
uses native browser APIs; actual iPhone/Android hardware and WeChat still need
manual checks before a child pilot. The [infrastructure record](docs/infrastructure.md)
describes the current service and previous services parked with data retained.

## Scene manifests

One playable activity is a **scene**: a video, roles, timed dialogue, and optional
backing audio, portraits, and waveforms. Its manifest is
`content/packs/<pack_id>/scenes/<slug>/scene.json`, validated by the `Scene` model
in `src/scene.ts`. A pack's `pack.json` groups scenes and owns their discovery and
localized text. The player uses the same format for founder and community packs;
this does not add a public marketplace or automatic community upload service.

Scene manifests support optional `tags` (up to 32 nonempty strings, 80 characters
each). Keep tags in the authoring recipe as well. Authoring commands resolve
pack paths through `scripts/content-paths.mjs` and refresh pack search data when
regenerating scenes. Review all changed pack text and translations before publishing.

Scene IDs retain their `scene_…` values; new pack IDs use opaque `pack_…` IDs.
Media URLs in OSS are unchanged.

## Research archive

Main begins with a new root commit on 2026-10-28. The previous history remains
available under these tags in the same repository:

| Tag | Preserved work |
| --- | --- |
| `research/parrot-english-2026-10-28` | Earlier application and documentation at `8df68a24` |
| `research/parrotbook-planning-2026-10-28` | Original pivot plan and company clarification at `522899f5` |
| `research/aliyun-pilot-2026-10-28` | Unmerged Alibaba China hosting prototype at `492409cf` |

To inspect a snapshot without changing this checkout:

```sh
git worktree add --detach ../parrot-english-research research/parrot-english-2026-10-28
```

These are source archives. Cloud databases, external media, credentials, and
running services require separate backup or retirement decisions. Keep secrets
and learner data out of Git.

## Development and deployment

Use the shared `main` checkout at `/Users/patchin/Workspace/parrot-english` and
pull with `git pull --ff-only` before editing. The owner selected this shared
workflow on 2026-10-29; old feature worktrees are not the current application.

Alibaba ESA connects directly to `patrickchin/parrot-english`. Only pushes to
`main` build and deploy `parrotbook-prototype` to production. The build uses Node
24, `npm ci`, then `npm test && npm run build`; `esa.jsonc` versions these settings.
Do not upload local bundles or ZIPs, or publish feature branches to production.
Check the ESA build's commit and `/api/health`'s `revision` against GitHub `main`
after deployment. Content publishing is separate from this application deployment. Packs and media stay in OSS; the app build never uploads recordings.
