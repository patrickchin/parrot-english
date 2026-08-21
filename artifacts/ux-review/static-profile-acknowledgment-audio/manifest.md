# Saved profile acknowledgment audio evidence

Captured: 2026-08-22
Branch: `codex/static-profile-acknowledgment-audio`
Route fixture: `/profile/setup?parrotE2eProfile=acknowledgment`
Tool: in-app Browser against the mounted Vite application

## Provenance

- Baseline dependency: `codex/deterministic-profile-acknowledgments` at
  `a94fc9c`.
- The captures came from the implementation worktree based on research commit
  `a7f6cd7`. The accepted product change was frozen at `41bb210`; the
  post-capture compatibility correction only broadened the invalid optional
  media guard and did not change the valid fixture's DOM, classes, or layout.
- The route used the repository's opt-in deterministic E2E session/API fixture.
  No production account, profile answer, microphone, or child data was used.
- Each viewport was explicitly overridden. The images are genuine baseline
  JPEGs, and their pixel dimensions and SHA-256 digests were rechecked after
  capture.

| File | Purpose | SHA-256 |
| --- | --- | --- |
| [saved-audio-390x844.jpg](./saved-audio-390x844.jpg) | Phone confirmation state while the saved-audio descriptor is present | `88af858a236bb5a0409ee554872e785d5b306358b677d5d05e10a8b459675ad1` |
| [saved-audio-640x360.jpg](./saved-audio-640x360.jpg) | Short-landscape confirmation state while the saved-audio descriptor is present | `a06ec4abf775dd13a0516fb2b3d1488346c18dd7b092d5dfa02eaf30aad2850f` |

Both captures show the exact `Thank you!` heading focused, a visible enabled
Next action, main scroll origin at zero, and zero horizontal overflow. The
rendered layout is intentionally unchanged from the preceding deterministic-copy
branch.

The captures show no audio-loading treatment, but do not establish when the
state appeared relative to media loading or any media outcome. They also do not
prove that media played, that physical sound was produced, or that a child
heard or understood it. The focused Chromium contract separately verifies the
exact static source, pending-playback cancellation, absence of
base64/object-URL work, and native media metadata loading.

Post-capture verification passed 88/88 focused Node tests, 677/677 full Node
and lifecycle tests, 8/8 focused Chromium tests, 238/238 full responsive
Chromium tests, the production build, lint with zero errors and two generated
warnings, and `git diff --check`.
