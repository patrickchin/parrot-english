# Responsive Lesson and Story Shelf Artwork

Last measured: 2026-08-21

Branch: `codex/responsive-shelf-art`

Audience: children choosing a lesson or story, especially on slower phones

## Decision

Retain the responsive shelf artwork.

The lesson and story shelves now offer 384 px and 768 px WebP candidates with
layout-specific `sizes`. On the existing constrained lab profile, the first
useful lesson cover completed in a median 661 ms and the first story cover in a
median 625 ms after the child chose that activity. Both are below the 1.5 s lab
guardrail and about 80% faster than the 2026-08-21 baseline.

The original images remain the fallback `src`. Loading priority did not change:
the first lesson cover remains high priority, two lesson covers remain eager,
and later pictures remain lazy. The browser receives fewer bytes because it can
choose the smallest candidate that is large enough for the rendered card.

## Product question and hypothesis

The baseline found that shelf words appeared quickly, but the first useful
picture took about 3.25 seconds. That is a poor ordering for a picture-led
choice intended for beginners who may not be able to read the title.

**Hypothesis:** If the shelves provide crop-preserving 384/768 candidates and
accurate layout sizes, the first useful picture will complete within 1.5 s on
the documented constrained profile without reducing picture meaning or visual
quality.

## Evidence used

- The internal performance baseline on `codex/performance-baseline` at
  `a02a78a` measured 3.265 s for the first lesson cover and 3.244 s for the
  first story cover. It also measured actual phone card widths and estimated
  the 384/768 savings with the already-installed `sharp` dependency.
- [PERF-01](./source-register.md) retains Core Web Vitals as field experience
  thresholds. It does not define a shelf-picture threshold.
- [PERF-02](./source-register.md) supports immediate acknowledgement as a
  general interaction principle. The 1.5 s first-picture guardrail is a Parrot
  lab decision, not a child-development standard.
- [LANG-04](./source-register.md) supports using pictures to carry the same
  meaning as the language. This makes crop preservation a learning requirement,
  not merely a visual preference.

## Implementation

- Generated 384 px and 768 px WebP variants for all 7 lesson covers and all 20
  story covers with `sharp`, WebP quality 76, and no crop operation.
- Added width-descriptor `srcset` values while keeping each original source as
  the fallback.
- Added `sizes` expressions that follow the real one-, two-, three-, and
  four-column card layouts rather than using a generic viewport guess.
- Kept personalized/private story art out of the public responsive URL rewrite.
- Added `npm run generate:shelf-art` for repeatable generation.
- Added `npm run benchmark:shelf-art` for the production-build route-choice
  benchmark.
- Added automated checks for candidate presence, WebP format, exact dimensions,
  source aspect ratio, and the 50 kB 768 px budget.

## Asset results

| Shelf | Original sources | 384 px set | 768 px set | Largest 768 px file |
| --- | ---: | ---: | ---: | ---: |
| Lessons, 7 covers | 790.76 kB | 108.40 kB | 248.97 kB | 41.20 kB |
| Stories, 20 covers | 2,750.66 kB | 210.12 kB | 604.32 kB | 46.96 kB |

Representative first-cover transfers:

| Cover | Original | 384 px candidate | Reduction |
| --- | ---: | ---: | ---: |
| First lesson | 104,134 B | 17,202 B | 83.5% |
| First story | 144,330 B | 11,490 B | 92.0% |

## Performance method and result

The repeatable benchmark builds the production app, serves text resources with
gzip, starts from a fresh browser context at 390×844 and device scale 1, waits
for the home choice to become usable, and then measures from the child's route
choice until the first cover is loaded and painted. Each sample uses:

- Chromium;
- 4× CPU slowdown;
- 150 ms latency;
- 1.6 Mbps download;
- 0.75 Mbps upload;
- a fresh context and no service-worker cache.

Results from three samples per route:

| Journey | Baseline | Responsive samples | Median | Change |
| --- | ---: | --- | ---: | ---: |
| Lesson choice → first cover | 3,265 ms | 659 / 661 / 704 ms | 661 ms | 79.8% faster |
| Story choice → first cover | 3,244 ms | 629 / 591 / 625 ms | 625 ms | 80.7% faster |

An immediately preceding complete run produced medians of 628 ms and 596 ms;
all repeated samples remained well below the guardrail.

The benchmark selected the 384 px candidate in every device-scale-1 sample:
17,202 B for the first lesson and 11,490 B for the first story. Direct cold
navigation still includes account/profile and core application boot; that is a
separate home-start budget and is not represented as a shelf-art result.

## Visual and behavioral review

The before/after screenshots are in
`artifacts/ux-review/responsive-shelf-art` at 390×844. The child, ball, hats,
characters, and other teaching objects keep the same placement because resize
preserves the complete 1:1 lesson or 3:2 story frame. The automated asset test
also compares every candidate height with the source aspect ratio.

Manual browser review found no visible crop or composition regression at the
phone shelf size. The lesson browser selected 384 px for a 169 CSS px image.
The story browser and production benchmark selected a responsive candidate for
a 358 CSS px image. Text, controls, focus targets, and card geometry did not
change.

## Limits and next questions

- This is a controlled local profile, not a deployed p75 or a representative
  child-device population.
- Quality 76 passed adult visual review; no children or caregivers compared
  image clarity directly.
- The source images remain in the repository and can still be used by older
  browsers that do not support `srcset`.
- Near-viewport lazy loading still varies by browser. The loading policy should
  change only if field or representative-device evidence still misses the
  picture budget.
- A future media pipeline should run generation and the byte/dimension test
  whenever a new shelf cover is added.

## Hand-off record

```text
Branch: codex/responsive-shelf-art
Base branch / dependency: codex/lesson-speech-short-landscape at 4c54b7f
Commit: pending implementation commit
Hypothesis: verified in the constrained lab; responsive candidates make picture-led choices useful sooner without changing the crop
Changed: 384/768 shelf assets, srcset/sizes, generator, production benchmark, asset/UI/browser tests, screenshots, research memo
Not changed: source artwork, card layout, loading priority, story page art, full-scene lesson art, personalized private art
Tests: pending full validation
Screenshots / traces: artifacts/ux-review/responsive-shelf-art before/after at 390×844
Measured result: lesson first cover median 661 ms; story first cover median 625 ms; largest 768 px candidate 46.96 kB
Risks / limitations: local lab only; no child fidelity study; older browsers retain the larger source fallback
Retain, revise, or reject: retain
Next question: Do deployed low-end phones meet the same first-picture budget without increasing eager image contention?
```
