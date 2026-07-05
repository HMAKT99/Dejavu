import type { Command } from 'commander';
import pc from 'picocolors';
import { checkFileForContradictions, compileRules } from '../../enforce/contradiction.js';
import { DuplicationIndex } from '../../enforce/duplication.js';
import { supportedFile } from '../../enforce/functions.js';
import { computeScore, gatherScoreInput, type ScoreCard } from '../../enforce/score.js';
import { allRepoFiles, readScannable } from '../../io/gitFiles.js';
import { loadLedger } from '../../io/ledgerStore.js';
import { healIndex, resolveWorkspace } from '../workspace.js';
import { type ActionIo, defaultIo } from './init.js';

export async function scoreAction(io: ActionIo): Promise<ScoreCard> {
  const ws = await resolveWorkspace({ cwd: io.cwd, global: false, env: io.env });
  await healIndex(ws);
  const root = ws.displayRoot;
  const { ledger } = await loadLedger(ws.ledgerLoc);
  const compiled = compileRules(ledger);

  const index = new DuplicationIndex();
  let contradictionCount = 0;
  for (const rel of await allRepoFiles(root)) {
    const content = await readScannable(root, rel);
    if (content === null) continue;
    contradictionCount += checkFileForContradictions(compiled, rel, content).length;
    if (supportedFile(rel)) index.addFile(rel, content);
  }

  const stats = index.duplicationStats();
  return computeScore(gatherScoreInput(ledger, stats, contradictionCount));
}

function bar(value: number, max: number, width = 20): string {
  const filled = Math.round((value / max) * width);
  return pc.green('█'.repeat(filled)) + pc.dim('░'.repeat(width - filled));
}

export function registerScore(program: Command): void {
  program
    .command('score')
    .description('repo health score (duplication, contradictions, decision hygiene)')
    .option('--json', 'machine-readable output')
    .action(async (flags: { json?: boolean }) => {
      const card = await scoreAction(defaultIo());
      if (flags.json) {
        console.log(JSON.stringify(card, null, 2));
        return;
      }
      const gradeColor = card.score >= 90 ? pc.green : card.score >= 70 ? pc.yellow : pc.red;
      console.log();
      console.log(
        `  ${pc.bold('DejaVu score')}  ${gradeColor(pc.bold(`${card.score}/100`))}  ${gradeColor(pc.bold(card.grade))}`,
      );
      console.log();
      console.log(
        `  duplication     ${bar(card.components.duplication, 45)}  ${card.components.duplication}/45  ${pc.dim(`(${card.duplicationPct}% of ${card.input.totalFunctions} functions duplicated)`)}`,
      );
      console.log(
        `  contradictions  ${bar(card.components.contradictions, 35)}  ${card.components.contradictions}/35  ${pc.dim(`(${card.input.contradictionCount} violation(s))`)}`,
      );
      console.log(
        `  decisions       ${bar(card.components.hygiene, 20)}  ${card.components.hygiene}/20  ${pc.dim(`(${card.input.activeDecisionCount} active, ${card.input.enforceableDecisionCount} enforceable)`)}`,
      );
      console.log();
      console.log(pc.dim(`  My repo scores ${card.grade}. What's yours? → npx dejavu-dev score`));
      console.log();
    });
}
