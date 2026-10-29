# Parrotbook Agent Notes

## Product direction

- Follow `docs/product-plan.md`. Build for children using the dubbing player
  independently; teacher dashboards and classroom management are outside the
  initial scope.
- Keep the player and content packs separate. Distributed content needs a
  documented rights basis; separate packs do not clear third-party rights.
- The earlier product is research preserved under the tags in `README.md`.
  Recover specific code only when it fits the new scope.

## Git

- Work in the shared `main` checkout at `/Users/patchin/Workspace/parrot-english`.
  Pull with `--ff-only` before editing; coordinate around existing local changes.
  Do not leave application work isolated on feature branches or old worktrees.
- Production deploys automatically from GitHub `main` through the connected
  Alibaba ESA build. Never publish a local bundle, ZIP, or feature branch to
  production. Verify the build commit and live `/api/health` revision after a push.

## Implementation

- Use tools, services, frameworks, and components for their intended, documented
  purpose, following established patterns. Convenience, fewer setup steps, or
  fewer resources alone do not justify assigning a responsibility to the wrong
  component. This applies to prototypes as well as production work.
- Store video, audio, recordings, and content-pack media in blob/object storage
  (Alibaba OSS for this prototype). Functions serve application code and APIs;
  never embed media bytes or base64 media in a function bundle.
- A quick prototype still uses these storage boundaries. Do not compress media
  to fit function upload limits. Revisit an unsuitable architecture instead.
- Before changing infrastructure, state which service holds code, media, and
  structured data. Reuse the agreed architecture unless a concrete requirement
  justifies changing it, and explain that change before implementation.
- Prefer entity-prefixed, opaque, URL-safe random IDs for application records.
  Preserve identifiers required by external providers.
- Prefer mature native platform integrations and standard UI when they fit.
  Explain material tradeoffs if a custom or browser alternative is necessary.
- Reuse shared controls once introduced; avoid page-specific copies of global
  controls and large JavaScript class constants.
- Preserve safety, guardian consent, privacy, progress, errors, and live statuses
  when simplifying the interface. Give each route one meaningful `h1`.

## Learner names and audio

- For authored personal names, use only Bob, Mary, Rose, Jack, Ben, or Sam.
  Preserve names supplied by a learner or guardian. Keep visible text, artwork,
  and saved audio consistent when an authored name changes.
- Do not use local, browser, or macOS system text-to-speech for any audio.

## Verification and screenshots

- Test rendered behavior with Playwright and accessible locators; do not assert
  CSS source or class names. Once the browser app exists, provide and run
  `npm run test:browser` for responsive UI changes.
- Save Codex screenshots under `~/Pictures/Screenshots/Codex/parrot-english/`.
