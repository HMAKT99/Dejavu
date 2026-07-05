import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

/**
 * File discovery for enforcement. Shells out to system git (a deliberate
 * stack decision) with a plain-fs fallback for non-git directories.
 */

/** Paths never scanned: DejaVu's own state (its regexes match themselves), deps, build output. */
const EXCLUDED = [
  'DECISIONS.md',
  '.dejavu/',
  'node_modules/',
  'dist/',
  'build/',
  '.next/',
  '.git/',
  'vendor/',
  'coverage/',
];

const MAX_FILE_BYTES = 512 * 1024;

export function isExcluded(rel: string): boolean {
  return EXCLUDED.some((e) =>
    e.endsWith('/') ? rel.startsWith(e) || rel.includes(`/${e}`) : rel === e,
  );
}

/**
 * User-defined exclusions: `.dejavu/config.json` → `{"exclude": ["glob", ...]}`.
 * For repos with INTENTIONAL duplication (scaffolding templates, fixtures)
 * that would otherwise dominate `check`/`score`.
 */
export async function loadUserExcludes(root: string): Promise<string[]> {
  try {
    const raw = await fs.readFile(path.join(root, '.dejavu', 'config.json'), 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.exclude)) {
      return parsed.exclude.filter((g: unknown): g is string => typeof g === 'string');
    }
  } catch {
    /* no config or invalid — no user excludes */
  }
  return [];
}

async function applyUserExcludes(root: string, rels: string[]): Promise<string[]> {
  const globs = await loadUserExcludes(root);
  if (globs.length === 0) return rels;
  const { matchesAny } = await import('../enforce/glob.js');
  return rels.filter((r) => !matchesAny(r, globs));
}

async function git(root: string, args: string[]): Promise<string> {
  const { stdout } = await execFileP('git', args, { cwd: root, maxBuffer: 64 * 1024 * 1024 });
  return stdout;
}

/** Changed files: staged + unstaged + untracked (default `dejavu check` scope). */
export async function changedFiles(root: string, stagedOnly: boolean): Promise<string[]> {
  const out = stagedOnly
    ? await git(root, ['diff', '--cached', '--name-only', '--diff-filter=ACMR'])
    : await git(root, ['status', '--porcelain', '--untracked-files=all']);
  const rels = stagedOnly
    ? out.split('\n').filter(Boolean)
    : out
        .split('\n')
        .filter(Boolean)
        .filter((l) => !l.startsWith('D ') && !l.startsWith(' D'))
        .map((l) => {
          const p = l.slice(3);
          // rename lines look like "old -> new"
          const arrow = p.indexOf(' -> ');
          return arrow === -1 ? p : p.slice(arrow + 4);
        });
  return applyUserExcludes(
    root,
    rels.map(unquote).filter((r) => !isExcluded(r)),
  );
}

/** All tracked + untracked-but-not-ignored files (score / --all scope). */
export async function allRepoFiles(root: string): Promise<string[]> {
  try {
    const out = await git(root, ['ls-files', '--cached', '--others', '--exclude-standard']);
    return applyUserExcludes(
      root,
      out
        .split('\n')
        .filter(Boolean)
        .map(unquote)
        .filter((r) => !isExcluded(r)),
    );
  } catch {
    return applyUserExcludes(root, await walkDir(root, ''));
  }
}

function unquote(p: string): string {
  // git quotes non-ASCII paths: "\"caf\\303\\xx.ts\""
  if (p.startsWith('"') && p.endsWith('"')) {
    try {
      return JSON.parse(p);
    } catch {
      return p.slice(1, -1);
    }
  }
  return p;
}

async function walkDir(root: string, rel: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await fs.readdir(path.join(root, rel), { withFileTypes: true });
  for (const e of entries) {
    const childRel = rel === '' ? e.name : `${rel}/${e.name}`;
    if (isExcluded(childRel) || isExcluded(`${childRel}/`)) continue;
    if (e.name.startsWith('.')) continue;
    if (e.isDirectory()) out.push(...(await walkDir(root, childRel)));
    else out.push(childRel);
  }
  return out;
}

/** Read a file for scanning; null for binary-looking or oversized content. */
export async function readScannable(root: string, rel: string): Promise<string | null> {
  try {
    const stat = await fs.stat(path.join(root, rel));
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) return null;
    const buf = await fs.readFile(path.join(root, rel));
    if (buf.includes(0)) return null; // binary
    return buf.toString('utf8');
  } catch {
    return null;
  }
}
