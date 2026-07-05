import { emptyLedgerText } from './serialize.js';

/**
 * Pure planner for `dejavu init`: given what already exists, return the file
 * operations needed. Idempotent by construction — existing files are never
 * touched, missing pieces are filled in individually.
 */

export interface FileOp {
  /** Repo-relative path. */
  path: string;
  content: string;
}

export interface InitState {
  hasLedger: boolean;
  hasIndex: boolean;
  hasDejavuGitignore: boolean;
}

export const DEJAVU_GITIGNORE = `# DejaVu local state — never commit these.
queue.jsonl
mined.json
backup/
`;

export function initPlan(state: InitState): FileOp[] {
  const ops: FileOp[] = [];
  if (!state.hasLedger) {
    ops.push({ path: 'DECISIONS.md', content: emptyLedgerText() });
  }
  if (!state.hasDejavuGitignore) {
    ops.push({ path: '.dejavu/.gitignore', content: DEJAVU_GITIGNORE });
  }
  // index.json is written by the caller via the indexer (it embeds a timestamp),
  // signalled here by path only.
  if (!state.hasIndex) {
    ops.push({ path: '.dejavu/index.json', content: '' });
  }
  return ops;
}
