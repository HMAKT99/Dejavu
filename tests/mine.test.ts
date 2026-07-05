import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type ActionIo, initAction } from '../src/cli/commands/init.js';
import { mineAction } from '../src/cli/commands/mine.js';
import { rememberAction } from '../src/cli/commands/remember.js';
import { claudeProjectSlug } from '../src/mining/sources.js';
import { parseTranscript } from '../src/mining/transcript.js';
import { makeSandbox, type Sandbox } from './helpers/tmpRepo.js';

const FIXTURE = path.join(import.meta.dirname, '..', 'testdata', 'mining', 'session-fixture.jsonl');

let sb: Sandbox;
let io: ActionIo;
let claudeProjects: string;

beforeEach(async () => {
  sb = makeSandbox();
  claudeProjects = path.join(sb.home, 'claude-projects');
  io = {
    cwd: sb.repo,
    env: { ...sb.env, DEJAVU_CLAUDE_PROJECTS: claudeProjects },
    now: () => new Date('2026-07-05T12:00:00Z'),
  };
  await initAction(io);
});

afterEach(() => sb.cleanup());

function installFixtureSession(): void {
  const slugDir = path.join(claudeProjects, claudeProjectSlug(sb.repo));
  mkdirSync(slugDir, { recursive: true });
  copyFileSync(FIXTURE, path.join(slugDir, 'session-1.jsonl'));
}

const readQueue = () =>
  readFileSync(path.join(sb.repo, '.dejavu', 'queue.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));

describe('parseTranscript', () => {
  it('extracts real messages, skips meta/sidechain/harness/thinking/tool payloads', () => {
    const msgs = parseTranscript(readFileSync(FIXTURE, 'utf8'));
    expect(msgs.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    const all = msgs.map((m) => m.text).join('\n');
    expect(all).toContain("let's use pnpm");
    expect(all).toContain('timestamptz');
    expect(all).not.toContain('META');
    expect(all).not.toContain('sidechain');
    expect(all).not.toContain('mine thinking blocks');
    expect(all).not.toContain('not conversation');
  });
});

describe('dejavu mine', () => {
  it('mines a Claude Code session into the review queue with evidence', async () => {
    installFixtureSession();
    const summary = await mineAction({}, io);
    const titles = summary.queued.map((c) => c.title).sort();
    expect(titles).toEqual([
      'Never call the database from components',
      'Use pnpm, not npm',
      'all timestamps stored as timestamptz in UTC',
    ]);

    const queue = readQueue();
    expect(queue).toHaveLength(3);
    const pnpm = queue.find((q) => q.draft.title === 'Use pnpm, not npm');
    expect(pnpm.source).toBe('miner:claude-code');
    expect(pnpm.confidence).toBe(0.85);
    expect(pnpm.evidence[0].file).toContain('claude-code session');
    expect(pnpm.evidence[0].excerpt).toContain("let's use pnpm");
  });

  it('is idempotent: a second run queues nothing new', async () => {
    installFixtureSession();
    await mineAction({}, io);
    const second = await mineAction({}, io);
    expect(second.queued).toEqual([]);
    expect(second.skippedSeen).toBeGreaterThan(0);
    expect(readQueue()).toHaveLength(3);
  });

  it('candidates already in the ledger are not re-queued', async () => {
    installFixtureSession();
    await rememberAction('Use pnpm, not npm', {}, io);
    const summary = await mineAction({}, io);
    expect(summary.queued.map((c) => c.title)).not.toContain('Use pnpm, not npm');
  });

  it('--dry-run finds candidates but writes nothing', async () => {
    installFixtureSession();
    const summary = await mineAction({ dryRun: true }, io);
    expect(summary.queued.length).toBe(3);
    expect(() => readQueue()).toThrow(); // no queue file created
    // and a later real run still queues them (dry-run recorded nothing)
    const real = await mineAction({}, io);
    expect(real.queued.length).toBe(3);
  });

  it('--limit caps queued candidates, highest confidence first', async () => {
    installFixtureSession();
    const summary = await mineAction({ limit: 1 }, io);
    expect(summary.queued).toHaveLength(1);
    expect(summary.queued[0]!.title).toBe('all timestamps stored as timestamptz in UTC'); // 0.95 marker
  });

  it('harvests #decision: comments from code with file:line evidence', async () => {
    writeFileSync(
      path.join(sb.repo, 'db.ts'),
      `// decision: soft-delete only, no hard DELETE statements\nexport const del = 1;\n`,
    );
    mkdirSync(path.join(sb.repo, 'migrations'), { recursive: true });
    writeFileSync(
      path.join(sb.repo, 'migrations', 'notes.py'),
      `# decision: migrations are forward-only\n`,
    );
    const summary = await mineAction({ source: ['comments'] }, io);
    const titles = summary.queued.map((c) => c.title).sort();
    expect(titles).toEqual([
      'migrations are forward-only',
      'soft-delete only, no hard DELETE statements',
    ]);
    expect(summary.queued.find((c) => c.title.startsWith('soft-delete'))!.evidence.file).toBe(
      'db.ts:1',
    );
  });

  it('mines OpenClaw sessions via DEJAVU_OPENCLAW_SESSIONS', async () => {
    const ocDir = path.join(sb.home, 'openclaw-sessions');
    mkdirSync(ocDir, { recursive: true });
    writeFileSync(
      path.join(ocDir, 'oc-1.jsonl'),
      `${JSON.stringify({ type: 'user', message: { role: 'user', content: 'from now on, use tabs for indentation in this repo' } })}\n`,
    );
    const summary = await mineAction(
      { source: ['openclaw'] },
      { ...io, env: { ...io.env, DEJAVU_OPENCLAW_SESSIONS: ocDir } },
    );
    expect(summary.queued.map((c) => c.title)).toEqual(['use tabs for indentation in this repo']);
    expect(summary.queued[0]!.source).toBe('openclaw');
  });

  it('no sessions anywhere → empty result, no crash', async () => {
    const summary = await mineAction({}, io);
    expect(summary.queued).toEqual([]);
  });

  it('unknown source name throws a helpful error', async () => {
    await expect(mineAction({ source: ['cursor'] }, io)).rejects.toThrow(/unknown mining source/);
  });
});
