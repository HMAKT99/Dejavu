import type { IndexEntry, IndexFile, Ledger } from './types.js';

/**
 * Build .dejavu/index.json from a ledger. The index is a derived cache for
 * fast matching (Milestone 3 enforcement, Milestone 5 MCP) — always
 * regenerable, never authoritative. Markdown wins on any disagreement.
 */
export function buildIndex(ledger: Ledger, generatedAt: string): IndexFile {
  const warnings: string[] = [];

  // Derive superseded-by from link structure (the supersedes side is
  // authoritative because appendDecision writes both sides).
  const derivedBy = new Map<string, string[]>();
  for (const d of ledger.decisions) {
    for (const target of d.supersedes ?? []) {
      derivedBy.set(target, [...(derivedBy.get(target) ?? []), d.id]);
    }
  }

  const decisions: IndexEntry[] = ledger.decisions.map((d) => {
    const by = derivedBy.get(d.id) ?? d.supersededBy ?? [];

    if (by.length > 0 && d.status === 'active') {
      warnings.push(`${d.id} is marked active but is superseded by ${by.join(', ')} (hand edit?)`);
    }
    if (d.status === 'superseded' && by.length === 0) {
      warnings.push(`${d.id} is marked superseded but nothing supersedes it`);
    }

    const entry: IndexEntry = {
      id: d.id,
      title: d.title,
      date: d.date,
      source: d.source,
      status: d.status,
    };
    if (d.rule !== undefined) entry.rule = d.rule;
    if (d.appliesTo && d.appliesTo.length > 0) entry.appliesTo = d.appliesTo;
    if (d.detect && d.detect.length > 0) entry.detect = d.detect;
    if (d.supersedes && d.supersedes.length > 0) entry.supersedes = d.supersedes;
    if (by.length > 0) entry.supersededBy = [...new Set(by)];
    return entry;
  });

  return { version: 1, generatedAt, decisions, warnings };
}

export function serializeIndex(index: IndexFile): string {
  return `${JSON.stringify(index, null, 2)}\n`;
}
