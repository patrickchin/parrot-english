# Story Reader completion focus implementation

Status: implemented and provisionally retained

Branch: `codex/story-reader-completion-focus`

Base: `codex/story-reader-join-in-visibility` documentation hand-off at
`9d891a7`

Research commit: `bbf68ce`

Implementation commit: `cedd6c8`

Review coverage follow-up: `9ee4223`

Review date: 2026-08-24

## Outcome

Finishing a story now moves focus once, before paint, to the existing
**Great job!** heading. A separated blue rule makes that programmatic arrival
visible without drawing a closed control-like shape. The heading stays outside
ordinary sequential navigation, so one forward Tab reaches **Listen again**.

No completion words, actions, artwork, sound, animation, delay, route, API, or
dependency changed. Replaying still remounts page 1, resets every owned scroll
position, focuses the first sentence, and stays silent until the child chooses
**Listen**.

## Measured problem

On the base branch, pointer and keyboard activation of **Finish story** removed
the focused button and left `document.body` as the active element at 280x568,
390x844, 640x360, and 1280x800. The completion heading and **Listen again**
were already visible, and all scroll owners remained at origin. The defect was
therefore a missing orientation hand-off rather than hidden content or broken
navigation.

A suspected replay-focus defect was disproved before implementation. Pointer
and keyboard replay at all four viewports already returned to page 1 with its
sentence focused, and a pointer sweep passed all 20 current stories. No replay
production code was changed; the verified behavior is now protected as a
regression contract.

## Retained behavior

`StoryReader` owns a ref for its completion heading and an isomorphic layout
effect keyed only to `isStoryComplete`. Once React commits the replacement
screen, the effect calls `focus({ preventScroll: true })`. `tabIndex=-1` makes
the static heading programmatically focusable without inserting it into normal
Tab order.

The heading shrink-wraps its unchanged title. On focus, a four-pixel
brand-blue rule appears twelve pixels to the left of its box, leaving eight
pixels of cream before the first glyph. In forced colors, the authored rule is
hidden and a real two-pixel outline with two-pixel offset remains. This is a
completion-local reuse of the Story Reader's reading-position grammar, not a
new global focus primitive.

The completion transition continues through the existing narration lifecycle:
it cancels an active read-aloud generation, constructs no completion media,
and ignores a stale callback from the removed page.

## Visual iteration

The first functional candidate placed the full-height rule eight pixels left
of the heading box, leaving a four-pixel glyph gap. Independent review at
280x568 and 640x360 read the result as `|Great job!`: potentially a capital
**I**, caret, or stray character. That treatment was rejected and its captures
were retained as decision evidence.

Moving only the rule four pixels farther left produced an eight-pixel cream
gap. Independent re-review retained it without requesting shorter or rounded
ends. Matched Browser geometry showed unchanged glyph, action, and scroll
positions. Decoded baseline/candidate JPEG comparisons with a per-channel
difference threshold of 24 found every strong changed pixel inside the new
rule: 124 pixels on the 280x568 capture and 180 pixels at 640x360.

The [artifact manifest](../../artifacts/ux-review/story-reader-completion-focus/manifest.md)
records two baselines, two rejected candidates, and two retained genuine
in-app Browser JPEGs with provenance, geometry, hashes, and evidence limits.

## Automated evidence

Rendered Playwright coverage proves:

- pointer completion at all four target viewports focuses the visible heading
  with `tabIndex=-1`, leaves **Listen again** fully visible, starts no speech,
  retains all scroll origins, and introduces no horizontal overflow;
- the next Tab reaches **Listen again**, whose pointer activation restores
  page-one sentence focus, idle narration, and the outer reader, inner reading
  pane, main, document, body, and window origins;
- keyboard Enter completion and replay preserve the same sequence;
- replay resets a deliberately scrolled short-landscape completion screen;
- completion cancels active narration, creates no `Audio`, and a stale speech
  callback cannot displace or alter the completion screen;
- lossless screenshot pixels establish the normal-color reading rule and its
  contrast, while forced-colors emulation establishes a real rendered outline;
  and
- existing completion copy, artwork, links, and responsive containment remain
  covered by the surrounding Story Reader suite.

Final validation:

| Check | Result |
| --- | --- |
| Focused completion/replay browser cases | 9/9 passed in 3.5 seconds |
| Full Chromium browser suite | 253/253 passed in 1.1 minutes |
| Unit, integration, lifecycle, and safety | 678/678 passed in 89 suites |
| Production TypeScript and build | Passed; Story Reader 11.58 kB raw / 3.75 kB gzip |
| Lint | 0 errors; 2 pre-existing generated-file warnings |
| Patch and evidence integrity | Local Markdown links, six JPEG dimensions/digests, and `git diff --check` verified |

An earlier full-browser run, before the final two adversarial cases were added,
exposed an unrelated concurrency-sensitive microphone fixture: one lesson test
failed because its mock advanced past **Opening mic...** before the assertion.
A ten-run parallel diagnostic passed 7/10, while a clean full rerun passed
251/251 and the final expanded run passed 253/253. No Lesson Player production
or test code was changed in this branch; the observation remains a separate
test-reliability follow-up rather than evidence against this behavior.

## Review decision

Three independent reviews found no blocking lifecycle, standards, test, or
visual issue after revision. The retained implementation incorporates their
bounded requests: pointer replay and outer-scroll assertions, horizontal-
overflow evidence, explicit documentation of the shrink-wrapped heading box,
an adversarial scrolled replay, active-narration cancellation, stale-callback
and media-construction checks, and corrected wording around the pre-existing
paragraph semantics.

Retain provisionally. The change repairs a reproduced state-transition defect
with one local focus effect and no additional language or waiting. Roll it back
if target assistive technology repeats or interrupts announcements, if a later
rerender steals focus, or if child review finds the marker misleading or the
static heading confusing.

## Limits and next questions

The evidence is deterministic English left-to-right Chromium behavior. It does
not establish VoiceOver, TalkBack, NVDA, switch-scanning, physical touch,
Safari/Firefox, zoom/text-spacing, localization, or child/caregiver
comprehension. Programmatic focus proves the DOM destination and rendered cue,
not what a particular assistive-technology pair announces.

The next stacked Story Reader investigation should address the independently
reproduced child-first order defect: after page-sentence focus, one Tab reaches
**Grown-up options** before the child's **Listen** action. Prefer meaningful DOM
order over positive `tabIndex` or key interception, and cover closed/open
personalization plus all page-control variants.

A separate semantic investigation should replace the pre-existing `aria-label`
on a paragraph role, which WAI-ARIA classifies as name-prohibited. That work
needs target screen-reader evidence and a locator migration; it is not hidden
inside this completion repair. The profile-heading reading-cue branch remains
queued after the higher-impact Story Reader order work.
