import type { Ledger } from '../core/types.js';

/**
 * A projection adapter teaches DejaVu how to speak one tool's context format
 * (CLAUDE.md, AGENTS.md, .cursorrules, ...). Implemented in Milestone 2;
 * the interface is fixed now so testdata/<tool>/ golden tests and community
 * adapters have a stable shape. One file per adapter, ~40 lines.
 */
export interface ProjectionAdapter {
  /** Stable adapter name, e.g. "claude-code", "cursor". */
  name: string;
  /** Does this tool appear to be used in the repo at `repoRoot`? Pure check over a file listing. */
  detect(repoFiles: string[]): boolean;
  /** Path (repo-relative) of the context file this adapter manages. */
  projectTarget(repoFiles: string[]): string;
  /** Render the managed block content for this tool from the ledger. */
  render(ledger: Ledger): string;
  /** Optional (Milestone 4): where this tool keeps session transcripts, for mining. */
  readSessions?(machineHome: string): Promise<string[]>;
}
