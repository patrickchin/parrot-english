# First-use timing and state-stability audit

- Reviewed: 2026-08-21
- Candidate: `7e3bf1d`
- Branch: `codex/first-use-ux-audit`
- Audience: primarily five-to-seven-year-old English beginners, with
  seven-to-ten as a comparison group rather than an assumed ability level

## Decision

The next bounded improvement should make learner-profile acknowledgments
child-paced. Audio may play, fail, or be absent, but none of those media outcomes
should navigate. Only the visible **Next** action should advance, and the newly
shown acknowledgment needs a deliberate focus destination.

This outranks the other first-use timing and layout findings because the current
behavior can remove the child's message and advance the product without the
child choosing to continue. That consequence is deterministic in all three
implemented branches:

- no audio calls `onNext` after exactly 1,800 ms;
- successful audio calls `onNext` when playback ends; and
- an audio `error` event or rejected `play()` promise calls `onNext`
  immediately.

The second-highest issue is a large cold-image layout movement on profile setup.
The 257,936-byte Peppa image has no intrinsic dimensions in the welcome,
question, acknowledgment, or profile-editor views. A controlled in-app Browser
probe delayed that image for three seconds and moved the welcome heading and
primary action by 106 CSS px when it decoded. That should be the next visual
stability branch, but it does not displace the acknowledgment issue: movement is
disorienting, while the acknowledgment behavior can discard content and agency.

No new telemetry is needed to make or verify the acknowledgment change. The
failure is fully represented by source branches, injected media outcomes, and a
mounted browser flow. Production timing collection remains relevant to boot,
profile-service, and real voice questions, but it should not block this fix.

## Evidence boundaries

This memo keeps four evidence classes separate:

| Label | Meaning in this memo |
| --- | --- |
| Source contract | A branch, ordering constraint, asset size, or DOM property directly present at `7e3bf1d`. |
| Deterministic lab | A local build, injected promise/timer, or in-app Browser condition whose inputs were controlled. |
| Historical lab | A repository memo measured on another recorded candidate or before later work. Useful for comparison, not a current percentile. |
| Field / human | Deployed-device distributions or direct child, caregiver, and assistive-technology observation. None was available for this audit. |

The in-app Browser was the only visual browser surface used. Browser probes ran
at 1280×720, device-pixel ratio 2. Artificial delays are stress conditions that
expose state ordering; they are not estimates of a child's connection. No probe
here produces a production LCP, INP, CLS, or latency percentile.

## What happens before the first useful screen

The protected application boot is serial at the component boundary:

1. [`RoutedApplication`](../../src/app/App.tsx) mounts `AuthGate` around
   `LearnerProfileGate` and the routes (lines 1231–1273).
2. While session state is pending, [`AuthGate`](../../src/auth/AuthGate.tsx)
   returns only **Checking your session…** (lines 222–234), so the profile gate
   is not mounted yet.
3. Once authenticated, [`LearnerProfileGate`](../../src/learner-profile/LearnerProfileGate.tsx)
   starts `loadLearnerProfile` in an effect (lines 639–663) and replaces the app
   with **Loading your questions…** or **Getting Peppa ready…** (lines 152–163).
4. Only after that response does home, setup, Talk, or another protected route
   render.

Both waits have named, stable status cards and failure/retry states. The source
proves their order, not their deployed duration. There is no current production
p75/p95 for either session resolution or profile loading, so parallelization,
new skeletons, or new telemetry are not justified by this audit alone.

### Current build artifact

`npm run build` passed with TypeScript and Vite 8.2.1. Vite transformed 1,888
modules and reported these relevant outputs:

| Output | Raw | Vite gzip estimate | Load boundary |
| --- | ---: | ---: | --- |
| HTML | 2.08 kB | 0.66 kB | Initial |
| Core CSS | 84.36 kB | 14.75 kB | Initial |
| Core JavaScript | 494.60 kB | 149.42 kB | Initial |
| Story shelf | 5.14 kB | 1.97 kB | Lazy route |
| Story reader | 10.58 kB | 3.44 kB | Lazy route |
| Conversation surface | 17.68 kB | 5.92 kB | Lazy inside the profile gate |
| LiveKit client | 468.82 kB | 121.41 kB | Imported during voice connection |

