import { describe, expect, it } from 'vitest';
import { parseLedger } from '../src/core/parse.js';

describe('parseLedger', () => {
  it('parses the spec example decision', () => {
    const text = `## D-014: Use Supabase RLS for authorization (not API-layer checks)
- date: 2026-07-04 · source: claude-code session · status: active
- context: single-tenant app, auth bugs from duplicated API checks
- rule: all authorization goes through RLS policies; no manual user_id filtering in API routes
- supersedes: D-006
`;
    const { ledger, warnings } = parseLedger(text);
    expect(warnings).toEqual([]);
    expect(ledger.decisions).toHaveLength(1);
    const d = ledger.decisions[0]!;
    expect(d.id).toBe('D-014');
    expect(d.title).toBe('Use Supabase RLS for authorization (not API-layer checks)');
    expect(d.date).toBe('2026-07-04');
    expect(d.source).toBe('claude-code session');
    expect(d.status).toBe('active');
    expect(d.context).toBe('single-tenant app, auth bugs from duplicated API checks');
    expect(d.supersedes).toEqual(['D-006']);
  });

  it('keeps everything before the first heading as verbatim preamble', () => {
    const text = `# Title

Prose with **markdown**.

## Not a decision heading (no ID)

## D-001: Real decision
- date: 2026-01-01 · source: manual · status: active
`;
    const { ledger } = parseLedger(text);
    expect(ledger.decisions).toHaveLength(1);
    expect(ledger.preamble).toContain('# Title');
    expect(ledger.preamble).toContain('## Not a decision heading (no ID)');
  });

  it('tolerates | and , separators, * bullets, and mixed-case keys', () => {
    const text = `## D-001 - use pnpm
* Status: Active | Date: 2026-06-01 | Source: manual
- Applies-To: a/** , b/**
`;
    const { ledger, warnings } = parseLedger(text);
    const d = ledger.decisions[0]!;
    expect(d.status).toBe('active');
    expect(d.date).toBe('2026-06-01');
    expect(d.title).toBe('use pnpm');
    expect(d.appliesTo).toEqual(['a/**', 'b/**']);
    expect(warnings).toEqual([]);
  });

  it('defaults missing status to active with a warning', () => {
    const { ledger, warnings } = parseLedger(`## D-001: x
- date: 2026-01-01 · source: manual
`);
    expect(ledger.decisions[0]!.status).toBe('active');
    expect(warnings.some((w) => w.code === 'missing-status')).toBe(true);
  });

  it('warns on unknown status and preserves the raw value', () => {
    const { ledger, warnings } = parseLedger(`## D-001: x
- date: 2026-01-01 · source: manual · status: retired
`);
    expect(ledger.decisions[0]!.status).toBe('active');
    expect(warnings.some((w) => w.code === 'unknown-status')).toBe(true);
    expect(ledger.decisions[0]!.extraFields).toContainEqual(['status_raw', 'retired']);
  });

  it('warns on duplicate IDs and keeps both entries', () => {
    const { ledger, warnings } = parseLedger(`## D-007: a
- date: 2026-01-01 · source: manual · status: active

## D-007: b
- date: 2026-01-02 · source: manual · status: active
`);
    expect(ledger.decisions).toHaveLength(2);
    expect(warnings.some((w) => w.code === 'duplicate-id')).toBe(true);
  });

  it('warns on a decision with no metadata line at all', () => {
    const { ledger, warnings } = parseLedger(`## D-001: bare decision
Some prose only.
`);
    expect(ledger.decisions[0]!.bodyLines).toEqual(['Some prose only.']);
    expect(warnings.some((w) => w.code === 'missing-metadata')).toBe(true);
  });

  it('warns on non-ISO dates but keeps them as written', () => {
    const { ledger, warnings } = parseLedger(`## D-001: x
- date: July 4th · source: manual · status: active
`);
    expect(ledger.decisions[0]!.date).toBe('July 4th');
    expect(warnings.some((w) => w.code === 'bad-date')).toBe(true);
  });

  it('routes unknown bullets to extraFields and prose to bodyLines, verbatim', () => {
    const { ledger } = parseLedger(`## D-001: x
- date: 2026-01-01 · source: manual · status: active
- owner: arun
Prose line.

    indented code-ish line
`);
    const d = ledger.decisions[0]!;
    expect(d.extraFields).toEqual([['owner', 'arun']]);
    expect(d.bodyLines).toEqual(['Prose line.', '', '    indented code-ish line']);
  });

  it('treats each detect bullet as one pattern (commas allowed inside regex)', () => {
    const { ledger } = parseLedger(`## D-001: x
- date: 2026-01-01 · source: manual · status: active
- detect: foo{1,3}bar
- detect: baz
`);
    expect(ledger.decisions[0]!.detect).toEqual(['foo{1,3}bar', 'baz']);
  });

  it('keeps a comma-containing source intact on the metadata line', () => {
    const { ledger } = parseLedger(`## D-002: x
- date: 2026-06-02, source: claude-code session, pair review
`);
    expect(ledger.decisions[0]!.source).toBe('claude-code session, pair review');
  });

  it('parses G-prefixed ledgers', () => {
    const { ledger } = parseLedger(
      `## G-001: prefer conventional commits
- date: 2026-01-01 · source: manual · status: active
`,
      'G',
    );
    expect(ledger.decisions[0]!.id).toBe('G-001');
    expect(ledger.idPrefix).toBe('G');
  });

  it('CRLF line endings parse identically to LF (autocrlf checkouts)', () => {
    const lf = `## D-001: Use pnpm\n- date: 2026-01-01 · source: manual · status: active\n- rule: pnpm only\n`;
    const crlf = lf.replace(/\n/g, '\r\n');
    const a = parseLedger(lf);
    const b = parseLedger(crlf);
    expect(b.ledger).toEqual(a.ledger);
    expect(b.ledger.decisions[0]!.rule).toBe('pnpm only'); // no trailing \r
  });

  it('handles empty input', () => {
    const { ledger, warnings } = parseLedger('');
    expect(ledger.decisions).toEqual([]);
    expect(ledger.preamble).toBe('');
    expect(warnings).toEqual([]);
  });
});
