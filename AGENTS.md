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

- Changes to `main` go through a pull request; never merge feature branches
  directly. The 2026-10-28 history reset was a one-time user-authorized exception.

## Implementation

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