The initial HTML + CSS + core estimate is 164.83 kB gzip, 15.17 kB below the
repository's 180 kB constrained-lab guardrail. This is build output, not a wire
measurement: it excludes response headers and depends on production encoding,
cache, CDN, and browser behavior. The built HTML references only the core script
and stylesheet; it contains no route-chunk preload or prefetch tags.

The UI font stack is `ui-rounded`, Arial Rounded, and `system-ui`; there is no
web-font request or web-font-driven swap to audit. LiveKit remains correctly
absent from initial transfer.

## Route and asset stability

### Home and shelves

The three home choices use explicit image `width` and `height` plus fixed visual
containers in [`HomeMenu.tsx`](../../src/app/HomeMenu.tsx) (lines 83–98). At the
390 px, device-scale-1 source choice described by the `sizes` rules, their three
source files total 69,906 bytes: 17,202 bytes for the responsive lesson cover,
12,634 bytes for the Talk image, and 40,070 bytes for the story image. This is a
static candidate-size sum, not observed transfer.

Story shelf art has intrinsic 1536×1024 dimensions, an aspect-ratio container,
one eager/high-priority first cover, and lazy later covers in
[`StoryArtwork.tsx`](../../src/stories/StoryArtwork.tsx) (lines 30–43) and
[`StoryList.tsx`](../../src/stories/StoryList.tsx) (lines 89–106). Lesson shelf
images do not carry intrinsic attributes, but their visual slot is reserved by
`min-height` and `aspect-[4/3]` in
[`LessonList.tsx`](../../src/lessons/LessonList.tsx) (lines 122–141).

The later [responsive shelf-art study](./responsive-shelf-art.md) measured
median first-cover paints of 661 ms for lessons and 625 ms for stories under its
documented constrained profile, down from roughly 3.25 seconds. Those are
historical lab results on that recorded branch, not current field timings. They
support retaining the responsive assets and not changing shelf loading policy
without a new miss.

### Profile art has unreserved height

`peppa-happy.webp` is a 1024×1024, 257,936-byte asset. Its profile instances
specify CSS width and maximum height, but omit HTML `width`/`height`, an
aspect-ratio utility, and a responsive candidate:

- setup welcome: [`LearnerProfileGate.tsx`](../../src/learner-profile/LearnerProfileGate.tsx),
  lines 297–305;
- question: [`LearnerProfileQuestion.tsx`](../../src/learner-profile/LearnerProfileQuestion.tsx),
  lines 76–81;
- acknowledgment: [`LearnerProfileAcknowledgment.tsx`](../../src/learner-profile/LearnerProfileAcknowledgment.tsx),
  lines 95–104; and
- editor: [`ProfileEditor.tsx`](../../src/learner-profile/ProfileEditor.tsx),
  around line 154.

In the controlled cold-image probe, the welcome image's rendered height changed
from 0 to 208 px. The card grew from 420 to 628 px and re-centered; the heading
and **Set up profile** action each moved down 106 px. Document height stayed 720
px, so this is visible in-place movement rather than added page scroll. This
single stress run is not a CLS score. The same URL can be cached before later
questions and acknowledgments, so the strongest demonstrated risk is the first
welcome view.

### Lazy routes are visually stable on client navigation, but direct-load focus is not

The story shelf, story reader, lesson creator/editor, and personalized-art panel
remain `lazy()` route chunks in [`App.tsx`](../../src/app/App.tsx), lines
122–159. The route tree has one named fallback, **Loading… / Getting your
activity ready.**, at lines 1129–1197.

Two controlled Browser paths behaved differently:

- On home → **Story time**, a three-second artificial `StoryList` module delay
  retained the old home rather than replacing it with a large fallback. At 100
  ms the clicked link still owned focus; when the module resolved, **Pick a
  story** owned focus. The same client transition without delay also ended on
  the destination heading.
