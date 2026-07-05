import type { WriteContext } from '../io/atomic.js';
import type { LedgerLocation } from '../io/ledgerStore.js';
import { indexIsHealthy, regenerateIndex } from '../io/ledgerStore.js';
import { machineHome, machinePaths, realpathIfExists } from '../io/machine.js';
import { findRepoRoot, repoPaths } from '../io/paths.js';
import type { QueueLocation } from '../io/queueStore.js';

/**
 * Resolves where a command operates: the repo layer (cwd's repo) or the
 * machine layer (--global). Every command handler starts here, which is also
 * where a stale/corrupt index.json gets rebuilt from markdown.
 */

export interface Workspace {
  ledgerLoc: LedgerLocation;
  queueLoc: QueueLocation;
  /** Directory shown to the user ("initialized in <here>"). */
  displayRoot: string;
  global: boolean;
}

export async function resolveWorkspace(opts: {
  cwd: string;
  global: boolean;
  env?: NodeJS.ProcessEnv;
}): Promise<Workspace> {
  const home = machineHome(opts.env ?? process.env);
  const resolvedHome = await realpathIfExists(home);

  if (opts.global) {
    const mp = machinePaths(home);
    const ctx: WriteContext = { layer: 'machine', repoRoot: '', machineHome: resolvedHome };
    return {
      ledgerLoc: {
        ledgerPath: mp.ledger,
        indexPath: null,
        backupDir: mp.backupDir,
        ctx,
        idPrefix: 'G',
      },
      queueLoc: { queuePath: mp.queue, ctx },
      displayRoot: home,
      global: true,
    };
  }

  const root = await findRepoRoot(opts.cwd);
  const resolvedRoot = await realpathIfExists(root);
  const rp = repoPaths(root);
  const ctx: WriteContext = { layer: 'repo', repoRoot: resolvedRoot, machineHome: resolvedHome };
  return {
    ledgerLoc: {
      ledgerPath: rp.ledger,
      indexPath: rp.index,
      backupDir: rp.backupDir,
      ctx,
      idPrefix: 'D',
    },
    queueLoc: { queuePath: rp.queue, ctx },
    displayRoot: root,
    global: false,
  };
}

/** Rebuild index.json from markdown when missing or corrupt (markdown wins). */
export async function healIndex(ws: Workspace): Promise<boolean> {
  if (await indexIsHealthy(ws.ledgerLoc)) return false;
  return regenerateIndex(ws.ledgerLoc);
}
