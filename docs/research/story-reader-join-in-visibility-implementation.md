# Story Reader join-in visibility implementation

Status: implemented and provisionally retained

Branch: `codex/story-reader-join-in-visibility`

Base: `codex/static-profile-acknowledgment-audio` documentation hand-off at
`6ca36e7`

Research commit: `160ac63`

Implementation commit: `5464b9d`

Review coverage follow-up: `af4c9d5`

Review date: 2026-08-24

## Outcome

Story Reader now treats the yellow **Say it** card as the current child task at
the participation phase. A short-wide page still arrives at the top with its
complete sentence visible. When device narration moves from the sentence to the
join-in phrase, only the existing inner reading pane moves by the smallest
distance needed to expose the full card. The card stays exposed for
**Your turn**, pause, and resume. Replay and page changes restore the pane to
its origin before the sentence is modeled again.

This repairs the measured 640×360 failure without shrinking language, adding a
scroll instruction, moving keyboard focus, or moving the artwork, bottom
controls, outer reader, or document.

## Measured problem

An executable baseline sweep loaded all 122 checked-in story pages at 640×360
and intersected each prompt with its nearest rendered vertical overflow owner.
Only 47 prompts were fully visible at arrival; 74 were partial and one was
wholly hidden. On 26 pages, neither the prompt label nor phrase had a visible
pixel. The current UI left that geometry unchanged when narration reported
**Your turn**.

The most constrained pages provided concrete boundaries:

- Kite, Come Back! page 4 exposed about 4 of 67.5 prompt pixels at origin.
- The Picnic Blanket Search page 1 exposed 0 of about 95 prompt pixels.
- Robo Tries page 6 already fit and served as a no-scroll threshold case.

The underlying problem was lifecycle ownership rather than available space:
the right reading pane was already the intended scroll owner, but narration
never changed its position when the child task changed.

## Retained behavior

The implementation adds three DOM references and one file-local geometry
helper. The helper compares the target and pane rectangles, then adjusts the
pane's `scrollTop` by only the clipped top or bottom distance. It does nothing
when the target already fits.

The reveal is attached to existing semantic boundaries rather than a new timer
or state:

1. page arrival and narration start synchronously reset the inner pane;
2. the current-generation device path reveals the prompt before starting the
   second utterance;
3. successful completion reapplies prompt visibility, which also gives a
   combined saved narration an honest completion boundary;
4. a current read-aloud failure places and reveals the alert directly after
   the prompt; and
5. the existing playback-generation checks prevent a late page from moving the
   new page or speaking its old phrase.

An isomorphic layout effect resets the page and reveals a newly committed alert
before paint in a browser while avoiding a server-render warning. An immediate
error reveal attempt also covers a same-message retry whose clear-and-restore
state updates React can batch.

`scrollIntoView()` was deliberately not used because it may move ancestor
scroll containers. There is no smooth scrolling, animation, transition,
timeout, new focus target, new label, new landmark, dependency, telemetry,
network request, or data change.

## Narration boundary

Current catalog pages all use device speech because their
`narrationAudioId` values are null. The device path has a real boundary between
the sentence utterance and join-in utterance, so the prompt can be revealed
before the second call is handed to speech synthesis.

The retained combined saved-audio path has no cue metadata. It therefore keeps
the sentence phase until media completion and reveals the prompt only then. It
does not guess a midpoint from duration. Future saved story narration needs
split assets or explicit cue timing before it can provide phrase-synchronous
presentation.

## Automated evidence

The new behavior coverage checks the rendered overflow owner and accessible
content rather than Tailwind source or class names. It proves:

- the second device utterance starts only after the complete prompt is visible;
- **Your turn** keeps it visible and replay resets to origin;
- pause and resume preserve the current pane position;
- page navigation restores sentence focus and origin;
- a stale same-turn completion cannot reveal or speak on the new page;
- synchronous and asynchronous failures keep the complete prompt and adjacent
  alert visible while a grown-up details panel remains open;
