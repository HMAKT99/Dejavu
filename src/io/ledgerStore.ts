import { promises as fs } from 'node:fs';
import { buildIndex, serializeIndex } from '../core/indexer.js';
import { parseLedger } from '../core/parse.js';
import { serializeLedger } from '../core/serialize.js';
import type { IdPrefix, Ledger, ParseWarning } from '../core/types.js';
import { type FsLike, type WriteContext, writeFileAtomic } from './atomic.js';

/**
 * Load/save a ledger (repo or machine). Saving always regenerates the JSON
 * index next to it in the same pass — markdown is the source of truth and the
 * index is never allowed to drift.
 */

export interface LedgerLocation {
  ledgerPath: string;
  indexPath: string | null; // machine ledger keeps no index in M1
  backupDir: string;
  ctx: WriteContext;
  idPrefix: IdPrefix;
}

export interface LoadedLedger {
  ledger: Ledger;
  warnings: ParseWarning[];
  /** True when the file didn't exist (empty ledger returned). */
  fresh: boolean;
}

export async function loadLedger(loc: LedgerLocation): Promise<LoadedLedger> {
  let text: string;
  try {
    text = await fs.readFile(loc.ledgerPath, 'utf8');
  } catch {
    return {
      ledger: { preamble: '', decisions: [], idPrefix: loc.idPrefix },
      warnings: [],
      fresh: true,
    };
  }
  const { ledger, warnings } = parseLedger(text, loc.idPrefix);
  return { ledger, warnings, fresh: false };
}

/**
 * Self-check gate: re-parse the exact bytes about to land and refuse the
 * write if any decision ID present in the previous content would vanish.
 * The tool is structurally unable to lose a decision.
 */
export function verifyNoDecisionLost(content: string, previous: string | null): string | null {
  if (previous === null) return null;
  const before = new Set(parseLedger(previous).ledger.decisions.map((d) => d.id));
  const after = new Set(parseLedger(content).ledger.decisions.map((d) => d.id));
  const lost = [...before].filter((id) => !after.has(id));
  if (lost.length > 0) {
    return `write would lose decision(s) ${lost.join(', ')} — aborted (previous file kept)`;
  }
  return null;
}

export async function saveLedger(
  loc: LedgerLocation,
  ledger: Ledger,
  opts: { now: () => Date; fsImpl?: FsLike } = { now: () => new Date() },
): Promise<void> {
  const text = serializeLedger(ledger);
  const writeOpts = {
    ctx: loc.ctx,
    backupDir: loc.backupDir,
    verify: verifyNoDecisionLost,
    ...(opts.fsImpl ? { fsImpl: opts.fsImpl } : {}),
  };
  await writeFileAtomic(loc.ledgerPath, text, writeOpts);

  if (loc.indexPath !== null) {
    const index = buildIndex(ledger, opts.now().toISOString());
    const idxOpts = { ctx: loc.ctx, ...(opts.fsImpl ? { fsImpl: opts.fsImpl } : {}) };
    await writeFileAtomic(loc.indexPath, serializeIndex(index), idxOpts);
  }
}

/** Regenerate index.json from the markdown on disk (markdown always wins). */
export async function regenerateIndex(
  loc: LedgerLocation,
  now: () => Date = () => new Date(),
): Promise<boolean> {
  if (loc.indexPath === null) return false;
  const { ledger, fresh } = await loadLedger(loc);
  if (fresh) return false;
  const index = buildIndex(ledger, now().toISOString());
  await writeFileAtomic(loc.indexPath, serializeIndex(index), { ctx: loc.ctx });
  return true;
}

/** True when index.json exists and is valid JSON with the right version. */
export async function indexIsHealthy(loc: LedgerLocation): Promise<boolean> {
  if (loc.indexPath === null) return true;
  try {
    const raw = await fs.readFile(loc.indexPath, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed?.version === 1;
  } catch {
    return false;
  }
}
