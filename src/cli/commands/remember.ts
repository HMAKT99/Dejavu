import { randomUUID } from 'node:crypto';
import type { Command } from 'commander';
import { appendDecision } from '../../core/ledger.js';
import { makeQueueItem } from '../../core/queue.js';
import type { Decision, DecisionDraft } from '../../core/types.js';
import { loadLedger, saveLedger } from '../../io/ledgerStore.js';
import { loadQueue, saveQueue } from '../../io/queueStore.js';
import { info, ok, printWarnings, renderDecisionBlock } from '../ui.js';
import { healIndex, resolveWorkspace } from '../workspace.js';
import { type ActionIo, defaultIo } from './init.js';

export interface RememberFlags {
  context?: string;
  rule?: string;
  appliesTo?: string[];
  detect?: string[];
  supersedes?: string;
  queue?: boolean;
  global?: boolean;
}

export type RememberResult =
  | { kind: 'queued'; pending: number }
  | { kind: 'recorded'; decision: Decision };

export async function rememberAction(
  title: string,
  flags: RememberFlags,
  io: ActionIo,
): Promise<RememberResult> {
  const ws = await resolveWorkspace({ cwd: io.cwd, global: flags.global ?? false, env: io.env });
  await healIndex(ws);

  const draft: DecisionDraft = { title };
  if (flags.context !== undefined) draft.context = flags.context;
  if (flags.rule !== undefined) draft.rule = flags.rule;
  if (flags.appliesTo && flags.appliesTo.length > 0) draft.appliesTo = flags.appliesTo;
  if (flags.detect && flags.detect.length > 0) draft.detect = flags.detect;
  if (flags.supersedes !== undefined) {
    draft.supersedes = flags.supersedes
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s !== '');
  }
  if (flags.global) draft.global = true;

  if (flags.queue) {
    const { items } = await loadQueue(ws.queueLoc);
    const item = makeQueueItem(draft, {
      qid: `q-${randomUUID()}`,
      createdAt: io.now().toISOString(),
      source: 'remember --queue',
    });
    await saveQueue(ws.queueLoc, [...items, item]);
    return { kind: 'queued', pending: items.length + 1 };
  }

  const { ledger, warnings } = await loadLedger(ws.ledgerLoc);
  printWarnings(warnings);

  const date = io.now().toISOString().slice(0, 10);
  const { ledger: next, decision } = appendDecision(ledger, draft, { date, source: 'manual' });
  await saveLedger(ws.ledgerLoc, next, { now: io.now.bind(io) });
  return { kind: 'recorded', decision };
}

function collect(value: string, previous: string[] = []): string[] {
  return [...previous, value];
}

export function registerRemember(program: Command): void {
  program
    .command('remember')
    .description('record a decision (append to the ledger, or --queue for review)')
    .argument('<title>', 'the decision, stated as a short imperative title')
    .option('-c, --context <text>', 'why this was decided')
    .option('-r, --rule <text>', 'the enforceable rule this decision implies')
    .option('--applies-to <glob>', 'file glob this decision governs (repeatable)', collect)
    .option('--detect <regex>', 'regex hint for contradiction detection (repeatable)', collect)
    .option('--supersedes <ids>', 'comma-separated decision ID(s) this replaces')
    .option('-q, --queue', 'send to the review queue instead of the ledger')
    .option('-g, --global', 'record in your machine-level context (~/.dejavu), never committed')
    .action(async (title: string, flags: RememberFlags) => {
      const result = await rememberAction(title, flags, defaultIo());
      if (result.kind === 'queued') {
        ok(
          `queued for review (${result.pending} pending) — run: dejavu review${flags.global ? ' --global' : ''}`,
        );
        return;
      }
      console.log(`\n${renderDecisionBlock(result.decision)}\n`);
      ok(
        `${result.decision.id} recorded in ${flags.global ? '~/.dejavu/DECISIONS.md (machine-only)' : 'DECISIONS.md'}`,
      );
      if (result.decision.supersedes && result.decision.supersedes.length > 0) {
        info(`${result.decision.supersedes.join(', ')} → status: superseded`);
      }
    });
}
