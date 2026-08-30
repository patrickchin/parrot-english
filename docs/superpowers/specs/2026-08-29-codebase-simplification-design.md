# Codebase Simplification Design

**Date:** 2026-08-29

## Context

The codebase audit found several layers that preserve abandoned implementations,
duplicate platform behavior, or test source structure instead of user-visible
contracts. The largest example is the learner-profile browser mutation journal:
the client maintains durable transactions, recovery tokens, cross-tab locks, and
orphan cleanup even though the worker already owns durable deletion tombstones and
returns the authoritative roster.

The goal is to remove those layers without weakening privacy, deletion fencing,
guardian authorization, accessibility, responsive behavior, or media validation.
The governing rule is Ponytail full: delete or reuse before inventing an
abstraction, and keep only complexity that protects a demonstrated contract.

## Decisions

### 1. Make the worker roster authoritative

`LearnerProfileGate` will stop persisting a browser-side mutation protocol. Create,
select, and delete will remain serialized and abort-fenced, but their durable state
will live only on the worker:

1. Send the mutation.
2. Accept a valid returned roster as authoritative.
3. If the response is missing or uncertain, reload the roster once and reconcile
   from the worker response.
4. If neither request establishes authoritative state, show the existing retryable
   error and revalidate on the next focus or visibility event.

Confirmed changes will emit one best-effort `BroadcastChannel` invalidation. Other
tabs will reload the roster; unsupported or missed broadcasts are covered by focus
and visibility revalidation. There will be no local-storage transaction journal,
Web Lock mutation protocol, recovery token, publication acknowledgement, or orphan
cleanup. Account/session fencing and server-reported `deletionPending` behavior
remain intact. Deletion tombstones and R2 cleanup stay entirely unchanged.

### 2. Collapse duplicate runtime paths

- `recordSpeechClip` becomes a duration/stop-signal adapter over
  `startSpeechRecording`; only one `MediaRecorder` lifecycle remains.
- Dubbing views render `IllustratedDubScene` from their existing definition.
  Component injection, wrapper scenes, their shared scene type, and unsafe casts go
  away.
- The shared lesson visual catalog exports both visuals and backgrounds. Worker
  callers consume it directly and the worker duplicate is deleted.
- The conversation state endpoint keeps its deployed `/facts` URL for rollout
  compatibility but accepts `{ controllerState }` only. The unused fact-candidate
  wire field, schema model, relations, and table are removed with a new forward
  migration. Existing migrations are immutable.
- Runtime stories keep only fields consumed by the product. Test-only prompt,
  vocabulary, duration, summary, category, and level-audit metadata and audit
  helpers are removed rather than moved into another runtime abstraction.
- The unused LiveKit `now` seam is removed.

### 3. Put presentation in its owning React components

Static lesson-player presentation and responsive rules move from `lesson.css` into
Tailwind utilities in `LessonPlayerUi.tsx`. `lesson.css` retains only runtime
character-slot positioning, the speech-tail polygon, and the combined short-wide
placement override permitted by repository policy. Accessible names and DOM
behavior remain stable; Playwright verifies narrow, short-landscape, and desktop
layouts rather than source classes.

### 4. Delete abandoned entry points and structural contracts

Delete the unused app-navigation and speech-operation modules, the speech-operation
test, stale Maestro runner/flows/scripts, the duplicate agent Dockerfile, duplicate
package aliases, and historical plan/spec documents that have no incoming links.
The current design and execution plan remain as the active record; git history is
the archive for prior plans.

Update deployment documentation and behavior tests to use the root Dockerfile.
Replace or delete tests whose only failure mode is a filename, import, identifier,
or source-text change. Keep infrastructure, behavior, privacy, and accessibility
tests that can catch product regressions.

## Non-goals and preserved complexity

- Do not alter deletion tombstones, R2 fencing/retries, guardian boundaries,
  rate-limit bindings, bounded request readers, media verification, feature flags,
  or source lesson audio.
- Do not remove database questionnaire tables in this change. Their runtime use is
  doubtful, but `learner_profile.questionnaire_version` still has a historical
  foreign key and production data has not been audited. Data safety outranks line
  count.
- Do not edit or renumber historical migrations, including duplicate numeric
  prefixes.
- Do not change visible learner names or authored lesson content.
- Do not introduce replacement frameworks, state libraries, or dependencies.

## Testing strategy

Behavior changes follow red-green-refactor. The learner-profile tests will first be
rewritten around the simpler observable contract: authoritative roster responses,
one reconciliation fetch after uncertain mutation results, invalidation-driven
reload, focus/visibility reload, account-transition fencing, and pending-deletion
handling. Old tests that specify browser journal internals will be deleted.

Recorder tests will prove timed stop, explicit stop, callback timing, abort, and
cleanup through the shared recorder lifecycle. Dubbing and lesson-player behavior
will be exercised through rendered components and Playwright accessible locators.
Worker tests will cover the controller-state-only endpoint and migration/schema
wiring. Focused tests run during each slice; the final gate is type checking, unit
and worker suites, builds, and `npm run test:browser`.

## Risks and mitigations

- **Uncertain learner mutation response:** reconcile once from the authoritative
  worker and retain a visible retry path; never invent local durable truth.
- **Missed cross-tab event:** focus/visibility revalidation is the fallback.
- **Responsive layout regression:** preserve component semantics and verify all
  required viewport families with Playwright.
- **Conversation migration rollout:** retain the endpoint URL while shrinking only
  its request body; use a forward migration and never rewrite history.
- **Large cleanup diff:** split work into bounded commits with independent task
  review, then run a whole-branch review and complete verification.
