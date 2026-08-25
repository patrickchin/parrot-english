# Private Story Preview Design

## Purpose

Provide a production-like Cloudflare test of two user-supplied long-story drafts with saved ElevenLabs narration while ensuring that only the account owner can access the preview. The draft titles, prose, and generated audio must remain outside Git and must never enter the normal production bundle or the pull request.

The test is intentionally limited to reading the stories and playing their audio. The preview may share the production Worker's D1 and R2 bindings, but testing must not exercise account creation, personalized-art generation, or other data-writing flows.

## Chosen Approach

Use a version preview of the existing `parrot-english` Worker and protect preview hostnames with Cloudflare Access. Access will be scoped to **Previews only** and use the **Cloudflare account members** policy. The account currently has one member. Enabling this policy is an external permission change and requires action-time confirmation immediately before it is applied.

Upload the test with `wrangler versions upload`, not `wrangler deploy` and not the repository's production deployment script. A version upload creates a preview without moving production traffic. The normal merge-to-main deployment remains unchanged.

A separate staging Worker with isolated D1 and R2 resources is deliberately out of scope. It would provide stronger data isolation, but adds databases, buckets, secrets, migrations, and lifecycle management that are unnecessary for a read-only story-player test.

## Content Isolation

Private preview inputs live under an ignored local directory. That directory contains:

- a manifest with private story IDs, current titles, and text filenames;
- the two user-supplied text files;
- generated narration MP3 files.

Tracked code refers only to the generic manifest format and directory convention. It must not contain the current titles, prose excerpts, content-derived identifiers, or generated audio.

The feature is fail-closed:

- A normal `npm run build` does not read private inputs and does not copy private audio.
- An explicit private-preview build flag enables the loader.
- A private-preview build fails if the manifest, a referenced story, a required page narration file, or validated metadata is missing or invalid.
- No private preview asset is stored beneath `public/`, because Vite would otherwise copy it into ordinary builds.

The pull request and merge contain only reusable loader, player, generator/build support, tests, documentation, and ignore rules. A production-bundle leak check must prove that the private inputs are absent before the branch can merge.

## Story Parsing and Fidelity

The loader creates a `Long stories` catalog level only when private stories are injected. Each source is validated for safe IDs, bounded title and text size, supported filenames, page count, and word counts.

Page boundaries are added only between existing paragraph or complete-line boundaries. Paragraphs are the units when the source contains blank-line paragraph breaks; otherwise, non-empty complete lines are the units. A deterministic greedy packer adds units to a page until the next unit would exceed 70 words. A single unit over 90 words is rejected instead of split. This keeps pages readable without altering, reordering, deleting, or adding story words or punctuation. A fidelity check compares the normalized source units with the normalized concatenation of all generated pages. The build fails if they differ.

The visible story paragraph and narration input are exactly the supplied page text. The existing `Turn the page!` learner prompt remains a separate piece of player UI and is not included in saved narration. Page separators and newline normalization are structural and are not narrated.

The current draft titles remain solely in the ignored manifest. They can be renamed there before any public release without changing tracked code.

## Narration

Generate one MP3 per parsed page using the existing ElevenLabs pipeline conventions:

- provider: ElevenLabs;
- model: `eleven_v3`;
- role: the existing narrator voice, not a protected-character clone;
- input: the exact page text;
- source files: the ignored private-preview directory.

The generator reuses an existing project-local ElevenLabs credential without copying it into this worktree, logging it, committing it, or creating a new secret. Generation is scoped to the two private stories and reports only IDs/statuses.

Private pages carry a generated audio source path in their injected metadata. Existing built-in stories continue to resolve static audio by ID; their behavior and assets are unchanged. The private build copies only the manifest-referenced MP3 files into `dist`, under a preview-specific asset path. An ordinary build copies none of them.

## Build and Runtime Data Flow

1. Read and validate the ignored manifest and the two text files.
2. Segment each text into pages while proving content fidelity.
3. Generate or verify one narration MP3 for every page.
4. Run the explicit private-preview build, injecting only the validated story metadata and emitting only referenced audio.
5. Assert that the private build contains both stories and every narration asset.
6. Assert separately that a normal production build contains no private title, story identifier, prose marker, manifest data, or preview audio path.
7. Upload the private `dist` as a Worker version preview with a unique tag and preview alias.
8. Test the Access boundary and the signed-in story experience.

The private story metadata is compile-time input. It is not written to D1 or R2 and does not require a database migration.

## Read-only Preview Shell

The explicit private-preview build flag selects a route-limited application shell after Cloudflare Access has authenticated the account owner. That shell exposes only the story shelf, story redirects, and story page routes; all other paths redirect to the `Long stories` shelf. It does not render the app account gate or learner-profile gate, and it disables personalized-story-art loading and controls. This avoids creating a preview-host session or touching shared D1/R2 data during the test.

This bypass exists only in the opted-in private bundle. A normal build keeps the existing account, learner-profile, and application routing behavior unchanged. Because Cloudflare Access is the private preview's sole authentication boundary, Access must be enabled and verified before the preview version is uploaded.

## Errors and Safety Controls

The private build stops with an actionable error for malformed JSON, unsafe paths, duplicate IDs, empty stories, oversized pages, fidelity mismatches, missing audio, or unexpected extra manifest entries. Paths are resolved beneath the ignored preview directory and may not escape it.

The ElevenLabs generator skips existing files unless explicitly forced, so rerunning a partial generation does not incur unnecessary requests. Failed API requests identify the page ID without exposing credentials or story text.

Cloudflare Access must be enabled before the preview URL is shared or used for verification. The upload must use a version-preview command, and the final verification must confirm that production traffic and the production deployment version did not change.

## Verification

Automated verification covers:

- parser validation, path safety, deterministic pagination, and exact content fidelity using synthetic fixtures;
- catalog placement and routing for injected long stories;
- route isolation that exposes only story pages in an opted-in private build while leaving normal application gates unchanged;
- private narration source playback while preserving built-in static-audio behavior;
- failure when required private narration is missing;
- an opted-in private build that includes synthetic private stories and audio;
- a normal production build that excludes all synthetic/private markers and preview audio;
- the existing unit, lint, build, and Playwright suites required by the repository.

Live verification covers:

- an unauthenticated browser is stopped by Cloudflare Access before reaching the app;
- the account owner's authenticated browser can reach the preview;
- both stories appear in `Long stories` under their current private titles;
- every page route loads and page navigation remains contained at narrow and desktop sizes;
- narration requests return successfully and playback advances/stops correctly;
- the public production domain does not contain the private stories or audio;
- the Worker production deployment remains unchanged by the preview upload.

## Git and Release Flow

Implementation starts from the current `origin/main` on a `codex/` feature branch. Existing local draft work is preserved but revised to match this design. Tests are written before implementation changes.

Before opening the pull request, inspect the complete diff and Git object list to ensure that no ignored private input was staged. Run the full verification suite and request an independent code review. The pull request contains generic support only. After required checks and review pass, merge it; the ordinary main build remains inert because the private-preview flag and ignored inputs are absent.

The private story build is then produced locally from the merged support code, uploaded as an Access-protected version preview, and verified end to end. The user can later replace the private text and titles; public release is a separate decision and is not part of this design.
