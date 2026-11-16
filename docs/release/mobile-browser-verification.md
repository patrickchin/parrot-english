# Mobile browser verification

This is a focused browser-engine and responsive-layout check, not a physical
phone support claim. It runs a freshly built production player locally, with
one worker and one preview server. It does not deploy code or write to cloud
storage.

Focused matrix: **48/48 passed, zero skips** — 16 Chromium and 16 WebKit
cases locally (30 core plus two focused notices cases), and 16 Firefox cases
on Linux CI. Both default encoding and forced native-AAC-unavailable cases
produce a real MP4 with verified audio. These are engine/scenario pairs, not
48 phones; repeated runs are not added to this count.

## Source and reproduction

- Date: 2026-11-16, Asia/Shanghai.
- Application source: `860cfcfb5c5a0d74c869e1ccee7c8d95bb8704b4` plus the
  test-only mobile matrix additions in this change.
- The focused rerun also includes the shared `VoiceWaveform.tsx` fix in this
  change, which moves the recovery status into normal flow below the plot.
- Final local expanded matrix: application code from
  `95adaf9321c5f219c9412d8ed50774bdb71575bd` plus the AAC implementation and
  regression patch committed unchanged as
  `8e33027da584dd3cfa8b2ff1d6657274efad420c`. The preview was built before that
  commit, so its embedded revision remains `95adaf93`; the tested source code
  includes the complete AAC fix. Initial Linux AAC proof tested the exact
  `8e33027d` commit; the final 16-case Firefox run tests merged main
  `75cd550d2f778033816f2262d14398f95082e2f3`.
- Runner: Node 24.19.0, macOS ARM64; Playwright 1.61.1.
- Command:

```sh
PLAYWRIGHT_PORT=21337 npm run test:browser -- --config=playwright.mobile.config.ts
```

The dedicated config now selects 48 cases (16 per engine) rather than the whole
browser suite: the verified 45 core cases plus three notices-page cases.
It builds once, starts one strict-port production preview, and uses one worker
to keep audio sessions isolated and avoid the earlier TCP-port exhaustion.
Do not run another app build or the content-moving boundary check concurrently.
An occupied port is an error; the harness does not reuse another checkout's
server.

## Matrix

| Project | Engine | Context | Result |
| --- | --- | --- | --- |
| `mobile-qa-chromium` | Chromium 149.0.7827.55 | Pixel 7 preset, initial 390×844 | 15 core passed; 1 additional notices case passed |
| `mobile-qa-webkit` | WebKit 26.5 | iPhone 13 preset, initial 390×844 | 15 core passed; 1 additional notices case passed |
| `mobile-qa-firefox` | Firefox 151.0 on Linux | Desktop Firefox with touch and 390×844 viewport | All 16 passed on merged main, including notices |

Each context is resized through these CSS viewport sizes. Tablet rows exercise
layout at tablet dimensions; the phone presets retain their original user
agent. They do not become emulated iPads or Android tablets.

| Layout | Viewport |
| --- | --- |
| Small phone portrait | 320×568 |
| Phone portrait | 390×844 |
| Phone landscape | 844×390 |
| Tablet portrait | 768×1024 |
| Tablet landscape | 1024×768 |

Firefox does not support Playwright's `isMobile` option. Its project enables
touch input and changes viewport size while keeping desktop Firefox behavior.
These projects are not real Android Chrome, iOS Safari, or Firefox for Android.

## Checks

- Packs remains a usable single-column or two-column gallery at the relevant
  widths, with no horizontal overflow. Pack search and scene selection work by
  touch.
- Practice and completion survive viewport changes without losing the selected
  line. Essential controls have at least 44×44 CSS-pixel targets and remain fully
  reachable. Vertical scrolling is allowed on short screens; controls must not
  be clipped or intercepted.
- Actual AudioWorklet/PCM capture, replay, and IndexedDB run with a synthetic
  microphone signal. Playback refusal, stuck audio resume, cancellation,
  microphone release, and a fresh retry are exercised.
- A partial dub survives reload and a new tab with the same recorded audio,
  waveform, role, and line progress, without uploads.
- MP4 export supplies the same bytes to the file-share API and the hosted-link
  upload. Native-share cancellation stays quiet; native-share rejection shows
  a recoverable error. Hosting requires confirmation, recovers from an uncertain
  publication without re-uploading, and keeps removal authority on the creator's
  device. Expired, missing, unconfigured, and invalid-media links show recovery
  states.
