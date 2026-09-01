# Task 1: Replace Noto With Pinned Fluent 3D Artwork

## Implementation

- Replaced the Noto SVG contract with the strict Fluent 3D PNG contract: schema-v1
  visual records are `{ kind: "fluent-3d", assetId }`, and
  `parseFluentAssetManifest` pins the Microsoft repository, revision
  `1ffb34c752ecf5d402f04cfb4b392c77f57c54bc`, MIT license, and `LICENSE` path.
- The compiler now uses the Fluent root, verifies safe `.png` paths, regular
  files/no symlinks/no extras, exact SHA-256 bytes, PNG signature, and 256×256
  IHDR dimensions, then emits Fluent image URLs.
- Vendored the exact upstream license and 94 official Fluent 3D 256×256 PNGs,
  each hash-pinned in `content/word-games/fluent-3d-assets.json`; removed all
  Noto content, artwork, licensing, and the scoped attributes exception.
- Changed only non-color visual kinds and regenerated the TypeScript catalog.
  Item/audio/tier/quiz/question IDs, learner text, and authored order are unchanged.

## Files changed

Changed manifest/compiler, nine non-color category JSON files, generated catalog,
asset/licensing notices, fixtures, affected word-game/UI tests, and the static-audio
fixture setup. Replaced `word-game-noto-assets.test.mjs` and Noto assets/manifest/
license with Fluent equivalents under `content/word-games/fluent-3d-assets.json`,
`public/assets/word-games/fluent-3d/`, and `third_party/fluentui-emoji-LICENSE`.

## TDD

RED command:

```sh
node --test tests/word-game-manifest.test.mjs tests/word-game-compiler.test.mjs tests/word-game-fluent-assets.test.mjs tests/word-game-curriculum.test.mjs tests/web-assets.test.mjs
```

RED result: failed as expected because `parseFluentAssetManifest` was not exported
by the Noto-only implementation (and the test fixtures had deliberately moved to
the Fluent names).

GREEN command:

```sh
node --test tests/word-game-manifest.test.mjs tests/word-game-compiler.test.mjs tests/word-game-fluent-assets.test.mjs tests/word-game-curriculum.test.mjs tests/web-assets.test.mjs
```

GREEN result: 88 passed, 0 failed. The compiler tests cover rejected Noto visuals,
wrong provenance/license fields, unsafe PNG paths, wrong hashes, non-PNG bytes,
wrong IHDR dimensions, symlinks, missing/unused records, and unexpected files.

## Verification

- `npm run generate:word-game-catalog` — passed.
- Extended relevant source suite (including package flow, static audio, app-shell,
  and product tests) — 114 passed, 0 failed.
- `npx eslint scripts/word-game tests/word-game-manifest.test.mjs tests/word-game-compiler.test.mjs tests/word-game-fluent-assets.test.mjs tests/word-game-curriculum.test.mjs` — passed.
- `npm run build` — passed. Vite emitted its existing large-chunk advisory only.
- `git diff --check` — passed.
- Independent inventory audit — 94 manifest records, 94 PNGs, 94 referenced IDs,
  all SHA-256 values matched; generated categories retain 162 questions.
- `npm run test:browser` — failed with widespread unrelated timeouts in this shared
  desktop environment. The first account-focus failure passed immediately in
  isolated Chromium reproduction (1/1). A word-game-only parallel run showed the
  same timeout pattern; its snapshot was already in a player route while waiting
  for a category-tier link. No UI code was changed in response.

## Self-review

Verified every non-color generated source is under `/assets/word-games/fluent-3d/`,
no Noto runtime references remain, and only the requested visual/provenance data
changed. The public artifact allowlist now permits only the constrained Fluent PNG
root, not arbitrary PNGs.

## Concerns

- Kept current learner labels/IDs as required despite unavoidable official-asset
  semantic exceptions: alligator uses Crocodile; blocks uses Brick; doll uses
  Nesting dolls; toy car and car share Automobile; toy train and train share Train.
  The pinned `assets/Mirror/3D/mirror_3d.png` is an exact wall-mirror match.
- Full browser verification is currently unreliable under shared-host parallel
  load; all source, integrity, lint, and production-build checks passed.

## Review fix

Review found that `.gitignore` ignored all public PNGs, so the first task commit
did not track the 94 vendored Fluent files. Added the narrow
`!/public/assets/word-games/fluent-3d/*.png` exception and a regression test
that compares `git ls-files` with the expected 94-file Fluent inventory.

- RED: `node --test tests/word-game-fluent-assets.test.mjs` failed because the
  tracked inventory was empty.
- GREEN: the same command passed 4/4 after staging the 94 PNGs.
