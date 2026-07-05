import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Command } from 'commander';
import { buildIndex, serializeIndex } from '../../core/indexer.js';
import { initPlan } from '../../core/init.js';
import { parseLedger } from '../../core/parse.js';
import { writeFileAtomic } from '../../io/atomic.js';
import { info, ok } from '../ui.js';
import { resolveWorkspace } from '../workspace.js';

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export interface ActionIo {
  cwd: string;
  env: NodeJS.ProcessEnv;
  now(): Date;
}

export function defaultIo(): ActionIo {
  return { cwd: process.cwd(), env: process.env, now: () => new Date() };
}

/** Returns the repo-relative paths it created (empty = already initialized). */
export async function initAction(io: ActionIo): Promise<string[]> {
  const ws = await resolveWorkspace({ cwd: io.cwd, global: false, env: io.env });
  const root = ws.displayRoot;
  const loc = ws.ledgerLoc;

  const state = {
    hasLedger: await exists(loc.ledgerPath),
    hasIndex: await exists(loc.indexPath!),
    hasDejavuGitignore: await exists(path.join(root, '.dejavu', '.gitignore')),
  };

  const ops = initPlan(state);
  const created: string[] = [];

  for (const op of ops) {
    const target = path.join(root, op.path);
    if (op.path === '.dejavu/index.json') {
      // Index derives from whatever ledger exists (fresh or pre-existing).
      const text = state.hasLedger ? await fs.readFile(loc.ledgerPath, 'utf8') : null;
      const source = text ?? ops.find((o) => o.path === 'DECISIONS.md')?.content ?? '';
      const { ledger } = parseLedger(source, 'D');
      await writeFileAtomic(target, serializeIndex(buildIndex(ledger, io.now().toISOString())), {
        ctx: loc.ctx,
      });
    } else {
      await writeFileAtomic(target, op.content, { ctx: loc.ctx });
    }
    created.push(op.path);
  }
  return created;
}

export function registerInit(program: Command): void {
  program
    .command('init')
    .description('initialize DejaVu in this repository (DECISIONS.md + .dejavu/)')
    .action(async () => {
      const created = await initAction(defaultIo());
      if (created.length === 0) {
        info('already initialized — DECISIONS.md untouched');
        return;
      }
      for (const p of created) ok(`created ${p}`);
      info('\nNext: dejavu remember "your first decision" — or commit DECISIONS.md as-is.');
    });
}