- Owner authentication rejects a bad key and never persists the good key.
  Folder selection, preview, publication, hide/show/delete, and confirmation
  controls run against a deterministic owner-service fixture. Folder preview
  and management controls cover the five viewport shapes.

The new matrix reuses the existing owner, guest-sharing, saved-dub, shared-link,
and recording-recovery tests. The prior pack-management QA recorded 316 passing
browser cases and 16 intentional microphone skips. That is earlier regression
evidence, not another full-suite result for this source revision; do not add
these repeated scenarios together as independent coverage.

## Evidence and limits

The initial run selected 42 cases: 28 passed, one Firefox browser launch failed,
the next Firefox launch was interrupted, and the other 12 Firefox cases were
not run. There were no intentional test skips in this focused matrix. These
are 28 passing engine/scenario pairs, not 28 physical devices.

Firefox could not create a usable browser process on this macOS 27.2 host.
Headless launch timed out after 180 seconds with
`sandbox_extension_issue_file_to_process` and
`RenderCompositorSWGL failed mapping default framebuffer`. A single headed
probe also timed out, bounded to 30 seconds, before opening an app page. The
installed native binary identifies as Firefox 151.0 (15126.6.11). No browser
sandbox or operating-system setting was bypassed. Firefox app behavior remains
unverified locally.

