# Task 2: Schema-v2 Word-Game Curriculum, Audio, Player, and Category UI

## Implementation

- Migrated the nine category manifests to strict schema version 2. Every one of
  the 107 items now owns a preserved `labelAudio` cue and a new `promptAudio`
  cue; the removed item `audio` and question `prompt`/`success` fields are
  rejected by the schema.
- Added strict `content/word-games/player.json` ownership of generic success,
  retry, and completion cues. The compiler validates all item and player cue IDs
  in one global namespace, plans their saved audio, and generates exactly
  `{ categories, player }`.
- Authored 81 fixed quizzes and 486 fixed questions across 27 tiers. Each tier
  has three six-question passes with target orders `[a,b,c,d,e,f]`,
  `[c,e,a,f,b,d]`, and `[e,b,d,a,f,c]`; each question explicitly owns the
  cyclic `[target,next1,next2,next3]` choice neighborhood.
- The frozen runtime derives each quiz cover from its first target. The player
  renders and speaks the target prompt cue, uses label cues for choices and wrong
  feedback, and displays the same generic-success/target-label or
  label/generic-retry sequence that playback receives.
- The category route now renders three sibling tier panels at large widths, each
  with three compact, distinct-cover quiz cards, a short pass title, and
  `6 questions`. Existing shared headers/controls, one route `h1`, progress,
  focus, status, and audio-error recovery remain intact.

## TDD

RED command:

```sh
node --test tests/word-game-manifest.test.mjs tests/word-game-compiler.test.mjs tests/word-game-curriculum.test.mjs tests/word-game-catalog.test.mjs tests/static-audio.test.mjs tests/app-shell-ui.test.mjs
```

RED result: exit 1; 69 tests ran and 44 failed for the intended old-contract
reasons: no `parseWordGamePlayerManifest`, schema-v2 fixtures rejected at the old
item-audio seam, production still had 27 quizzes/162 questions, generated output
lacked `categories`/`player`, runtime lacked prompt cues and quiz covers, and the
player/category rendering still used the old copy and links.

GREEN result for the same focused command: 121 passed, 0 failed.

## Audio oracle and generation

The compiler's initial missing-audio oracle contained exactly 107 IDs. Every ID
matched `word-game-*-prompt`; it contained no label, generic, nursery-rhyme, or
story cue:

```text
word-game-animals-alligator-prompt
word-game-animals-bird-prompt
word-game-animals-cat-prompt
word-game-animals-cow-prompt
word-game-animals-dog-prompt
word-game-animals-duck-prompt
word-game-animals-elephant-prompt
word-game-animals-fish-prompt
word-game-animals-frog-prompt
word-game-animals-giraffe-prompt
word-game-animals-horse-prompt
word-game-animals-pig-prompt
word-game-body-parts-arm-prompt
word-game-body-parts-brain-prompt
word-game-body-parts-ears-prompt
word-game-body-parts-eyes-prompt
word-game-body-parts-foot-prompt
word-game-body-parts-hand-prompt
word-game-body-parts-heart-prompt
word-game-body-parts-leg-prompt
word-game-body-parts-mouth-prompt
word-game-body-parts-nose-prompt
word-game-body-parts-tongue-prompt
word-game-body-parts-tooth-prompt
word-game-clothes-boots-prompt
word-game-clothes-coat-prompt
word-game-clothes-dress-prompt
word-game-clothes-gloves-prompt
word-game-clothes-hat-prompt
word-game-clothes-pants-prompt
word-game-clothes-scarf-prompt
word-game-clothes-shirt-prompt
word-game-clothes-shoes-prompt
word-game-clothes-shorts-prompt
word-game-clothes-socks-prompt
word-game-clothes-swimsuit-prompt
word-game-colors-black-prompt
word-game-colors-blue-prompt
word-game-colors-brown-prompt
word-game-colors-gray-prompt
word-game-colors-green-prompt
word-game-colors-orange-prompt
word-game-colors-pink-prompt
word-game-colors-purple-prompt
word-game-colors-red-prompt
word-game-colors-white-prompt
word-game-colors-yellow-prompt
word-game-feelings-angry-prompt
word-game-feelings-bored-prompt
word-game-feelings-calm-prompt
word-game-feelings-confused-prompt
word-game-feelings-excited-prompt
word-game-feelings-happy-prompt
word-game-feelings-sad-prompt
word-game-feelings-scared-prompt
word-game-feelings-silly-prompt
word-game-feelings-sleepy-prompt
word-game-feelings-surprised-prompt
word-game-feelings-worried-prompt
word-game-food-apple-prompt
word-game-food-banana-prompt
word-game-food-bread-prompt
word-game-food-carrot-prompt
word-game-food-cheese-prompt
word-game-food-egg-prompt
word-game-food-milk-prompt
word-game-food-orange-prompt
word-game-food-potato-prompt
word-game-food-rice-prompt
word-game-food-sandwich-prompt
word-game-food-tomato-prompt
word-game-home-bathtub-prompt
word-game-home-bed-prompt
word-game-home-broom-prompt
word-game-home-chair-prompt
word-game-home-door-prompt
word-game-home-house-prompt
word-game-home-key-prompt
word-game-home-mirror-prompt
word-game-home-shower-prompt
word-game-home-sofa-prompt
word-game-home-toilet-prompt
word-game-home-window-prompt
word-game-toys-ball-prompt
word-game-toys-blocks-prompt
word-game-toys-doll-prompt
word-game-toys-drum-prompt
word-game-toys-kite-prompt
word-game-toys-puzzle-prompt
word-game-toys-robot-prompt
word-game-toys-skateboard-prompt
word-game-toys-teddy-bear-prompt
word-game-toys-toy-car-prompt
word-game-toys-toy-train-prompt
word-game-toys-yo-yo-prompt
word-game-transport-airplane-prompt
word-game-transport-bicycle-prompt
word-game-transport-boat-prompt
word-game-transport-bus-prompt
word-game-transport-car-prompt
word-game-transport-helicopter-prompt
word-game-transport-motorcycle-prompt
word-game-transport-rocket-prompt
word-game-transport-scooter-prompt
word-game-transport-taxi-prompt
word-game-transport-train-prompt
word-game-transport-truck-prompt
```

