import { describe, expect, it } from 'vitest';
import { allocateId, appendDecision, LedgerError } from '../src/core/ledger.js';
import { parseLedger } from '../src/core/parse.js';
import type { Ledger } from '../src/core/types.js';

const empty = (prefix: 'D' | 'G' = 'D'): Ledger => ({
  preamble: '',
  decisions: [],
  idPrefix: prefix,
});

const OPTS = { date: '2026-07-05', source: 'manual' };

describe('allocateId', () => {
  it('starts at 001', () => {
    expect(allocateId(empty())).toBe('D-001');
  });

  it('takes max+1 across gaps and statuses (never reuses)', () => {
    const { ledger } = parseLedger(`## D-002: a
- date: 2026-01-01 · source: manual · status: deprecated

## D-014: b
- date: 2026-01-01 · source: manual · status: superseded
`);
    expect(allocateId(ledger)).toBe('D-015');
  });

  it('is immune to duplicate IDs', () => {
    const { ledger } = parseLedger(`## D-007: a
- date: 2026-01-01 · source: manual · status: active

## D-007: b
- date: 2026-01-01 · source: manual · status: active
`);
    expect(allocateId(ledger)).toBe('D-008');
  });

  it('grows past 999 without breaking', () => {
    const { ledger } = parseLedger(`## D-999: a
- date: 2026-01-01 · source: manual · status: active
`);
    expect(allocateId(ledger)).toBe('D-1000');
  });

  it('uses the ledger prefix', () => {
    expect(allocateId(empty('G'))).toBe('G-001');
  });
});

describe('appendDecision', () => {
  it('appends an active decision with allocated ID', () => {
    const { ledger, decision } = appendDecision(empty(), { title: 'Use pnpm' }, OPTS);
    expect(decision.id).toBe('D-001');
    expect(decision.status).toBe('active');
    expect(ledger.decisions).toHaveLength(1);
  });

  it('rejects empty titles', () => {
    expect(() => appendDecision(empty(), { title: '   ' }, OPTS)).toThrow(LedgerError);
  });

  it('supersede flips the old entry and links both directions', () => {
    const one = appendDecision(empty(), { title: 'old way' }, OPTS).ledger;
    const { ledger, decision } = appendDecision(
      one,
      { title: 'new way', supersedes: ['D-001'] },
      OPTS,
    );
    const old = ledger.decisions.find((d) => d.id === 'D-001')!;
    expect(old.status).toBe('superseded');
    expect(old.supersededBy).toEqual(['D-002']);
    expect(old.title).toBe('old way'); // content untouched
    expect(decision.supersedes).toEqual(['D-001']);
    expect(decision.status).toBe('active');
  });

  it('supersede of a missing ID fails without mutating anything', () => {
    const one = appendDecision(empty(), { title: 'a' }, OPTS).ledger;
    expect(() => appendDecision(one, { title: 'b', supersedes: ['D-099'] }, OPTS)).toThrow(
      /no such decision/,
    );
    expect(one.decisions).toHaveLength(1);
    expect(one.decisions[0]!.status).toBe('active');
  });

  it('rejects cross-layer references (repo ledger cannot mention G- IDs)', () => {
    expect(() => appendDecision(empty('D'), { title: 'x', supersedes: ['G-001'] }, OPTS)).toThrow(
      /cross-layer/,
    );
    expect(() => appendDecision(empty('G'), { title: 'x', supersedes: ['D-001'] }, OPTS)).toThrow(
      /cross-layer/,
    );
  });

  it('does not mutate the input ledger (pure)', () => {
    const one = appendDecision(empty(), { title: 'a' }, OPTS).ledger;
    const before = JSON.stringify(one);
    appendDecision(one, { title: 'b', supersedes: ['D-001'] }, OPTS);
    expect(JSON.stringify(one)).toBe(before);
  });

  it('double-supersede accumulates supersededBy without duplicates', () => {
    let l = appendDecision(empty(), { title: 'a' }, OPTS).ledger;
    l = appendDecision(l, { title: 'b', supersedes: ['D-001'] }, OPTS).ledger;
    l = appendDecision(l, { title: 'c', supersedes: ['D-001'] }, OPTS).ledger;
    const old = l.decisions.find((d) => d.id === 'D-001')!;
    expect(old.supersededBy).toEqual(['D-002', 'D-003']);
  });
});
