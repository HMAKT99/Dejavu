import type { Decision, DecisionDraft, IdPrefix, Ledger } from './types.js';

/** Pure ledger operations. All functions return new Ledger objects. */

export class LedgerError extends Error {}

/** max(numeric part)+1 over ALL decisions regardless of status; zero-padded to 3. */
export function allocateId(ledger: Ledger): string {
  let max = 0;
  for (const d of ledger.decisions) {
    const n = Number.parseInt(d.id.split('-')[1] ?? '0', 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  const next = max + 1;
  return `${ledger.idPrefix}-${String(next).padStart(3, '0')}`;
}

/** Repo ledgers must never reference G- IDs and vice versa (layer separation). */
export function assertSameLayerRefs(ledger: Ledger, refs: string[] | undefined): void {
  for (const ref of refs ?? []) {
    const prefix = ref.split('-')[0] as IdPrefix;
    if (prefix !== ledger.idPrefix) {
      throw new LedgerError(
        `cross-layer reference: ${ledger.idPrefix}-ledger cannot reference ${ref} ` +
          `(repo decisions and global decisions must stay independent)`,
      );
    }
  }
}

export function findDecision(ledger: Ledger, id: string): Decision | undefined {
  return ledger.decisions.find((d) => d.id === id);
}

export interface AppendResult {
  ledger: Ledger;
  decision: Decision;
}

/**
 * Append a new active decision from a draft. If draft.supersedes is set, the
 * referenced decisions flip to `superseded` and gain a superseded-by link —
 * the only rewrite ever made to an existing entry (context/rule/body stay
 * intact; history is the value).
 */
export function appendDecision(
  ledger: Ledger,
  draft: DecisionDraft,
  opts: { date: string; source: string },
): AppendResult {
  assertSameLayerRefs(ledger, draft.supersedes);

  if (draft.title.trim() === '') {
    throw new LedgerError('decision title must not be empty');
  }

  for (const target of draft.supersedes ?? []) {
    if (!findDecision(ledger, target)) {
      throw new LedgerError(`cannot supersede ${target}: no such decision in this ledger`);
    }
  }

  const id = allocateId(ledger);
  const decision: Decision = {
    id,
    title: draft.title.trim(),
    date: opts.date,
    source: opts.source,
    status: 'active',
    extraFields: [],
    bodyLines: [],
  };
  if (draft.context !== undefined) decision.context = draft.context;
  if (draft.rule !== undefined) decision.rule = draft.rule;
  if (draft.appliesTo && draft.appliesTo.length > 0) decision.appliesTo = [...draft.appliesTo];
  if (draft.detect && draft.detect.length > 0) decision.detect = [...draft.detect];
  if (draft.supersedes && draft.supersedes.length > 0) decision.supersedes = [...draft.supersedes];

  const decisions = ledger.decisions.map((d) => {
    if (!draft.supersedes?.includes(d.id)) return d;
    return {
      ...d,
      status: 'superseded' as const,
      supersededBy: [...new Set([...(d.supersededBy ?? []), id])],
    };
  });

  return {
    ledger: { ...ledger, decisions: [...decisions, decision] },
    decision,
  };
}
