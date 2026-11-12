# Parrotbook Agent Notes

## Product direction

- Follow `docs/product-plan.md`. Build for independent learners across ages,
  including children, teens, and adults. Retain guardian guidance for child use;
  teacher dashboards and classroom management are outside the initial scope.
- The earlier product is research preserved under the tags in `README.md`.
  Recover specific code only when it fits the new scope.

## Git

- GitHub `main` pushes pass through the `Deploy player` workflow's full-diff
  path gate. Changes limited to `content/`, `docs/`, `README.md`, or known
  authoring scripts skip player deployment; content publication remains an
  explicit `npm run content:publish`.
  App changes request the connected ESA source build of `main`. Never publish a
  local bundle, ZIP, or feature branch to production. Verify `/api/health` against
  the actual successful ESA build commit; content-only commits may leave the
  deployed revision behind `main`.

## Implementation

- Ask whether backward compatibility is required before preserving legacy
  behavior, unless the user has already specified. Default to backward
  compatibility not being needed. Add compatibility layers, legacy aliases, or
  migration code only when explicitly required.
- Use tools, services, frameworks, and components for their intended, documented
  purpose, following established patterns. Convenience, fewer setup steps, or
  fewer resources alone do not justify assigning a responsibility to the wrong
  component. This applies to prototypes as well as production work.
- Store video, audio, recordings, and content-scene media in blob/object storage
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

- Prefer simple, common personal names that are familiar to English learners
  from different countries, such as Bob, Mary, Rose, Jack, Ben, or Sam. These
  are examples, not an exhaustive list; avoid obscure or unfamiliar names.
  Preserve names supplied by a learner or guardian. Keep visible text, artwork,
  and saved audio consistent when an authored name changes.
- Do not use local, browser, or macOS system text-to-speech for any audio.
- Verify authored speakers against the source performance, including off-screen
  lines and speaker changes within a draft turn. Keep incidental speakers in the
  original audio; mark their roles `selectable: false` when they offer too little
  useful practice. Do not automatically exclude every one-line role.
- Check cuts against the uncut source and retain complete final syllables with a
  natural release where possible. Alignment inside an already-truncated window
  cannot prove completeness. Keep the next speaker out of per-line prompts.

## Verification and screenshots

- Test rendered behavior with Playwright and accessible locators; do not assert
  CSS source or class names. Once the browser app exists, provide and run
  `npm run test:browser` for responsive UI changes.
- Save Codex screenshots under `~/Pictures/Screenshots/Codex/parrot-english/`.
