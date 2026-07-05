import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * All destructive writes go through here. Guarantees:
 *  1. Atomicity: write to tmp file in the same directory + rename. A crash
 *     mid-write leaves the original untouched.
 *  2. Backup: the previous content is kept at <dir>/backup/<name>.prev
 *     (repo ledgers: .dejavu/backup/) before the rename lands.
 *  3. Layer separation: every write declares its layer ('repo' | 'machine');
 *     a repo write resolving inside the machine home (or vice versa) throws.
 *     This is the code-level enforcement of the spec's hard rule.
 */

export type Layer = 'repo' | 'machine';

export interface WriteContext {
  layer: Layer;
  /** Absolute, realpath-resolved repo root ('' when no repo is involved). */
  repoRoot: string;
  /** Absolute, realpath-resolved machine home (~/.dejavu or $DEJAVU_HOME). */
  machineHome: string;
}

export class LayerViolationError extends Error {}

/** Minimal fs facade so tests can inject failures mid-operation. */
export interface FsLike {
  writeFile(file: string, data: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  mkdir(dir: string): Promise<void>;
  readFile(file: string): Promise<string | null>;
}

export const realFs: FsLike = {
  writeFile: (file, data) => fs.writeFile(file, data, 'utf8'),
  rename: (from, to) => fs.rename(from, to),
  mkdir: async (dir) => {
    await fs.mkdir(dir, { recursive: true });
  },
  readFile: async (file) => {
    try {
      return await fs.readFile(file, 'utf8');
    } catch {
      return null;
    }
  },
};

/**
 * realpath the deepest existing ancestor, then re-append the not-yet-existing
 * remainder — so symlinks can't smuggle a write across the layer boundary,
 * and paths that don't exist yet still compare correctly.
 */
async function realpathPrefix(p: string): Promise<string> {
  const abs = path.resolve(p);
  let dir = abs;
  const pending: string[] = [];
  for (;;) {
    try {
      const real = await fs.realpath(dir);
      return pending.length === 0 ? real : path.join(real, ...pending);
    } catch {
      const parent = path.dirname(dir);
      if (parent === dir) return abs;
      pending.unshift(path.basename(dir));
      dir = parent;
    }
  }
}

export async function assertLayer(ctx: WriteContext, resolvedTarget: string): Promise<void> {
  // Resolve the boundary roots through the same realpath walk as the target,
  // so a symlinked ancestor (e.g. macOS /var → /private/var) can't make a
  // prefix comparison silently pass.
  const machineHome = ctx.machineHome === '' ? '' : await realpathPrefix(ctx.machineHome);
  const repoRoot = ctx.repoRoot === '' ? '' : await realpathPrefix(ctx.repoRoot);
  const inMachine =
    machineHome !== '' &&
    (resolvedTarget === machineHome || resolvedTarget.startsWith(machineHome + path.sep));
  const inRepo =
    repoRoot !== '' &&
    (resolvedTarget === repoRoot || resolvedTarget.startsWith(repoRoot + path.sep));

  if (ctx.layer === 'repo' && inMachine) {
    throw new LayerViolationError(
      `repo-layer write targets machine home: ${resolvedTarget} — repo decisions must never depend on the machine`,
    );
  }
  if (ctx.layer === 'machine' && inRepo) {
    throw new LayerViolationError(
      `machine-layer write targets the repository: ${resolvedTarget} — personal context must never leak into a repo`,
    );
  }
}

export interface AtomicWriteOptions {
  ctx: WriteContext;
  /**
   * Directory for a .prev backup of existing content (used for ledgers —
   * repo: <root>/.dejavu/backup, machine: ~/.dejavu/backup).
   */
  backupDir?: string;
  /**
   * Self-check gate: called with the exact bytes about to land; return an
   * error string to abort. Ledger saves use this to re-parse their own output
   * and refuse any write that would lose a decision ID.
   */
  verify?(content: string, previous: string | null): string | null;
  fsImpl?: FsLike;
}

export class SelfCheckError extends Error {}

export async function writeFileAtomic(
  target: string,
  content: string,
  opts: AtomicWriteOptions,
): Promise<void> {
  const io = opts.fsImpl ?? realFs;
  const absTarget = path.resolve(target);
  const resolvedTarget = await realpathPrefix(absTarget);
  await assertLayer(opts.ctx, resolvedTarget);

  const previous = await io.readFile(absTarget);

  if (opts.verify) {
    const problem = opts.verify(content, previous);
    if (problem !== null) {
      throw new SelfCheckError(`refusing to write ${absTarget}: ${problem}`);
    }
  }

  await io.mkdir(path.dirname(absTarget));

  if (opts.backupDir && previous !== null) {
    const backupDir = path.resolve(opts.backupDir);
    await io.mkdir(backupDir);
    const backupPath = path.join(backupDir, `${path.basename(absTarget)}.prev`);
    // Backup is written atomically too; a failure here aborts before the
    // original is touched.
    const backupTmp = `${backupPath}.tmp`;
    await io.writeFile(backupTmp, previous);
    await io.rename(backupTmp, backupPath);
  }

  const tmp = `${absTarget}.tmp-${process.pid}`;
  await io.writeFile(tmp, content);
  await io.rename(tmp, absTarget);
}
