import { describe, expect, it } from 'vitest';
import { parseAppliesToInput, parseDetectInput } from '../src/cli/commands/review.js';
import { makeQueueItem, parseQueue, serializeQueue } from '../src/core/queue.js';

const OPTS = {
  qid: 'q-11111111-1111-1111-1111-111111111111',
  createdAt: '2026-07-05T00:00:00.000Z',
  source: 'remember --queue',
};

describe('queue JSONL', () => {
  it('round-trips items', () => {
    const items = [
      makeQueueItem({ title: 'Use pnpm', rule: 'pnpm only' }, OPTS),
      makeQueueItem({ title: 'UTC everywhere', global: true }, { ...OPTS, qid: 'q-2' }),
    ];
    const { items: back, badLines } = parseQueue(serializeQueue(items));
    expect(badLines).toEqual([]);
    expect(back).toEqual(items);
  });

  it('a corrupt line loses one candidate, not the queue', () => {
    const good = JSON.stringify(makeQueueItem({ title: 'ok' }, OPTS));
    const text = `${good}\nnot json at all\n{"v":1,"but":"wrong shape"}\n${good}\n`;
    const { items, badLines } = parseQueue(text);
    expect(items).toHaveLength(2);
    expect(badLines).toEqual([2, 3]);
  });

  it('empty queue serializes to empty string, parses to empty list', () => {
    expect(serializeQueue([])).toBe('');
    expect(parseQueue('')).toEqual({ items: [], badLines: [] });
  });

  it('review edit-flow input parsing: applies_to commas, detect ;; separator', () => {
    expect(parseAppliesToInput(' src/api/** , supabase/** ')).toEqual([
      'src/api/**',
      'supabase/**',
    ]);
    expect(parseAppliesToInput('')).toEqual([]);
    // regexes keep their commas and pipes intact
    expect(parseDetectInput('user_id\\s*===? ;; require\\([\'"](moment|luxon)')).toEqual([
      'user_id\\s*===?',
      'require\\([\'"](moment|luxon)',
    ]);
    expect(parseDetectInput('foo{1,3}bar')).toEqual(['foo{1,3}bar']);
    expect(parseDetectInput('')).toEqual([]);
  });

  it('tolerates unknown extra fields (forward compat with miners)', () => {
    const item = { ...makeQueueItem({ title: 'mined' }, OPTS), confidence: 0.82, minerVersion: 3 };
    const { items } = parseQueue(`${JSON.stringify(item)}\n`);
    expect(items[0]!.draft.title).toBe('mined');
    expect(items[0]!.confidence).toBe(0.82);
  });
});
