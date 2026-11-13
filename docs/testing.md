# Player testing

Use Node 24, FFmpeg/FFprobe on PATH, and the locked npm dependencies:

```sh
npm ci
npx playwright install chromium webkit
npm run test:all
```

`npm test` runs TypeScript, app logic, content validation, and application/content
boundary checks. `npm run test:browser` runs the entire Playwright suite against
desktop Chromium, Pixel-emulated Chromium, iPhone-emulated WebKit, and a fresh
production build. Production checks open every published scene; recording
recovery and stress checks also run against the production build.

Browser checks cover role/line selection, recording/re-recording, cancellation,
replay and audio timing, skipped lines, completion, MP4 export, save/reload,
history and deletion, storage failures, permissions, interrupted media, missing
content, search, languages, keyboard access, and phone/tablet layouts. The
recording checks use real AudioWorklets, PCM encoding, Web Audio, video decoding,
and IndexedDB. Synthetic microphone input replaces hardware without requesting
access to the developer's microphone or uploading recordings.

Both test servers always start from the current checkout. An occupied port is
an error, so another worktree's app cannot silently substitute for the code
under test. Browser fixtures block development hot reload so source edits cannot
reset an in-flight lesson. WebKit uses one worker to isolate native audio sessions;
parallel sessions interrupted each other's clock checks during stress testing.
Choose a different pair when necessary (the preview uses port + 2):

```sh
PLAYWRIGHT_PORT=14317 npm run test:all
```

The internal Sintel media fixture is checked in. Published scene JSON is routed
from `content/`; media uses the ignored local authoring cache when available and
otherwise the published OSS origin. Full catalog checks therefore need either
the referenced assets in `content/local-dubbing/` or access to OSS. To explicitly
exercise remote media, set `PARROTBOOK_LIVE_MEDIA=1`. This still substitutes local
catalog JSON; it is not a production deployment smoke test.

## Repeatable stress runs

```sh
npm run test:stress
STRESS_STEPS=100 npm run test:stress
STRESS_SEED=2026 STRESS_STEPS=100 npm run test:stress -- --project=webkit
```

The normal suite includes three seeds with 24 mixed actions each on four
targets (288 actions, in addition to setup and final verification). The longer
command runs 1,200 mixed actions. Each seed shuffles every action before
repeating: record, cancel capture, cancel pending microphone permission,
original playback, recorded playback, jump between lines, reload, browser
history, cancel reset, completed replay/edit, and open Help during playback.

After every action the test checks the selected line, accepted waveform,
recording availability, paused video, released microphones/audio sources,
absence of alerts and uncaught errors, and absence of recording uploads. At the
end it reloads and verifies every accepted take. These are stateful randomized
UI sequences, not load tests of OSS or the deployment service. They run in
isolated browser storage and do not touch a tester's saved dubs.

Failed runs retain Playwright traces under `test-results/`. Stress tests attach
the seed, action sequence, capture frames/peaks, input and output clocks, and alerts as
`stress-actions`; replay the seed to investigate:

```sh
npx playwright show-trace test-results/<failed-test>/trace.zip
```

The checks save explicit screenshots under
`~/Pictures/Screenshots/Codex/parrot-english/`. Use `--output=<directory>` to keep
trace artifacts separate when running multiple Playwright processes.

## Recorded playback startup

Previously replay scheduled voice before asking the video to play, then gave
the video only 120 ms to emit `playing`. A healthy 250 ms native start reliably
produced the retryable video playback error. Replay now waits for `playing`,
schedules voice against the audible output clock and actual picture time, and
retains the opening samples. A regression delays native startup on three
successive replays. The existing rendered-transient and early/late voice checks
continue to verify sync and syllable retention. Real stalls still time out;
pause, speed changes, suspended audio, and drift still stop playback visibly.
Errors during audio scheduling reject the startup operation so it can recover.

Stop/Record controls also keep separate DOM identities. A regression holds the
pointer down on Stop, interrupts playback, and then releases it; this must not
request the microphone or replace the accepted recording after the idle Record
control appears in the same position.
Keyboard focus follows that control through preparation, capture, and saving.

## Remaining limits

Browser tests run separately from the existing ESA deployment gate, which runs
app tests and a build. Use `npm run test:all` before merging player changes.
Emulation does not prove physical iPhone/Android, Bluetooth output, microphone
permissions, audio routing, backgrounding, WeChat, or mainland network behavior.
Those still need checks on the intended devices. Randomized sequences increase
coverage; they do not establish that all possible orders have been tested.
