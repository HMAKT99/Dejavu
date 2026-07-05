import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  type FsLike,
  LayerViolationError,
  realFs,
  SelfCheckError,
  type WriteContext,
  writeFileAtomic,
} from '../src/io/atomic.js';
import { verifyNoDecisionLost } from '../src/io/ledgerStore.js';

let dir: string;
let ctx: WriteContext;

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'dejavu-atomic-'));
  ctx = { layer: 'repo', repoRoot: dir, machineHome: path.join(dir, 'nonexistent-home') };
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** Wrap realFs so a chosen operation throws when the predicate matches. */
function failingFs(op: keyof FsLike, when: (arg: string) => boolean): FsLike {
  return {
    ...realFs,
    [op]: (a: string, b?: string) => {
      if (when(a)) return Promise.reject(new Error(`injected ${op} failure`));
      // biome-ignore lint/suspicious/noExplicitAny: test shim over the facade
      return (realFs[op] as any)(a, b);
    },
  };
}

const LEDGER_V1 = `## D-001: keep me
- date: 2026-01-01 · source: manual · status: active
`;
const LEDGER_V2 = `## D-001: keep me
- date: 2026-01-01 · source: manual · status: active

## D-002: new one
- date: 2026-01-02 · source: manual · status: active
`;

describe('writeFileAtomic', () => {
  it('writes new files and overwrites existing ones', async () => {
    const target = path.join(dir, 'DECISIONS.md');
    await writeFileAtomic(target, LEDGER_V1, { ctx });
    expect(readFileSync(target, 'utf8')).toBe(LEDGER_V1);
    await writeFileAtomic(target, LEDGER_V2, { ctx });
    expect(readFileSync(target, 'utf8')).toBe(LEDGER_V2);
  });

  it('a writeFile crash mid-operation leaves the original bytes intact', async () => {
    const target = path.join(dir, 'DECISIONS.md');
    writeFileSync(target, LEDGER_V1);
    const fsImpl = failingFs('writeFile', (p) => p.includes('.tmp-'));
    await expect(writeFileAtomic(target, LEDGER_V2, { ctx, fsImpl })).rejects.toThrow(
      'injected writeFile failure',
    );
    expect(readFileSync(target, 'utf8')).toBe(LEDGER_V1);
  });

  it('a rename crash mid-operation leaves the original bytes intact', async () => {
    const target = path.join(dir, 'DECISIONS.md');
    writeFileSync(target, LEDGER_V1);
    const fsImpl = failingFs('rename', (from) => from.includes('.tmp-'));
    await expect(writeFileAtomic(target, LEDGER_V2, { ctx, fsImpl })).rejects.toThrow(
      'injected rename failure',
    );
    expect(readFileSync(target, 'utf8')).toBe(LEDGER_V1);
  });

  it('keeps a .prev backup of the previous content when backupDir is set', async () => {
    const target = path.join(dir, 'DECISIONS.md');
    const backupDir = path.join(dir, '.dejavu', 'backup');
    writeFileSync(target, LEDGER_V1);
    await writeFileAtomic(target, LEDGER_V2, { ctx, backupDir });
    expect(readFileSync(path.join(backupDir, 'DECISIONS.md.prev'), 'utf8')).toBe(LEDGER_V1);
    expect(readFileSync(target, 'utf8')).toBe(LEDGER_V2);
  });

  it('no backup is created on first write (nothing to back up)', async () => {
    const target = path.join(dir, 'DECISIONS.md');
    const backupDir = path.join(dir, '.dejavu', 'backup');
    await writeFileAtomic(target, LEDGER_V1, { ctx, backupDir });
    expect(existsSync(path.join(backupDir, 'DECISIONS.md.prev'))).toBe(false);
  });

  describe('self-check gate (verifyNoDecisionLost)', () => {
    it('refuses a write that would lose a decision ID', async () => {
      const target = path.join(dir, 'DECISIONS.md');
      writeFileSync(target, LEDGER_V2); // has D-001 and D-002
      await expect(
        writeFileAtomic(target, LEDGER_V1, { ctx, verify: verifyNoDecisionLost }),
      ).rejects.toThrow(SelfCheckError);
      expect(readFileSync(target, 'utf8')).toBe(LEDGER_V2); // untouched
    });

    it('allows growth and status changes', async () => {
      const target = path.join(dir, 'DECISIONS.md');
      writeFileSync(target, LEDGER_V1);
      await writeFileAtomic(target, LEDGER_V2, { ctx, verify: verifyNoDecisionLost });
      expect(readFileSync(target, 'utf8')).toBe(LEDGER_V2);
    });

    it('allows first writes (no previous content)', async () => {
      const target = path.join(dir, 'DECISIONS.md');
      await writeFileAtomic(target, LEDGER_V1, { ctx, verify: verifyNoDecisionLost });
      expect(readFileSync(target, 'utf8')).toBe(LEDGER_V1);
    });
  });

  describe('layer separation', () => {
    it('throws when a repo write targets the machine home', async () => {
      const home = path.join(dir, 'home', '.dejavu');
      const repoCtx: WriteContext = {
        layer: 'repo',
        repoRoot: path.join(dir, 'repo'),
        machineHome: home,
      };
      await expect(
        writeFileAtomic(path.join(home, 'DECISIONS.md'), 'x', { ctx: repoCtx }),
      ).rejects.toThrow(LayerViolationError);
    });

    it('throws when a machine write targets the repo', async () => {
      const repo = path.join(dir, 'repo');
      const machineCtx: WriteContext = {
        layer: 'machine',
        repoRoot: repo,
        machineHome: path.join(dir, 'home', '.dejavu'),
      };
      await expect(
        writeFileAtomic(path.join(repo, 'CLAUDE.md'), 'leak', { ctx: machineCtx }),
      ).rejects.toThrow(LayerViolationError);
    });

    it('symlinks cannot smuggle a machine write into the repo', async () => {
      const { symlinkSync, mkdirSync } = await import('node:fs');
      const repo = path.join(dir, 'repo');
      const home = path.join(dir, 'home');
      mkdirSync(repo, { recursive: true });
      mkdirSync(home, { recursive: true });
      symlinkSync(repo, path.join(home, 'sneaky'));
      const machineCtx: WriteContext = {
        layer: 'machine',
        repoRoot: await realpath(repo),
        machineHome: await realpath(home),
      };
      await expect(
        writeFileAtomic(path.join(home, 'sneaky', 'DECISIONS.md'), 'leak', { ctx: machineCtx }),
      ).rejects.toThrow(LayerViolationError);
    });
  });
});

async function realpath(p: string): Promise<string> {
  const { promises: fs } = await import('node:fs');
  return fs.realpath(p);
}
