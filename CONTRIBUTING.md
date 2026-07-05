# Contributing to DejaVu

Thanks for helping give AI codebases a memory. The two highest-leverage
contributions are **adapters** (support a new tool in ~40 lines) and **mining
heuristics** (catch more decision moments without losing precision).

## Setup

```bash
git clone https://github.com/HMAKT99/Dejavu && cd Dejavu
npm install
npm test            # 200+ tests must stay green
npm run typecheck && npm run lint
```

Node ≥ 20. `npm run build` produces `dist/cli.js` (what `npx dejavu` runs);
`npm link` to try your build on a real repo.

## Adapters

Follow [docs/adapters.md](docs/adapters.md). Short version: one small data
object in `src/adapters/`, one fixture folder in `testdata/<tool>/`, run
`UPDATE_GOLDEN=1 npm test`, review the generated golden, done. The golden
driver picks up your folder automatically.

## Mining heuristics

Add patterns to `src/mining/heuristics.ts`. The bar is **precision over
recall**: your pattern must not fire on anything in the noise table in
`tests/heuristics.test.ts`, and you should extend that table with the
near-misses your pattern skirts past. A polluted review queue kills user
trust faster than a missed decision.

## Ground rules

- **Never touch content outside a managed block.** Corrupting a user's
  CLAUDE.md is a project-killing bug; the tests in `tests/managedBlock.test.ts`
  and `tests/project.test.ts` are the contract.
- **Machine layer never enters the repo.** `tests/machine.test.ts` proves the
  hard rule; changes that weaken it won't merge.
- **Markdown is the source of truth.** `.dejavu/index.json` must always be
  regenerable from `DECISIONS.md`.
- New runtime dependencies need a very good reason (budget: <12, currently 4).
- `dejavu check` must stay under 3s on a 50k-LOC repo (pre-commit tolerance).

## Tests

`npm test` runs golden-file tests, 200-seed generative round-trips,
injected-failure destructive-path tests, and CLI integration in sandboxes.
Regenerate goldens with `UPDATE_GOLDEN=1 npm test` and include the diff in
your PR — goldens double as the format spec.
