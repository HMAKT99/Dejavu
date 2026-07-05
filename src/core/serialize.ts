import type { Decision, Ledger } from './types.js';

/**
 * Canonical serializer for DECISIONS.md. This output is the product's face —
 * it gets committed, diffed, screenshotted, and read raw by agents. Keep it
 * beautiful and perfectly stable: serialize(parse(serialize(x))) must equal
 * serialize(parse(x)) so canonical files never churn in git.
 */

export const DEFAULT_PREAMBLE = `# Decisions

Architectural and product decisions for this repository, kept by [DejaVu](https://github.com/arunkt/dejavu).
Agents and humans: treat \`status: active\` entries as binding. Changes append a superseding entry — history stays.
`;

export function serializeDecision(d: Decision): string {
  const lines: string[] = [];
  lines.push(`## ${d.id}: ${d.title}`);

  const meta: string[] = [];
  meta.push(`date: ${d.date}`);
  meta.push(`source: ${d.source}`);
  meta.push(`status: ${d.status}`);
  lines.push(`- ${meta.join(' · ')}`);

  if (d.context !== undefined && d.context !== '') lines.push(`- context: ${d.context}`);
  if (d.rule !== undefined && d.rule !== '') lines.push(`- rule: ${d.rule}`);
  if (d.appliesTo && d.appliesTo.length > 0) lines.push(`- applies_to: ${d.appliesTo.join(', ')}`);
  if (d.detect && d.detect.length > 0) {
    for (const pattern of d.detect) lines.push(`- detect: ${pattern}`);
  }
  if (d.supersedes && d.supersedes.length > 0)
    lines.push(`- supersedes: ${d.supersedes.join(', ')}`);
  if (d.supersededBy && d.supersededBy.length > 0)
    lines.push(`- superseded-by: ${d.supersededBy.join(', ')}`);

  for (const [key, value] of d.extraFields) {
    lines.push(`- ${key}: ${value}`);
  }
  if (d.bodyLines.length > 0) {
    lines.push(''); // breathing room between the bullet block and free text
    lines.push(...d.bodyLines);
  }

  return lines.join('\n');
}

export function serializeLedger(ledger: Ledger): string {
  const parts: string[] = [];
  const preamble = ledger.preamble.replace(/\n+$/, '');
  if (preamble !== '') parts.push(preamble);
  for (const d of ledger.decisions) parts.push(serializeDecision(d));
  return `${parts.join('\n\n')}\n`;
}

export function emptyLedgerText(): string {
  return `${DEFAULT_PREAMBLE.replace(/\n+$/, '')}\n`;
}
