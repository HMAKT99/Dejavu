# Write an adapter in 40 lines

An adapter teaches DejaVu to speak one tool's context format. The managed-block
engine, renderer, and safety guarantees are shared — an adapter is a small data
object plus a fixture folder.

## 1. The adapter (~15 lines)

```ts
// src/adapters/windsurf.ts
import type { ProjectionAdapter } from './types.js';

export const windsurf: ProjectionAdapter = {
  name: 'windsurf',
  displayName: 'Windsurf (.windsurfrules)',
  detect: (repoFiles) => repoFiles.includes('.windsurfrules') || repoFiles.includes('.windsurf'),
  projectTarget: () => '.windsurfrules',
  // localTarget: only if the tool has an UNCOMMITTED per-user context file.
  // readSessions: only if the tool keeps local transcripts worth mining.
};
```

Register it in `src/adapters/registry.ts`.

### The contract

- `detect(repoFiles)` — pure predicate over the repo-root file listing. No fs.
- `projectTarget(repoFiles)` — repo-relative path of the **committed** context file.
- `localTarget` — set ONLY if the tool auto-loads an uncommitted per-user file
  (like `CLAUDE.local.md`). This is where machine-level (`G-`) preferences go;
  DejaVu guarantees gitignore coverage before writing. Never point this at a
  committed file — tests will fail, by design.
- `readSessions(machineHome)` — optional, for Milestone-4-style mining.

## 2. Golden fixtures (~the other 25 lines)

Create `testdata/windsurf/fresh/ledger.md` (copy one from another tool's
`fresh/` case). Run:

```bash
UPDATE_GOLDEN=1 npm test
```

This generates `expected.windsurfrules`. Review it, commit it. The golden
driver in `tests/adapters.test.ts` picks up the folder automatically — no test
code to write. Add an `existing-content` case (an `input.<target>` file with
user content) if the tool's files commonly have hand-written content.

## 3. Checklist for the PR

- [ ] `detect` matches how the tool actually marks a repo (config file or dir)
- [ ] `npm test` green, goldens reviewed
- [ ] One line in the README tool table
