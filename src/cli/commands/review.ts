import * as p from '@clack/prompts';
import type { Command } from 'commander';
import pc from 'picocolors';
import { appendDecision } from '../../core/ledger.js';
import { serializeDecision } from '../../core/serialize.js';
import type { DecisionDraft, QueueItem } from '../../core/types.js';
import { loadLedger, saveLedger } from '../../io/ledgerStore.js';
import { loadQueue, saveQueue } from '../../io/queueStore.js';
import { draftPreview, fail, info } from '../ui.js';
import { healIndex, resolveWorkspace } from '../workspace.js';
import { refreshExistingProjections } from './project.js';

type Verdict = 'approve' | 'edit' | 'reject' | 'skip';

export function registerReview(program: Command): void {
  program
    .command('review')
    .description('review queued decision candidates (approve / edit / reject)')
    .option('-g, --global', 'review the machine-level queue (~/.dejavu)')
    .action(async (flags: { global?: boolean }) => {
      const ws = await resolveWorkspace({ cwd: process.cwd(), global: flags.global ?? false });
      await healIndex(ws);

      const { items, badLines } = await loadQueue(ws.queueLoc);
      if (badLines.length > 0) {
        fail(
          `queue has ${badLines.length} unreadable line(s) (${badLines.join(', ')}) — kept in place, skipping them`,
        );
      }
      if (items.length === 0) {
        info('review queue is empty — nothing to do.');
        return;
      }

      if (!process.stdout.isTTY || !process.stdin.isTTY) {
        // CI / piped: never open an interactive UI. List and bail with a hint.
        for (const item of items) {
          console.log(`- [${item.source}] ${item.draft.title}`);
        }
        fail(
          `${items.length} candidate(s) pending — run \`dejavu review\` in a terminal to process them`,
        );
        process.exitCode = 1;
        return;
      }

      p.intro(pc.bgCyan(pc.black(' dejavu review ')));

      const remaining: QueueItem[] = [];
      const approvedIds: string[] = [];
      let rejected = 0;
      let aborted = false;

      // Ledger is re-loaded per approval so IDs allocate sequentially, but
      // written once at the end via a single load→mutate→save pass instead.
      let { ledger, warnings } = await loadLedger(ws.ledgerLoc);
      if (warnings.length > 0) {
        p.log.warn(
          `${warnings.length} parse warning(s) in the ledger — see \`dejavu status\` output later`,
        );
      }
      let dirty = false;

      for (const [i, item] of items.entries()) {
        if (aborted) {
          remaining.push(item);
          continue;
        }

        const preview = draftPreview(item.draft, '(next id)');
        let noteBody = serializeDecision(preview);
        if (item.evidence && item.evidence.length > 0) {
          const ev = item.evidence[0]!;
          noteBody += `\n\n${pc.dim(`evidence: "${ev.excerpt ?? ''}"`)}\n${pc.dim(`from: ${ev.file ?? 'unknown'}`)}`;
        }
        const confidence =
          item.confidence !== undefined ? ` · ${Math.round(item.confidence * 100)}%` : '';
        p.note(noteBody, `${i + 1}/${items.length} · from ${item.source}${confidence}`);

        const verdict = (await p.select({
          message: 'What should happen to this decision?',
          options: [
            { value: 'approve', label: 'Approve', hint: 'append to the ledger' },
            { value: 'edit', label: 'Edit, then approve' },
            { value: 'reject', label: 'Reject', hint: 'discard the candidate' },
            { value: 'skip', label: 'Skip', hint: 'decide later, keep in queue' },
          ],
        })) as Verdict | symbol;

        if (p.isCancel(verdict)) {
          aborted = true;
          remaining.push(item);
          continue;
        }

        let draft: DecisionDraft = item.draft;

        if (verdict === 'edit') {
          const edited = await editDraft(draft);
          if (edited === null) {
            remaining.push(item); // cancelled edit → keep queued
            continue;
          }
          draft = edited;
        }

        if (verdict === 'approve' || verdict === 'edit') {
          const date = new Date().toISOString().slice(0, 10);
          try {
            const res = appendDecision(ledger, draft, { date, source: item.source });
            ledger = res.ledger;
            approvedIds.push(res.decision.id);
            dirty = true;
            p.log.success(`${res.decision.id}: ${draft.title}`);
          } catch (err) {
            p.log.error(`could not approve: ${(err as Error).message}`);
            remaining.push(item);
          }
        } else if (verdict === 'reject') {
          rejected++;
        } else if (verdict === 'skip') {
          remaining.push(item);
        }
      }

      if (dirty) {
        await saveLedger(ws.ledgerLoc, ledger, { now: () => new Date() });
      }
      await saveQueue(ws.queueLoc, remaining);

      if (dirty && !flags.global) {
        const refreshed = await refreshExistingProjections({
          cwd: process.cwd(),
          env: process.env,
          now: () => new Date(),
        });
        for (const r of refreshed) p.log.success(`${r.target} — managed block refreshed`);
      }

      const bits: string[] = [];
      if (approvedIds.length > 0)
        bits.push(`${approvedIds.length} approved → ${approvedIds.join(', ')}`);
      if (rejected > 0) bits.push(`${rejected} rejected`);
      if (remaining.length > 0) bits.push(`${remaining.length} still queued`);
      p.outro(bits.length > 0 ? bits.join(' · ') : 'nothing changed');
    });
}

async function editDraft(draft: DecisionDraft): Promise<DecisionDraft | null> {
  const title = await p.text({
    message: 'Title',
    initialValue: draft.title,
    validate: (v) => (v === undefined || v.trim() === '' ? 'title must not be empty' : undefined),
  });
  if (p.isCancel(title)) return null;

  const context = await p.text({
    message: 'Context (why) — empty to omit',
    initialValue: draft.context ?? '',
  });
  if (p.isCancel(context)) return null;

  const rule = await p.text({
    message: 'Rule (enforceable) — empty to omit',
    initialValue: draft.rule ?? '',
  });
  if (p.isCancel(rule)) return null;

  const next: DecisionDraft = { ...draft, title: (title as string).trim() };
  const ctx = (context as string).trim();
  const rl = (rule as string).trim();
  if (ctx !== '') next.context = ctx;
  else delete next.context;
  if (rl !== '') next.rule = rl;
  else delete next.rule;
  return next;
}
