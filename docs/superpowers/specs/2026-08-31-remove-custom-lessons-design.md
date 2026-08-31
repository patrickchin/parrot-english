# Custom Lessons Removal Design

**Date:** 2026-08-31

## Context

Parrot English currently exposes one vertically integrated custom-lesson feature
under several names: **My Lessons**, **custom lessons**, and **Made for you**.
Guardians can generate or upload a lesson, learners can play it from the lesson
shelf, and the worker stores the lesson in D1. Join-in recordings for those
lessons are stored in R2 alongside recordings for built-in lessons.

The feature will be removed completely so it can be redesigned later without
preserving its current contracts. The removal includes existing saved custom
lessons and their custom-lesson join-in audio. This scope does not include
personalized story art, learner profiles, built-in lessons, or built-in lesson
recordings.

## Decisions

### 1. Delete the complete custom-lesson product surface

Remove the Guardian My Lessons manager, lesson creator, visual editor, scene
preview, client API and hook, custom shelf section, custom lesson player routes,
and all related navigation. The Guardian dashboard will retain its learner,
story, dubbing, and account controls; the learner lesson shelf will contain only
the built-in catalog.

Old custom-lesson browser URLs will receive the app's ordinary unknown-route
fallback. No redirect, feature flag, disabled placeholder, or compatibility
screen will remain.

### 2. Remove the backend capability instead of hiding it

Delete the My Lessons CRUD and generation handlers, repository, OpenAI lesson
generator and prompt, generator model reporting, generator-specific rate limit,
and Guardian authorization rules. Removed `/api/lessons/my` routes will use the
worker's ordinary not-found response. No read-only compatibility API or restore
path will remain.

Remove feature-only lesson preparation and editing helpers after their callers
are gone. Keep shared lesson validation, visual catalogs, device speech, and the
OpenAI configuration used by the LiveKit conversation agent.

### 3. Collapse shared lesson contracts to built-in lessons

The lesson player and route helpers will no longer accept a `my` source or a
custom-lesson revision. Built-in lessons will continue to use saved audio,
full-scene artwork, join-in recording consent, upload queues, and the existing
lesson-player UI.

The recording worker will accept built-in lesson recording routes only. Remove
custom-lesson lookup, revision and generation fencing, custom generation
metadata, and per-custom-lesson cleanup helpers. Preserve shared R2 retry,
consent, account deletion, learner deletion, and built-in recording cleanup
behavior.

### 4. Permanently delete stored custom-lesson data

Add a forward D1 migration that drops `learner_lesson`, and remove the table from
the current Drizzle schema. Applied historical migrations and snapshots remain
immutable so existing and fresh databases retain a valid migration history.

Custom-lesson audio will be purged only from keys matching one of the deployed
storage shapes below; built-in `parrot` recordings and all other objects in the
shared bucket remain untouched:

- `personalized-story-art/<account>/lesson-recordings/my/...`
- `personalized-story-art/<account>/learners/<learner>/lesson-recordings/my/...`

The purge workflow will:

1. Resolve the configured database and R2 bucket with read-only checks.
2. Count D1 rows and exact matching R2 keys before mutation.
3. Deploy the runtime removal before applying the table-drop migration, so an old
   worker never runs against a missing table.
4. Delete the exact custom-recording keys, with pagination and prefix validation.
5. Verify that the table is absent and the matching R2 key count is zero.

The repository change will include the forward migration and a one-time,
dry-run-by-default operational purge command. The command will require an explicit
execute flag and bucket selection, paginate the bucket listing, filter each key
against the two complete shapes above, print counts before deletion, and verify
zero matches afterward. It remains as an auditable migration artifact rather than
runtime feature code. Running remote deployment or cleanup is reported separately
from implementing the repository change; no remote mutation is implied by a local
test run.

### 5. Remove current documentation and test contracts

Delete tests that exist solely for custom lesson creation, editing, generation,
persistence, loading, and playback. Selectively rewrite mixed route, recording,
authorization, schema, deletion, build-info, lifecycle, and browser tests around
the smaller built-in-only contract.

Update current README and design documentation so they no longer advertise My
Lessons, custom lesson generation, device-speech exceptions for custom lessons,
or the removed API and table. Historical migrations and superseded git history
remain as lineage rather than being rewritten.

## Error and compatibility behavior

- Removed browser routes follow the existing unknown-route behavior.
- Removed API routes return the existing not-found response and cannot mutate
  retained data.
- Built-in lesson recording failures keep their existing visible and retryable
  behavior.
- The R2 purge ignores and never deletes a listed key outside the two validated
  custom-recording shapes, and aborts if pagination fails to advance.
- D1 and R2 cleanup are verified independently because neither storage system can
  transactionally delete the other.

## Testing strategy

Behavior changes follow red-green-refactor. First adjust route, dashboard, shelf,
worker-routing, recording, schema, and build-info tests to require the absence of
the custom-lesson surface. Then delete feature-only suites and implementation.

Focused checks will prove that:

- only built-in lesson routes and cards remain;
- former custom lesson browser and API paths cannot reach feature code;
- the recording client and worker reject a `my` source while built-in uploads
  still work;
- generator model and rate-limit configuration are absent;
- the forward migration removes `learner_lesson` from upgraded and fresh test
  databases;
- exact R2 selection cannot touch built-in recordings or unrelated bucket data;
- account, learner, story-art, dubbing, and built-in lesson behavior remains
  intact.

The final gate is the complete unit/worker suite, type checking and production
build, lint, `npm run test:browser`, migration verification, and a dead-reference
scan across live source, tests, configuration, and current documentation.

## Non-goals

- Do not redesign or replace custom lessons in this change.
- Do not remove personalized story art or its shared R2 bucket.
- Do not remove learner-level lesson recording consent or built-in recordings.
- Do not rewrite or renumber historical migrations.
- Do not add a feature flag, compatibility facade, replacement dependency, or
  reusable framework for a feature that no longer exists.

## Risks and mitigations

- **Irreversible family-data deletion:** the user explicitly approved deletion;
  resolve and count exact targets before mutation, use exact prefixes, and verify
  afterward.
- **Shared recording regression:** remove only `my` branches and retain focused
  built-in upload, consent, fencing, and deletion coverage.
- **Migration/deployment ordering:** deploy the worker removal before dropping the
  table; document and verify the order.
- **Shared-bucket over-deletion:** match the complete `/lesson-recordings/my/`
  path segment, validate every listed key, and never delete by the broader
  learner or account prefix.
- **Large deletion diff:** divide implementation into independently testable
  frontend, backend, recording/schema, documentation, and cleanup slices before
  running whole-repository verification.
