import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { Command } from 'commander';
import pc from 'picocolors';
import type { DecisionDraft } from '../../core/types.js';
import { allRepoFiles, readScannable } from '../../io/gitFiles.js';
import { loadLedger } from '../../io/ledgerStore.js';
import { loadMined, saveMined } from '../../io/minedStore.js';
import { loadQueue, saveQueue } from '../../io/queueStore.js';
import {
  ALL_SOURCES,
  dedupeCandidates,
  type MinedItem,
  type MiningSource,
  mineComments,
  mineSessions,
} from '../../mining/miner.js';
import { info, ok } from '../ui.js';
import { healIndex, resolveWorkspace } from '../workspace.js';
import { type ActionIo, defaultIo } from './init.js';

export interface MineFlags {
  source?: string[];
  dryRun?: boolean;
  limit?: number;
}

export interface MineSummary {
  queued: MinedItem[];
  skippedSeen: number;
  scannedSources: MiningSource[];
}

function parseSources(raw: string[] | undefined): MiningSource[] {
  if (!raw || raw.length === 0) return ALL_SOURCES;
  const sources: MiningSource[] = [];
  for (const s of raw) {
    if (!ALL_SOURCES.includes(s as MiningSource)) {
      throw new Error(`unknown mining source "${s}" — known: ${ALL_SOURCES.join(', ')}`);
    }
    sources.push(s as MiningSource);
  }
  return sources;
}

export async function mineAction(flags: MineFlags, io: ActionIo): Promise<MineSummary> {
  const ws = await resolveWorkspace({ cwd: io.cwd, global: false, env: io.env });
  await healIndex(ws);
  const root = ws.displayRoot;
  const sources = parseSources(flags.source);

  const candidates: MinedItem[] = await mineSessions(root, sources, io.env);
  if (sources.includes('comments')) {
    for (const rel of await allRepoFiles(root)) {
      const content = await readScannable(root, rel);
      if (content !== null) candidates.push(...mineComments(rel, content));
    }
  }

  const minedPath = path.join(root, '.dejavu', 'mined.json');
  const seen = await loadMined(minedPath);
  const { items: queue } = await loadQueue(ws.queueLoc);
  const { ledger } = await loadLedger(ws.ledgerLoc);

  let fresh = dedupeCandidates(candidates, seen, queue, ledger);
  const skippedSeen = candidates.length - fresh.length;
  if (flags.limit !== undefined && flags.limit > 0) fresh = fresh.slice(0, flags.limit);

  if (flags.dryRun || fresh.length === 0) {
    return { queued: fresh, skippedSeen, scannedSources: sources };
  }

  const queueItems = fresh.map((c) => {
    const draft: DecisionDraft = { title: c.title };
    if (c.rule !== undefined) draft.rule = c.rule;
    return {
      v: 1 as const,
      qid: `q-${randomUUID()}`,
      createdAt: io.now().toISOString(),
      source: `miner:${c.source}`,
      confidence: c.confidence,
      evidence: [c.evidence],
      draft,
    };
  });
  await saveQueue(ws.queueLoc, [...queue, ...queueItems]);
  for (const c of fresh) seen.add(c.fingerprint);
  await saveMined(minedPath, seen, ws.ledgerLoc.ctx);

  return { queued: fresh, skippedSeen, scannedSources: sources };
}

export function registerMine(program: Command): void {
  program
    .command('mine')
    .description('mine decisions from AI session transcripts and #decision: comments')
    .option(
      '--source <name>',
      `mine one source (repeatable): ${ALL_SOURCES.join(', ')}`,
      (v: string, prev: string[] = []) => [...prev, v],
    )
    .option('--dry-run', 'show candidates without queueing them')
    .option('--limit <n>', 'queue at most n candidates', (v: string) => Number.parseInt(v, 10))
    .action(async (flags: MineFlags) => {
      const summary = await mineAction(flags, defaultIo());

      if (summary.queued.length === 0) {
        info(
          summary.skippedSeen > 0
            ? `no new candidates (${summary.skippedSeen} already processed or known)`
            : `no decision moments found in ${summary.scannedSources.join(', ')}`,
        );
        return;
      }

      for (const c of summary.queued) {
        const conf = `${Math.round(c.confidence * 100)}%`;
        console.log(
          `${pc.cyan('◆')} ${pc.bold(c.title)} ${pc.dim(`(${conf} · ${c.source})`)}\n` +
            `  ${pc.dim(`"${c.excerpt}" — ${c.evidence.file}`)}`,
        );
      }
      console.log();
      if (flags.dryRun) {
        info(`${summary.queued.length} candidate(s) found — dry run, nothing queued`);
      } else {
        ok(
          `${summary.queued.length} candidate(s) queued` +
            (summary.skippedSeen > 0 ? ` (${summary.skippedSeen} already known — skipped)` : '') +
            ' — run: dejavu review',
        );
      }
    });
}
