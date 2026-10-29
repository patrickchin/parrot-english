# Parrotbook

An English dubbing player for children, designed for independent use on phones
and tablets and delivery through Chinese infrastructure.

Choose a scene and character, hear each line, record your version, and watch
the finished scene with your own voice. The player and content packs are
separate. Guardian consent and save/share controls belong in the grown-up area;
the first product has no teacher workflow.

Read the [product plan](docs/product-plan.md) for scope, content permissions,
hosting, domain options, and the pilot sequence. The earlier application remains
archived; the current player and GitHub deployment configuration are on `main`.

The first player is live at <https://parrotbook.com/>. Choose a scene and role,
listen to the original dialogue, record each turn, then replay with your voice.
Takes remain in memory and disappear on refresh, close, or an explicit reset.

The header's UI language selector offers English and 简体中文. It remembers only
the interface preference on this browser; switching languages keeps the current
scene and recordings. English dialogue/audio and the optional Chinese meaning
hints are independent of the UI language.

The warm single-column player shows a teal original-audio envelope and a coral
learner envelope with a synchronized playhead during listening, capture, and
replay. This is timing and emphasis feedback, not pronunciation scoring. See
[the UI and waveform notes](docs/ui-design.md).

The shelf contains the four selected memes: **No, this is Patrick**, **Chocolate!**,
**Wumbo**, and **Ogres are like onions**. Their prepared excerpts load
from a dedicated Alibaba OSS bucket, so each scene opens directly.
A separate CC BY 3.0
**Sintel** sample can be played immediately. See [clip sources](docs/clip-sources.md)
for the YouTube links, timing notes, credits, and redistribution status.

```sh
npm ci
npm run dev
npm run build
npm test
npm run test:browser
```

Application code and pack metadata belong in ESA; video, audio, and scene
images belong in Alibaba OSS. `mediaBase` in each pack identifies its media
location. Original downloads and meme authoring outputs remain ignored under
`content/local-dubbing/`; licensed Sintel authoring files are in `content/media/`. No learner recording upload,
account, database, voice generation, or speech scoring is involved. Microphone
capture uses native browser APIs; actual iPhone/Android
hardware and WeChat still need manual checks before a child pilot.

`npm run build` emits application code, HTML/CSS, and pack metadata in
`build/edge-worker.mjs` for Alibaba ESA. It rejects media in the public build
instead of embedding it in the function. The retained [account smoke test](prototype/README.md)
records the earlier deployment proof. The [infrastructure record](docs/infrastructure.md)
describes the current service and previous services parked with data retained.

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
after deployment. Media stays in OSS; the app build never uploads recordings.
