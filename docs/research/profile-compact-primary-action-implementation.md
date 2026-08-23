# Profile compact primary-action implementation

Status: implemented and provisionally retained

Branch: `codex/profile-compact-primary-action`

Stacked base: `codex/profile-operation-pending-focus` at `7e6d75a`

Research: `334dd94`

Red contract: `d8dffb2`

Implementation: `5b2fa73`

Acceptance hardening: `7978833`

Research date: 2026-08-24

Guidance:
[`profile-compact-primary-action-guidance.md`](./profile-compact-primary-action-guidance.md)

Visual evidence:
[`artifacts/ux-review/profile-compact-primary-action/manifest.md`](../../artifacts/ux-review/profile-compact-primary-action/manifest.md)

## Outcome

The first learner-profile question now keeps its complete full-size **Next**
action in the initial 320x640 viewport. The owned main remains at scroll origin
through the real keyboard path from the focused heading to Replay, answer,
microphone, Skip, and Next.

The change is three question-local responsive additions:

- `max-[360px]:p-3` on the card;
- `max-[360px]:my-2 max-[360px]:gap-2` on the visual prompt group; and
- `max-[360px]:mt-0 max-[360px]:gap-2` on the action row.

Tailwind's arbitrary max-width variant is exclusive: `max-[360px]` means
widths below 360 CSS pixels. Existing `short` utilities still own constrained
height, and 360px and wider retain their prior portrait composition. The new
utilities duplicate already-active values at 280x568, so that established
ultra-narrow composition is unchanged.

Nothing else changed. Prompt and translation copy, 96px portrait artwork, the
130px answer row, 52px microphone, 144x52 Next action, control order, focus
model, audio, saving, pending operations, errors, shared controls, and global
breakpoints are intact. The implementation adds no JavaScript, request,
animation, timer, or interaction delay.

## Test-first evidence

The existing 320px test had called `scrollIntoViewIfNeeded()` on each action
before measuring it. The new contract measures Next while the heading owns
focus and main scroll is zero, then traverses the real sequential keyboard
order and requires main scroll to remain zero.

On base `7e6d75a`, that test failed before implementation:

```text
Expected bottom <= 641
Received bottom = 710.5
```

After the first CSS implementation, screenshot review found that
`max-[359px]` did not apply at exactly 359px. A new boundary assertion failed
with a 29px main scroll range. The class was corrected to `max-[360px]`, and
both 320 and 359 contracts passed. This is why the boundary test checks scroll
range instead of only Next's border box: at 359px, Next happened to remain
visible while the card still clipped.

The final test proves at both 320x640 and 359x640:

- initial heading focus and main scroll origin;
- zero main scroll range for the required first question;
- complete Replay and Next border boxes before action focus;
- at least 44x44 targets;
- Account/Replay clearance and pointer ownership;
- one-line progress and zero horizontal overflow;
- reverse keyboard focus to Replay with complete focus paint; and
- forward order through answer, microphone, Skip, and Next without scrolling.

The optional-question operation fixture separately measures the 320x640 Next
before it receives focus, requires the owned main to remain at scroll origin,
and repeats those checks through idle, opening, listening, writing, ready, and
thinking. It also locks the 144x52 target and the complete focused paint. This
prevents browser focus scrolling from disguising a future below-fold
regression.

## Rendered geometry

Measurements use the deterministic production-copy profile fixture, reduced
motion, loaded fonts, one-device-pixel screenshots, and local Chromium. Border
boxes were read before any action-focused browser auto-scroll.

| State | Card | Main range | Skip | Next | Result |
| --- | --- | ---: | --- | --- | --- |
| Base required, 320x640 | y=14...738.5, h=724.5 | 113 px | y=598.5...642.5 | y=658.5...710.5 | Skip clips 2.5px; Next wholly below |
| Candidate required, 320x640 | y=31.75...608.25, h=576.5 | 0 px | y=544.25...588.25 | y=540.25...592.25 | all complete |
| Candidate required, 359x640 | y=50.5...589.5, h=539 | 0 px | complete | complete | exact compact boundary complete |
| Candidate required, 360x640 | y=18.5...621.5, h=603 | 0 px | y=545.5...589.5 | y=541.5...593.5 | excluded guard remains complete |
| Candidate optional, 320x640 | h=628.5 | 17 px | two skip actions complete | y=574.5...626.5 | Next and its focus paint complete at origin |
| Candidate optional thinking, 320x640 | unchanged | 17 px | non-owners disabled | y=574.5...626.5 | focused owner paint ends at y=634.5 |

