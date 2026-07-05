/**
 * A projection adapter teaches DejaVu how to reach one tool's context file
 * (CLAUDE.md, AGENTS.md, .cursorrules, ...). Adapters are pure data + a
 * detect predicate — the managed-block engine and renderer are shared, so a
 * community adapter is ~20 lines. Golden tests live in testdata/<name>/.
 */
export interface ProjectionAdapter {
  /** Stable adapter name, e.g. "claude-code", "cursor". */
  name: string;
  /** Human-facing label, e.g. "Claude Code (CLAUDE.md)". */
  displayName: string;
  /** Does this tool appear to be used here? `repoFiles` = repo-root entries. */
  detect(repoFiles: string[]): boolean;
  /** Repo-relative path of the committed context file this adapter manages. */
  projectTarget(repoFiles: string[]): string;
  /**
   * Repo-relative path of an UNCOMMITTED per-user context file, when the tool
   * supports one (e.g. CLAUDE.local.md). This is the only place machine-level
   * (G-) content may be projected — and it must be gitignored.
   */
  localTarget?: string;
  /** Optional (Milestone 4): where this tool keeps session transcripts, for mining. */
  readSessions?(machineHome: string): Promise<string[]>;
}
