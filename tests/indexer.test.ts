import { describe, expect, it } from 'vitest';
import { buildIndex } from '../src/core/indexer.js';
import { parseLedger } from '../src/core/parse.js';

const EPOCH = '1970-01-01T00:00:00.000Z';

describe('buildIndex', () => {
  it('derives supersededBy from link structure', () => {
    const { ledger } = parseLedger(`## D-001: old
- date: 2026-01-01 · source: manual · status: superseded

## D-002: new
- date: 2026-01-02 · source: manual · status: active
- supersedes: D-001
`);
    const index = buildIndex(ledger, EPOCH);
    expect(index.decisions[0]!.supersededBy).toEqual(['D-002']);
    expect(index.warnings).toEqual([]);
  });

  it('flags an active decision that something supersedes (hand edit)', () => {
    const { ledger } = parseLedger(`## D-001: old
- date: 2026-01-01 · source: manual · status: active

## D-002: new
- date: 2026-01-02 · source: manual · status: active
- supersedes: D-001
`);
    const index = buildIndex(ledger, EPOCH);
    expect(index.warnings.some((w) => w.includes('D-001') && w.includes('active'))).toBe(true);
  });

  it('flags a superseded decision with no superseder', () => {
    const { ledger } = parseLedger(`## D-001: orphan
- date: 2026-01-01 · source: manual · status: superseded
`);
    const index = buildIndex(ledger, EPOCH);
    expect(index.warnings.some((w) => w.includes('D-001'))).toBe(true);
  });

  it('carries enforcement fields (rule, appliesTo, detect) into the index', () => {
    const { ledger } = parseLedger(`## D-001: x
- date: 2026-01-01 · source: manual · status: active
- rule: no manual user_id filtering
- applies_to: src/api/**
- detect: user_id\\s*===?
`);
    const e = buildIndex(ledger, EPOCH).decisions[0]!;
    expect(e.rule).toBe('no manual user_id filtering');
    expect(e.appliesTo).toEqual(['src/api/**']);
    expect(e.detect).toEqual(['user_id\\s*===?']);
  });
});