- On a direct cold `/stories` load, the fallback heading owned focus while the
  same module was delayed, then focus fell to `BODY` when the destination
  replaced it. A direct fast local `/stories` load also ended on `BODY`.

The source explains the direct-load result: [`RouteFocusManager.tsx`](../../src/app/RouteFocusManager.tsx)
focuses the first `main h1` on the next animation frame and reruns only when the
pathname changes (lines 8–22). If that heading is the Suspense fallback, the
destination reveal does not retrigger it. This is a real keyboard-focus gap for
direct/refresh entry to the observed story route, but no action or content was
lost. It ranks below the profile acknowledgment and profile-art issues. The
historical [performance baseline](./performance-baseline.md) found route words
or actions within 64–321 ms under its constrained lab profile, so a loading
system or eager route bundle is not warranted from this result.

## Interaction timing and pending feedback

| Path | Evidence at `7e3bf1d` | Assessment |
| --- | --- | --- |
| Lesson **Start lesson** | The state-owning lesson UI is eager; the start action is focused in `App.tsx` lines 409–423. The historical baseline measured 49–50 ms to next paint under its constrained profile, and the [lesson stability memo](./lesson-start-stability.md) records the one-click/no-refetch regression contract. | Preserve. Current field timing is unknown, but no unresolved state-loss branch was found. |
| Story **Listen** | `StoryReader.tsx` lines 89–173 sets `playing` before starting media, returns to `idle` with a stable readable error on synchronous or asynchronous failure, and focuses page text when a page changes (lines 85–87). | Good immediate state ordering. Real device-speech/audio success and latency were not measured here. |
| Talk **Start**, sound recovery, microphone | The current direct-action browser tests measure pending paint in-page below 100 ms and assert one focused, `aria-disabled` action, one visible pending phrase/spinner, stable geometry, duplicate guards, and reduced motion. See `conversation-audio-playback.spec.ts` lines 54–108 and 283–337 and the [direct-action handoff](./talk-direct-action-feedback.md). | Strong deterministic coverage. Real autoplay, permission prompts, physical output, target AT, and child comprehension remain field/manual questions. |
| Lesson microphone opening | `LessonPlayerUi.tsx` lines 666–704 uses native `disabled`, changes the button to **Opening mic…**, and also changes the prompt. `lesson-player.spec.ts` lines 1121–1125 explicitly expects both copies. | Understandable but visually and verbally duplicated; lower priority than profile failures. Align with the single-owner Talk pattern in a later branch. |
| Profile answer saving | `LearnerProfileQuestion.tsx` lines 97–175 disables the fieldset and shows **Peppa is thinking…** in both a status and the submit control. | Stable wait feedback, but the elapsed wait can be long and is not measured in production. |

### Profile submission has a serial upstream tail

For a first-use answer, the worker awaits enrichment, persistence/reload, and
then acknowledgment TTS before returning the acknowledgment
([`worker/learner-profile.ts`](../../worker/learner-profile.ts), lines 371–422).
The default Groq timeout is 15,000 ms
([`worker/groq.ts`](../../worker/groq.ts), lines 19–20 and 52–58), and the default
ElevenLabs timeout is 10,000 ms
([`worker/learner-profile-acknowledgment-audio.ts`](../../worker/learner-profile-acknowledgment-audio.ts),
lines 7–9 and 28–35). These are caps for individual upstream calls, not observed
waits or an end-to-end guarantee.

Profile edit is more exposed: changed answers are enriched sequentially at
`worker/learner-profile.ts` lines 479–535, then their audio is synthesized
sequentially at lines 555–562. The UI remains in its saving state throughout.
This is a high potential latency issue, but frequency and production phase
durations are unknown. It ranks below the acknowledgment behavior because the
latter is certain whenever one of its explicit media branches occurs and can
navigate away without consent.

### Talk defers LiveKit, but begins its import after the start API

