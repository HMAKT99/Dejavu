import { promises as fs } from 'node:fs';
import { parseQueue, serializeQueue } from '../core/queue.js';
import type { QueueItem } from '../core/types.js';
import { type WriteContext, writeFileAtomic } from './atomic.js';

export interface QueueLocation {
  queuePath: string;
  ctx: WriteContext;
}

export async function loadQueue(
  loc: QueueLocation,
): Promise<{ items: QueueItem[]; badLines: number[] }> {
  let text: string;
  try {
    text = await fs.readFile(loc.queuePath, 'utf8');
  } catch {
    return { items: [], badLines: [] };
  }
  return parseQueue(text);
}

export async function saveQueue(loc: QueueLocation, items: QueueItem[]): Promise<void> {
  await writeFileAtomic(loc.queuePath, serializeQueue(items), { ctx: loc.ctx });
}
