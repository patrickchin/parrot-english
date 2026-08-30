# Task 1 Report: Authored Phrase Duration Authority

## Implementation summary

Added `getDubLineMusicPhrase`, the canonical resolver for mapping a canonical `DubLine` to its authored `DubMelodyPhrase`. It supports whole-song phrase inventories and repeating scene-line phrase inventories, rejects non-canonical line objects, and rejects invalid phrase counts. Added the required catalog coverage and identity assertions.

## TDD RED

Command:

```bash
node --test tests/dub-catalog.test.mjs
```

Expected failure:

```text
SyntaxError: The requested module '../src/dubbing/rhyme-catalog.ts' does not provide an export named 'getDubLineMusicPhrase'
```

Cause: the behavior test imported the new resolver before the production export existed.

## GREEN

Command:

```bash
node --test tests/dub-catalog.test.mjs
```

Result: 8 tests passed, 0 failed.

Additional verification:

```bash
npm run typecheck --if-present
```

Result: exit 0 (no typecheck script was configured, so npm completed without output).

Full suite:

```bash
npm test
```

Result: 1492 tests passed, 0 failed.

## Files changed

- `src/dubbing/rhyme-catalog.ts`
- `tests/dub-catalog.test.mjs`

## Commit

`7344eb452d9652a69e6c791c38ebf2153fd59a3c` — `refactor: derive dub timing from melody phrases` (the report-only amend follows this implementation commit).

## Self-review

- Resolver uses object identity through `definition.lines.indexOf(line)` as required by the canonical-line contract.
- Phrase selection handles both supported inventory shapes and fails closed for all other counts.
- Returned phrases are existing authored objects from `definition.music.linePhrases`; no timing is synthesized.
- `git diff --check` passes.

## Concerns

None. The full test suite completed without lifecycle timing flakes.
