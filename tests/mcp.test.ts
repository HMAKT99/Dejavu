import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseLedger } from '../src/core/parse.js';
import { DuplicationIndex } from '../src/enforce/duplication.js';
import { checkSnippet, getDecision, listActive, searchDecisions } from '../src/mcp/handlers.js';

const APP = path.join(import.meta.dirname, '..', 'examples', 'spaghetti-app');
const { ledger } = parseLedger(readFileSync(path.join(APP, 'DECISIONS.md'), 'utf8'));

function appIndex(): DuplicationIndex {
  const index = new DuplicationIndex();
  for (const rel of ['utils/text.ts', 'utils/dates.ts', 'lib/helpers.ts']) {
    index.addFile(rel, readFileSync(path.join(APP, rel), 'utf8'));
  }
  return index;
}

describe('search_decisions', () => {
  it('finds decisions by keyword, active ranked above superseded', () => {
    const hits = searchDecisions(ledger, 'authorization');
    expect(hits.length).toBeGreaterThanOrEqual(2);
    expect(hits[0]!.id).toBe('D-002'); // active beats superseded D-001
    expect(hits[0]!.rule).toContain('RLS');
  });

  it('matches by ID too', () => {
    expect(searchDecisions(ledger, 'D-004')[0]!.id).toBe('D-004');
  });

  it('empty/one-letter queries return nothing', () => {
    expect(searchDecisions(ledger, '')).toEqual([]);
    expect(searchDecisions(ledger, 'a')).toEqual([]);
  });
});

describe('get_decision', () => {
  it('returns the full markdown block, case-insensitive', () => {
    const block = getDecision(ledger, 'd-002');
    expect(block).toContain('## D-002: Use Supabase RLS');
    expect(block).toContain('- supersedes: D-001');
  });

  it('unknown ID returns null', () => {
    expect(getDecision(ledger, 'D-999')).toBeNull();
  });
});

describe('check_against_decisions', () => {
  it('flags a snippet that contradicts D-002 in scope', () => {
    const result = checkSnippet(
      ledger,
      appIndex(),
      'const mine = rows.filter((r) => r.user_id === req.user.id);',
      'app/api/invoices/route.ts',
    );
    expect(result.contradictions).toHaveLength(1);
    expect(result.contradictions[0]!.decision.id).toBe('D-002');
  });

  it('flags a snippet that re-implements an existing function', () => {
    const snippet = `function toSlug(s) {
  const lowered = s.toLowerCase().trim();
  const cleaned = lowered.replace(/[^a-z0-9\\s-]/g, '');
  const collapsed = cleaned.replace(/[\\s-]+/g, '-');
  return collapsed.replace(/^-+|-+$/g, '');
}`;
    const result = checkSnippet(ledger, appIndex(), snippet, 'lib/new.ts');
    expect(result.duplicates.length).toBeGreaterThanOrEqual(1);
    expect(result.duplicates.map((d) => d.existing)).toContain('slugify()');
  });

  it('clean code passes', () => {
    const result = checkSnippet(
      ledger,
      appIndex(),
      'export const sum = (a: number, b: number) => a + b;',
      'lib/math.ts',
    );
    expect(result.contradictions).toEqual([]);
    expect(result.duplicates).toEqual([]);
  });
});

describe('list_active_decisions', () => {
  it('lists only active decisions', () => {
    const active = listActive(ledger);
    expect(active.map((d) => d.id)).toEqual(['D-002', 'D-003', 'D-004']);
  });
});

describe('server construction', () => {
  it('createServer wires up without a transport', async () => {
    const { createServer } = await import('../src/mcp/server.js');
    const server = createServer({
      root: APP,
      ledgerLoc: {
        ledgerPath: path.join(APP, 'DECISIONS.md'),
        indexPath: null,
        backupDir: path.join(APP, '.dejavu', 'backup'),
        ctx: { layer: 'repo', repoRoot: APP, machineHome: '' },
        idPrefix: 'D',
      },
    });
    expect(server).toBeDefined();
  });
});
