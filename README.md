# Parrotbook

An English dubbing player for learners across ages, designed for independent
use on phones and tablets and delivery through Chinese infrastructure.

Choose a scene and character, hear each line, record your version, and watch
the finished scene with your own voice. The player and scene content are
separate. Guardian consent and save/share controls belong in the grown-up area;
the first product has no teacher workflow.

Read the [product plan](docs/product-plan.md) for scope, content permissions,
hosting, domain options, and the pilot sequence. The earlier application remains
archived; the current player and GitHub deployment configuration are on `main`.

New content prioritizes **memeable internet moments**: creator comedy, reactions,
interviews, and viral exchanges, alongside recognizable film/TV memes. The
[discovery queue and batch workflow](docs/meme-discovery.md) cover Chinese and
Western platforms. Discovery continues during authoring, with periodic additions
when a verified batch is ready.

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

The green Pop Studio interface uses vivid green, forest ink, mint surfaces,
yellow primary actions, and pink recording controls. It starts in light mode
regardless of the device theme. The header's sun/moon button switches appearance
and remembers that choice on this browser, including across scene navigation.
Changing appearance preserves the current scene and recordings.

The player shows detailed green original-audio and coral learner waveforms
with a synchronized playhead during listening, capture, and replay. Dialogue
captions show the current turn. This is timing and emphasis feedback, not
pronunciation scoring. See
[the UI and waveform notes](docs/ui-design.md).

The internal-test shelf has four folders: **72 meme, film and animation scenes**,
**15 First English conversations**, **15 Young Sheldon/Harry Potter conversations for
ages 10–12**, and **14 Friends/HIMYM/Big Bang Theory conversations for teens**.
The First English folder uses language level, with five foundational English Singsing
conversations and ten playful Gogo stories built from short, concrete phrases;
see [the beginner review](docs/first-english-review.md).
See [the latest 12 scenes](docs/clip-expansion-2026-11-11-c.md) and
[the earlier TV scenes](docs/tv-review.md) for sources and content notes. The 21 short meme excerpts have been expanded or replaced with complete
exchanges; Patrick, Chocolate, and Onions retain their original edits.
The category tabs show scene previews and counts, and keep the selected folder
across playback, language changes, and reloads.
Three social-video additions are live in [the social meme batch](docs/social-meme-scenes.md): Corn Kid, Apparently Kid, and Emotional Damage.
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

`npm run test:all` runs all checks, including the browser suite. See the
[testing guide](docs/testing.md) for prerequisites, seeded recording stress
tests, failure traces, and the limits of emulated devices.

Content is authored separately under `content/packs/`. The authored 116 scenes
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
No content upload runs as part of an application build or deployment. Committing
content changes does not publish them; run `npm run content:publish` explicitly.

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

The [Deploy player workflow](.github/workflows/deploy-app.yml) runs on `main`
pushes and checks the complete Git diff through `scripts/app-deployment.mjs`.
Changes limited to `content/`, `docs/`, `README.md`, or known authoring scripts
leave the player release pointer unchanged. Runtime, package, build, and unknown
paths advance it; the filter has no 300-file limit. Manual main workflow runs can
retry a release build.

`release/player` is a deployment pointer to an already merged commit from `main`,
advanced only by that workflow after fast-forward and ancestry checks. Develop
and merge on ordinary branches, never on this release ref. ESA's `BuildBranches`
and `ProductionBranch` both use `release/player`; its native Git push build is
monitored by the workflow. A missing build or manual retry can request a fresh
ESA build from the same Git-backed release ref. Feature code is merged into
`main` before it can be released; the workflow uploads no application bundle.

ESA fetches source from the existing GitHub connection and uses Node 24,
`npm ci`, then `npm run test:app && npm run build`; `esa.jsonc` versions those
commands. The app gate works independently of authored content. `npm test` runs
all app, content, typecheck, and boundary checks. The workflow obtains short-lived
Alibaba credentials through GitHub OIDC; see [the infrastructure record](docs/infrastructure.md)
for its provider, role, and selected trigger configuration.

Never publish unmerged feature code, local bundles, or ZIPs to production. When
an app deployment runs, compare the successful ESA build's actual source commit
with `/api/health`'s `revision`. Content-only main commits do not advance the
release pointer, so the deployed app revision can trail `main`. Pack publication
remains the explicit OSS workflow above, with no player build or learner-recording
upload.
