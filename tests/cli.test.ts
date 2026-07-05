import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type ActionIo, initAction } from '../src/cli/commands/init.js';
import { rememberAction } from '../src/cli/commands/remember.js';
import { parseLedger } from '../src/core/parse.js';
import { makeSandbox, type Sandbox, treeSnapshot } from './helpers/tmpRepo.js';

let sb: Sandbox;
let io: ActionIo;

beforeEach(() => {
  sb = makeSandbox();
  io = { cwd: sb.repo, env: sb.env, now: () => new Date('2026-07-05T12:00:00Z') };
});

afterEach(() => sb.cleanup());

const read = (rel: string) => readFileSync(path.join(sb.repo, rel), 'utf8');

describe('dejavu init', () => {
  it('creates DECISIONS.md, .dejavu/index.json and .dejavu/.gitignore', async () => {
    const created = await initAction(io);
    expect(created.sort()).toEqual(['.dejavu/.gitignore', '.dejavu/index.json', 'DECISIONS.md']);
    expect(read('DECISIONS.md')).toContain('# Decisions');
    expect(JSON.parse(read('.dejavu/index.json')).version).toBe(1);
    expect(read('.dejavu/.gitignore')).toContain('queue.jsonl');
  });

  it('is idempotent: second run creates nothing and changes nothing', async () => {
    await initAction(io);
    await rememberAction('Use pnpm', {}, io);
    const before = treeSnapshot(sb.repo);
    const created = await initAction(io);
    expect(created).toEqual([]);
    expect(treeSnapshot(sb.repo)).toEqual(before);
  });

  it('fills in missing pieces without touching existing files', async () => {
    await initAction(io);
    await rememberAction('Keep me', {}, io);
    const ledgerBefore = read('DECISIONS.md');
    rmSync(path.join(sb.repo, '.dejavu', 'index.json'));
    const created = await initAction(io);
    expect(created).toEqual(['.dejavu/index.json']);
    expect(read('DECISIONS.md')).toBe(ledgerBefore);
    // Regenerated index reflects the existing ledger, not an empty one.
    expect(JSON.parse(read('.dejavu/index.json')).decisions).toHaveLength(1);
  });
});

describe('dejavu remember', () => {
  beforeEach(async () => {
    await initAction(io);
  });

  it('records a full decision and it parses back identically', async () => {
    const result = await rememberAction(
      'Use Supabase RLS for authorization',
      {
        context: 'auth bugs from duplicated API checks',
        rule: 'all authorization goes through RLS policies',
        appliesTo: ['src/api/**'],
        detect: ['user_id\\s*==='],
      },
      io,
    );
    if (result.kind !== 'recorded') throw new Error('expected recorded');
    expect(result.decision.id).toBe('D-001');

    const { ledger, warnings } = parseLedger(read('DECISIONS.md'));
    expect(warnings).toEqual([]);
    const d = ledger.decisions.find((x) => x.id === 'D-001')!;
    expect(d.title).toBe('Use Supabase RLS for authorization');
    expect(d.rule).toBe('all authorization goes through RLS policies');
    expect(d.appliesTo).toEqual(['src/api/**']);
    expect(d.detect).toEqual(['user_id\\s*===']);
    expect(d.date).toBe('2026-07-05');
  });

  it('supersede end-to-end: old entry flips, new entry links, index agrees', async () => {
    await rememberAction('old way', {}, io);
    const result = await rememberAction('new way', { supersedes: 'D-001' }, io);
    if (result.kind !== 'recorded') throw new Error('expected recorded');
    expect(result.decision.id).toBe('D-002');

    const { ledger } = parseLedger(read('DECISIONS.md'));
    const old = ledger.decisions.find((d) => d.id === 'D-001')!;
    expect(old.status).toBe('superseded');
    expect(old.supersededBy).toEqual(['D-002']);

    const index = JSON.parse(read('.dejavu/index.json'));
    expect(index.decisions.find((d: { id: string }) => d.id === 'D-001').status).toBe('superseded');
    expect(index.warnings).toEqual([]);
  });

  it('IDs allocate sequentially across runs', async () => {
    for (let i = 1; i <= 3; i++) {
      const r = await rememberAction(`decision ${i}`, {}, io);
      if (r.kind !== 'recorded') throw new Error('expected recorded');
      expect(r.decision.id).toBe(`D-00${i}`);
    }
  });

  it('--queue leaves the ledger alone and appends to queue.jsonl', async () => {
    const ledgerBefore = read('DECISIONS.md');
    const r = await rememberAction('try pnpm', { queue: true }, io);
    expect(r).toEqual({ kind: 'queued', pending: 1 });
    expect(read('DECISIONS.md')).toBe(ledgerBefore);
    const line = JSON.parse(read('.dejavu/queue.jsonl').trim());
    expect(line.draft.title).toBe('try pnpm');
    expect(line.v).toBe(1);
  });

  it('rebuilds a deleted index.json from markdown on the next command', async () => {
    await rememberAction('a decision', {}, io);
    rmSync(path.join(sb.repo, '.dejavu', 'index.json'));
    await rememberAction('queued', { queue: true }, io); // touches queue only, but heals index
    expect(existsSync(path.join(sb.repo, '.dejavu', 'index.json'))).toBe(true);
    expect(JSON.parse(read('.dejavu/index.json')).decisions).toHaveLength(1);
  });

  it('rebuilds a corrupted index.json from markdown (markdown wins)', async () => {
    await rememberAction('truth lives in markdown', {}, io);
    writeFileSync(
      path.join(sb.repo, '.dejavu', 'index.json'),
      '{"version":1,"decisions":[{"id":"D-9',
    );
    await rememberAction('another', { queue: true }, io);
    const index = JSON.parse(read('.dejavu/index.json'));
    expect(index.decisions).toHaveLength(1);
    expect(index.decisions[0].title).toBe('truth lives in markdown');
  });

  it('works from a subdirectory (repo root discovery)', async () => {
    const sub = path.join(sb.repo, 'src', 'deep');
    const { mkdirSync } = await import('node:fs');
    mkdirSync(sub, { recursive: true });
    const r = await rememberAction('found the root', {}, { ...io, cwd: sub });
    if (r.kind !== 'recorded') throw new Error('expected recorded');
    expect(read('DECISIONS.md')).toContain('found the root');
    expect(existsSync(path.join(sub, 'DECISIONS.md'))).toBe(false);
  });

  it('hand-edited (messy) ledger still accepts appends and canonicalizes safely', async () => {
    writeFileSync(
      path.join(sb.repo, 'DECISIONS.md'),
      `# My decisions
## D-3 - use tabs
* status: Active | date: 2026-01-01 | source: manual
`,
    );
    const r = await rememberAction('next decision', {}, io);
    if (r.kind !== 'recorded') throw new Error('expected recorded');
    expect(r.decision.id).toBe('D-004'); // max+1 over hand-written D-3
    const { ledger } = parseLedger(read('DECISIONS.md'));
    expect(ledger.decisions.map((d) => d.id)).toEqual(['D-3', 'D-004']);
    expect(ledger.preamble).toContain('# My decisions');
  });
});
