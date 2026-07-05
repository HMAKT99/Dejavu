import type { DecisionDraft, QueueItem } from './types.js';

/**
 * Review queue: candidate decisions awaiting `dejavu review`. Stored as JSONL
 * (.dejavu/queue.jsonl — uncommitted, see .dejavu/.gitignore) so Milestone 4
 * miners can append without parsing, and a corrupt line loses one candidate,
 * not the queue.
 */

export interface QueueParseResult {
  items: QueueItem[];
  /** 1-based line numbers that failed to parse (kept out of items, reported). */
  badLines: number[];
}

export function parseQueue(text: string): QueueParseResult {
  const items: QueueItem[] = [];
  const badLines: number[] = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (line === '') continue;
    try {
      const obj = JSON.parse(line);
      if (isQueueItem(obj)) items.push(obj);
      else badLines.push(i + 1);
    } catch {
      badLines.push(i + 1);
    }
  }
  return { items, badLines };
}

export function serializeQueue(items: QueueItem[]): string {
  if (items.length === 0) return '';
  return `${items.map((i) => JSON.stringify(i)).join('\n')}\n`;
}

export function makeQueueItem(
  draft: DecisionDraft,
  opts: { qid: string; createdAt: string; source: string },
): QueueItem {
  return { v: 1, qid: opts.qid, createdAt: opts.createdAt, source: opts.source, draft };
}

function isQueueItem(obj: unknown): obj is QueueItem {
  if (typeof obj !== 'object' || obj === null) return false;
  const o = obj as Record<string, unknown>;
  if (o.v !== 1) return false;
  if (typeof o.qid !== 'string' || typeof o.createdAt !== 'string') return false;
  if (typeof o.source !== 'string') return false;
  if (typeof o.draft !== 'object' || o.draft === null) return false;
  const draft = o.draft as Record<string, unknown>;
  return typeof draft.title === 'string' && draft.title.trim() !== '';
}
