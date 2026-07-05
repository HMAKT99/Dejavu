# DejaVu

[![CI](https://github.com/HMAKT99/Dejavu/actions/workflows/ci.yml/badge.svg)](https://github.com/HMAKT99/Dejavu/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/dejavu-dev?color=a371f7&label=npm)](https://www.npmjs.com/package/dejavu-dev)
[![node](https://img.shields.io/node/v/dejavu-dev?color=3fb950)](https://github.com/HMAKT99/Dejavu#quick-start)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)

**Your AI already wrote this.** DejaVu gives your codebase a memory that every coding agent shares — and none can ignore.

```
⚠ duplicate  lib/helpers.ts:4
  makeUrlSlug() looks 98% like slugify() in utils/text.ts:2
  your AI already wrote this — reuse it instead
```

Every AI coding session starts fresh. The decision to use Supabase RLS instead of API-layer auth was made three weeks ago, in a different tool, and is now invisible — so today's session quietly contradicts it and rewrites `slugify()` for the fourth time. AI-assisted codebases accumulate duplication at up to **8x** the rate of hand-written ones, and tech debt compounds until the **Spaghetti Point** at ~month 3, where adding features starts breaking existing ones.

**Month 3 is where vibecoded projects go to die. DejaVu is how yours survives it.**

![DejaVu in 15 seconds: init, remember a decision, check catches a duplicate](docs/media/install.gif)

<sub>15-second walkthrough — [MP4 version](docs/media/install.mp4) · rendered from [`video/`](video/) with Remotion</sub>

## What it does

1. **Capture** — mines decisions from your Claude Code / OpenClaw session transcripts (heuristics, no LLM needed), harvests `#decision:` code comments, and takes `dejavu remember` for everything else. Every candidate goes through your review queue — nothing lands without your approval.
2. **Inject** — projects active decisions into every agent's context via managed blocks in `CLAUDE.md`, `AGENTS.md`, `.cursorrules`, OpenClaw `MEMORY.md` — and serves them over **MCP** to any agent that asks. Decisions survive tool-switching.
3. **Enforce** — `dejavu check` flags code that contradicts a past decision or re-implements something that already exists. Runs as a CLI, a pre-commit hook, a GitHub Action, or a real-time agent hook. Warn-first; `--strict` when you mean it.

Mental model: **git for code, DejaVu for the *why*.**

## Quick start

```bash
cd your-project
npx dejavu-dev init                # DECISIONS.md + .dejavu/ (+ optional pre-commit hook)
npx dejavu-dev mine                # harvest decisions from your past Claude Code sessions
npx dejavu-dev review              # approve / edit / reject each candidate
npx dejavu-dev project             # push decisions into CLAUDE.md, .cursorrules, ...
npx dejavu-dev check               # "did my last change contradict or duplicate anything?"
npx dejavu-dev score               # 0-100 repo health, letter grade, shareable badge
```

Try it on the included wreck: [`examples/spaghetti-app`](examples/spaghetti-app) — a month-3 fixture with a planted contradiction and two AI-rewritten duplicates.

## Why not …?

| | ADR tools (AgDR, adr-agent) | PR review bots (Qodo, CodeAnt) | Agent memory (Mem0, Cipher) | **DejaVu** |
|---|---|---|---|---|
| Automatic capture from sessions | ✗ (human discipline) | ✗ | ~ (facts, not decisions) | ✔ |
| Works across every tool | ~ (docs only) | ✗ (their platform) | ✗ (per-framework) | ✔ (files + MCP) |
| Enforcement against code | ✗ | ✔ (PR time, cloud) | ✗ | ✔ (local, pre-commit) |
| Fully local | ✔ | ✗ | ~ | ✔ |
| Free | ✔ | ✗ (enterprise seats) | ~ | ✔ (Apache-2.0) |

ADR tools validated the problem but require the discipline that vibecoding removed. Review bots catch drift — at PR time, in the cloud, per seat. Memory tools store preferences, not decisions, and check nothing. DejaVu is the unclaimed combination: **capture + inject + enforce, local and free.**

And the two-layer design is the part that travels: repo decisions live in `DECISIONS.md` **committed to git** — a collaborator's Cursor respects decisions your Claude Code made even if they never install DejaVu, because the repo itself is the export format. Your personal preferences live in `~/.dejavu/` and are **never** committed (enforced in code, proven by tests — including `git check-ignore`).

## The decision format

```markdown
## D-014: Use Supabase RLS for authorization (not API-layer checks)
- date: 2026-07-04 · source: claude-code session · status: active
- context: single-tenant app, auth bugs from duplicated API checks
- rule: all authorization goes through RLS policies; no manual user_id filtering in API routes
- applies_to: src/api/**
- detect: user_id\s*===?
- supersedes: D-006
```

Plain markdown, fully useful with zero tooling. `applies_to:` globs and `detect:` regexes make a decision *enforceable*. Changing your mind appends a superseding entry — history is the value. `.dejavu/index.json` is a derived cache, always regenerable; **markdown is the source of truth**.

## Commands

| Command | What it does |
|---|---|
| `dejavu init` | Set up a repo (idempotent); offers the pre-commit hook |
| `dejavu remember "<title>"` | Record a decision: `--context`, `--rule`, `--applies-to`, `--detect`, `--supersedes`, `--queue`, `--global` |
| `dejavu mine` | Harvest sessions + `#decision:` comments into the queue (`--source`, `--dry-run`, `--limit`) |
| `dejavu review` | Approve / edit / reject queued candidates (TUI, shows confidence + evidence) |
| `dejavu project` | Update managed blocks in agent context files (`--to`, `--all`, `--check`, `--remove`) |
| `dejavu check [files]` | Contradictions + duplication on changed files (`--staged`, `--all`, `--strict`) |
| `dejavu score` | Repo health 0–100 + grade (`--json`, `--badge` → local SVG) |
| `dejavu hooks install` | Pre-commit hook — warns by default, `--strict` blocks |
| `dejavu serve` | MCP server: `search_decisions`, `get_decision`, `check_against_decisions` ([docs/mcp.md](docs/mcp.md)) |

**CI:** the [GitHub Action](docs/ci.md) runs `check` + projection staleness on any repo — including ones built entirely on web platforms (Lovable, Replit, Bolt), since the repo carries the ledger.

## Configuration

Repos with *intentional* duplication (scaffolding templates, fixtures) can exclude paths from `check`/`score` via `.dejavu/config.json`:

```json
{ "exclude": ["cli/template/**", "fixtures/**"] }
```

## Performance

`dejavu check` and `dejavu score` complete in **under 1 second on a 50k-LOC repo** (~2,400 functions) — measured, not aspirational. Pre-commit tolerance was the design budget (3s); heuristic extraction + normalized-token shingles with an inverted index get there without embeddings, AST parsers, or the network.

## Non-goals (v0.1)

No cloud, no accounts, no telemetry, no embeddings/vector DB, no full AST analysis (heuristics that catch the common 80% beat perfect analysis that ships never), no PR review comments (that lane is taken). Windows: the full test suite passes natively in CI (experimental); WSL remains the recommended path.

## Contributing

The highest-leverage PR is a ~40-line adapter for your tool: [docs/adapters.md](docs/adapters.md). Golden-file tests make adapter PRs trivially verifiable — add a fixture folder, run `UPDATE_GOLDEN=1 npm test`, review the diff. Mining heuristics PRs are gated by the precision table in `tests/heuristics.test.ts`: new patterns must not fire on the noise set.

```bash
npm install && npm test       # 200+ tests: golden files, generative round-trips, injected fs failures
npm run typecheck && npm run lint
npm run build                 # tsup → dist/cli.js (what npx runs)
npm run build:bin             # bun build --compile → single executable
```

## License

Apache-2.0
