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

## Compact mobile player

`mobile-layout.spec.ts` checks the actual video picture and every lesson action
before any interaction can scroll them into view. English and Chinese role
choice, practice, and completion fit at 375 × 667, 390 × 664 (browser chrome
visible), and 390 × 844. Separate cases cover four role choices, an eight-line
picker, and rotation to 844 × 390. Controls retain a minimum 44 px touch height;
the three main recording actions are 56 px tall. Numbered line markers are
32 px circles inside 44 px touch targets, without a redundant visible prompt.

Landscape clips fill the phone's viewing width edge to edge. The mobile video
starts directly below the header and uses natural flex flow rather than a
stretched, vertically centered grid row. This also avoids WebKit retaining the
previous video-row height after a viewport resize. Practice captions size only the selected
line, and inactive control panels reserve no space. Portrait sources remain
uncropped inside a 4:3 viewing area. Rotated phones put the video beside the
workspace. The 320 × 568 check permits vertical scrolling and verifies
that every action remains reachable without horizontal overflow; enlarged text
and expanded errors may also grow the page rather than clipping useful content.

The startup fix was also exercised in Safari on the iPhone 17 / iOS 26.5
simulator. Native taps started recording after the microphone prompt and
played the completed scene through its 15.7-second
end. The silent hardware input was rejected visibly; accepted spoken-voice
capture and replay still require a manual voice check on a device.

Original and learner waveforms share the same full-height canvas coordinates,
timing band, and cursor. The subdued original remains behind the coral learner
trace. Browser checks verify matching bounds, differently colored pixels at
overlapping coordinates, and the existing live-capture timing/performance limits.
Paused seeks also update captions and the idle playhead when reset or completion
returns the picture to its opening frame.

## Recorded playback startup

iOS Safari can load only video metadata and then stay idle, even with
`preload="auto"`. An iPhone 17 simulator running iOS 26.5 reproduced this on the
live player: `readyState` was 1, `networkState` was 1, no media error existed,
and the buffered range was empty. Both Play and Start dubbing were disabled
because the player waited for `canplay`. Explicit loading with the native
inspector's user-gesture mode produced `readyState` 4 and enabled the controls.

Source-backed media actions now remain available before `canplay`. Their click
handlers request native `load()` synchronously when needed, including cold
recording and playback of a resumed draft. Starting practice requests no
microphone access. Local files still require valid duration metadata, and media
errors remain visible and retryable. `mobile-preload.spec.ts` withholds
`canplay` until a trusted click starts loading, including a later-line seek.

Previously replay scheduled voice before asking the video to play, then gave
the video only 120 ms to emit `playing`. A healthy 250 ms native start reliably
produced the retryable video playback error. Replay now waits for `playing`,
schedules voice against the audible output clock and actual picture time, and
retains the opening samples. A regression delays native startup on three
successive replays. The existing rendered-transient and early/late voice checks
continue to verify sync and syllable retention. Real stalls still time out;
pause, speed changes, suspended audio, and drift still stop playback visibly.
Errors during audio scheduling reject the startup operation so it can recover.

Playback also waits for the picture clock to advance after `playing`, since
WebKit can emit that event while its initial frame is still parked. Capture
keeps the opening PCM during preparation; `video-progress.spec.ts` checks that
delay, cancellation, and the bounded timeout. The ongoing sync guard remains
active once playback starts.

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

## Intermittent recording/replay interruptions

Production does not collect browser error logs. Earlier timing reproductions
were controlled simulations, not a reproduction of the reported Samsung Brave
failure. The error message alone cannot distinguish the app's own sync watchdog
from a paused video, changed playback rate, or suspended audio context.

Player errors now offer **Error details → Copy diagnostic report**. The bounded
in-memory report captures the app bundle revision, browser, failure reason,
recent player events, and audio/video clock state before cleanup. It also appears
in the browser console. No report is uploaded automatically; recordings, media
URLs, learner text, and account data are excluded.

### Connected Android reproduction (2026-11-18)

USB debugging reproduced recording and recorded-replay interruptions on a
Samsung Galaxy S24 (SM-S9210), Android 16, Brave 1.99.57 / Chromium 157.0.8103.79,
using the phone speaker. Native video and Web Audio used independent output
paths. Starting and muting native video changed its clock relative to the
capture/voice clock, and the application's sync watchdog stopped the operation.
This was captured from the actual device, without substituting media APIs.

Chromium now routes the video through the same AudioContext as capture and
recorded voices. A GainNode silences the original during replaced turns without
reconfiguring the native video output. The temporary 50 ms startup-threshold
experiment was insufficient and was removed. WebKit retains native video audio:
its MediaElementAudioSourceNode exposes an inaccurate media clock, reproduced
in local WebKit tests and tracked by [WebKit #204228](https://bugs.webkit.org/show_bug.cgi?id=204228).
Failure recovery replaces an attached video together with a closed context,
because a media element can belong to only one MediaElementAudioSourceNode.

Repeat the real microphone → accepted take → reload → two replays flow twice
on an attached Android browser, with Parrotbook open in the foreground:

```sh
adb forward tcp:9222 localabstract:chrome_devtools_remote
ANDROID_CDP_URL=http://127.0.0.1:9222 npm run test:android
```

This macOS acoustic test plays the authored Sintel fixture using `afplay` into
the nearby phone's real microphone. Keep the computer speaker audible. It uses
a fresh scene draft and leaves that test draft on the device, preserving existing
dubs. `ANDROID_TEST_SCENE` selects another fresh English scene URL; `/dubs/` URLs
are rejected. The JSON report in the temporary directory contains outcomes and
diagnostics, with no recorded audio. `ANDROID_TEST_REPORT` overrides its path.
This optional device gate is separate from desktop browser emulation in CI.

The shared runtime previously aborted recording or replay on a single low
`readyState` sample, a `waiting` event, or one clock discrepancy over 120 ms.
`transient-media.spec.ts` reproduces false failures with an 80 ms readiness dip
while the real decoded picture continues moving. It also checks brief waiting
events and audio-clock anomalies. These cases run in the mobile CI matrix.

The player now shows preparation status for buffering instead of immediately
discarding the operation. Original playback has a bounded eight-second buffering
timeout. Synchronized recording/replay retain the 120 ms sync limit, with
200 ms confirmation for clock drift; pause, seeking, speed changes, and audio
suspension still stop immediately. Persistent drift and buffering are tested,
and cancellation clears the buffering deadline.

Recorded replay also covers a speaker output requiring 250–500 ms of lead time,
on both first and later lines. The test delays the actual rendered signal as
well as the output timestamp, then measures its opening against the moving
picture. Previously this healthy device latency hit an immediate 120 ms startup
rejection. Replay now warms the picture, rewinds when more lead time is needed,
queues the complete voice, and starts the picture at the audible deadline.
Repeat playback and cancellation during that lead-in are checked; ongoing sync
monitoring uses the scheduled voice clock, including on this delayed path.
Capture also waits for its native clock to advance after the worklet's initial
acknowledgement; the parked-clock regression keeps the picture paused during
that startup interval, then requires an accepted recording.

The full audio regression uses generated microphone input through the real
AudioWorklet, encoder, draft storage, reload, and recorded replay. An analyser
in the actual replay output path must observe a non-silent rendered signal.
This verifies more than UI state or successful `play()`, but does not substitute
for a physical Samsung/Brave or iOS spoken-microphone test.
