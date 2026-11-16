# Mobile browser verification

This is a focused browser-engine and responsive-layout check, not a physical
phone support claim. It runs a freshly built production player locally, with
one worker and one preview server. It does not deploy code or write to cloud
storage.

## Source and reproduction

- Date: 2026-11-16, Asia/Shanghai.
- Application source: `860cfcfb5c5a0d74c869e1ccee7c8d95bb8704b4` plus the
  test-only mobile matrix additions in this change.
- The focused rerun also includes the shared `VoiceWaveform.tsx` fix in this
  change, which moves the recovery status into normal flow below the plot.
- Runner: Node 24.19.0, macOS ARM64; Playwright 1.61.1.
- Command:

```sh
PLAYWRIGHT_PORT=21337 npm run test:browser -- --config=playwright.mobile.config.ts
```

The dedicated config selects 42 cases rather than the whole browser suite.
It builds once, starts one strict-port production preview, and uses one worker
to keep audio sessions isolated and avoid the earlier TCP-port exhaustion.
Do not run another app build or the content-moving boundary check concurrently.
An occupied port is an error; the harness does not reuse another checkout's
server.

## Matrix

| Project | Engine | Context | Result |
| --- | --- | --- | --- |
| `mobile-qa-chromium` | Chromium 149.0.7827.55 | Pixel 7 preset, initial 390×844 | 14 passed |
| `mobile-qa-webkit` | WebKit 26.5 | iPhone 13 preset, initial 390×844 | 14 passed |
| `mobile-qa-firefox` | Installed Firefox 151.0; no browser handshake | Desktop Firefox with touch and 390×844 viewport | Blocked before loading the app |

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

`.github/workflows/mobile-browser.yml` supplies the alternate Linux host. On
pull requests to main (including PR #276), main pushes, or a manual run, it
installs Node 24, dependencies from the lockfile, the pinned Playwright version's
Firefox and native dependencies, and FFmpeg. It runs only the 14 Firefox
engine/scenario pairs using the same one-worker, one-production-server config.
The workflow has only `contents: read`, uses no cloud credentials or repository
secrets, and retains logs, failure traces, and screenshots for 14 days. It does
not deploy. A successful CI run is still required before claiming Firefox
coverage; adding the workflow is not a passing result.

The run log is `/private/tmp/parrotbook-mobile-qa.log`; the bounded retry log is
`/private/tmp/parrotbook-mobile-firefox-headed.log`. A one-second native startup
sample is `/private/tmp/parrotbook-firefox-startup.sample.txt`. Later invocations
replace Playwright's `test-results/`, so those logs are the persistent failure
record. Explicit screenshots are saved under
`~/Pictures/Screenshots/Codex/parrot-english/` using names such as
`mobile-qa-webkit-practice-phone-landscape.png` and
`mobile-qa-webkit-owner-preview-tablet-portrait.png`. Firefox produced no app
screenshots.

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
