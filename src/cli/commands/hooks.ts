import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Command } from 'commander';
import { fail, info, ok } from '../ui.js';
import { resolveWorkspace } from '../workspace.js';
import { type ActionIo, defaultIo } from './init.js';

/**
 * Pre-commit hook management. Warn-first philosophy: the default hook shows
 * findings but never blocks a commit; --strict makes it block. We refuse to
 * touch a pre-commit hook we didn't write.
 */

const MARKER = '# dejavu pre-commit hook v1';

function hookScript(strict: boolean): string {
  return `#!/bin/sh
${MARKER}
# Checks staged files against DECISIONS.md (contradictions + duplication).
# Installed by \`dejavu hooks install\`; remove with \`dejavu hooks uninstall\`.
dejavu check --staged${strict ? ' --strict' : ''}
`;
}

export type HookResult = 'installed' | 'updated' | 'refused-foreign' | 'removed' | 'absent';

export async function installHook(io: ActionIo, strict: boolean): Promise<HookResult> {
  const ws = await resolveWorkspace({ cwd: io.cwd, global: false, env: io.env });
  const hookPath = path.join(ws.displayRoot, '.git', 'hooks', 'pre-commit');
  let existing: string | null = null;
  try {
    existing = await fs.readFile(hookPath, 'utf8');
  } catch {
    /* no hook yet */
  }
  if (existing !== null && !existing.includes(MARKER)) return 'refused-foreign';
  await fs.mkdir(path.dirname(hookPath), { recursive: true });
  await fs.writeFile(hookPath, hookScript(strict), { mode: 0o755 });
  return existing === null ? 'installed' : 'updated';
}

export async function uninstallHook(io: ActionIo): Promise<HookResult> {
  const ws = await resolveWorkspace({ cwd: io.cwd, global: false, env: io.env });
  const hookPath = path.join(ws.displayRoot, '.git', 'hooks', 'pre-commit');
  let existing: string;
  try {
    existing = await fs.readFile(hookPath, 'utf8');
  } catch {
    return 'absent';
  }
  if (!existing.includes(MARKER)) return 'refused-foreign';
  await fs.unlink(hookPath);
  return 'removed';
}

export function registerHooks(program: Command): void {
  const hooks = program.command('hooks').description('manage the git pre-commit hook');

  hooks
    .command('install')
    .description('install a pre-commit hook running `dejavu check --staged`')
    .option('--strict', 'make the hook block commits on findings (default: warn only)')
    .action(async (flags: { strict?: boolean }) => {
      const result = await installHook(defaultIo(), flags.strict ?? false);
      switch (result) {
        case 'installed':
          ok(
            `pre-commit hook installed (${flags.strict ? 'strict — blocks on findings' : 'warn-only'})`,
          );
          break;
        case 'updated':
          ok('pre-commit hook updated');
          break;
        case 'refused-foreign':
          fail('a pre-commit hook already exists that DejaVu did not write — not touching it');
          info('add this line to it yourself:  dejavu check --staged');
          process.exitCode = 1;
          break;
        default:
          break;
      }
    });

  hooks
    .command('uninstall')
    .description('remove the DejaVu pre-commit hook')
    .action(async () => {
      const result = await uninstallHook(defaultIo());
      switch (result) {
        case 'removed':
          ok('pre-commit hook removed');
          break;
        case 'absent':
          info('no pre-commit hook installed');
          break;
        case 'refused-foreign':
          fail('the existing pre-commit hook is not DejaVu’s — not touching it');
          process.exitCode = 1;
          break;
        default:
          break;
      }
    });
}
