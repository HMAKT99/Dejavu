# Changelog

## 0.1.0 — unreleased

Initial release.

- **Ledger**: `DECISIONS.md` decision format (tolerant parser, canonical
  serializer, supersede semantics, derived `.dejavu/index.json`); atomic
  writes with backup and a self-check gate that refuses any write that would
  lose a decision ID
- **Capture**: `dejavu remember` (context/rule/applies-to/detect/supersedes,
  `--global` machine layer, `--queue`), `dejavu mine` (Claude Code + OpenClaw
  transcript heuristics, `#decision:` comment harvesting, fingerprint store so
  rejections never resurface), `dejavu review` TUI with confidence + evidence
- **Inject**: `dejavu project` managed blocks for Claude Code (CLAUDE.md +
  CLAUDE.local.md), AGENTS.md, Cursor (.cursorrules), OpenClaw (MEMORY.md);
  byte-exact reversibility (`--remove`), CI staleness gate (`--check`);
  machine-level prefs only ever land in gitignored local files
- **Enforce**: `dejavu check` (contradiction detection via `detect:` regexes
  scoped by `applies_to:` globs + duplication radar for JS/TS/Python with
  exact-copy fast path), `dejavu score` (0–100 + grade + local SVG badge),
  warn-first pre-commit hook, GitHub Action; <1s on a 50k-LOC repo
- **Serve**: `dejavu serve` MCP server — `search_decisions`, `get_decision`,
  `check_against_decisions`, `list_active_decisions`
- **Config**: `.dejavu/config.json` `exclude` globs for repos with intentional
  duplication (templates, fixtures)
