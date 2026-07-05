import { promises as fs } from 'node:fs';
import type { Command } from 'commander';
import pc from 'picocolors';
import { adapters, findAdapter } from '../../adapters/registry.js';
import type { ProjectionAdapter } from '../../adapters/types.js';
import { renderProjectBlock } from '../../core/render.js';
import { loadLedger } from '../../io/ledgerStore.js';
import {
  type ProjectResult,
  projectionIsCurrent,
  projectMachineLayer,
  projectRepoLayer,
  removeProjection,
  targetsWithBlocks,
} from '../../io/projector.js';
import { fail, info, ok } from '../ui.js';
import { healIndex, resolveWorkspace } from '../workspace.js';
import { type ActionIo, defaultIo } from './init.js';

export interface ProjectFlags {
  to?: string[];
  all?: boolean;
  remove?: boolean;
  check?: boolean;
  global?: boolean; // commander sets false for --no-global
}

async function repoEntries(root: string): Promise<string[]> {
  try {
    return await fs.readdir(root);
  } catch {
    return [];
  }
}

function pickAdapters(flags: ProjectFlags, entries: string[]): ProjectionAdapter[] {
  if (flags.to && flags.to.length > 0) {
    return flags.to.map((name) => {
      const a = findAdapter(name);
      if (!a) {
        const known = adapters.map((x) => x.name).join(', ');
        throw new Error(`unknown tool "${name}" — known adapters: ${known}`);
      }
      return a;
    });
  }
  if (flags.all) return adapters;
  return adapters.filter((a) => a.detect(entries));
}

export interface ProjectSummary {
  results: ProjectResult[];
  stale: string[];
}

export async function projectAction(flags: ProjectFlags, io: ActionIo): Promise<ProjectSummary> {
  const ws = await resolveWorkspace({ cwd: io.cwd, global: false, env: io.env });
  await healIndex(ws);
  const root = ws.displayRoot;
  const entries = await repoEntries(root);
  const selected = pickAdapters(flags, entries);
  const ctx = ws.ledgerLoc.ctx;
  const results: ProjectResult[] = [];
  const stale: string[] = [];

  if (flags.remove) {
    const rels = new Set<string>();
    for (const a of adapters) {
      rels.add(a.projectTarget(entries));
      if (a.localTarget) rels.add(a.localTarget);
    }
    for (const rel of rels) {
      const outcome = await removeProjection(root, rel, ctx);
      if (outcome === 'updated') results.push({ adapter: '-', target: rel, outcome });
    }
    return { results, stale };
  }

  const { ledger } = await loadLedger(ws.ledgerLoc);

  if (flags.check) {
    const content = renderProjectBlock(ledger);
    const rels = [...new Set(selected.map((a) => a.projectTarget(entries)))];
    for (const rel of await targetsWithBlocks(root, rels)) {
      if (!(await projectionIsCurrent(root, rel, content))) stale.push(rel);
    }
    return { results, stale };
  }

  const seen = new Set<string>();
  for (const a of selected) {
    const rel = a.projectTarget(entries);
    if (!seen.has(rel)) {
      seen.add(rel);
      results.push(await projectRepoLayer(root, ledger, a, entries, ctx));
    }
  }

  if (flags.global !== false) {
    const globalWs = await resolveWorkspace({ cwd: io.cwd, global: true, env: io.env });
    const { ledger: globalLedger, fresh } = await loadLedger(globalWs.ledgerLoc);
    if (!fresh) {
      for (const a of selected) {
        if (!a.localTarget || seen.has(a.localTarget)) continue;
        seen.add(a.localTarget);
        results.push(await projectMachineLayer(root, globalLedger, a, ctx));
      }
    }
  }

  return { results, stale };
}

/**
 * Refresh projections that already exist (targets carrying a managed block).
 * Used after ledger changes so context files never go stale — but never
 * creates a projection the user didn't ask for.
 */
export async function refreshExistingProjections(io: ActionIo): Promise<ProjectResult[]> {
  const ws = await resolveWorkspace({ cwd: io.cwd, global: false, env: io.env });
  const root = ws.displayRoot;
  const entries = await repoEntries(root);
  const relToAdapter = new Map<string, ProjectionAdapter>();
  for (const a of adapters) relToAdapter.set(a.projectTarget(entries), a);
  const existing = await targetsWithBlocks(root, [...relToAdapter.keys()]);
  if (existing.length === 0) return [];

  const { ledger } = await loadLedger(ws.ledgerLoc);
  const results: ProjectResult[] = [];
  for (const rel of existing) {
    results.push(
      await projectRepoLayer(root, ledger, relToAdapter.get(rel)!, entries, ws.ledgerLoc.ctx),
    );
  }
  return results.filter((r) => r.outcome === 'updated' || r.outcome === 'created');
}

function printResults(results: ProjectResult[]): void {
  for (const r of results) {
    switch (r.outcome) {
      case 'created':
        ok(`${r.target} — managed block added`);
        break;
      case 'updated':
        ok(`${r.target} — managed block refreshed`);
        break;
      case 'unchanged':
        info(`${r.target} — already current`);
        break;
      case 'skipped':
        info(`${r.adapter}: skipped (${r.detail})`);
        break;
      case 'failed':
        fail(`${r.target}: ${r.detail}`);
        break;
    }
  }
}

export function registerProject(program: Command): void {
  program
    .command('project')
    .description("project active decisions into your agents' context files (managed blocks)")
    .option(
      '--to <tool>',
      'target a specific tool (repeatable); see --all for the list',
      (v: string, prev: string[] = []) => [...prev, v],
    )
    .option('--all', `target every known tool: ${adapters.map((a) => a.name).join(', ')}`)
    .option('--remove', 'remove all DejaVu managed blocks (reversible projection)')
    .option('--check', 'exit 1 if any existing projection is stale (CI mode)')
    .option('--no-global', 'skip machine-level preferences (local context files)')
    .action(async (flags: ProjectFlags) => {
      const { results, stale } = await projectAction(flags, defaultIo());

      if (flags.check) {
        if (stale.length > 0) {
          for (const rel of stale) fail(`${rel} is stale — run: dejavu project`);
          process.exitCode = 1;
        } else {
          ok('all projections current');
        }
        return;
      }

      if (results.length === 0) {
        info(
          flags.remove
            ? 'no managed blocks found — nothing to remove'
            : `no agent context files detected — use --to <tool> or --all (${adapters.map((a) => a.name).join(', ')})`,
        );
        return;
      }
      if (flags.remove) {
        for (const r of results) ok(`${r.target} — managed block removed`);
      } else {
        printResults(results);
      }
      const failed = results.filter((r) => r.outcome === 'failed');
      if (failed.length > 0) process.exitCode = 1;
      if (!flags.remove && failed.length === 0) {
        info(pc.dim('\nCommit the updated context files so every collaborator’s agent sees them.'));
      }
    });
}
