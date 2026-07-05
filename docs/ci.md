# DejaVu in CI

The GitHub Action runs on repos built with **any** tool — including web platforms
(Lovable, Replit, Bolt) that push to GitHub. The repo carries `DECISIONS.md`, so
CI is the one place every workflow converges.

## Quick start

```yaml
# .github/workflows/dejavu.yml
name: dejavu
on: [pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - uses: HMAKT99/Dejavu@v0   # or: run `npx dejavu-dev check --all` directly
        with:
          strict: false          # warn-first; flip to true when the team is ready
          scope: all
```

## What it checks

1. `dejavu check` — code that contradicts an active decision (`detect:` patterns
   scoped by `applies_to:` globs) and functions that re-implement existing ones.
2. `dejavu project --check` — agent context files (CLAUDE.md, AGENTS.md,
   .cursorrules) whose managed block is stale relative to `DECISIONS.md`.

Both are warn-first by default. `strict: true` makes findings fail the job.
