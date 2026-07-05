import pc from 'picocolors';
import { serializeDecision } from '../core/serialize.js';
import type { Decision, DecisionDraft, ParseWarning } from '../core/types.js';

/** Terminal rendering helpers shared by all commands. */

export function renderDecisionBlock(d: Decision): string {
  const raw = serializeDecision(d);
  return raw
    .split('\n')
    .map((line) => {
      if (line.startsWith('## ')) return pc.bold(pc.cyan(line));
      const m = line.match(/^- ([a-z_-]+):/);
      if (m) return `- ${pc.dim(`${m[1]}:`)}${line.slice(2 + m[1]!.length + 1)}`;
      return line;
    })
    .join('\n');
}

export function draftPreview(draft: DecisionDraft, id: string): Decision {
  const d: Decision = {
    id,
    title: draft.title,
    date: '(on approve)',
    source: 'pending',
    status: 'active',
    extraFields: [],
    bodyLines: [],
  };
  if (draft.context !== undefined) d.context = draft.context;
  if (draft.rule !== undefined) d.rule = draft.rule;
  if (draft.appliesTo && draft.appliesTo.length > 0) d.appliesTo = draft.appliesTo;
  if (draft.detect && draft.detect.length > 0) d.detect = draft.detect;
  if (draft.supersedes && draft.supersedes.length > 0) d.supersedes = draft.supersedes;
  return d;
}

export function printWarnings(warnings: ParseWarning[]): void {
  for (const w of warnings) {
    console.error(pc.yellow(`⚠ DECISIONS.md:${w.line} ${w.message}`));
  }
}

export function ok(msg: string): void {
  console.log(`${pc.green('✔')} ${msg}`);
}

export function info(msg: string): void {
  console.log(pc.dim(msg));
}

export function fail(msg: string): void {
  console.error(`${pc.red('✖')} ${msg}`);
}
