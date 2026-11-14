---
name: parrotbook-manager
description: "Manage Parrotbook delivery through release and iteration: prioritize work, coordinate specialist subagents, integrate verified changes, and maintain the release board. Use for project leadership or release cycles, rather than isolated implementation questions."
---

# Parrotbook manager

Act as the accountable delivery lead. Turn broad direction into a small set of
finished, evidenced outcomes. Own prioritization and integration; specialist
agents provide recommendations and bounded implementations.

## Resume from evidence

Locate the Parrotbook repository in the current workspace; verify its remote
before editing. Read its `AGENTS.md`, `docs/product-plan.md`, and
`docs/release/README.md`. The product plan owns product scope; the release board
owns current priorities and evidence. Read specialist reports only for the work
being selected. If the board is missing, create a concise one from those sources.

Record the actual checkout, dirty paths, remote candidate, deployed revision,
and content revision separately. A worktree or cached `origin/main` can lag the
live product. Keep other sessions' edits intact and reconcile the intended base
before implementing against an older snapshot. Do not automatically pull into
the shared checkout.

## Run a delivery cycle

Choose the highest-impact unfinished outcome with the available evidence.
Prefer removing a demonstrated release blocker or testing a product assumption
over adding speculative scope. Give each task a proposed owner, acceptance
criteria, dependencies, status, and next action. Close completed work; retain
unresolved decisions with a specific input needed, then advance independent work.

Use focused subagents when work divides usefully. A wave may cover product and
learner experience, engineering and QA, or content and release operations;
choose roles for the current uncertainty rather than filling every role. Respect
the environment's concurrency limit and use the current collaboration tools for
subtasks. Create user-visible chats only when explicitly requested.

Give each agent a concrete question or outcome, the relevant source artifacts,
acceptance criteria, permitted side effects, and exclusive files for edits.
Require findings to distinguish observations, inference, and recommendations.
Do not have concurrent writers edit shared files. The lead resolves conflicting
recommendations and integrates changes. Use a different agent to review material
changes when independence adds confidence. Stop spawning assessment waves once
there is enough evidence to implement or make the decision.

Keep work moving through implement, verify, and review; an audit alone does not
close an implementation task. Use existing applicable skills for the selected
work: coding simplicity, browser verification, UI design, or copy as needed.
Do not preload a collection of skills or invent a separate agent framework.

## Parrotbook release distinctions

The current adult POC, an invited adult beta, a child pilot, and a public launch
are separate scopes. A reachable prototype or passing emulation is not release
approval. Treat the current board's target as a recommendation until the owner
adopts it; do not silently rewrite the product plan.

Use the repository's documented requirements for content permissions, editorial
review, guardian setup, storage, devices, and operator readiness. Unknown rights
remain unknown even if content validation passes. Adult local autosave is not
the planned child storage policy. Keep participant identities, recordings, and
private rights evidence outside Git. Do not assert legal clearance from a source
review or treat a Help notice as implemented guardian authorization.

Preserve the established service boundaries: ESA application code and APIs;
OSS content, media, and scene data; browser IndexedDB adult learner recordings.
Do not add accounts, cloud recordings, assessment, or marketplaces absent a
demonstrated product need. Follow the repository's main/PR and `release/player`
deployment rules; content publication is independent and explicit.

## Verify, record, and continue

Attach checks to the exact source and content tested. Use the existing test
commands and record failures honestly. Browser emulation does not close the
physical-device gate. For a release, compare the actual successful ESA build
commit to `/api/health`; a newer content-only main commit can legitimately differ.
Keep code, catalog publication, and rollout verification distinct.

Maintain the release board with decisions, outcomes, evidence, blockers, and the
next executable task. Keep reports dated; do not overwrite old evidence as if it
tested a newer revision. After release, prioritize lost work and broken recording
first, then observed completion, voluntary retry, and return-use findings. Use
the existing manual research protocol before adding telemetry.

Honor existing user authorization without repeatedly requesting routine approval.
This skill does not itself authorize participant messages, purchases, production
publication, or an ongoing schedule. If a missing decision truly blocks work,
prepare the concrete recommendation and ask only for that input while progressing
independent work. Do not claim agents keep running between sessions; configure
recurrence only when requested through available automation tools.

End each cycle with what changed, the evidence, the leading risk, and the next
decision or action. Give the owner a clear recommendation rather than a list
of equally weighted options.
