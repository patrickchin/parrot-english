# Performance and Child-Perceived Latency Baseline

Last measured: 2026-08-21  
Primary product question: Which waits can a young learner see, and which current
costs most delay the picture, control, or voice outcome they need?

Revision note, 2026-08-21: later browser and LiveKit research rejected a
browser-derived per-turn "first audible" milestone for Parrot's long-lived
remote stream. This historical lab baseline now keeps `assistant_signal`,
session playback readiness/known block, and physical output separate. See
[Remote audio playback readiness and honest feedback](./remote-audio-playback.md).

## Decision summary

The current candidate acknowledges core taps quickly. The first lesson Start
produced its next painted state in 17–50 ms in this lab, and voice Start changed
to a waiting state in 17–54 ms. Preserve that behavior.

The first high-confidence performance improvement should be responsive lesson
and story shelf artwork. On the constrained lab profile, route words appeared
in 64–321 ms while the first useful cover took about 3.25 seconds. The shelves
currently send 1024 px lesson covers and 1536 px story covers to a 390 px-wide
phone, and several near-viewport covers compete for the same connection.

Do not add an analytics vendor or a performance framework yet. The browser,
Playwright, the Performance API, and the already-installed `sharp` dependency
cover the next checks. Field collection should follow the privacy-safe event
review described in [feedback and latency](./feedback-and-latency.md).

## Scope and important exclusions

This memo measures a current local candidate, not deployed production and not a
representative child device population. It provides reproducible regression
seeds and implementation priorities; it does not establish field percentiles
or prove what delay children will tolerate.

The candidate was the primary `codex/lesson-start-stability` worktree at base
commit `b589f08`, including the uncommitted eager lesson-player UI import under
review on 2026-08-21. The durable docs branch is intentionally based on
`codex/continuous-research-program`, so it does not overlap application code.

Excluded from the lab voice outcome:

- a real authentication, profile, conversation, or LiveKit service;
- microphone permission and device capture startup;
- the real 121.41 kB gzip LiveKit download, room connection, remote agent,
  remote non-silent samples, physical audio output, and learner perception;
- CDN, cache, packet loss, server geography, and low-memory device behavior;
- direct observation with children or caregivers.

## Method

- Built the candidate with Vite 8.2.1 and measured its production chunks.
- Served production assets with gzip and a history fallback.
- Used Chromium 149.0.7827.55 at 390×844 on an Apple M5 Pro.
- Used a fresh browser context for every journey.
- Ran three unthrottled samples and two constrained samples.
- Constrained profile: 4× CPU slowdown, 150 ms round-trip latency, 1.6 Mbps
  download, and 0.75 Mbps upload through Chrome DevTools Protocol.
- Measured visible state changes in the page with `performance.now()`, a
  `MutationObserver`, and the next animation frame. Playwright locator polling
  added roughly 500 ms to one early measurement, so Playwright wall-clock wait
  duration was rejected as the interaction metric.
- Voice Start used a fixed 900 ms mock conversation API and the repository's
  in-browser transport. It is useful for state ordering only.

The constrained profile is a product-defined repeatable lab condition, not a
named industry device class. Results should be compared only with runs using
the same conditions.

## Build baseline

| Resource | Raw | Gzip | When loaded |
| --- | ---: | ---: | --- |
| Core JavaScript | 474.58 kB | 143.46 kB | Initial app |
| Core CSS | 75.63 kB | 13.50 kB | Initial app |
| LiveKit client | 468.82 kB | 121.41 kB | Deferred until a real voice connection |
| Conversation surface | 14.31 kB | 4.85 kB | Talk route |
| Lesson creator | 44.99 kB | 10.84 kB | Grown-up creator route |
| Story reader | 10.21 kB | 3.38 kB | Story page |
| Story shelf | 5.12 kB | 1.99 kB | Story shelf |

The measured cold home transfer was 154.88 kB across the HTML, core JavaScript,
CSS, and route bootstrap requests. The eager lesson-player change adds about
3.04 kB gzip to the core but removes the interaction-time lesson UI chunk and
prevents the first Start from losing state. For a primary child action, that is
the better trade at the current size.

## Lab observations