Generation used only the checked-in ElevenLabs pipeline and its existing
voice/model/format/language defaults. The API key was parsed directly from the
authorized root-worktree `.dev.vars` into the generator process environment;
its value was never printed, copied, logged, or tracked. TLS verification stayed
enabled with `NODE_USE_SYSTEM_CA=1`.

The first guarded run was interrupted with exit 130 after an independent content
audit found plural grammar that needed correction. At that point 65 prompt files
existed. Five newly generated incorrect clothes prompts (shoes, socks, pants,
shorts, and gloves) existed and were removed by exact path; the blocks prompt had
not yet been generated. No label or unrelated prompt audio was touched. After
fixing the six sources to `Which are the ...?`, source/compiler tests passed,
60 valid prompt files remained, and the compiler proved a new exact 47-ID oracle
containing only missing prompt IDs, including all six corrected plural cues. The
approved generator then produced only those 47 files.

Final audio evidence:

- Missing-audio oracle: 0.
- Prompt audio: 107/107 non-empty MP3 files; FFprobe reported MP3 and FFmpeg
  decoded every file cleanly.
- Existing label audio: 107/107 working-tree blob hashes exactly match base
  commit `b88201a0`.
- Exact `word-game-*.mp3` inventory: 216 files — 107 labels, 107 prompts, retry,
  and complete. Generic success remains the existing narrator asset outside the
  word-game prefix.
- Planner/static cue inventory: 217 unique IDs — 214 item cues plus three player
  cues.

## Verification

- Independent JSON audit at snapshot `f2cb2638…`: passed exact
  9 categories/27 tiers/81 quizzes/486 questions/107 items, target and cyclic
  choice orders, globally unique strict IDs, grammatical category-appropriate
  prompts, no disallowed names, all 107 label IDs/texts/audio bytes unchanged,
  and 217 unique cue IDs.
- `npm run generate:word-game-catalog` — passed.
- `npm run check:content-catalogs` — passed.
- Focused Task 2 Node suite — 121 passed, 0 failed.
- Additional package-flow/generator/player-build/Fluent/web-assets suite —
  21 passed, 0 failed.
- Full `npm test` — 1,612 passed, 0 failed.
- Adjusted ESLint command over all applicable Task 2 JavaScript/TypeScript files
  — passed.
- `npm run build` — passed; Vite emitted its existing large-chunk advisory only.
- `PLAYWRIGHT_PORT=44011 npx playwright test tests/e2e/word-game.spec.ts` —
  14 passed, 0 failed.
- `PLAYWRIGHT_PORT=44012 npm run test:browser` — 586 passed, 0 failed in 2.6m.
- Both isolated ports had no listener after Playwright exited.
- `git diff --check` — passed.

## Self-review

Reviewed the complete working diff from `b88201a0`, including source manifests,
compiler/schema, static-audio registration, runtime/UI, generated catalog, tests,
and all 107 new MP3s. Rechecked exact curriculum counts and deterministic orders,
strict ID/text ownership, deep freezing, prompt/feedback playback parity,
accessible route structure, and the absence of runtime/content Noto references.
The Task 1 Fluent manifest, pinned hashes, 94 PNGs, tracked inventory, and license
remain unchanged.

## Concerns

- The plan's literal ESLint command includes `content/word-games`, but ESLint 9
  exits 2 because this JSON-only directory is ignored and has no matching config.
  No lint configuration was changed. Removing only that inapplicable directory
  makes the otherwise identical Task 2 lint scope pass.
- The production build retains the repository's existing Vite large-chunk
  advisory; it is not introduced by this task.
