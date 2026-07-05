import type { Decision, Ledger } from './types.js';

/**
 * Render the managed-block content projected into agent context files.
 * One shared shape for every tool: agents read markdown fine everywhere,
 * and a single format keeps golden tests and user expectations aligned.
 */

export function activeDecisions(ledger: Ledger): Decision[] {
  return ledger.decisions.filter((d) => d.status === 'active');
}

function renderDecision(d: Decision): string {
  const lines = [`- **${d.id}: ${d.title}**`];
  if (d.rule) lines.push(`  - rule: ${d.rule}`);
  if (d.context) lines.push(`  - why: ${d.context}`);
  if (d.appliesTo && d.appliesTo.length > 0)
    lines.push(`  - applies to: ${d.appliesTo.join(', ')}`);
  return lines.join('\n');
}

/** Repo-layer projection (committed context files). */
export function renderProjectBlock(ledger: Ledger): string {
  const active = activeDecisions(ledger);
  const parts = [
    '## Project decisions (DejaVu)',
    '',
    'Binding decisions for this repository — do not contradict them.',
    'Full history in DECISIONS.md. Managed block: edit with `dejavu`, not by hand.',
    '',
  ];
  if (active.length === 0) {
    parts.push('_No active decisions yet. Record one with `dejavu remember`._');
  } else {
    parts.push(active.map(renderDecision).join('\n'));
  }
  return parts.join('\n');
}

/**
 * Machine-layer projection — only ever written to uncommitted local files.
 * Empty string when there is nothing to say (callers skip the write).
 */
export function renderGlobalBlock(ledger: Ledger): string {
  const active = activeDecisions(ledger);
  if (active.length === 0) return '';
  return [
    '## Your preferences (DejaVu, machine-level)',
    '',
    'Personal cross-project preferences. Never committed to the repository.',
    '',
    active.map(renderDecision).join('\n'),
  ].join('\n');
}
