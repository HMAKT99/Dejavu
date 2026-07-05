import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type ActionIo, initAction } from '../src/cli/commands/init.js';
import { projectAction, refreshExistingProjections } from '../src/cli/commands/project.js';
import { rememberAction } from '../src/cli/commands/remember.js';
import { makeSandbox, type Sandbox } from './helpers/tmpRepo.js';

let sb: Sandbox;
let io: ActionIo;

beforeEach(async () => {
  sb = makeSandbox();
  io = { cwd: sb.repo, env: sb.env, now: () => new Date('2026-07-05T12:00:00Z') };
  await initAction(io);
  await rememberAction('Use pnpm, never npm', { rule: 'pnpm for all package operations' }, io);
});

afterEach(() => sb.cleanup());

const read = (rel: string) => readFileSync(path.join(sb.repo, rel), 'utf8');
const write = (rel: string, text: string) => writeFileSync(path.join(sb.repo, rel), text);

describe('dejavu project', () => {
  it('projects into an explicitly requested tool, creating the file', async () => {
    const { results } = await projectAction({ to: ['claude-code'] }, io);
    expect(results).toHaveLength(1);
    expect(results[0]!.outcome).toBe('created');
    const text = read('CLAUDE.md');
    expect(text).toContain('<!-- dejavu:begin -->');
    expect(text).toContain('D-001: Use pnpm, never npm');
    expect(text).toContain('rule: pnpm for all package operations');
  });

  it('detects tools from repo files when no --to given', async () => {
    write('AGENTS.md', '# Agent guide\n');
    write('.cursorrules', 'Be concise.\n');
    const { results } = await projectAction({}, io);
    const targets = results.map((r) => r.target).sort();
    expect(targets).toEqual(['.cursorrules', 'AGENTS.md']);
    expect(read('AGENTS.md')).toContain('# Agent guide');
    expect(read('AGENTS.md')).toContain('dejavu:begin');
    expect(read('.cursorrules')).toContain('Be concise.');
  });

  it('never touches user content outside the block across repeated runs', async () => {
    write('CLAUDE.md', '# Mine\n\ntop text\n');
    await projectAction({ to: ['claude-code'] }, io);
    await rememberAction('All dates in UTC', { rule: 'timestamptz only' }, io);
    await projectAction({ to: ['claude-code'] }, io);
    const text = read('CLAUDE.md');
    expect(text.startsWith('# Mine\n\ntop text\n')).toBe(true);
    expect(text).toContain('D-002: All dates in UTC');
    expect(text.match(/dejavu:begin/g)).toHaveLength(1);
  });

  it('second project run with no ledger change reports unchanged', async () => {
    await projectAction({ to: ['claude-code'] }, io);
    const { results } = await projectAction({ to: ['claude-code'] }, io);
    expect(results[0]!.outcome).toBe('unchanged');
  });

  it('superseded decisions drop out of the projection', async () => {
    await projectAction({ to: ['claude-code'] }, io);
    await rememberAction('Use bun, never npm', { supersedes: 'D-001' }, io);
    await projectAction({ to: ['claude-code'] }, io);
    const text = read('CLAUDE.md');
    expect(text).toContain('D-002: Use bun, never npm');
    expect(text).not.toContain('D-001: Use pnpm');
  });

  it('refuses to write into a file with corrupted markers (file untouched)', async () => {
    const corrupt = '# Mine\n\n<!-- dejavu:begin -->\norphaned, no end marker\n';
    write('CLAUDE.md', corrupt);
    const { results } = await projectAction({ to: ['claude-code'] }, io);
    expect(results[0]!.outcome).toBe('failed');
    expect(results[0]!.detail).toContain('fix the markers by hand');
    expect(read('CLAUDE.md')).toBe(corrupt);
  });

  it('--remove strips blocks and restores pre-projection bytes', async () => {
    const original = '# Mine\n\nuser text\n';
    write('CLAUDE.md', original);
    await projectAction({ to: ['claude-code'] }, io);
    expect(read('CLAUDE.md')).not.toBe(original);
    await projectAction({ remove: true }, io);
    expect(read('CLAUDE.md')).toBe(original);
  });

  it('--remove deletes a file that consisted only of our block', async () => {
    await projectAction({ to: ['claude-code'] }, io);
    expect(existsSync(path.join(sb.repo, 'CLAUDE.md'))).toBe(true);
    await projectAction({ remove: true }, io);
    expect(existsSync(path.join(sb.repo, 'CLAUDE.md'))).toBe(false);
  });

  it('--check reports stale projections and current ones', async () => {
    await projectAction({ to: ['claude-code'] }, io);
    let res = await projectAction({ check: true }, io);
    expect(res.stale).toEqual([]);
    await rememberAction(
      'New decision',
      {},
      {
        ...io,
        // bypass auto-refresh by writing via action only — no projections refreshed here
      },
    );
    // rememberAction does not auto-refresh (that's the CLI wrapper); block is now stale
    res = await projectAction({ check: true }, io);
    expect(res.stale).toEqual(['CLAUDE.md']);
  });
});

