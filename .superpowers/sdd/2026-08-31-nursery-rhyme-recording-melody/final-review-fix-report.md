# Final review fix report: audio-clock recording completion

## Implementation

`prepareDubLineBacking` now creates one unconnected oscillator as a silent,
dedicated terminal source. It starts on the same `AudioContext` clock as the
authored line melody and is scheduled to stop at the selected phrase's exact
`durationMs`. Its guarded `onended` handler owns natural completion. The RAF
loop now reports presentation progress only and cannot finish a recording.

Backing cleanup sets its idempotency guard and detaches the terminal handler
before it stops any source. Frame cancellation, abort-listener removal, source
stops, and context close are isolated so a failure in one cleanup primitive
cannot prevent the remaining cleanup. A post-start tick or RAF-requeue error
performs the same cleanup and invokes the new explicit `onFailure` callback.

`DubStudio` handles that callback through a generation-fenced recording
failure path. It aborts the recording controller, stops the backing, cancels
and discards the microphone session and pending take, restores the existing
Record action, and displays the existing one-line melody failure copy. The
MediaRecorder input remains the microphone stream only.

The existing E2E Web Audio harness now models scheduled `onended` delivery on
its accelerated audio clock. The Old MacDonald two-second case snapshots the
backing-start count immediately before the second Record action, requires that
count to increase before awaiting upload, and therefore proves that exact
action started new backing.

## Per-finding resolution

### Important: RAF was the natural-end authority

Resolved in `src/dubbing/dub-playback.ts`. Natural completion comes from the
dedicated scheduled audio source. The focused regression fires that source's
terminal event while withholding every RAF callback and observes one natural
completion, zero presentation progress beyond the initial value, one context
close, and no pending RAF.

Manual stop and abort detach the handler before source stop. Failure cleanup
uses the same guarded path. Focused tests fire the former terminal after each
manual, abort, and failure path and prove `onEnded` remains at zero.

### Minor: throwing frame primitives could strand audio and recording

Resolved in `src/dubbing/dub-playback.ts` and `src/dubbing/DubStudio.tsx`.
Throwing `cancelAnimationFrame` no longer escapes or blocks terminal/source,
listener, and context cleanup. A throwing asynchronous RAF requeue closes the
backing, reports the original error through `onFailure`, and never calls
`onEnded`. Mounted React coverage proves the explicit failure response cancels
the active recorder, stops its track, uploads nothing, closes the context once,
shows the melody retry error, and restores Record.

### Minor: Old MacDonald two-second backing assertion was stale

Resolved in `tests/e2e/dubbing.spec.ts`. The test captures
`backingStarts.length` before the two-second Record click and requires a larger
count before awaiting the second saved take. It can no longer pass using starts
left over from the preceding eight-second action.

## Files

- `src/dubbing/dub-playback.ts`
- `src/dubbing/DubStudio.tsx`
- `src/testing/e2e-browser-mocks.ts`
- `tests/dub-playback.test.mjs`
- `tests/dub-ui.test.mjs`
- `tests/e2e/dubbing.spec.ts`
- `.superpowers/sdd/2026-08-31-nursery-rhyme-recording-melody/final-review-fix-report.md`

No dependency, asset, Worker, API, storage, route, migration, package, public
audio, generated media, deployment, or database path changed.

## TDD RED evidence

Baseline command before test changes:

```sh
node --test tests/dub-playback.test.mjs tests/dub-ui.test.mjs
```

Result: 92 passed, 0 failed.

Regression RED command after extending the existing Web Audio/RAF harness and
before production changes:

```sh
node --test tests/dub-playback.test.mjs tests/dub-ui.test.mjs
```

Result: 90 passed, 5 failed. Relevant failures and causes:

- `prepares an exact two-second line backing without fetching audio` expected
  a terminal `onended` function but found none: natural completion still
  belonged to RAF.
- `continues backing cleanup when frame cancellation throws` observed the
  injected cancellation exception: cleanup stopped before audio/context
  teardown.
- `reports an asynchronous progress-loop failure and never ends the backing`
  observed the injected RAF-requeue exception escape: there was no failure
  callback or cleanup path.
