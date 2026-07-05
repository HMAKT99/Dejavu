import { promises as fs } from 'node:fs';
import { type WriteContext, writeFileAtomic } from './atomic.js';

/**
 * .dejavu/mined.json — fingerprints of every candidate ever queued by the
 * miner. Once queued, a candidate never comes back: an approval lands in the
 * ledger (deduped there) and a rejection must stick. Local-only, gitignored,
 * safe to delete (worst case: previously rejected candidates reappear once).
 */

export interface MinedStore {
  version: 1;
  fingerprints: string[];
}

export async function loadMined(minedPath: string): Promise<Set<string>> {
  try {
    const raw = await fs.readFile(minedPath, 'utf8');
    const parsed = JSON.parse(raw) as MinedStore;
    if (parsed?.version === 1 && Array.isArray(parsed.fingerprints)) {
      return new Set(parsed.fingerprints.filter((f) => typeof f === 'string'));
    }
  } catch {
    /* missing or corrupt → start fresh */
  }
  return new Set();
}

export async function saveMined(
  minedPath: string,
  fingerprints: Set<string>,
  ctx: WriteContext,
): Promise<void> {
  const store: MinedStore = { version: 1, fingerprints: [...fingerprints].sort() };
  await writeFileAtomic(minedPath, `${JSON.stringify(store, null, 2)}\n`, { ctx });
}
