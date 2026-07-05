import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkAction } from '../src/cli/commands/check.js';
import { installHook, uninstallHook } from '../src/cli/commands/hooks.js';
import { type ActionIo, initAction } from '../src/cli/commands/init.js';
import { rememberAction } from '../src/cli/commands/remember.js';
import { scoreAction } from '../src/cli/commands/score.js';
import { makeSandbox, type Sandbox } from './helpers/tmpRepo.js';

let sb: Sandbox;
let io: ActionIo;

const SLUGIFY = `export function slugify(input) {
  const lowered = input.toLowerCase().trim();
  const cleaned = lowered.replace(/[^a-z0-9\\s-]/g, '');
  const collapsed = cleaned.replace(/[\\s-]+/g, '-');
  return collapsed.replace(/^-+|-+$/g, '');
}`;

const SLUGIFY_CLONE = `function makeUrlSlug(text) {
  const lowered = text.toLowerCase().trim();
  const cleaned = lowered.replace(/[^a-z0-9\\s-]/g, "");
  const collapsed = cleaned.replace(/[\\s-]+/g, "-");
  return collapsed.replace(/^-+|-+$/g, "");
}`;

function write(rel: string, text: string) {
  const full = path.join(sb.repo, rel);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, text);
}

function gitAdd(...files: string[]) {
  execFileSync('git', ['add', ...files], { cwd: sb.repo });
}

beforeEach(async () => {
  sb = makeSandbox();
  io = { cwd: sb.repo, env: sb.env, now: () => new Date('2026-07-05T12:00:00Z') };
  await initAction(io);
  await rememberAction(
    'Use Supabase RLS for authorization',
    {
      rule: 'no manual user_id filtering in API routes',
      appliesTo: ['src/api/**'],
      detect: ['user_id\\s*===?'],
    },
    io,
  );
});

afterEach(() => sb.cleanup());

describe('dejavu check', () => {
  it('flags a contradiction in a changed file inside applies_to scope', async () => {
    write('src/api/orders.ts', 'const mine = rows.filter(r => r.user_id === uid);\n');
    const report = await checkAction({}, [], io);
    expect(report.contradictions).toHaveLength(1);
    expect(report.contradictions[0]!.decision.id).toBe('D-001');
    expect(report.contradictions[0]!.file).toBe('src/api/orders.ts');
    expect(report.duplicates).toEqual([]);
  });

  it('ignores the same pattern outside applies_to scope', async () => {
    write('scripts/backfill.ts', 'if (row.user_id === target) {}\n');
    const report = await checkAction({}, [], io);
    expect(report.contradictions).toEqual([]);
  });

  it('flags a duplicate of an existing committed function', async () => {
    write('utils/text.ts', SLUGIFY);
    gitAdd('utils/text.ts');
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'base'], {
      cwd: sb.repo,
    });
    write('src/newstuff.ts', SLUGIFY_CLONE);

    const report = await checkAction({}, [], io);
    expect(report.duplicates).toHaveLength(1);
    expect(report.duplicates[0]!.fn.name).toBe('makeUrlSlug');
    expect(report.duplicates[0]!.existing.file).toBe('utils/text.ts');
  });

  it('--staged checks only staged files', async () => {
    write('src/api/staged.ts', 'a.user_id === b\n');
    write('src/api/unstaged.ts', 'c.user_id === d\n');
    gitAdd('src/api/staged.ts');
    const report = await checkAction({ staged: true }, [], io);
    expect(report.contradictions.map((c) => c.file)).toEqual(['src/api/staged.ts']);
  });

  it('explicit file arguments narrow the scan (hook mode)', async () => {
    write('src/api/a.ts', 'x.user_id === y\n');
    write('src/api/b.ts', 'x.user_id === y\n');
    const report = await checkAction({}, ['src/api/a.ts'], io);
    expect(report.contradictions.map((c) => c.file)).toEqual(['src/api/a.ts']);
  });

  it('never scans DECISIONS.md or .dejavu (self-match exclusion)', async () => {
    // DECISIONS.md literally contains "user_id\s*===?" — must not fire
    const report = await checkAction({ all: true }, [], io);
    expect(report.contradictions).toEqual([]);
  });

  it('a clean changed file reports nothing', async () => {
    write('src/api/clean.ts', 'export const ok = () => auth.viaRls();\n');
    const report = await checkAction({}, [], io);
    expect(report.contradictions).toEqual([]);
    expect(report.duplicates).toEqual([]);
  });
});

describe('dejavu score', () => {
  it('scores a repo and reflects duplication + contradictions', async () => {
    write('utils/text.ts', SLUGIFY);
    write('src/copy.ts', SLUGIFY_CLONE);
    write('src/api/bad.ts', 'rows.filter(r => r.user_id === uid);\n');
    const card = await scoreAction(io);
    expect(card.input.totalFunctions).toBe(2);
    expect(card.input.duplicatedFunctions).toBe(2);
    expect(card.input.contradictionCount).toBe(1);
    expect(card.input.activeDecisionCount).toBe(1);
    expect(card.input.enforceableDecisionCount).toBe(1);
    expect(card.score).toBeLessThan(60);
  });

  it('clean repo with one enforceable decision scores 100', async () => {
    write('src/fine.ts', 'export const t = (a, b) => a + b;\n');
    const card = await scoreAction(io);
    expect(card.score).toBe(100);
    expect(card.grade).toBe('A+');
  });
});

describe('dejavu hooks', () => {
  it('installs, updates, and uninstalls the pre-commit hook', async () => {
    expect(await installHook(io, false)).toBe('installed');
    const hookPath = path.join(sb.repo, '.git', 'hooks', 'pre-commit');
    const script = readFileSync(hookPath, 'utf8');
    expect(script).toContain('dejavu check --staged');
    expect(script).not.toContain('--strict');

    expect(await installHook(io, true)).toBe('updated');
    expect(readFileSync(hookPath, 'utf8')).toContain('--strict');

    expect(await uninstallHook(io)).toBe('removed');
    expect(await uninstallHook(io)).toBe('absent');
  });

  it('refuses to touch a foreign pre-commit hook', async () => {
    const hookPath = path.join(sb.repo, '.git', 'hooks', 'pre-commit');
    mkdirSync(path.dirname(hookPath), { recursive: true });
    writeFileSync(hookPath, '#!/bin/sh\nmy-own-linter\n');
    expect(await installHook(io, false)).toBe('refused-foreign');
    expect(await uninstallHook(io)).toBe('refused-foreign');
    expect(readFileSync(hookPath, 'utf8')).toContain('my-own-linter');
  });
});
