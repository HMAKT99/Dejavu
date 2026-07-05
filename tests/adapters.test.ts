import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { adapters, findAdapter } from '../src/adapters/registry.js';
import { upsertManagedBlock } from '../src/core/managedBlock.js';
import { parseLedger } from '../src/core/parse.js';
import { renderProjectBlock } from '../src/core/render.js';

const TESTDATA = path.join(import.meta.dirname, '..', 'testdata');
const UPDATE = process.env.UPDATE_GOLDEN === '1';

/**
 * Adapter golden tests: testdata/<tool>/<case>/ holds ledger.md, an optional
 * input.<target>, and expected.<target>. This is the contract a community
 * adapter PR must satisfy — add a folder, run UPDATE_GOLDEN=1, review the diff.
 */
describe('adapter golden files', () => {
  for (const adapter of adapters) {
    const toolDir = path.join(TESTDATA, adapter.name);
    if (!existsSync(toolDir)) continue;
    const cases = readdirSync(toolDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();

    describe(adapter.name, () => {
      for (const name of cases) {
        it(name, () => {
          const dir = path.join(toolDir, name);
          const ledgerText = readFileSync(path.join(dir, 'ledger.md'), 'utf8');
          const { ledger } = parseLedger(ledgerText);
          const target = adapter.projectTarget([]);
          const base = path.basename(target);

          const inputPath = path.join(dir, `input.${base}`);
          const input = existsSync(inputPath) ? readFileSync(inputPath, 'utf8') : '';

          const actual = upsertManagedBlock(input, renderProjectBlock(ledger));

          const expectedPath = path.join(dir, `expected.${base}`);
          if (UPDATE) writeFileSync(expectedPath, actual);
          expect(actual).toBe(readFileSync(expectedPath, 'utf8'));
        });
      }
    });
  }
});

describe('adapter registry', () => {
  it('detects tools from repo-root entries', () => {
    expect(findAdapter('claude-code')!.detect(['CLAUDE.md', 'src'])).toBe(true);
    expect(findAdapter('claude-code')!.detect(['.claude', 'src'])).toBe(true);
    expect(findAdapter('claude-code')!.detect(['src'])).toBe(false);
    expect(findAdapter('agents-md')!.detect(['AGENTS.md'])).toBe(true);
    expect(findAdapter('cursor')!.detect(['.cursorrules'])).toBe(true);
    expect(findAdapter('cursor')!.detect(['.cursor'])).toBe(true);
    expect(findAdapter('openclaw')!.detect(['MEMORY.md'])).toBe(true);
    expect(findAdapter('openclaw')!.detect(['.openclaw'])).toBe(true);
  });

  it('every adapter has a unique name and target', () => {
    const names = adapters.map((a) => a.name);
    expect(new Set(names).size).toBe(names.length);
    const targets = adapters.map((a) => a.projectTarget([]));
    expect(new Set(targets).size).toBe(targets.length);
  });

  it('only claude-code has a local (uncommitted) target in v0.1', () => {
    for (const a of adapters) {
      if (a.name === 'claude-code') expect(a.localTarget).toBe('CLAUDE.local.md');
      else expect(a.localTarget).toBeUndefined();
    }
  });
});