Talk sets `connecting` before awaiting remote work in
[`usePeppaConversation.ts`](../../src/conversation/usePeppaConversation.ts),
lines 868–892. It creates and connects the transport only after the start API
returns (lines 930–945); the transport then imports `livekit-client` in
[`livekit-conversation.ts`](../../src/conversation/livekit-conversation.ts),
lines 151–153 and 590–597. Thus the 121.41 kB gzip build chunk is correctly
deferred from home, but its import is source-proven to begin after the start API
rather than in parallel with it. The repository has no current production phase
distribution showing that this is the dominant voice wait, so retain it as a
bounded later experiment rather than preloading LiveKit globally.

## LearnerProfileAcknowledgment: exact failure contract

[`beginAcknowledgmentPlayback`](../../src/learner-profile/LearnerProfileAcknowledgment.tsx)
uses one guarded `advance()` callback (lines 34–44), but assigns navigation to
media outcomes:

| Input/outcome | Exact source branch | Current result |
| --- | --- | --- |
| `acknowledgment.audio === null` | lines 61–63 | `setTimeout(advance, 1_800)` |
| Base64/blob/audio construction throws | lines 47–60 | The same 1,800 ms timer |
| Audio reaches `ended` | lines 55–57 | Immediate `advance()` |
| Audio emits `error` | lines 55–57 | Immediate `advance()` |
| `audio.play()` rejects | line 57 | Promise rejection is caught by `advance()` immediately |

Cleanup correctly clears the timer, removes listeners, pauses audio, revokes the
object URL, and ignores stale callbacks (lines 65–74). The problem is not stale
work; it is that valid media completion and media failure both own navigation.

A read-only injected probe imported this function through Vite SSR and exercised
all branches. It observed `noAudioDelayMs: 1800`, one advance after firing that
timer, and one advance for each of `ended`, `error`, and rejected `play()`. This
is deterministic function behavior, not a claim that any target browser will
reject playback at a particular rate. [VOICE-09 in the source
register](./source-register.md) establishes that audible autoplay and rejected
play promises require explicit recovery; it does not establish Parrot's field
frequency.

The mounted no-audio Browser flow exposed two additional consequences. When the
acknowledgment appeared, **Next** was visible but `document.activeElement` was
`BODY`, because the submitted control had been removed on the same route and no
local focus lifecycle ran. After a little over two seconds, the acknowledgment
was gone and the route was home without a click. Home's heading then received
focus because the pathname changed.

The fixed duration is not tied to the message length, the child's language or
reading confidence, or an explicit choice. The audio generator accepts
acknowledgments up to 160 characters, but every no-audio result receives the same
1.8 seconds. An audio-ending listener also gives no pause after listening. In a
profile edit, `handleAcknowledgmentNext` advances through each item one at a time
(`LearnerProfileGate.tsx`, lines 988–1022), so fast media errors or rejected play
promises can cascade through multiple acknowledgments.

This audit does not claim a universal reading-speed threshold for children. The
product problem exists without one: optional media availability determines
whether visible content remains and whether navigation occurs. That conflicts
with the repository's child-agency and user-controlled-interruption principles
([A11Y-04 and WELL-01](./source-register.md)).

### Existing tests encode the behavior but do not make it safe

[`tests/learner-profile-ui.test.mjs`](../../tests/learner-profile-ui.test.mjs)
passed 35/35 focused tests in this audit. Within its acknowledgment suite:

- lines 244–258 verify the message, polite live region, and immediate **Next**;
- lines 260–303 require audio `ended` to advance;
- lines 305–325 require only that the no-audio delay be at least 1,500 ms, then
  clean up before invoking the timer to prove stale work is ignored; and
- there is no direct `error`-event or rejected-`play()` case.

The mounted lifecycle path at
[`tests/lifecycle/app-lifecycle.test.mjs`](../../tests/lifecycle/app-lifecycle.test.mjs),
lines 3983–4042, returns `audio: null` but immediately clicks **Next**, so it
never observes the 1.8-second branch or focus after the submitted control is
replaced. Passing tests therefore confirm the current contract and cleanup; they
do not establish adequate reading time, child control, or media-failure safety.

## Ranked unresolved issues

