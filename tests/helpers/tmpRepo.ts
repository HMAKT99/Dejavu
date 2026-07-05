import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Sandbox for CLI integration tests: a fake repo (git-initialized) plus a fake
 * machine home, wired via the DEJAVU_HOME override. Nothing touches the real
 * ~/.dejavu or the developer's repos.
 */
export interface Sandbox {
  repo: string;
  home: string;
  env: NodeJS.ProcessEnv;
  cleanup(): void;
}

export function makeSandbox(): Sandbox {
  const base = mkdtempSync(path.join(os.tmpdir(), 'dejavu-test-'));
  const repo = path.join(base, 'repo');
  const home = path.join(base, 'home');
  mkdirSync(repo, { recursive: true });
  mkdirSync(home, { recursive: true });
  execFileSync('git', ['init', '-q'], { cwd: repo });
  return {
    repo,
    home,
    env: { ...process.env, DEJAVU_HOME: home },
    cleanup: () => rmSync(base, { recursive: true, force: true }),
  };
}

/** Stable fingerprint of a directory tree: sorted relative paths + sizes. */
export function treeSnapshot(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir).sort()) {
      if (name === '.git') continue;
      const full = path.join(dir, name);
      const rel = path.relative(root, full);
      const st = statSync(full);
      if (st.isDirectory()) {
        out.push(`${rel}/`);
        walk(full);
      } else {
        out.push(`${rel} (${st.size}b)`);
      }
    }
  };
  walk(root);
  return out;
}
