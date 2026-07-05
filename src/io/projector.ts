import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ProjectionAdapter } from '../adapters/types.js';
import {
  blockIsCurrent,
  hasManagedBlock,
  ManagedBlockError,
  removeManagedBlock,
  upsertManagedBlock,
} from '../core/managedBlock.js';
import { renderGlobalBlock, renderProjectBlock } from '../core/render.js';
import type { Ledger } from '../core/types.js';
import { type WriteContext, writeFileAtomic } from './atomic.js';

/**
 * Projection: writing rendered decision blocks into other tools' context
 * files. Repo decisions go to committed targets (CLAUDE.md, AGENTS.md, ...);
 * machine-level preferences go ONLY to uncommitted local targets
 * (CLAUDE.local.md) after their gitignore coverage is guaranteed.
 */

export type ProjectOutcome = 'created' | 'updated' | 'unchanged' | 'skipped' | 'failed';

export interface ProjectResult {
  adapter: string;
  target: string;
  outcome: ProjectOutcome;
  detail?: string;
}

async function readOrNull(p: string): Promise<string | null> {
  try {
    return await fs.readFile(p, 'utf8');
  } catch {
    return null;
  }
}

async function upsertIntoFile(
  filePath: string,
  content: string,
  ctx: WriteContext,
): Promise<ProjectOutcome> {
  const existing = await readOrNull(filePath);
  if (existing !== null && blockIsCurrent(existing, content)) return 'unchanged';
  const next = upsertManagedBlock(existing ?? '', content);
  await writeFileAtomic(filePath, next, { ctx });
  return existing === null ? 'created' : 'updated';
}

/** Project repo-layer decisions into the adapter's committed target. */
export async function projectRepoLayer(
  repoRoot: string,
  ledger: Ledger,
  adapter: ProjectionAdapter,
  repoFiles: string[],
  ctx: WriteContext,
): Promise<ProjectResult> {
  const rel = adapter.projectTarget(repoFiles);
  const target = path.join(repoRoot, rel);
  try {
    const outcome = await upsertIntoFile(target, renderProjectBlock(ledger), ctx);
    return { adapter: adapter.name, target: rel, outcome };
  } catch (err) {
    if (err instanceof ManagedBlockError) {
      return { adapter: adapter.name, target: rel, outcome: 'failed', detail: err.message };
    }
    throw err;
  }
}

/**
 * Ensure `.gitignore` covers `rel` before any machine-level content lands in
 * the repo tree. Creates or appends as needed; returns false only when the
 * entry could not be guaranteed (in which case the caller must not write).
 */
export async function ensureGitignored(
  repoRoot: string,
  rel: string,
  ctx: WriteContext,
): Promise<boolean> {
  const giPath = path.join(repoRoot, '.gitignore');
  const existing = (await readOrNull(giPath)) ?? '';
  const lines = existing.split('\n').map((l) => l.trim());
  if (lines.includes(rel) || lines.includes(`/${rel}`)) return true;
  const addition = `\n# DejaVu machine-level context — personal, never commit\n${rel}\n`;
  const next =
    existing === '' ? addition.trimStart() : existing.replace(/\n?$/, '\n') + addition.trimStart();
  await writeFileAtomic(giPath, next, { ctx });
  return true;
}

/**
 * Project machine-layer (G-) preferences into the adapter's UNCOMMITTED local
 * target. Refuses adapters without a localTarget; guarantees gitignore
 * coverage first. This is the only sanctioned path for global content to
 * appear inside a repo working tree.
 */
export async function projectMachineLayer(
  repoRoot: string,
  globalLedger: Ledger,
  adapter: ProjectionAdapter,
  ctx: WriteContext,
): Promise<ProjectResult> {
  if (!adapter.localTarget) {
    return {
      adapter: adapter.name,
      target: '',
      outcome: 'skipped',
      detail: 'tool has no uncommitted local context file',
    };
  }
  const rel = adapter.localTarget;
  const content = renderGlobalBlock(globalLedger);
  if (content === '') {
    return {
      adapter: adapter.name,
      target: rel,
      outcome: 'skipped',
      detail: 'no global preferences',
    };
  }
  const ok = await ensureGitignored(repoRoot, rel, ctx);
  if (!ok) {
    return {
      adapter: adapter.name,
      target: rel,
      outcome: 'failed',
      detail: 'could not guarantee gitignore coverage; refusing to write machine content',
    };
  }
  try {
    const outcome = await upsertIntoFile(path.join(repoRoot, rel), content, ctx);
    return { adapter: adapter.name, target: rel, outcome };
  } catch (err) {
    if (err instanceof ManagedBlockError) {
      return { adapter: adapter.name, target: rel, outcome: 'failed', detail: err.message };
    }
    throw err;
  }
}

/**
 * Remove DejaVu's managed block from a target. If the file consisted only of
 * our block, the now-empty file is deleted (safe: all bytes were ours).
 */
export async function removeProjection(
  repoRoot: string,
  rel: string,
  ctx: WriteContext,
): Promise<ProjectOutcome> {
  const target = path.join(repoRoot, rel);
  const existing = await readOrNull(target);
  if (existing === null) return 'unchanged';
  const next = removeManagedBlock(existing);
  if (next === existing) return 'unchanged';
  if (next.trim() === '') {
    await fs.unlink(target);
    return 'updated';
  }
  await writeFileAtomic(target, next, { ctx });
  return 'updated';
}

/** Stale-check for CI: does the target carry the current block? */
export async function projectionIsCurrent(
  repoRoot: string,
  rel: string,
  content: string,
): Promise<boolean> {
  const existing = await readOrNull(path.join(repoRoot, rel));
  if (existing === null) return false;
  return blockIsCurrent(existing, content);
}

/** Targets (committed ones) that already carry a managed block. */
export async function targetsWithBlocks(repoRoot: string, rels: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const rel of rels) {
    const text = await readOrNull(path.join(repoRoot, rel));
    if (text !== null) {
      try {
        if (hasManagedBlock(text)) out.push(rel);
      } catch {
        // malformed markers — surfaced when an explicit project runs
      }
    }
  }
  return out;
}
