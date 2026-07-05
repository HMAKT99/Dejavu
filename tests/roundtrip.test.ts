import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildIndex, serializeIndex } from '../src/core/indexer.js';
import { parseLedger } from '../src/core/parse.js';
import { serializeLedger } from '../src/core/serialize.js';
import type { Decision, Ledger } from '../src/core/types.js';

const LEDGERS = path.join(import.meta.dirname, '..', 'testdata', 'ledgers');
const EPOCH = '1970-01-01T00:00:00.000Z';
const UPDATE = process.env.UPDATE_GOLDEN === '1';

const cases = readdirSync(LEDGERS, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

describe('golden fixtures', () => {
  for (const name of cases) {
    describe(name, () => {
      const dir = path.join(LEDGERS, name);
      const input = readFileSync(path.join(dir, 'input.md'), 'utf8');

      it('serializes to the expected canonical form', () => {
        const { ledger } = parseLedger(input);
        const actual = serializeLedger(ledger);
        const expectedPath = path.join(dir, 'expected.md');
        if (UPDATE) writeFileSync(expectedPath, actual);
        expect(actual).toBe(readFileSync(expectedPath, 'utf8'));
      });

      it('builds the expected index', () => {
        const { ledger } = parseLedger(input);
        const actual = serializeIndex(buildIndex(ledger, EPOCH));
        const expectedPath = path.join(dir, 'expected.index.json');
        if (UPDATE) writeFileSync(expectedPath, actual);
        expect(actual).toBe(readFileSync(expectedPath, 'utf8'));
      });

      it('emits the expected warnings', () => {
        const { warnings } = parseLedger(input);
        const expectedPath = path.join(dir, 'expected.warnings.json');
        if (UPDATE) {
          if (warnings.length > 0)
            writeFileSync(expectedPath, `${JSON.stringify(warnings, null, 2)}\n`);
          else if (existsSync(expectedPath)) rmSync(expectedPath);
        }
        const expected = existsSync(expectedPath)
          ? JSON.parse(readFileSync(expectedPath, 'utf8'))
          : [];
        expect(warnings).toEqual(expected);
      });

      it('is a fixed point after one canonicalization', () => {
        const once = serializeLedger(parseLedger(input).ledger);
        const twice = serializeLedger(parseLedger(once).ledger);
        expect(twice).toBe(once);
      });

      it('loses no content: every field value from input survives', () => {
        const { ledger } = parseLedger(input);
        const output = serializeLedger(ledger);
        for (const d of ledger.decisions) {
          expect(output).toContain(d.title);
          if (d.rule) expect(output).toContain(d.rule);
          if (d.context) expect(output).toContain(d.context);
          for (const [, v] of d.extraFields) expect(output).toContain(v);
          for (const line of d.bodyLines) expect(output).toContain(line);
        }
      });
    });
  }
});

describe('generative round-trips', () => {
  // Deterministic PRNG — no Math.random, reproducible failures.
  function mulberry32(seed: number) {
    let a = seed;
    return () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const TITLES = [
    'Use pnpm not npm',
    'Alle Daten in UTC speichern — für immer',
    '数据库迁移永远向前',
    'No ORMs; SQL lives in src/db/queries',
    'emoji in titles 🎯 should survive',
    'A very long title '.repeat(12).trim(),
  ];
  const WORDS = ['auth', 'cache', 'RLS', 'später', 'edge-cases', 'naïve', 'π≈3.14159', 'a·b'];

  function randomDecision(rand: () => number, i: number, prefix: 'D' | 'G'): Decision {
    const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)]!;
    const maybe = <T>(v: T): T | undefined => (rand() < 0.5 ? v : undefined);
    const d: Decision = {
      id: `${prefix}-${String(i + 1).padStart(3, '0')}`,
      title: pick(TITLES),
      date: '2026-07-05',
      source: pick(['manual', 'claude-code session', 'openclaw session']),
      status: pick(['active', 'superseded', 'deprecated'] as const),
      extraFields: [],
      bodyLines: [],
    };
    const ctx = maybe(`${pick(WORDS)} ${pick(WORDS)} ${pick(WORDS)}`);
    if (ctx !== undefined) d.context = ctx;
    const rule = maybe(`always ${pick(WORDS)}; never ${pick(WORDS)}`);
    if (rule !== undefined) d.rule = rule;
    if (rand() < 0.3) d.appliesTo = ['src/**', 'lib/*.ts'];
    if (rand() < 0.3) d.detect = ['user_id\\s*===?', 'require\\(["\']moment'];
    if (rand() < 0.2 && i > 0) d.supersedes = [`${prefix}-${String(i).padStart(3, '0')}`];
    if (rand() < 0.3) d.extraFields.push(['owner', pick(WORDS)], ['revisit', '2027-01-01']);
    if (rand() < 0.3) d.bodyLines.push('Extra prose line.', '', `More about ${pick(WORDS)}.`);
    return d;
  }

  it('parse(serialize(L)) preserves every ledger built via the API (200 seeds)', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const rand = mulberry32(seed);
      const prefix = rand() < 0.5 ? 'D' : 'G';
      const n = 1 + Math.floor(rand() * 8);
      const ledger: Ledger = {
        preamble: seed % 3 === 0 ? '' : '# Decisions\n\nSome preamble.\n',
        decisions: Array.from({ length: n }, (_, i) => randomDecision(rand, i, prefix)),
        idPrefix: prefix,
      };
      const text = serializeLedger(ledger);
      const { ledger: back, warnings } = parseLedger(text, prefix);

      expect(warnings, `seed ${seed} should parse its own output warning-free`).toEqual([]);
      expect(back.decisions.length).toBe(ledger.decisions.length);
      for (let i = 0; i < n; i++) {
        const a = ledger.decisions[i]!;
        const b = back.decisions[i]!;
        expect(b.id, `seed ${seed} #${i}`).toBe(a.id);
        expect(b.title).toBe(a.title);
        expect(b.status).toBe(a.status);
        expect(b.rule ?? null).toBe(a.rule ?? null);
        expect(b.context ?? null).toBe(a.context ?? null);
        expect(b.appliesTo ?? []).toEqual(a.appliesTo ?? []);
        expect(b.detect ?? []).toEqual(a.detect ?? []);
        expect(b.supersedes ?? []).toEqual(a.supersedes ?? []);
        expect(b.extraFields).toEqual(a.extraFields);
        // bodyLines: internal blanks collapse at block edges only; compare trimmed run
        expect(b.bodyLines.join('\n').trim()).toBe(a.bodyLines.join('\n').trim());
      }
      // Idempotence
      expect(serializeLedger(back)).toBe(text);
    }
  });
});
