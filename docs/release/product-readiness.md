# Product release assessment

Historical assessment: the owner subsequently chose software testing with
friends using the current owner-published packs and deferred creator permissions.
The original three-cleared-scene beta proposal below is not a gate on that work;
see the current [release board](README.md) and product-plan update.

Assessed 2026-11-14 against checkout `53f3d594020778c267c3e961b26e3ee4096e1b40`.
This is a source/document assessment, not a new browser, device, rights, or legal
verification. Source references below use repository paths and one-based lines.

## Recommendation

Prepare a small invited **adult** beta first, subject to the owner's audience
decision and the release gates below. This is a recommendation, not an approved
change to the product plan. The long-term product remains independent learning
across ages. The existing adult prototype already implements the core activity;
the missing evidence is whether real learners can complete and repeat it on
their actual phones with content we can distribute.

An invited beta does not resolve the existing permissions or operator questions.
Do not equate the currently reachable site with readiness for wider release.
The plan records 111 internal-test scenes, unconfirmed redistribution rights,
and unverified physical devices (`docs/product-plan.md:32`).

## Implemented and proposed behavior

| Area | Evidence in this checkout | Release implication |
| --- | --- | --- |
| Core activity | Role selection, original playback, per-line practice, record/skip progress, result playback, and edit controls exist (`src/App.tsx:168`, `src/App.tsx:210`; `src/lesson-state.ts:30`). | Evaluate usability and reliability before adding more feature scope. Implementation is not proof of device performance. |
| Discovery | Home directory, collection/series browsing, search, and an editorial featured scene exist (`src/Library.tsx:17`, `src/Library.tsx:46`). Five interface languages are documented (`README.md:29`). | A large catalog is available for internal research, but it is not a cleared release catalog. |
| Local persistence | Autosave is wired into the player (`src/App.tsx:85`); My dubs resumes and individually deletes attempts (`src/app/SavedDubs.tsx:40`, `src/app/SavedDubs.tsx:67`). Starting over preserves old attempts (`docs/product-plan.md:48`). | This is adult POC behavior. It differs from the planned child default of session-only takes and clearing between learners. |
| Export | Result download is enabled after at least one recorded line (`src/App.tsx:213`); generation and download run locally (`src/app/DubDownload.tsx:29`). | Technical export availability does not establish permission to redistribute the underlying scene or dub. |
| Child setup | The plan calls for guardian authorization before the activity (`docs/product-plan.md:110`). Current lesson state has choose/practice/result, with Help/details/reset overlays (`src/lesson-state.ts:5`); the guardian message is in Help (`src/App.tsx:231`, `src/locales/en/translation.json:140`). | A Help notice is not the proposed guardian setup or enforcement. Do not treat the current adult flow as a child release. |
| Privacy and controls | Save statuses/errors, storage warnings, delete confirmation, and no-upload guidance exist (`src/App.tsx:178`, `src/App.tsx:222`; `src/app/SavedDubs.tsx:58`; `src/locales/en/translation.json:139`). | Confirm first-use understanding, shared-device expectations, and deletion on hardware. No new account or recording upload is needed for initial learning. |
| Deployment and devices | ESA code and OSS media/content boundaries are documented (`README.md:99`). Test documentation explicitly excludes proof of real phones, WeChat, Bluetooth, and mainland network behavior (`docs/testing.md:95`). | Require an actual device/network evidence sheet; browser emulation cannot close this gate. |

## Distinct release targets

