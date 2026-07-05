import { describe, expect, it } from 'vitest';
import { parseLedger } from '../src/core/parse.js';
import { checkFileForContradictions, compileRules } from '../src/enforce/contradiction.js';

const LEDGER = `# Decisions

## D-001: Use Supabase RLS for authorization
- date: 2026-07-04 · source: manual · status: active
- rule: no manual user_id filtering in API routes
- applies_to: src/api/**
- detect: user_id\\s*===?

## D-002: Never use moment.js
- date: 2026-07-04 · source: manual · status: active
- rule: use date-fns
- detect: require\\(['"]moment|from ['"]moment

## D-003: Old superseded rule
- date: 2026-07-01 · source: manual · status: superseded
- detect: SHOULD_NEVER_FIRE
- superseded-by: D-002
`;

function compiled() {
  return compileRules(parseLedger(LEDGER).ledger);
}

describe('compileRules', () => {
  it('compiles only active decisions with detect patterns', () => {
    const c = compiled();
    expect(c.rules.map((r) => r.decision.id)).toEqual(['D-001', 'D-002']);
    expect(c.badPatterns).toEqual([]);
  });

  it('collects invalid regexes instead of crashing', () => {
    const { ledger } = parseLedger(`## D-001: broken
- date: 2026-01-01 · source: manual · status: active
- detect: [unclosed
`);
    const c = compileRules(ledger);
    expect(c.rules).toEqual([]);
    expect(c.badPatterns).toHaveLength(1);
    expect(c.badPatterns[0]!.id).toBe('D-001');
  });
});

describe('checkFileForContradictions', () => {
  it('flags a violation inside applies_to scope with file:line', () => {
    const code = `export async function getOrders(req) {
  const rows = await db.query('...');
  return rows.filter(r => r.user_id === req.user.id);
}`;
    const findings = checkFileForContradictions(compiled(), 'src/api/orders.ts', code);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.decision.id).toBe('D-001');
    expect(findings[0]!.line).toBe(3);
    expect(findings[0]!.excerpt).toContain('user_id ===');
  });

  it('same code outside applies_to scope is fine', () => {
    const code = `const x = row.user_id === session.id;`;
    expect(checkFileForContradictions(compiled(), 'scripts/migrate.ts', code)).toEqual([]);
  });

  it('decisions without applies_to scan every file', () => {
    const code = `import moment from 'moment';`;
    const findings = checkFileForContradictions(compiled(), 'anywhere/x.ts', code);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.decision.id).toBe('D-002');
  });

  it('superseded decisions never fire', () => {
    const findings = checkFileForContradictions(compiled(), 'x.ts', 'SHOULD_NEVER_FIRE');
    expect(findings).toEqual([]);
  });

  it('caps findings per decision per file at 5', () => {
    const code = Array.from({ length: 20 }, (_, i) => `if (a.user_id === ${i}) {}`).join('\n');
    const findings = checkFileForContradictions(compiled(), 'src/api/spam.ts', code);
    expect(findings).toHaveLength(5);
  });

  it('accepts /wrapped/ regex syntax', () => {
    const { ledger } = parseLedger(`## D-001: wrapped
- date: 2026-01-01 · source: manual · status: active
- detect: /console\\.log/
`);
    const c = compileRules(ledger);
    const findings = checkFileForContradictions(c, 'x.ts', 'console.log("hi")');
    expect(findings).toHaveLength(1);
  });
});
