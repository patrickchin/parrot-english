# Nursery Rhyme Melody and Voice Alignment Implementation Plan

> **Execution note:** The user explicitly requested autonomous implementation,
> pull-request creation, and merge. Follow strict red-green-refactor locally;
> do not pause for an approval checkpoint that the user has waived in advance.

**Goal:** Replace the generic nursery-rhyme backing pattern with the correct
Five Little Ducks and Old MacDonald melodies, align every voice line to its
musical phrase, and merge the verified change.

**Architecture:** Store one immutable, line-relative score per rhyme. Keep the
existing shared Web Audio clock and schedule score notes from the same authored
line cues used by guide and private voice sources. Retain all current recording,
consent, storage, and UI behavior.

**Tech Stack:** TypeScript, Web Audio API, Node test runner, React/Vite,
Playwright, ESLint, GitHub CLI.

**Spec:** `docs/superpowers/specs/2026-08-29-nursery-rhyme-melody-design.md`

## Constraints

- Do not add a dependency or require an API key.
- Do not regenerate, time-stretch, pitch-shift, upload, or replace guide or
  learner recordings.
- Encode only traditional/public-domain melody data, not a copied recording.
- Five Little Ducks keeps its existing lyrics, cues, and 98-second full clock.
- Old MacDonald keeps stable line IDs and lyrics but uses phrase offsets
  `0/8/16/18/20/22/24` seconds in every 32-second scene, a 162-second full
  clock, and a 9.2-second final cue tail.
- Full and selected-scene playback use the same score and voice clock.
- Missing voice audio never removes the melody or visual timeline.
- Preserve existing cancellation, consent-loss, and failure cleanup behavior.
- Run `npm test`, `npm run lint`, `npm run build`, and
  `npm run test:browser` before opening the pull request.

## Task 1: Define the score contract and musical timelines

**Files:**

- Create: `src/dubbing/dub-melodies.ts`
- Modify: `src/dubbing/dub-script.ts`
- Modify: `src/dubbing/rhyme-catalog.ts`
- Modify: `tests/dub-state.test.mjs`
- Create/modify: `tests/dub-catalog.test.mjs`

- [ ] Add a failing domain test that pins Old MacDonald's first-scene cue
      offsets to `[0, 8000, 16000, 18000, 20000, 22000, 24000]`, subsequent
      scene starts to 32-second intervals, full duration to 162 seconds, and
      final tail to 9.2 seconds.
- [ ] Add a failing catalog test requiring both definitions to own deeply
      frozen scores with exactly one phrase per scene line and with every note
      contained inside its phrase.
- [ ] Run the focused tests and confirm failures are caused by the missing
      score/timeline behavior.
- [ ] Add the minimal immutable score types and literal note data from the two
      reviewed traditional scores.
- [ ] Attach the correct score to both definitions and change only Old
      MacDonald's cue/duration values.
- [ ] Run the focused tests until green, then refactor duplicate score-freezing
      code only if the tests remain green.

## Task 2: Schedule the distinctive melodies on the shared clock

**Files:**

- Modify: `src/dubbing/dub-playback.ts`
- Modify: `tests/dub-playback.test.mjs`

- [ ] Add a failing selected-scene playback test for Five Little Ducks. Assert
      the first score-derived triangle frequencies are the literal E4, D4, D4,
      C4 sequence and that the first melody note begins exactly with line 1's
      voice source.
- [ ] Add a failing selected-scene playback test for Old MacDonald. Assert the
      line-source starts are `0/8/16/18/20/22/24` seconds from `startAt`, the
      melody begins with the literal C5, C5, C5, G4 source-score sequence, and
      each line's first melody note shares its voice timestamp.
- [ ] Confirm both tests fail against the generic 92 BPM scheduler for the
      expected reason.
- [ ] Replace the global generic note pattern with a definition-aware score
      scheduler. Use triangle melody notes, quiet sine bass pulses, a full-rhyme
      count-in, and a tonic/fifth outro only when playback extends past the last
      phrase.
- [ ] Keep every oscillator in the existing cleanup collection and preserve
      setup-failure rollback.
- [ ] Set the music bus from the definition-owned volume while retaining the
      existing voice master gain.
- [ ] Update existing oscillator-count assertions to behavior-based assertions
      where exact implementation counts do not protect a user-visible contract.
- [ ] Run `node --test tests/dub-playback.test.mjs` until the entire file is
      green.

## Task 3: Reconcile duration behavior and regression coverage

**Files:**

- Modify: `tests/dub-playback.test.mjs`
- Modify only if required by a real failure: `src/dubbing/DubStudio.tsx`

- [ ] Update Old MacDonald scene/full boundary tests to the new authored clocks
      and verify all five scenes rebase to scene-relative zero.
- [ ] Verify a decoded last take may extend a selected scene while the score
      sustains a quiet ending underneath the tail.
- [ ] Run focused dubbing tests: `node --test tests/dub-*.test.mjs`.
- [ ] Run the complete unit/integration suite: `npm test`.
- [ ] If a failure is unrelated to the changed contract, diagnose it before
      changing production code or expectations.

## Task 4: Browser and quality verification

**Files:** no planned production changes.

- [ ] Run `npm run lint` and resolve every new error without broad cleanup.
- [ ] Run `npm run build` and confirm TypeScript accepts the new immutable score
      contract.
- [ ] Run `npm run test:browser` to preserve responsive and accessible dubbing
      behavior.
- [ ] Start the local app and use a real browser smoke test for both rhyme
      routes. Confirm the existing full-playback controls remain accessible,
      playback starts without a console error, and Stop cancels playback.
- [ ] Inspect `git diff --check`, the complete diff, asset changes, and status.
      Confirm no guide/private audio or unrelated file changed.

## Task 5: Review, pull request, CI, and merge

- [ ] Re-read the spec and check every goal/non-goal against the final diff.
- [ ] Run a fresh final verification sequence on the exact commit candidate:
      `npm test`, `npm run lint`, `npm run build`, and
      `npm run test:browser`.
- [ ] Commit the implementation with its tests and design records.
- [ ] Fetch `origin/main`, integrate it without force-pushing, and rerun affected
      verification if the base moved.
- [ ] Push `codex/nursery-rhyme-melody` and open a pull request to `main` with a
      concise summary and verification evidence.
- [ ] Monitor every required check. Diagnose and fix failures autonomously,
      pushing ordinary follow-up commits and rerunning local verification.
- [ ] Squash-merge only after required checks pass; delete the remote feature
      branch if the forge allows it.
- [ ] Verify the pull request is merged, `origin/main` contains the merge
      result, and the feature branch has no uncommitted work.

