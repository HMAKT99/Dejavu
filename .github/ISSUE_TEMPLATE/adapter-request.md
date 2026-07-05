---
name: Adapter request
about: Ask for (or offer to build) support for another AI coding tool
title: "Adapter: <tool name>"
labels: adapter, good first issue
---

**Tool:**

**Committed context file it reads** (e.g. `.windsurfrules`, `GEMINI.md`):

**How to detect the tool in a repo** (config file / directory that marks it):

**Does it have an UNCOMMITTED per-user context file?** (like `CLAUDE.local.md`)

**Does it keep local session transcripts worth mining?** (path + format if known)

Building it yourself? [docs/adapters.md](../../docs/adapters.md) — it's ~40
lines including the test fixture, and the golden driver does the rest.
