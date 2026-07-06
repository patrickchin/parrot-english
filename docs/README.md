# Parrot English Docs

These docs describe the current product and technical design as of
2026-07-06. They are based on the implemented code, existing specs, and the
prompt history from Codex sessions in this project.

## Design Docs

- [Product Experience](./design/product-experience.md) explains the child-facing
  lesson experience, character roles, state flow, and UX rules.
- [Technical Architecture](./design/technical-architecture.md) explains the app,
  Worker API, lesson state machine, speech evaluation path, and local/dev
  runtime modes.
- [Audio and Content Pipeline](./design/audio-and-content-pipeline.md) explains
  static lesson audio, voice direction, regeneration rules, and why runtime TTS
  is disabled.
- [Codex Session Decision Log](./design/codex-session-decision-log.md) records
  the major decisions that came from the project Codex prompts.

## Related Specs

- [App Home and URL Routing Design](./superpowers/specs/2026-07-06-app-home-and-url-routing-design.md)
  is the approved design for authenticated entry, lesson source namespaces,
  durable scene URLs, browser history, and future-feature skeleton pages.
- [Child Speaking Flow Design](./superpowers/specs/2026-06-27-child-speaking-flow-design.md)
  is the detailed UX spec for repetition, speaking prompts, feedback, and retry
  behavior.