| Target | What is closest today | Evidence still needed before that target |
| --- | --- | --- |
| Invited adult beta | Existing local recording, saving, replay, and export match the documented adult POC. | Owner selects audience/devices; usable permitted content set; recorded hardware/network results; visible tester expectations and support route; reviewed operator/release scope. |
| Child pilot | The core dubbing interaction is reusable and the plan proposes three short starter scenes. | Guardian setup and child storage/save/export policy implemented and verified; suitable cleared scenes; operator/classification review recorded by the responsible people; agreed learner age/level and observed independent use. See `docs/product-plan.md:284` and `docs/product-plan.md:319`. |
| Public launch | A deployed prototype and content publication workflow already exist. | A reviewed release catalog and usage terms, verified delivery/support/removal process, operator readiness, repeat-use evidence, and scope-specific review. Any child audience also requires the child gates. No subscriptions or public community hosting are implied. See `docs/product-plan.md:132`, `docs/product-plan.md:183`, and `docs/product-plan.md:307`. |

These distinctions report the repository's planned requirements; they are not
an independent legal opinion or current verification of external requirements.

## Five priorities, in order

1. **Choose one beta audience and supported entry path.** Proposed owner: founder
   with product lead preparing the decision. Acceptance: a short decision names
   adult versus child scope, English level, primary phone/OS/browser, whether
   WeChat entry is expected, permitted geography, beta size, and what export/save
   behavior testers should expect. Do not promise a release date until the
   content and device dependencies are estimated. The unresolved device/audience
   choices already appear in `docs/product-plan.md:346`.
2. **Produce a small release-eligible content set.** Proposed owner: content lead;
   founder supplies rights-holder/operator decisions. Acceptance: three scenes
   have documented permitted use for the chosen audience/territory and export
   policy; complete source exchanges, speaker identities, cuts, captions,
   Chinese hints, and content guidance have a human review record. No unresolved
   catalog entries silently become release entries. This follows the existing
   three-scene direction (`docs/product-plan.md:155`, `docs/product-plan.md:169`)
   without assuming the current 111 scenes are eligible.
3. **Prove the complete loop on real phones.** Proposed owner: QA lead coordinating
   device holders. Acceptance: each supported device records and re-records,
   stops immediately, replays in sync, survives reload/resume, deletes a dub,
   handles denied permission and interruption, and downloads/reopens an MP4 if
   export is in scope. Record browser/OS, audio output, network, build revision,
   scene revision, date, and observed result. Close each blocking failure or
   explicitly narrow support before inviting testers (`docs/testing.md:95`).
4. **Make the selected release promise clear before recording.** Proposed owner:
   product/engineering lead. Acceptance for an adult beta: testers can identify
   its adult test scope, on-device saving, site-data-loss risk, delete path,
   supported browsers, export restrictions, and contact route without relying
   on a verbal briefing. Verify comprehension with the first observed testers.
   If the owner chooses children instead, implement the planned guardian and
   session-only defaults before recruitment; do not reuse adult persistence by
   default (`docs/product-plan.md:293`).
5. **Run an observed beta and use the result to choose the next investment.**
   Proposed owner: product lead; founder recruits and contacts participants.
   Acceptance: one small cohort completes the protocol below; every technical
   blocker has a reproducible issue or a documented inability to reproduce;
   aggregate completion/retry/return counts and qualitative reasons lead to an
   explicit continue/fix/pause decision. More catalog, accounts, scoring, and
   marketplace work wait for demonstrated demand (`docs/product-plan.md:360`).

## Minimal beta protocol and measurement

For the recommended adult beta, propose 5–8 invited adults first. This is a
diagnostic cohort, not the plan's later proposed 10–20-learner child pilot or a
claim of statistical significance. Recruit only after the target's gates close.
Keep invitation delivery and participant contact with the founder; this report
does not authorize sending messages.

Use an existing founder-held private note or document. Assign opaque random
`tst_…` labels; store any contact mapping separately from observations and outside
Git. Explain what notes are kept and agree a short retention period before
testing. Do not request names, voice files, screen recordings, account creation,
or analytics uploads. Use aggregate results in repository release notes.

Give a tester only: “Choose a short scene, record a role, and watch your dub.”
Ask them to say when they are stuck. An observer notes assistance without
coaching first; stop to help if the participant wants it. After the natural first
attempt, separately ask them to resume after reload and find deletion. Test
export only for a scene cleared for that use. Tell testers not to upload exports
unless the scene's terms permit it.