| Rank | Issue | Why it is here | Evidence confidence |
| ---: | --- | --- | --- |
| 1 | Media-controlled acknowledgment advance and same-route focus loss | Can remove the child's message or cascade through acknowledgments without a choice; applies to no-audio, ended, error, and rejected-play branches. | High: exact source, injected branches, mounted no-audio Browser flow. Browser rejection frequency remains unknown. |
| 2 | Unreserved 258 kB profile image | First setup CTA moved 106 px in a controlled cold-image run; the image carries essential character meaning for a low-reading audience. | High for geometry, unknown for field frequency/CLS. |
| 3 | Serial profile enrichment, persistence, and TTS | One answer can wait behind two sequential upstream calls; multi-answer edit serializes every enrichment and every synthesis. | High for ordering and configured caps, low for deployed latency distribution. |
| 4 | Direct lazy-route reveal drops focus to `BODY` | Verified on direct `/stories`, both fast local and artificially delayed; client navigation correctly focused the destination. | High for the observed route, untested across every lazy route and target AT. |
| 5 | Lesson microphone duplicates pending feedback and disables focused controls | Current source and browser test require the same **Opening mic** idea in prompt and button, unlike the calmer Talk ownership pattern. | High for rendered contract, unknown child/AT effect. |
| 6 | LiveKit module work starts after the Talk start API | Adds a source-proven serial phase to voice startup, but immediate pending feedback is strong and no production phase distribution identifies it as dominant. | High for ordering, low for field impact. |
| 7 | Serial session → profile boot | Two understandable gates must complete before the first protected screen. Historical home boot met the repository lab guardrail, but current field percentiles are absent. | High for ordering, low for field impact. |

## One bounded improvement and its acceptance contract

Create a stacked implementation branch for **child-paced profile
acknowledgments**. Keep the acknowledgment text, Peppa image, polite semantics,
audio attempt, and existing cleanup. Change only progression and focus ownership:

- audio `ended`, `error`, rejected `play()`, missing audio, and decode/setup
  failure must never call `onNext`;
- remove the 1,800 ms navigation timer;
- only activation of the visible **Next** button advances;
- when the acknowledgment replaces the submitted control on the same route,
  focus its heading once with `tabIndex={-1}` (consistent with route headings),
  leaving **Next** as the next sequential action; and
- do not add telemetry, a dependency, a timeout, an audio replay system, or new
  content to this branch.

Acceptance tests:

1. With `audio: null`, advance fake time beyond 1,800 ms and assert the
   acknowledgment and **Next** remain and `onNext` has not run.
2. With audio, fire `ended` and `error` separately and reject `play()`; assert no
   branch calls `onNext`, rejection is handled, and cleanup still pauses,
   removes listeners, revokes its object URL, and ignores stale events.
3. Activate **Next** and assert exactly one `onNext` call.
4. In a mounted final-answer flow, assert the acknowledgment heading receives
   focus, remains after more than two seconds with no audio, and advances only
   after **Next** is activated.
5. In a two-acknowledgment profile-edit flow, assert each **Next** reveals one
   item and media failure cannot skip either item or close the route.
6. Use accessible locators and retain the current narrow/short containment
   coverage; do not assert Tailwind classes.

After that branch, reserve the profile image's 1:1 geometry and add responsive
character candidates in a separate visual-stability branch with a delayed-image
browser regression. Keeping these changes separate makes both causal results
easy to review.

## What this repository can and cannot prove

It can prove build boundaries, source ordering, injected media outcomes,
rendered focus, reserved geometry, and local action feedback. It can also retain
the existing product guardrails: field LCP ≤2.5 s, INP ≤200 ms, CLS ≤0.1 at p75;
product-hypothesis control acknowledgment p95 ≤100 ms; and the constrained-lab
route/action, first-picture, and initial-transfer budgets in the
[performance baseline](./performance-baseline.md). [PERF-01 and
PERF-02](./source-register.md) record the standards sources and the limits of
those mappings.

It cannot prove production percentiles, cache/CDN behavior, real autoplay or
permission outcomes, physical audibility, assistive-technology announcement
order, or that a five-year-old multilingual learner understands or tolerates a
given wait. Those require representative deployed measurements and direct,
consented child/caregiver and target-AT observation. None should be inferred from
passing Playwright tests or a desktop lab run.
