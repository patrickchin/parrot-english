# Task 3 report: listening-first picture player

## Status

Implemented the catalog-driven listening-first word-game player, replaced the temporary legacy wrapper, deleted `FirstWordsGame.tsx`, and kept the word-game path entirely on saved static audio.

## TDD evidence

### RED: principal browser behavior against the legacy player

Command:

```text
npx playwright test tests/e2e/word-game.spec.ts --grep "keeps picture exploration" --reporter=line
```

Output:

```text
Running 1 test using 1 worker
[1/1] [chromium] › tests/e2e/word-game.spec.ts:69:1 › keeps picture exploration separate from choosing and uses saved audio

Error: expect(locator).toBeVisible() failed
Locator: getByRole('main').getByRole('heading', { name: 'Animals', level: 1 })
Expected: visible
Error: element(s) not found

1 failed
  [chromium] › tests/e2e/word-game.spec.ts:69:1 › keeps picture exploration separate from choosing and uses saved audio
```

This was the expected feature failure: the canonical Animals route still rendered the retired “Word game” quiz and had no topic heading, picture choices, separate Listen controls, or static word-game audio cues.

### RED: generic catalog audio descriptors

Command:

```text
node --test tests/word-game-catalog.test.mjs
```

Output:

```text
SyntaxError: The requested module '../src/games/word-game-catalog.ts' does not provide an export named 'WORD_GAME_COMPLETE_AUDIO'
✖ tests/word-game-catalog.test.mjs
ℹ pass 0
ℹ fail 1
```

### GREEN: principal browser behavior

Command:

```text
npx playwright test tests/e2e/word-game.spec.ts --grep "keeps picture exploration" --reporter=line
```

Output:

```text
Running 1 test using 1 worker
[1/1] [chromium] › tests/e2e/word-game.spec.ts:69:1 › keeps picture exploration separate from choosing and uses saved audio
1 passed (1.4s)
```

### Focused iteration failures and fixes

The first complete focused run produced three passing scenarios and two assertion failures:

```text
npx playwright test tests/e2e/word-game.spec.ts --reporter=line

2 failed
  completes all six Animals rounds, focuses transitions, and plays again
  uses a large scrollable game surface
3 passed
```

- Completion intentionally contains both the persistent header “Back to games” link and a completion-card “Back to games” link. The test was narrowed to the completion link instead of using a strict locator that matched both.
- The game is a normal document-scrollable route, not a fixed-height nested main scroller. The test now verifies document scrolling at that boundary.

The two corrected scenarios then passed:

```text
npx playwright test tests/e2e/word-game.spec.ts --grep "completes all six|large scrollable" --reporter=line

2 passed (7.1s)
```

Final focused command and output:

```text
npx playwright test tests/e2e/word-game.spec.ts --reporter=line

Running 5 tests using 5 workers
5 passed (1.8s)
```

## Implementation

- Added `WordGamePlayer.tsx`, driven by the resolved `WordGameTopic` and `buildWordGameRounds`.
- Replaced the App route’s temporary `FirstWordsGame` compatibility render with `<WordGamePlayer topic={decision.topic} />`.
- Deleted `FirstWordsGame.tsx`; no device speech remains in the word-game product path.
- Added the exact frozen generic descriptors:
  - `word-game-retry` → `/assets/audio/word-game-retry.mp3` → `Listen and try again.`
  - `word-game-complete` → `/assets/audio/word-game-complete.mp3` → `Great listening! You finished the game.`
- Extended `WordGameVisual` to render an individual catalog item while preserving the topic-card interface. Choice swatches suppress their visible label.
- Added a generation-safe, single-`AbortController` playback owner. Every player action replaces prior audio, unmount aborts, expected `AbortError` is silent, and stale settlements cannot clear or mutate a newer operation.
- Used `playAudioLine` for prompt, teaching label, correct feedback, and completion. Wrong choices use `playAudioSequence` with the selected teaching label followed by the retry line. Catalog `source` is mapped to `audioSrc`.
- Added Start listening, automatic prompt playback on start/Next/replay, prompt-only Listen again, three sibling picture Choose and text Listen controls, calm retry, exact success feedback, locking only Choose actions after success, child-paced Next/Finish, focus transitions, completion, Play again, and Back to games.
- Kept one persistent sound alert while leaving visual interactions usable after saved-audio failure.
- Updated the E2E `Audio` boundary so `/assets/audio/word-game-*` requests are static cues and participate in `held-cue`, `cue-failure`, replacement, and unmount behavior.
- Rewrote browser coverage for all six Animals rounds without waiting for unpublished v8 bitmap decoding.
- Updated SSR shell expectations from the retired quiz to the routed Animals listening-first state.

## Files

- `src/app/App.tsx`
- `src/games/FirstWordsGame.tsx` (deleted)
- `src/games/WordGamePlayer.tsx` (new)
- `src/games/WordGameVisual.tsx`
- `src/games/word-game-catalog.ts`
- `src/testing/e2e-browser-mocks.ts`
- `tests/app-shell-ui.test.mjs`
- `tests/e2e/word-game.spec.ts`
- `tests/word-game-catalog.test.mjs`

## Verification

Focused browser:

```text
npx playwright test tests/e2e/word-game.spec.ts --reporter=line
5 passed (1.8s)
```

Affected Node tests:

```text
node --test tests/word-game-catalog.test.mjs tests/app-routes.test.mjs tests/app-shell-ui.test.mjs tests/audio-playback.test.mjs
ℹ tests 67
ℹ pass 67
ℹ fail 0
```

Full Node suite:

```text
npm test
ℹ tests 1516
ℹ pass 1516
ℹ fail 0
```

Build:

```text
npm run build
✓ 1968 modules transformed.
✓ built in 565ms
```

The build retained the repository’s existing large-chunk advisory.

Lint:

```text
npm run lint
✖ 2 problems (0 errors, 2 warnings)
```

Both warnings are existing unused-disable warnings in generated `worker-configuration.d.ts`; there were no lint errors.

Complete browser suite required by the responsive UI notes:

```text
npm run test:browser -- --reporter=line
4 failed
557 passed (2.8m)
```

All four failures are the documented downstream home-menu bitmap decode condition in `tests/e2e/home-menu.spec.ts`: three phone layouts and one desktop layout wait for `naturalWidth` on the unpublished v8 word-game image. The five focused word-game tests passed in this same run. The v8 catalog artwork was not reverted.

## Self-review

- Confirmed `FirstWordsGame` is removed and `playDeviceSpeech` has no reference under `src/games` or the word-game tests.
- Confirmed catalog IDs, texts, and sources are asserted independently with literal expectations.
- Confirmed picture Listen does not change feedback, progress, selection, Choose enabled state, focus, or Next visibility.
- Confirmed a wrong answer keeps all Choose buttons enabled and can immediately be followed by the correct answer.
- Confirmed correct feedback locks Choose buttons while preserving Listen controls and revealing Next/Finish.
- Confirmed replacement and unmount cancellation, silent expected aborts, persistent failure UI, heading focus, completion audio, and replay.
- Confirmed browser tests assert semantic image names and exact v8 sources without remote decode waits or screenshots.
- Confirmed no page CSS, device-speech fallback, score language, or new dependency was added.
- `git diff --check` is clean.

## Concerns

- The v8 word-game bitmaps are still unpublished, so the known home-menu decode checks remain red until the later publishing/integration tasks land.
- Final breakpoint polish is intentionally left to Task 8; this task provides the required large `max-w-7xl`, document-scrollable surface and basic containment only.