The first Linux run, [43795845129](https://github.com/patrickchin/parrot-english/actions/runs/43795845129),
tested `267612c07dc5928174a9c101a6af2cf63dd4d672` with Firefox 151.0:
9 cases passed and 5 recording-dependent cases failed. Gallery/layout,
owner authentication/folder publication/management, and shared-link playback
and recovery all passed. The failures were cached-video sharing, three capture
startup/retry cases, and partial-draft persistence.

All five traces remain in the preparing state before a microphone stream is
returned to the app. The synthetic fixture awaits its native generator's
`AudioContext.resume()`; the app never reaches worklet creation (`captures=0`).
The blocked-video and stuck-application-context scenarios therefore never reach
their intended test stages. No application defect is established by those five
failures. Trace recovery files are under
`/private/tmp/parrotbook-firefox-partial/`; the failed step log is
`/private/tmp/parrotbook-firefox-ci-failed.log`.

The workflow now installs and starts a user PulseAudio daemon with a native
null output sink, selects it as default, and prints `pactl info`. Before the app
tests, a standalone Firefox page creates and resumes a native `AudioContext`
from an actual button click and requires a running clock within five seconds
(browser launch is bounded to 30 seconds). That isolates CI audio output from
app behavior and prevents another full matrix when the output clock is broken.
There are no autoplay preference changes or browser sandbox overrides. Tests
stop after the first failure to bound diagnosis. The subsequent runs below
verify both the environment repair and the final complete matrix.

The next Linux run, [43796864201](https://github.com/patrickchin/parrot-english/actions/runs/43796864201),
tested `95adaf9321c5f219c9412d8ed50774bdb71575bd`. PulseAudio setup and the native
audio preflight passed (`state: running`, clock 0.113 seconds, 44,100 Hz).
The first guest-sharing test then recorded successfully and reached completion,
confirming the earlier microphone-fixture stall was repaired. Preparing the MP4
exposed an application limitation: the result shows “This browser cannot export
MP4. Try a recent Safari or Chrome.” File-sharing controls never appear. The
first-failure limit stopped the other 13 cases, which are unrun rather than
skipped or passed. The exact snapshot is
`/private/tmp/parrotbook-firefox-pulse-error-context.md`; the step log is
`/private/tmp/parrotbook-firefox-pulse-failed.log`.

The first export capability gate checks for AAC encoding. The implementation
now retains native encoding when available and loads the official Mediabunny
AAC software encoder when native AAC is unavailable. The expanded regression
runs the full cached-video flow twice: with default capabilities, and with only
native `AudioEncoder.isConfigSupported()` answers for `mp4a` forced false.
Firefox without `AudioEncoder` naturally exercises the same fallback; the test
does not invent a native encoder or stub encoded output.

Both cases require real MP4 bytes, matching SHA-256 hashes for the native file
and hosted upload, a video stream and 48 kHz AAC stream reported by FFprobe,
and decoded PCM containing the synthetic learner's 660 Hz signal during the
replaced line (amplitude above 0.05, at least 70% of the segment's energy).
Consent, native cancellation/error/retry, publication retry, and creator-only
removal checks remain unchanged. The expanded Chromium/WebKit run passed all
30 cases in 1.6 minutes with zero skips
(`/private/tmp/parrotbook-mobile-aac-expanded.log`). This is the final local
matrix result; earlier passes and targeted reruns overlap with it and are not
added together. The 15-case Linux Firefox run,
[43797816610](https://github.com/patrickchin/parrot-english/actions/runs/43797816610),
passed all 15 cases in 1.4 minutes on the exact AAC-fix commit
`8e33027da584dd3cfa8b2ff1d6657274efad420c`, with zero skips. The native audio
preflight, both real-export sharing flows, three recording-startup recovery
cases, exact local-draft persistence, all layouts, owner controls, and shared
playback all passed. The complete CI log is
`/private/tmp/parrotbook-firefox-aac-success.log`. No codec failure is hidden by
changing the media fixture or skipping Firefox's guest-sharing case.

The final 16-case Firefox run on merged main,
[43799961595](https://github.com/patrickchin/parrot-english/actions/runs/43799961595),
passed all 16 in 1.3 minutes on
`75cd550d2f778033816f2262d14398f95082e2f3`, with zero skips. This includes the
additional notices regression. Its saved log is
`/private/tmp/parrotbook-firefox-75cd-success.log`. Combined with the local
30-case core run and two focused notices cases, this establishes the 48 unique
passing engine/scenario pairs without summing repeated CI runs.

`.github/workflows/mobile-browser.yml` supplies the alternate Linux host. On
pull requests to main (including PR #276), main pushes, or a manual run, it
installs Node 24, dependencies from the lockfile, the pinned Playwright version's
Firefox and native dependencies, FFmpeg, and PulseAudio. It now selects 16 Firefox
engine/scenario pairs using the same one-worker, one-production-server config.
The workflow has only `contents: read`, uses no cloud credentials or repository
secrets, and retains logs, failure traces, and screenshots for 14 days. It does
not deploy. The passing run above supplies Firefox engine evidence; it does not
certify Firefox for Android or physical-device audio and sharing behavior.

The run log is `/private/tmp/parrotbook-mobile-qa.log`; the bounded retry log is
`/private/tmp/parrotbook-mobile-firefox-headed.log`. A one-second native startup
sample is `/private/tmp/parrotbook-firefox-startup.sample.txt`. Later invocations
replace Playwright's `test-results/`, so those logs are the persistent failure
record. Explicit screenshots are saved under
`~/Pictures/Screenshots/Codex/parrot-english/` using names such as
`mobile-qa-webkit-practice-phone-landscape.png` and
`mobile-qa-webkit-owner-preview-tablet-portrait.png`. Locally blocked Firefox
produced no app screenshots; Linux CI retains its own evidence artifact.

Manual review found the unavailable-waveform recovery message clipped at
320 CSS pixels: its wrapped text exceeds the fixed waveform lane. This is a
real degraded-state layout issue exposed by the shortened media fixture. A
rendered text-bounds regression now checks every clipping ancestor at all five
shapes. The shared layout fix passed the focused Chromium/WebKit matrix rerun
(two cases, both passing; `/private/tmp/parrotbook-mobile-waveform-fix.log`).
New 320-pixel practice and result screenshots show the complete message below
the plot. These reruns repeat two of the original 28 cases and do not increase
the unique scenario count. Other inspected controls, including landscape
practice, sharing-error retry, and tablet owner preview, remained readable and
reachable.

A final two-case rerun also waits for all 21 gallery covers to load and decode
before capturing the five shapes. Both engines passed again
(`/private/tmp/parrotbook-mobile-decoded-gallery.log`, 2 passed in 35.7 seconds).
The earlier blank green cover areas were screenshots taken before lazy images
loaded, rather than a cover-loading defect. The decoded phone and tablet
screenshots show actual artwork and readable pack titles and metadata.

Representative reviewed files in the screenshot directory:

- `mobile-qa-webkit-practice-phone-small.png` and
  `mobile-qa-webkit-result-phone-small.png`: full recovery message after the fix.
- `mobile-qa-chromium-packs-phone-portrait.png`: decoded single-column gallery.
- `mobile-qa-webkit-packs-tablet-landscape.png`: decoded two-column gallery.
- `mobile-qa-chromium-share-error-phone-portrait.png`: consent, error, and retry.
- `mobile-qa-webkit-owner-preview-tablet-portrait.png`: folder preview and owner
  management controls.

## Live rollout and notices follow-up

The merged player rollout was verified independently against native ESA build
records in the deployment workflow and the public health endpoint:

| Merged revision | Workflow | Actual successful ESA build | Live health |
| --- | --- | --- | --- |
| `c962e745bab6a3ceed10822d84b5af77c4b58b0d` | [43798284785](https://github.com/patrickchin/parrot-english/actions/runs/43798284785) | `189340752406660`, succeeded 03:29:05 UTC | Exact match 03:29:50 UTC |
| `77c20ec2da822a2f80ec853621ecfb54e2479c9a` | [43798648236](https://github.com/patrickchin/parrot-english/actions/runs/43798648236) | `189341217558660`, succeeded 03:32:54 UTC | Exact match 03:33:01 UTC |
| `75cd550d2f778033816f2262d14398f95082e2f3` | [43799961611](https://github.com/patrickchin/parrot-english/actions/runs/43799961611) | `189342884767888`, succeeded 03:46:27 UTC | Exact match 03:46:40 UTC |

All three workflows completed successfully. Read-only logs are saved as
`/private/tmp/parrotbook-player-release-c962.log` and
`/private/tmp/parrotbook-player-release-77c20.log`, and
`/private/tmp/parrotbook-player-release-75cd.log`.

A real-content production smoke check at 390×844 confirmed one Packs h1,
21 franchise packs, a decoded cover, no horizontal overflow, visible Patrick
uploader attribution and privacy guidance, franchise search narrowing to
SpongeBob, and its actual five-scene detail. The unmocked notices page returned
200 with MPL/LGPL texts and source links. No uploads or API mutations were
performed. Screenshot: `production-c962-packs-390.png` in the screenshot folder.
The isolated Playwright CLI browser was closed after the check.

The notices page exposed a minor 14-pixel horizontal overflow at 390 CSS pixels:
its long FFmpeg source hash could not wrap. The shared static page now allows
code text to wrap. A new rendered regression loads that actual asset, checks
one h1 and complete source-hash text bounds at all five viewport shapes, then
expands both native license disclosures and checks for horizontal overflow
again. The new Chromium and WebKit cases passed separately, 2/2 in 11.5 seconds
(`/private/tmp/parrotbook-mobile-notices-fix.log`), without rerunning the 45 core
cases. The updated 390-pixel screenshot
`mobile-qa-webkit-software-notices-phone-portrait.png` shows the complete hash
wrapping within the page. Its Firefox case subsequently passed in the final
16-case CI run above. After the merged `75cd550d` rollout, a read-only production
check at both 320 and 390 CSS pixels confirmed document width exactly matched
viewport width, one Software notices h1, and the complete source hash's rendered
text within the viewport. Screenshots are
`production-75cd-software-notices-320.png` and
`production-75cd-software-notices-390.png`; the 320-pixel result was visually
reviewed. The isolated browser was closed afterward.

## Short real-phone friend test

Start with iPhone Safari and Android Chrome, then Android Firefox. Treat
WeChat's embedded browser separately; these real-phone checks go beyond emulation.

1. Open [Parrotbook](https://parrotbook.com/) directly. Search Packs, choose a
   scene, rotate, and check the keyboard and buttons.
2. Deny mic once; enable it in browser settings and retry. Record/replay two
   lines; check timing and that the phone's mic indicator turns off afterward.
3. Reopen an unfinished dub through My dubs after reloading; check saved voice
   and progress. Switch apps or lock, return, and record again.
4. Finish and prepare. Cancel/retry the native share sheet; save/share the MP4.
   Play it on your phone and a friend's; confirm your recorded voice is audible.
5. Once hosted links are enabled, confirm upload; play on another device,
   remove on the creator's device, and check playback stops.
6. Repeat recording/export inside WeChat; report separately. If blocked, try
   “Open in browser” and compare.
7. Report model, OS/browser version, Wi-Fi/mobile network, failing step/error,
   and screenshot. Mark untested steps.

## Physical-device limits

Catalog JSON is routed from repository fixtures. The short licensed Sintel video
fixture exercises decoding, capture, replay, and export; other available media
may use OSS. API responses and the OS file-share result are controlled fixtures.
Native folder input is populated through Playwright, not an actual phone's
system picker. No microphone hardware, system share sheet, or live owner/share
API is certified by this run.

Real-device checks remain required for permission prompts and denial/retry,
Bluetooth/headphones, speaker feedback, app switching/backgrounding, interruptions,
screen locking, the browser keyboard and address bar, safe-area insets, storage
eviction, actual folder/file pickers and share sheets, WeChat, and mainland
network conditions. Viewport resizing does not reproduce every orientation or
mobile audio-session event.