Times below are medians where three unthrottled samples were available and the
observed range of two constrained samples otherwise.

| Journey milestone | Unthrottled | Constrained | Interpretation |
| --- | ---: | ---: | --- |
| Home choices usable | 68 ms | 2.02–2.03 s | Within the proposed boot guardrail |
| Home LCP | 56 ms in two valid samples | 1.576–1.584 s | Lab only; field p75 is required |
| Home CLS | 0 | 0 | Reserved layout was stable in this viewport |
| Lesson shelf words/action | ≤55 ms | 64 ms | The route responds quickly |
| First lesson cover complete | 55 ms | 3.265 s | Picture delivery is the bottleneck |
| Ready-made lesson intro | 38 ms | 51–53 ms | No interaction-time UI download remains |
| Lesson Start to next paint | 25 ms | 49–50 ms | Preserve this immediate acknowledgement |
| Story shelf words/action | ≤96 ms | 321 ms | Lazy route feedback remains understandable |
| First story cover complete | 96 ms | 3.244 s | Picture delivery is the bottleneck |
| Story page and first page art | 43 ms | 575–577 ms | Current illustrated page asset is reasonable |
| Talk-route loading feedback | 1 ms | 6 ms | Feedback appears immediately |
| Talk Start action available | 302 ms | 307 ms | An inferred Suspense reveal delay holds the route for about 300 ms |
| Voice Start to waiting paint | 17–24 ms | 17–54 ms | Below the proposed 100 ms product target |
| Voice Start to mock learner turn | 1.303–1.306 s | 1.331–1.349 s | Includes 900 ms mock API; not real voice latency |

One story-shelf waterfall showed four covers starting together. The first
1536×1024, 144.33 kB cover began at 235 ms and completed at 3.242 s while the
others shared the constrained connection. The lesson shelf's first 1024×1024,
104.13 kB cover completed at 3.264 s. The component marks two lesson covers
eager and the remaining covers lazy, but browser near-viewport loading can
still create contention.

## Responsive-art estimate

Temporary in-memory `sharp` encodes at WebP quality 80 estimated the available
savings. These are candidates, not approved assets; visual comparison is still
required at 1× and 2× device pixel ratios.

| Asset set | Current total | 384 px estimate | 768 px estimate |
| --- | ---: | ---: | ---: |
| 7 lesson covers | 809.74 kB | 123.32 kB | 289.18 kB |
| 20 story covers | 2.817 MB | 256.32 kB | 777.54 kB |

Representative results:

- first lesson cover: 104.13 kB current, 19.18 kB at 384 px, 42.53 kB at
  768 px;
- first story cover: 144.33 kB current, 13.47 kB at 384 px, 38.70 kB at
  768 px.

At the 390 px phone layout, lesson cards are about 180 CSS px wide while a
single-column story card is about 366 CSS px wide. A 384/768 `srcset` therefore
covers common 1×/2× cases without sending the full source to every shelf card.

## Proposed budgets

These budgets serve different purposes and must not be merged into one score.

### Field experience targets

Retain the standards-backed good thresholds at p75 by route, browser, and
coarse device class:

- LCP ≤2.5 s;
- INP ≤200 ms;
- CLS ≤0.1.

Retain the product hypothesis of control acknowledgement p95 ≤100 ms. It needs
validation with the target audience and representative devices; it is not a
child-development standard.

### Repeatable lab regression guardrails

On the constrained profile above:

- cold home choices usable ≤2.5 s;
- initial compressed HTML + CSS + JavaScript transfer ≤180 kB;
- loading or acknowledgement state painted ≤200 ms in automated CI, while the
  product target remains 100 ms;
- route-specific child words or primary action usable ≤500 ms;
- first useful shelf picture complete ≤1.5 s;
- each responsive shelf-cover candidate ≤50 kB at 768 px;
- no new layout shift when a lazy chunk, image, transcript, or status appears.

The wider 200 ms CI acknowledgement budget absorbs shared-run scheduling. It
must not be reported as the product target. A regression test should measure in
the page and capture the next paint, not time a Playwright locator wait.

### Voice outcome targets

Keep the existing proposed milestones separately:

- tap acknowledgement p95 ≤100 ms;
- room connected p75 ≤3 s and p95 ≤7 s;
- child end-of-turn to first `assistant_signal` p75 ≤1.5 s and p95 ≤3 s;
- ≥4 s to `assistant_signal` is a degraded warning pending child validation;
- conversation Start to first remote-audio session readiness or known block:
  no SLO until the real browser/autoplay matrix supplies a baseline.

The permission decision interval is human time and must not be placed inside a
microphone-start SLO. Similarly, `learnerTurnReadyMs` can include a person's
autoplay-unlock delay and the automatic repeat of possibly interrupted opening
output. Do not use it as a post-grant device or system SLO.

## Smallest useful test set

1. Add a browser helper that records activation, observes the named next state,
   waits one animation frame, and returns the in-page elapsed time. Cover
   lesson Start, voice Start, microphone Start, Stop, Repeat, and Continue.
2. Add file-size and dimension checks for responsive 384/768 shelf assets using
   the already-installed `sharp`; do not add an image plugin merely for tests.
3. Add one production-build lab job or an explicitly invoked local script for
   the constrained boot and first-picture budgets. The ordinary Playwright
   suite currently runs Vite development mode, which is not a bundle-size or
   production-loading benchmark.
4. Keep existing responsive layout tests. `conversation-timing.spec.ts` checks
   movement and overflow, not elapsed time; its name should not be treated as
   evidence of latency coverage.
5. Collect field distributions only after the allowlisted, no-op-safe event
   boundary and child-data review. Do not send transcript text, audio, exact
   network addresses, or persistent device identifiers.

Playwright already supports unique ports, retained failure traces, screenshots,
Chromium, viewports, and accessible locators. Chrome DevTools Protocol provides
CPU/network shaping. Lighthouse, a telemetry vendor, and a second browser
automation dependency are unnecessary for the next step.

## Prioritized implementation ideas

1. **Responsive shelf art.** Generate 384/768 variants from the existing lesson
   and story covers, add accurate `srcset`/`sizes`, keep one high-priority first
   cover, and visually compare crops and textless meaning. Re-run the first-art
   budget before changing the loading policy further.
2. **Parallelize voice intent work.** After the child explicitly taps Start,
   begin the deferred LiveKit import in parallel with the conversation POST
   instead of waiting for the POST before requesting 121.41 kB gzip. Do not
   preload it on home or merely on route view; that would charge every visitor.
3. **Add privacy-safe field milestones.** Record only allowlisted timings for
   control acknowledgement, API completion, module ready, room connected,
   microphone published, `assistant_signal`, and remote-audio session readiness
   or known block. Never rename a software milestone as physical audible output.
4. **Keep route fallback simple.** Story and Talk loading feedback appeared in
   1–321 ms. Do not build skeleton systems or prefetch every route without field
   evidence. Consider intent-based prefetch on pointer, focus, or touch only if
   representative devices miss the 500 ms route-action guardrail.
5. **Protect the lesson owner from Suspense.** Core child state must live above
   any deferred presentation or be eager at its first interaction. Never accept
   a smaller initial bundle if a first tap can unmount the activity and reset it.

## Evidence and unresolved questions

Threshold sources are [PERF-01 and PERF-02](./source-register.md); voice event
semantics are [VOICE-01 through VOICE-09](./source-register.md). Lab budgets and
responsive-art estimates are Parrot decisions, not claims from those sources.

Next evidence needed:

- real deployed p75/p95 by route and coarse device class;
- actual assistant-signal stage breakdown across API, LiveKit module, room,
  agent, model/speech generation, and network;
- session playback readiness/known-block outcomes and human recovery delay by
  target browser and device, kept separate from assistant-signal timing;
- an optional controlled acoustic comparison of software signals with physical
  speaker onset using synthetic adult audio only; never treat it as production
  monitoring or proof that a child heard sound;
- visual fidelity review of 384/768 shelf images on 1×/2× screens;
- direct child observation of whether an immediate stable wait state preserves
  confidence during a 2–4 second outcome delay;
- whether story and lesson shelves should show fewer cards initially on slow or
  data-saving connections without hiding learner choice.
