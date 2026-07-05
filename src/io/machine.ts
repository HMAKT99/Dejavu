import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Machine layer: ~/.dejavu (override with $DEJAVU_HOME, which tests use).
 * Holds the user's cross-project global ledger (G- IDs) and config.
 * HARD RULE: nothing under this directory is ever written into a repo, and
 * no repo file ever references it — enforced by io/atomic.ts assertLayer and
 * core/ledger.ts assertSameLayerRefs.
 */

export interface MachinePaths {
  home: string;
  config: string;
  ledger: string;
  queue: string;
  backupDir: string;
}

export function machineHome(env: NodeJS.ProcessEnv = process.env): string {
  return env.DEJAVU_HOME && env.DEJAVU_HOME !== ''
    ? path.resolve(env.DEJAVU_HOME)
    : path.join(os.homedir(), '.dejavu');
}

export function machinePaths(home: string): MachinePaths {
  return {
    home,
    config: path.join(home, 'config.json'),
    ledger: path.join(home, 'DECISIONS.md'),
    queue: path.join(home, 'queue.jsonl'),
    backupDir: path.join(home, 'backup'),
  };
}

/** realpath a directory if it exists (for layer checks); '' if it doesn't. */
export async function realpathIfExists(p: string): Promise<string> {
  try {
    return await fs.realpath(p);
  } catch {
    return path.resolve(p);
  }
}
