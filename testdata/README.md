# Test fixtures

## `ledgers/<case>/`

Golden fixtures for the DECISIONS.md parser/serializer/indexer. Each case dir contains:

- `input.md` — hand-written input (may be messy; that's the point)
- `expected.md` — canonical serializer output for that input
- `expected.index.json` — index built from the parsed ledger (`generatedAt` pinned to `1970-01-01T00:00:00.000Z`)
- `expected.warnings.json` — parse warnings (omit when none)

`tests/roundtrip.test.ts` globs these dirs; add a regression case by adding a folder.
Regenerate expectations with `UPDATE_GOLDEN=1 npm test` and review the git diff —
these files double as the format specification.

## `<tool>/` (reserved)

Adapter golden tests land here in Milestone 2 (`claude-code/`, `cursor/`, ...):
projection input/output pairs so community adapter PRs are trivially verifiable.