- Mounted natural completion found no terminal handler, so no take was saved
  while RAF was withheld.
- Mounted progress failure surfaced the raw exception, leaving no explicit
  recorder cancellation response.

Browser-harness RED command, run on a unique port to avoid Playwright's local
`reuseExistingServer` behavior:

```sh
PLAYWRIGHT_PORT=4197 npx playwright test tests/e2e/dubbing.spec.ts \
  --grep "automatically stops and saves|Old MacDonald records"
```

Result: 0 passed, 2 failed. Both timed out waiting for the saved waveform
because the existing mock oscillator's `stop()` was a no-op and never emitted
the newly authoritative scheduled `onended` event. An earlier default-port
attempt rendered the obsolete `Up to 6 seconds` UI from an unrelated reused
server; it was diagnosed as stale environment evidence and excluded from the
product RED result.

The two-second count tightening is a test-correctness fix rather than missing
product behavior. Its mutation target is the former `> 0` assertion: retaining
that assertion would let the first recording satisfy the second action's test.

## GREEN evidence

```sh
node --test tests/dub-playback.test.mjs tests/dub-ui.test.mjs
# 95 passed, 0 failed

PLAYWRIGHT_PORT=4198 npx playwright test tests/e2e/dubbing.spec.ts \
  --grep "automatically stops and saves|Old MacDonald records"
# 2 passed, 0 failed

node --test tests/dub-catalog.test.mjs tests/dub-playback.test.mjs \
  tests/dub-state.test.mjs tests/dub-ui.test.mjs tests/dub-waveform.test.mjs
# 126 passed, 0 failed

PLAYWRIGHT_PORT=4199 npx playwright test tests/e2e/dubbing.spec.ts
# 88 passed, 0 failed
```

Pre-commit complete verification:

```text
npm test                              1510 passed, 0 failed
npm run lint                          exit 0; 0 errors, 2 existing generated-file warnings
npm run build                         exit 0; TypeScript/Vite passed, existing chunk advisory only
PLAYWRIGHT_PORT=4200 npm run test:browser
                                      557 passed, 0 failed
git diff --check                      exit 0
```

## Exact-commit full verification

The code commit verified was
`b10e21267247f4f271e73ad318903e78c6b9fca7` —
`fix: end dub recordings on the audio clock`.

```text
npm test                              1510 passed, 0 failed
npm run lint                          exit 0; 0 errors, same 2 generated-file warnings
npm run build                         exit 0; TypeScript/Vite passed, existing chunk advisory only
PLAYWRIGHT_PORT=4201 npm run test:browser
                                      557 passed, 0 failed
git diff --check ad7b037..HEAD        exit 0
git status --short                    no output
```

After this report is amended into the fix commit, the same full commands are
rerun against final HEAD; the final task response records that delivered SHA.

## Commit

Subject: `fix: end dub recordings on the audio clock`.

The implementation was first committed as `b10e212`; this report is amended
into that fix commit, so the delivered SHA differs while retaining one cohesive
fix wave.

## Self-review

- The terminal is unconnected and silent; music still connects only to device
  output, and MediaRecorder still receives only the microphone stream.
- Preparation remains node-free through `context.resume()`; all gains,
  melody oscillators, and the terminal are created only by synchronous
  `start()`.
- Phrase `durationMs` remains the only recording, UI, waveform, and terminal
  timing authority.
- Natural end saves once. Manual Stop saves partial. Abort, navigation,
  unmount, and presentation failure discard through existing generation and
  cancellation fencing.
- `onEnded` is guarded after manual stop, abort, and failure; cleanup remains
  idempotent even when frame cancellation throws.
- Scene/full playback code and its count-in path are unchanged.
- The diff contains no generated audio, guide audio, dependencies, package
  manifests, Worker code, migrations, API/storage changes, or new UI controls.
- `git diff --check` and the focused/full behavior suites cover every reviewed
  finding without assertions on CSS source or class names.

## Concerns

No deterministic implementation concern remains. The Vite large-chunk
advisory and two generated `worker-configuration.d.ts` lint warnings predate
this fix. Local Playwright commands use unique ports because the repository's
non-CI configuration intentionally reuses any server already on its default
port.