describe('auto-refresh after ledger changes', () => {
  it('refreshes only targets that already carry a managed block', async () => {
    write('AGENTS.md', '# Agents\n');
    await projectAction({ to: ['claude-code'] }, io); // CLAUDE.md has a block; AGENTS.md does not
    await rememberAction('All dates in UTC', {}, io);
    const refreshed = await refreshExistingProjections(io);
    expect(refreshed.map((r) => r.target)).toEqual(['CLAUDE.md']);
    expect(read('CLAUDE.md')).toContain('All dates in UTC');
    expect(read('AGENTS.md')).not.toContain('dejavu:begin');
  });
});

describe('machine-layer projection (hard rule: never committed)', () => {
  beforeEach(async () => {
    await rememberAction(
      'I prefer conventional commits',
      { global: true, rule: 'conventional commit messages' },
      io,
    );
  });

  it('global prefs land in CLAUDE.local.md only, which gets gitignored', async () => {
    const { results } = await projectAction({ to: ['claude-code'] }, io);
    const local = results.find((r) => r.target === 'CLAUDE.local.md');
    expect(local?.outcome).toBe('created');

    expect(read('CLAUDE.md')).not.toContain('conventional commits');
    expect(read('CLAUDE.local.md')).toContain('G-001: I prefer conventional commits');
    expect(read('CLAUDE.local.md')).toContain('Never committed');
    expect(read('.gitignore')).toContain('CLAUDE.local.md');

    // git itself confirms the file can never be committed
    const ignored = execFileSync('git', ['check-ignore', 'CLAUDE.local.md'], {
      cwd: sb.repo,
      encoding: 'utf8',
    }).trim();
    expect(ignored).toBe('CLAUDE.local.md');
  });

  it('tools without a local target never receive global content', async () => {
    write('AGENTS.md', '# Agents\n');
    write('.cursorrules', 'rules\n');
    await projectAction({ all: true }, io);
    expect(read('AGENTS.md')).not.toContain('conventional commits');
    expect(read('.cursorrules')).not.toContain('conventional commits');
    expect(read('MEMORY.md')).not.toContain('conventional commits');
  });

  it('--no-global skips machine-layer projection entirely', async () => {
    await projectAction({ to: ['claude-code'], global: false }, io);
    expect(existsSync(path.join(sb.repo, 'CLAUDE.local.md'))).toBe(false);
  });

  it('an existing .gitignore is appended to, not clobbered', async () => {
    write('.gitignore', 'node_modules/\ndist/\n');
    await projectAction({ to: ['claude-code'] }, io);
    const gi = read('.gitignore');
    expect(gi).toContain('node_modules/');
    expect(gi).toContain('dist/');
    expect(gi).toContain('CLAUDE.local.md');
  });
});
