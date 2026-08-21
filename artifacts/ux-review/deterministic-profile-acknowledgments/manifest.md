# Deterministic profile acknowledgment visual evidence

Captured: 2026-08-22  
Branch: `codex/deterministic-profile-acknowledgments`  
Route fixture: `/profile/setup?parrotE2eProfile=acknowledgment`  
Tool: in-app Browser against the mounted Vite application

| File | Purpose | SHA-256 |
| --- | --- | --- |
| [280x568-thank-you.jpg](./280x568-thank-you.jpg) | Ultra-narrow phone selected state | `e427f6cf717c3d3e6fcde4a4494df65ab30d9bb8e5b09801d20bed77b87ea41f` |
| [390x844-thank-you.jpg](./390x844-thank-you.jpg) | Regular phone selected state | `9a8692fe5d8d49f0d29d3a1a3b4f6c158f5f26297bde0eaa8164ed9c54e23071` |
| [640x360-thank-you.jpg](./640x360-thank-you.jpg) | Short-landscape selected state | `55c1d08ffd3c89a5f28ce7dfc42c4f9e180ea610c34f517de6ca6d12aa97b131` |
| [1440x900-thank-you.jpg](./1440x900-thank-you.jpg) | Desktop selected state | `57a6d696e013048eee0f66bc14bd595d33f97787ec08543ff51edc2efeff0c6e` |
| [280x568-legacy-long-guard.jpg](./280x568-legacy-long-guard.jpg) | Retained 160-character defensive fixture for density comparison | `4d6a78a4dab0fba5f5f49eb5fdf2901c1508e26a6a25a60cbe40cdc761d01da6` |

All selected-state captures show the exact reviewed phrase `Thank you!`, Peppa's
happy state, one explicit Next action, and the programmatic heading-focus cue.
The comparison capture is not allowed current server output; it records why the
legacy rendering guard remains useful.
