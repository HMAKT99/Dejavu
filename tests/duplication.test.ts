import { describe, expect, it } from 'vitest';
import { DuplicationIndex } from '../src/enforce/duplication.js';
import { extractFunctions } from '../src/enforce/functions.js';
import { tokenize } from '../src/enforce/tokenize.js';

const SLUGIFY_A = `export function slugify(input) {
  const lowered = input.toLowerCase().trim();
  const cleaned = lowered.replace(/[^a-z0-9\\s-]/g, '');
  const collapsed = cleaned.replace(/[\\s-]+/g, '-');
  return collapsed.replace(/^-+|-+$/g, '');
}`;

// Same algorithm, different names, quotes, and comments — the AI rewrite case
const SLUGIFY_B = `// helper to make URL-safe strings
function makeUrlSlug(text) {
  const lowered = text.toLowerCase().trim();
  const cleaned = lowered.replace(/[^a-z0-9\\s-]/g, "");
  const collapsed = cleaned.replace(/[\\s-]+/g, "-");
  return collapsed.replace(/^-+|-+$/g, "");
}`;

// SLUGIFY_A with only the function name changed (verbatim AI re-emit)
const SLUGIFY_A_RENAMED = SLUGIFY_A.replace('function slugify', 'function urlSafeSlug');

const UNRELATED = `export function totalPrice(items, taxRate) {
  let subtotal = 0;
  for (const item of items) {
    subtotal += item.price * item.quantity;
  }
  const tax = subtotal * taxRate;
  return Math.round((subtotal + tax) * 100) / 100;
}`;

describe('extractFunctions', () => {
  it('finds JS function declarations, arrows, and function expressions', () => {
    const src = `
function alpha(a, b) {
  return a + b;
}
export const beta = (x) => {
  return x * 2;
};
const gamma = async function (y) {
  return y;
};
`;
    const fns = extractFunctions('x.ts', src);
    expect(fns.map((f) => f.name)).toEqual(['alpha', 'beta', 'gamma']);
    expect(fns[0]!.line).toBe(2);
  });

  it('finds Python defs by indentation', () => {
    const src = `import os

def first(a):
    x = a + 1
    return x

async def second(b):
    return b

def third():
    pass
`;
    const fns = extractFunctions('x.py', src);
    expect(fns.map((f) => f.name)).toEqual(['first', 'second', 'third']);
    expect(fns[0]!.body).toContain('return x');
    expect(fns[0]!.body).not.toContain('async def');
  });

  it('ignores unsupported extensions', () => {
    expect(extractFunctions('x.go', 'func main() {}')).toEqual([]);
  });
});

describe('tokenize', () => {
  it('normalizes strings, numbers, and comments away', () => {
    const a = tokenize(`const x = "hello"; // comment\nreturn x + 42;`);
    const b = tokenize(`const x = 'world'; /* other */\nreturn x + 7;`);
    expect(a).toEqual(b);
    expect(a).toContain('STR');
    expect(a).toContain('NUM');
  });
});

describe('DuplicationIndex', () => {
  it('flags a renamed re-implementation across files', () => {
    const index = new DuplicationIndex();
    index.addFile('utils/text.ts', SLUGIFY_A);
    index.addFile('lib/newstuff.ts', SLUGIFY_B);
    index.addFile('lib/pricing.ts', UNRELATED);

    const findings = index.checkFiles(new Set(['lib/newstuff.ts']));
    expect(findings).toHaveLength(1);
    const f = findings[0]!;
    expect(f.fn.name).toBe('makeUrlSlug');
    expect(f.existing.name).toBe('slugify');
    expect(f.existing.file).toBe('utils/text.ts');
    expect(f.similarity).toBeGreaterThan(0.72);
  });

  it('does not flag unrelated functions', () => {
    const index = new DuplicationIndex();
    index.addFile('utils/text.ts', SLUGIFY_A);
    index.addFile('lib/pricing.ts', UNRELATED);
    expect(index.checkFiles(new Set(['lib/pricing.ts']))).toEqual([]);
  });

  it('ignores tiny functions (too generic to flag)', () => {
    const index = new DuplicationIndex();
    index.addFile('a.ts', 'export function id(x) { return x; }');
    index.addFile('b.ts', 'export function ident(y) { return y; }');
    expect(index.checkFiles(new Set(['b.ts']))).toEqual([]);
  });

  it('catches duplicates between two changed files', () => {
    const index = new DuplicationIndex();
    index.addFile('one.ts', SLUGIFY_A);
    index.addFile('two.ts', SLUGIFY_B);
    const findings = index.checkFiles(new Set(['one.ts', 'two.ts']));
    expect(findings).toHaveLength(1); // symmetric pair reported once
  });

  it('catches a rename-only exact copy at 100% even among heavy boilerplate', () => {
    const index = new DuplicationIndex();
    // 80 near-identical boilerplate functions saturate the shingle buckets
    for (let i = 0; i < 80; i++) {
      index.addFile(
        `gen/file${i}.ts`,
        `export function handler${i}(req, res) {
  const body = req.body;
  const parsed = schema.parse(body);
  const result = service.run(parsed);
  res.json({ ok: true, data: result, meta: { version: 1 } });
  return result;
}`,
      );
    }
    index.addFile('utils/text.ts', SLUGIFY_A);
    index.addFile('ai/new.ts', SLUGIFY_A_RENAMED);
    const findings = index.checkFiles(new Set(['ai/new.ts']));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.similarity).toBe(1);
    expect(findings[0]!.existing.name).toBe('slugify');
  });

  it('duplicationStats counts duplicated functions repo-wide', () => {
    const index = new DuplicationIndex();
    index.addFile('utils/text.ts', SLUGIFY_A);
    index.addFile('lib/newstuff.ts', SLUGIFY_B);
    index.addFile('lib/pricing.ts', UNRELATED);
    const stats = index.duplicationStats();
    expect(stats.totalFunctions).toBe(3);
    expect(stats.duplicatedFunctions).toBe(2);
    expect(stats.pairs).toHaveLength(1);
  });
});