- portrait and desktop pages that already fit do not scroll;
- artwork, controls, outer reader, document, and focused control remain stable;
- reduced-motion mode receives the same immediate result; and
- every current device-speech prompt in the 20-story, 122-page catalog is fully
  exposed before its join-in utterance and at **Your turn**.

The component-level saved-audio contract uses a controlled media instance to
prove that a combined asset leaves the pane at origin while playing and reveals
the prompt only on completion.

Final validation through review follow-up `af4c9d5`:

| Check | Result |
| --- | --- |
| Unit, integration, lifecycle, and safety | 678/678 passed in 89 suites |
| Full Chromium browser suite | 244/244 passed in 1.1 minutes |
| Exhaustive current-story subcase | 122 pages passed in 27.6 seconds |
| Production TypeScript and build | Passed; Story Reader 11.21 kB raw / 3.70 kB gzip |
| Lint | 0 errors; 2 pre-existing generated-file warnings |
| Research and artifact integrity | 399 local Markdown links resolved; three JPEGs are 640×360 with matching SHA-256 digests |
| Patch integrity | `git diff --check` passed |

## Visual evidence

The [artifact manifest](../../artifacts/ux-review/story-reader-join-in-visibility/manifest.md)
records three genuine in-app Browser JPEGs with SHA-256 digests: the baseline
Kite page and retained **Your turn** states for Kite and the wholly hidden
Picnic stress page.

At 640×360, Kite's complete 67.5 px card is visible at `scrollTop = 63.5` and
Picnic's complete 95 px card is visible at `scrollTop = 121`. The artwork and
bottom controls remain fixed, and the outer reader and document stay at origin.
The screenshots support presentation review; deterministic browser hooks own
the exact pre-second-utterance timing assertion.

## Review decision

Three independent reviews inspected `160ac63..5464b9d` for playback races,
React lifecycle and server rendering, accessibility, rendered geometry, test
realism, maintainability, and performance.

- The production-correctness review found no actionable issue and separately
  verified the generation guards, saved-audio boundary, layout effects, and
  conservative rounding.
- The accessibility/test review found that the catalog loop excluded all pages
  in a future mixed saved/device story. Follow-up `af4c9d5` now visits every
  story and conditionally exercises every device-speech page. It also completes
  narration at 1280×360, where `short-wide` and `lg` rules overlap, and verifies
  the full prompt, outer reader, document, art, and controls.
- The maintainability review proposed replacing the rendered 122-page sweep
  because it takes about 28 seconds. That recommendation was not adopted. The
  boundary tests already isolate the algorithm, while the sweep protects the
  separate content-and-layout risk: browser font wrapping, card height, and
  breakpoint geometry cannot be represented by a fast Node catalog invariant.
  Its measured cost remains bounded inside the 1.1-minute full browser suite.

The two accepted coverage gaps pass all 19 Storytelling tests in 30.7 seconds,
including the sweep in 28.1 seconds. No production revision was required.

## Interpretation and limits

Retain this as a bounded, reversible task-visibility repair. It makes current
primary content available at the phase where a child needs it and introduces no
new English or interaction to understand. That is product evidence, not proof
that children comprehend the prompt, repeat it successfully, or learn more.

Evidence remains deterministic local Chromium in English and left-to-right
layout. It does not cover Safari, Firefox, zoom, increased text spacing, safe
areas, physical devices, translations, RTL, screen-reader announcement order,
switch access, manual scroll discoverability, real audio output, or child and
caregiver observation.

The cheapest formative follow-up is a short moderated task with young
multilingual learners: after they tap **Listen** on a long page, can they locate
and repeat the phrase without an adult pointing or saying “scroll”? Record task
completion and confusion without collecting child audio.

## Follow-up

Keep the separate profile-heading reading-position cue queued. A test-design
review also raised a potentially independent Story Reader completion-to-replay
focus question; reproduce that from the current base before ranking or fixing
it so this branch does not absorb an unrelated focus-flow change.