The required 320px card loses 148 CSS pixels of intrinsic height while the
task content and controls retain their sizes. The measured reduction is 24px
of card padding, 24px of visual-block margins, 8px of visual gap, 8px of footer
top margin, 60px from the tightened/reflowed footer, and 24px because the wider
inner content lets the unchanged Chinese translation reflow from two lines to
one. The centered card moves down from y=14 to y=31.75 after it fits; this is a
stable initial composition, not an interaction-driven content shift.

The optional fixture intentionally has one small 17px main range because it
adds **Skip question**. All three actions, the complete Next paint envelope
when focused, the prompt, and the answer remain visible at origin. The
existing error contract may minimally scroll an already-focused retry when an
alert is inserted.

## Visual review

The retained 320x640 screen is denser but still has one clear hierarchy:
progress/replay, character and bilingual prompt, answer, then actions. It does
not shrink the character, prompt, translation, field, or targets. The larger
pink Next remains the visual primary action, and the two optional exits remain
underlined text actions.

The focused screenshot confirms the contiguous light/deep focus indicator is
complete at the bottom of the viewport. In the optional thinking state the
focused primary owner remains fully saturated and visible while competing
actions mute, without moving any anchor.

The exact 359/360 pair was retained as evidence. Both are complete; the 360px
screen gains the existing larger decorative spacing and its prompt happens to
wrap to two lines. The breakpoint therefore changes breathing room, not task
availability, order, size, or meaning.

Independent visual review retained normal-flow compaction over sticky and cue
alternatives and found no blocker in the compact action. It also recorded
three residuals rather than hiding them: the 359-to-360 breathing-room change
is abrupt; the optional action row moves Next left when both skip choices are
present; and arbitrary Account labels may invalidate narrow-screen Replay
clearance. The account-label observation came from an exploratory probe without
a preserved fixture or artifact, so this record treats it as a risk to
reproduce, not a verified defect. It is now the next backlog improvement
because any repair needs a shared-header rule rather than another
question-local offset.

One screenshot was also captured through the genuine in-app Browser at its
1280x720 viewport to confirm that the ordinary wider layout is unchanged. The
narrow evidence uses headless Chromium because the in-app Browser surface did
not expose exact viewport emulation. Provenance is explicit in the manifest.

## Verification

Final commands and observed results:

| Check | Result | Observed wall time |
| --- | --- | ---: |
| New 320 and 359 boundary tests | 2/2 passed | under 1 s test time |
| Profile viewport + operation suites, including review hardening | 38/38 passed | 17.2 s |
| `npm test` | 686/686 passed | 2.43 s |
| `npm run build` | TypeScript and production Vite build passed | 3.22 s |
| `npm run lint` | 0 errors; 2 unchanged warnings in generated `worker-configuration.d.ts` | 2.64 s |
| `PLAYWRIGHT_PORT=4224 npm run test:browser` | 312/312 passed | 1.3 min |

An earlier full browser run reused the hand-started visual server on port 4220.
That server did not include Playwright's expected
`PARROT_FRONTEND_COMMIT_SHA=e2e-web`, so the unrelated caregiver build-details
test could not find that exact label and the run ended 311/312. The same test
passed alone on a Playwright-owned server, and the complete clean rerun on that
server passed 312/312. No retry or source change was used to hide a product or
timing failure.

## Retain, rollback, and remaining uncertainty

Retain the change provisionally: it fixes a directly reproduced initial-
visibility failure with normal-flow CSS, preserves task space and controls,
and passes the complete regression suite. Direct learner discovery remains
untested.

Rollback if physical-device or enlarged-text review finds crowding, clipping,
or accidental taps that the CSS-pixel fixture misses. Do not generalize this
breakpoint to other routes without their own evidence.

Still unknown:

- whether four-to-six-year-old weak-English learners find and predict Next
  more reliably;
- whether a conventional arrow, Chinese support, or audio demonstration is
  needed for the action label;
- software-keyboard behavior on representative Android and iOS devices;
- target screen-reader and switch-control experience; and
- the correct exceptional-overflow treatment for enlarged text or longer
  localization.

The next cheapest evidence is a counterbalanced caregiver-assisted task test
using the base and candidate screenshots/prototypes, followed by physical
320px-class device testing with the software keyboard. Measure unprompted
action discovery, time after answer completion, scroll attempts, wrong taps,
and adult interventions—not engagement duration.
