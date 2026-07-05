import type { Command } from 'commander';
import pc from 'picocolors';
import {
  type CompileResult,
  type ContradictionFinding,
  checkFileForContradictions,
  compileRules,
} from '../../enforce/contradiction.js';
import { type DuplicateFinding, DuplicationIndex } from '../../enforce/duplication.js';
import { supportedFile } from '../../enforce/functions.js';
import { allRepoFiles, changedFiles, readScannable } from '../../io/gitFiles.js';
import { loadLedger } from '../../io/ledgerStore.js';
import { fail, info, ok } from '../ui.js';
import { healIndex, resolveWorkspace } from '../workspace.js';
import { type ActionIo, defaultIo } from './init.js';

export interface CheckFlags {
  staged?: boolean;
  all?: boolean;
  strict?: boolean;
}

export interface CheckReport {
  contradictions: ContradictionFinding[];
  duplicates: DuplicateFinding[];
  badPatterns: CompileResult['badPatterns'];
  scannedFiles: number;
}

export async function checkAction(
  flags: CheckFlags,
  explicitFiles: string[],
  io: ActionIo,
): Promise<CheckReport> {
  const ws = await resolveWorkspace({ cwd: io.cwd, global: false, env: io.env });
  await healIndex(ws);
  const root = ws.displayRoot;
  const { ledger } = await loadLedger(ws.ledgerLoc);
  const compiled = compileRules(ledger);

  // Which files are "under review" vs "context"?
  let targets: string[];
  if (explicitFiles.length > 0) {
    targets = explicitFiles;
  } else if (flags.all) {
    targets = await allRepoFiles(root);
  } else {
    targets = await changedFiles(root, flags.staged ?? false);
  }

  const contradictions: ContradictionFinding[] = [];
  const index = new DuplicationIndex();
  const changedSet = new Set<string>();
  let scannedFiles = 0;

  // Contradictions scan only the targets; the duplication index needs the
  // whole repo as context, with targets marked as "changed".
  for (const rel of targets) {
    const content = await readScannable(root, rel);
    if (content === null) continue;
    scannedFiles++;
    contradictions.push(...checkFileForContradictions(compiled, rel, content));
    if (supportedFile(rel)) {
      changedSet.add(rel);
    }
  }

  if (changedSet.size > 0) {
    const repoFiles = flags.all ? targets : await allRepoFiles(root);
    for (const rel of repoFiles) {
      if (!supportedFile(rel)) continue;
      const content = await readScannable(root, rel);
      if (content !== null) index.addFile(rel, content);
    }
    // Explicit/changed files might be brand new (untracked but not yet listed)
    for (const rel of changedSet) {
      if (repoFiles.includes(rel)) continue;
      const content = await readScannable(root, rel);
      if (content !== null) index.addFile(rel, content);
    }
  }

  const duplicates = changedSet.size > 0 ? index.checkFiles(changedSet) : [];
  return { contradictions, duplicates, badPatterns: compiled.badPatterns, scannedFiles };
}

export function printReport(report: CheckReport): void {
  for (const bp of report.badPatterns) {
    info(pc.yellow(`note: ${bp.id} has an invalid detect pattern (${bp.pattern}) — skipped`));
  }
  for (const c of report.contradictions) {
    console.log(
      `${pc.yellow('⚠')} ${pc.bold(c.decision.id)} ${pc.dim(`${c.file}:${c.line}`)}\n` +
        `  ${pc.red(c.excerpt)}\n` +
        `  decision: ${c.decision.title}${c.decision.rule ? pc.dim(` — ${c.decision.rule}`) : ''}`,
    );
  }
  for (const d of report.duplicates) {
    const more = d.otherMatches > 0 ? pc.dim(` (+${d.otherMatches} more match(es))`) : '';
    console.log(
      `${pc.yellow('⚠')} ${pc.bold('duplicate')} ${pc.dim(`${d.fn.file}:${d.fn.line}`)}\n` +
        `  ${pc.cyan(`${d.fn.name}()`)} looks ${Math.round(d.similarity * 100)}% like ` +
        `${pc.cyan(`${d.existing.name}()`)} in ${d.existing.file}:${d.existing.line}${more}\n` +
        `  ${pc.dim('your AI already wrote this — reuse it instead')}`,
    );
  }
}

export function registerCheck(program: Command): void {
  program
    .command('check')
    .description('check changed code against decisions (contradictions + duplication)')
    .argument('[files...]', 'explicit files to check (default: git changed files)')
    .option('--staged', 'check staged files only (pre-commit mode)')
    .option('--all', 'check the whole repo')
    .option('--strict', 'exit 1 on findings (default: warn only)')
    .action(async (files: string[], flags: CheckFlags) => {
      const report = await checkAction(flags, files, defaultIo());
      const total = report.contradictions.length + report.duplicates.length;

      if (report.scannedFiles === 0) {
        info('nothing to check — no changed files (try --all or pass files)');
        return;
      }
      if (total === 0) {
        ok(`${report.scannedFiles} file(s) checked — no contradictions, no duplicates`);
        return;
      }
      printReport(report);
      console.log();
      const summary = `${total} finding(s): ${report.contradictions.length} contradiction(s), ${report.duplicates.length} duplicate(s)`;
      if (flags.strict) {
        fail(`${summary} — blocking (strict mode)`);
        process.exitCode = 1;
      } else {
        info(`${summary} — warnings only (use --strict to block)`);
      }
    });
}
