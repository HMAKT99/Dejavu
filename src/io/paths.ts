import { promises as fs } from 'node:fs';
import path from 'node:path';

/** Repo path layout + repo-root discovery. */

export interface RepoPaths {
  root: string;
  ledger: string;
  dejavuDir: string;
  index: string;
  queue: string;
  backupDir: string;
  dejavuGitignore: string;
}

export function repoPaths(root: string): RepoPaths {
  const dejavuDir = path.join(root, '.dejavu');
  return {
    root,
    ledger: path.join(root, 'DECISIONS.md'),
    dejavuDir,
    index: path.join(dejavuDir, 'index.json'),
    queue: path.join(dejavuDir, 'queue.jsonl'),
    backupDir: path.join(dejavuDir, 'backup'),
    dejavuGitignore: path.join(dejavuDir, '.gitignore'),
  };
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Walk up from `cwd` looking for an existing DECISIONS.md or .dejavu/ (an
 * initialized repo), falling back to the nearest .git directory, falling back
 * to `cwd` itself (for `dejavu init` in a bare directory).
 */
export async function findRepoRoot(cwd: string): Promise<string> {
  let gitRoot: string | null = null;
  let dir = path.resolve(cwd);
  for (;;) {
    if (
      (await exists(path.join(dir, 'DECISIONS.md'))) ||
      (await exists(path.join(dir, '.dejavu')))
    ) {
      return dir;
    }
    if (gitRoot === null && (await exists(path.join(dir, '.git')))) {
      gitRoot = dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return gitRoot ?? path.resolve(cwd);
}
