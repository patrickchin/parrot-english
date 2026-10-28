# Parrotbook

An English dubbing player for children, designed for independent use on phones
and tablets and delivery through Chinese infrastructure.

Choose a scene and character, hear each line, record your version, and watch
the finished scene with your own voice. The player and content packs are
separate. Guardian consent and save/share controls belong in the grown-up area;
the first product has no teacher workflow.

Read the [product plan](docs/product-plan.md) for scope, content permissions,
hosting, domain options, and the pilot sequence. This is a planning baseline;
the earlier application and deployment automation have not been carried into it.

The first player is live at <https://parrotbook.com/>. Choose a scene and role,
listen to the original dialogue, record each turn, then replay with your voice.
Takes remain in memory and disappear on refresh, close, or an explicit reset.

The shelf contains the four selected memes: **No, this is Patrick**, **Chocolate!**,
**Wumbo**, and **Ogres are like onions**. Their private test videos are excluded
from Git and from the hosted bundle. The public player accepts the prepared
video from a device file picker without uploading it. A separate CC BY 3.0
**Sintel** sample can be played immediately. See [clip sources](docs/clip-sources.md)
for the YouTube links, timing notes, credits, and redistribution status.

```sh
npm ci
npm run dev
npm run build
npm test
npm run test:browser
```

With private footage prepared under `content/local-dubbing/`, the development
server plays those four scenes directly. On the hosted player, unzip the private
test-clip package and select the matching `*-v1.mp4` file for the chosen scene.
No cloud media upload, account, database, voice generation, or speech scoring is
involved. Microphone capture uses native browser APIs; actual iPhone/Android
hardware and WeChat still need manual checks before a child pilot.

`npm run build` emits the site and reviewed public assets inside one
`build/edge-worker.mjs` for Alibaba ESA. The retained [account smoke test](prototype/README.md)
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

Future changes to main go through pull requests.
