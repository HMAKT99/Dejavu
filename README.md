# DejaVu

**Your AI already wrote this.** DejaVu gives your codebase a memory that every coding agent shares — and none can ignore.

Every AI coding session starts fresh. The decision to use Supabase RLS instead of API-layer auth was made three weeks ago, in a different tool, and is now invisible — so today's session quietly contradicts it. Month 3 is where vibecoded projects go to die. DejaVu is how yours survives it.

DejaVu is a local CLI that:

1. **Captures decisions** — manually today (`dejavu remember`), mined automatically from your Claude Code / OpenClaw sessions soon
2. **Projects them** into every agent's context (CLAUDE.md, AGENTS.md, .cursorrules, MCP) so decisions survive tool-switching *(Milestone 2)*
3. **Enforces them** — flags code that contradicts a past decision or re-implements something that already exists *(Milestone 3)*

Think: git for code, **DejaVu for the *why***.

## Status

Early development — Milestone 3 of 5. What works today:

- `DECISIONS.md` ledger: parse, canonical serialize, atomic writes with backup + a self-check gate that structurally cannot lose a decision
- `dejavu init` — set up a repo (idempotent)
- `dejavu remember` — record decisions with context, rules, globs, detection hints; supersede old ones
- `dejavu review` — TUI over a candidate queue (approve / edit / reject / skip)
- `dejavu project` — inject active decisions into CLAUDE.md, AGENTS.md, .cursorrules, and OpenClaw MEMORY.md via managed blocks; auto-refreshed on every ledger change
- `dejavu check` — contradiction detection (`detect:` regex scoped by `applies_to:` globs) + duplication radar (normalized-token similarity, exact-copy fast path; JS/TS/Python). ~0.9s on a 50k-LOC repo. Warn-first; `--strict` to block
- `dejavu score` — 0–100 repo health (duplication %, contradictions, decision hygiene) with a letter grade
- `dejavu hooks install` — pre-commit hook that warns (never blocks, unless `--strict`); refuses to touch hooks it didn't write
- `--global` machine-level context (`~/.dejavu`) with hard layer separation, enforced in code and tests; projected only into gitignored local files (CLAUDE.local.md)

## Quick start

```bash
# not yet on npm — run from a clone:
git clone https://github.com/arunkt/dejavu && cd dejavu
npm install && npm run build && npm link

cd your-project
dejavu init
dejavu remember "Use Supabase RLS for authorization" \
  --context "auth bugs from duplicated API checks" \
  --rule "all authorization goes through RLS policies" \
  --applies-to "src/api/**" \
  --detect "user_id\s*=="
```

That appends to `DECISIONS.md`:

```markdown
## D-001: Use Supabase RLS for authorization
- date: 2026-07-05 · source: manual · status: active
- context: auth bugs from duplicated API checks
- rule: all authorization goes through RLS policies
- applies_to: src/api/**
- detect: user_id\s*==
```

Change your mind later — history stays:

```bash
dejavu remember "RLS plus edge-function checks for admin routes" --supersedes D-001
# D-001 → status: superseded · superseded-by: D-002
```

## How it's designed

**Two storage layers, deliberately split:**

| Layer | Where | Contains | Committed? |
|---|---|---|---|
| Repo | `DECISIONS.md` + `.dejavu/` | project decisions (`D-…`) | yes — memory travels with `git clone` |
| Machine | `~/.dejavu/` | your cross-project prefs (`G-…`) | **never** |

Because the repo layer is committed, a collaborator's Cursor respects decisions your Claude Code made — even if they never installed DejaVu. And because the machine layer never touches the repo, your personal preferences can't leak into a client's codebase. Both rules are enforced in code (`src/io/atomic.ts`) and proven by tests (`tests/machine.test.ts`), not just documented.

**Markdown is the source of truth.** `DECISIONS.md` is fully useful as plain markdown with zero tooling; `.dejavu/index.json` is a derived cache, always regenerable, automatically healed when missing or corrupt. Delete it any time.

**Decisions are append-mostly.** Changing your mind appends a superseding entry and flips exactly two lines on the old one (`status`, `superseded-by`). Context, rule, and body are never rewritten — the history is the value.

## Commands

| Command | What it does |
|---|---|
| `dejavu init` | Create `DECISIONS.md` + `.dejavu/` (idempotent) |
| `dejavu remember "<title>"` | Record a decision. Flags: `--context`, `--rule`, `--applies-to <glob>` (repeatable), `--detect <regex>` (repeatable), `--supersedes <ids>`, `--queue`, `--global` |
| `dejavu review` | Review queued candidates in a TUI: approve / edit / reject / skip |
| `dejavu project` | Inject active decisions into agent context files. Flags: `--to <tool>` (claude-code, agents-md, cursor, openclaw), `--all`, `--check` (CI staleness gate), `--remove` (fully reversible), `--no-global` |
| `dejavu check [files...]` | Check changed code against decisions. Flags: `--staged` (pre-commit), `--all`, `--strict` |
| `dejavu score` | Repo health score with letter grade; `--json` for machines |
| `dejavu hooks install/uninstall` | Manage the pre-commit hook; `install --strict` to make it block |

## Roadmap

- ~~**M2 — Inject**~~: ✅ managed blocks in `CLAUDE.md`, `AGENTS.md`, `.cursorrules`, OpenClaw `MEMORY.md`; an adapter is ~15 lines ([src/adapters/](src/adapters/))
- ~~**M3 — Enforce**~~: ✅ `dejavu check` (contradictions + duplication radar), pre-commit hook, `dejavu score`
- **M4 — Mine**: harvest decision moments from Claude Code / OpenClaw session transcripts into the review queue
- **M5 — Serve**: MCP server (`search_decisions`, `check_against_decisions`), GitHub Action

Non-goals: no cloud, no accounts, no telemetry, no embeddings. Local files, heuristics that catch the common 80%.

## Development

```bash
npm install
npm test              # vitest — golden-file, generative round-trip, destructive-path tests
npm run typecheck     # tsc --noEmit
npm run lint          # biome
npm run build         # tsup → dist/cli.js
npm run build:bin     # bun build --compile → ./dejavu single executable
```

Golden fixtures in `testdata/ledgers/` double as the format spec; regenerate with `UPDATE_GOLDEN=1 npm test` and review the diff.

## License

Apache-2.0
