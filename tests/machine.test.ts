import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type ActionIo, initAction } from '../src/cli/commands/init.js';
import { rememberAction } from '../src/cli/commands/remember.js';
import { makeSandbox, type Sandbox, treeSnapshot } from './helpers/tmpRepo.js';

/**
 * The spec's hard rules, proven end-to-end:
 *  - user-level context NEVER gets written into a repo
 *  - repo-level operations NEVER touch the machine home
 */

let sb: Sandbox;
let io: ActionIo;

beforeEach(() => {
  sb = makeSandbox();
  io = { cwd: sb.repo, env: sb.env, now: () => new Date('2026-07-05T12:00:00Z') };
});

afterEach(() => sb.cleanup());

describe('layer separation (hard rules)', () => {
  it('remember --global writes only to DEJAVU_HOME, never the repo', async () => {
    await initAction(io);
    const repoBefore = treeSnapshot(sb.repo);

    const result = await rememberAction('I prefer conventional commits', { global: true }, io);
    expect(result.kind).toBe('recorded');
    if (result.kind === 'recorded') expect(result.decision.id).toBe('G-001');

    expect(treeSnapshot(sb.repo)).toEqual(repoBefore); // repo untouched, byte-for-byte tree
    const globalLedger = path.join(sb.home, 'DECISIONS.md');
    expect(existsSync(globalLedger)).toBe(true);
    expect(readFileSync(globalLedger, 'utf8')).toContain('G-001');
  });

  it('repo commands never touch the machine home', async () => {
    const homeBefore = treeSnapshot(sb.home);
    await initAction(io);
    await rememberAction('Use pnpm', { rule: 'pnpm only' }, io);
    expect(treeSnapshot(sb.home)).toEqual(homeBefore);
    expect(readFileSync(path.join(sb.repo, 'DECISIONS.md'), 'utf8')).toContain('D-001');
  });

  it('global ledger uses G- IDs, repo ledger uses D- IDs', async () => {
    await initAction(io);
    const g = await rememberAction('global pref', { global: true }, io);
    const d = await rememberAction('repo decision', {}, io);
    if (g.kind !== 'recorded' || d.kind !== 'recorded') throw new Error('expected recorded');
    expect(g.decision.id).toBe('G-001');
    expect(d.decision.id).toBe('D-001');
  });

  it('repo ledger cannot supersede a G- decision (cross-layer ban, end to end)', async () => {
    await initAction(io);
    await rememberAction('global pref', { global: true }, io);
    await expect(rememberAction('bad', { supersedes: 'G-001' }, io)).rejects.toThrow(/cross-layer/);
  });

  it('global queue lives in DEJAVU_HOME, repo queue in .dejavu/', async () => {
    await initAction(io);
    await rememberAction('queued global', { global: true, queue: true }, io);
    await rememberAction('queued repo', { queue: true }, io);
    expect(existsSync(path.join(sb.home, 'queue.jsonl'))).toBe(true);
    expect(existsSync(path.join(sb.repo, '.dejavu', 'queue.jsonl'))).toBe(true);
    expect(readFileSync(path.join(sb.home, 'queue.jsonl'), 'utf8')).not.toContain('queued repo');
    expect(readFileSync(path.join(sb.repo, '.dejavu', 'queue.jsonl'), 'utf8')).not.toContain(
      'queued global',
    );
  });
});