| Measure | Count and interpretation |
| --- | --- |
| Independent completion | Report `x/n` starters reaching replay with at least one recorded line without step-by-step help. Also report how many recorded all role lines; the app can reach result after skipping lines (`src/lesson-state.ts:41`). Permission or media failures remain in the denominator. |
| Voluntary engagement | Report `x/n` starters who voluntarily re-record a line or choose a second scene before being prompted. Separate voluntary behavior from requested verification tasks. |
| Return | Once, about seven days later, ask whether they returned without a reminder and why. Report returned/responded/invited counts separately; missing replies are unknown. No tracking beacon is needed. |
| Reliability | Count sessions blocked, work lost, permission failures, replay sync complaints, save failures, and export failures, with device and reproduction steps. Treat work loss or privacy-control failures as blockers regardless of cohort averages. |
| Demand | Ask “What would you use this for?”, “What made you stop?”, and “Would you choose to use it again?” Ask willingness to pay as a research question; do not add billing. |

Carry the plan's **hypotheses**, not validated promises, into evaluation: at least
80% independently finish a short scene, at least half voluntarily retry or choose
another scene, and at least half return within a week (`docs/product-plan.md:331`).
With 5–8 people, show raw counts and reasons alongside percentages. Successful
usability does not establish English-learning efficacy. Reassess the threshold
and protocol for any later child cohort rather than transferring adult results.

After the cohort: fix blockers first; if completion is strong but return is weak,
investigate scene appeal and repeat-use needs before expanding infrastructure.
If the primary entry surface cannot reliably record, use the product plan's
platform decision rather than accumulating browser workarounds
(`docs/product-plan.md:274`).

## Browser verification appendix — 2026-11-14

Ran the existing `PLAYWRIGHT_PORT=15317 npm run test:browser` against this
checkout, with development/preview servers on 15317/15319. The first sandboxed
attempt failed before testing with `listen EPERM`; an approved escalation then
started the suite. Browsers and dependencies were available; no installation,
runtime, fixture, or configuration changes were made for this run.

The coordinator requested a graceful stop after repeatable assertion failures
were established. Playwright's final summary after SIGINT (exit 130) was:

| Result | Count |
| --- | ---: |
| Selected | 507 |
| Passed | 146 |
| Failed | 4 |
| Interrupted | 2 |
| Did not run | 355 |
| Skipped | 0 |

Elapsed time was 6.0 minutes. **The full browser suite did not complete or pass.**
WebKit and production project results cannot be inferred from this partial run.
The two interrupted mobile cases are not independent failure findings.

The four failures were Chromium assertions:

- `tests/browser/library.spec.ts:107`: after returning from a scene and
  reloading, the test expected 67 list items and found 111.
- Three parameterized cases in `tests/browser/social-memes.spec.ts:8`: after
  navigation, each expected a pressed “Memes & clips” button inside a “Scene
  categories” group, which the rendered page did not contain.

These indicate a test/navigation-contract mismatch requiring review, rather
than evidence that recording itself failed. The coordinator's engineering
review identified stale assertions against the current collection interface;
that diagnosis still needs a reviewed correction and rerun. This executor did
not alter tests to obtain passes.

Passed cases included Chromium recording/re-recording/replay, local export,
save and deletion failure recovery, denied permissions, silent input, history,
language switching, and media stress, plus part of the mobile project. They are
useful baseline evidence, not physical-device or full release verification.

Raw log: `/private/tmp/parrotbook-release-browser.log`. Failure traces and
snapshots were retained under `test-results/`; explicit screenshots used
`~/Pictures/Screenshots/Codex/parrot-english/`. After stopping, no listeners
remained on ports 15317/15319. These temporary artifacts are not durable release
records and may be replaced by later runs; preserve selected evidence if needed.
