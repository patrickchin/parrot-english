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

The [Alibaba account smoke test](prototype/README.md) contains a minimal page
and backend endpoint for checking the new deployment path.

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
