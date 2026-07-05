import { activeDecisions } from '../core/render.js';
import type { Ledger } from '../core/types.js';

/**
 * dejavu score: a 0–100 repo health number with a letter grade.
 * Three components, weighted for what actually kills vibecoded projects:
 *   - duplication (45): % of functions with a near-duplicate elsewhere
 *   - contradictions (35): active-decision violations found in the repo
 *   - decision hygiene (20): do decisions exist, and are they enforceable?
 */

export interface ScoreInput {
  totalFunctions: number;
  duplicatedFunctions: number;
  contradictionCount: number;
  activeDecisionCount: number;
  enforceableDecisionCount: number; // active decisions carrying detect: or applies_to:
}

export interface ScoreCard {
  score: number;
  grade: string;
  duplicationPct: number;
  components: { duplication: number; contradictions: number; hygiene: number };
  input: ScoreInput;
}

export function gatherScoreInput(
  ledger: Ledger,
  stats: { totalFunctions: number; duplicatedFunctions: number },
  contradictionCount: number,
): ScoreInput {
  const active = activeDecisions(ledger);
  return {
    totalFunctions: stats.totalFunctions,
    duplicatedFunctions: stats.duplicatedFunctions,
    contradictionCount,
    activeDecisionCount: active.length,
    enforceableDecisionCount: active.filter(
      (d) => (d.detect && d.detect.length > 0) || (d.appliesTo && d.appliesTo.length > 0),
    ).length,
  };
}

export function computeScore(input: ScoreInput): ScoreCard {
  const duplicationPct =
    input.totalFunctions === 0 ? 0 : (input.duplicatedFunctions / input.totalFunctions) * 100;

  // Duplication: 0% dup → full 45; 25%+ dup → 0. The 8x-duplication problem.
  const duplication = Math.max(0, 45 * (1 - duplicationPct / 25));

  // Contradictions: each violation costs 7 of 35.
  const contradictions = Math.max(0, 35 - input.contradictionCount * 7);

  // Hygiene: having decisions at all (10) + how many are enforceable (10).
  let hygiene = 0;
  if (input.activeDecisionCount > 0) {
    hygiene += 10;
    hygiene += 10 * Math.min(1, input.enforceableDecisionCount / input.activeDecisionCount);
  }

  const score = Math.round(duplication + contradictions + hygiene);
  return {
    score,
    grade: grade(score),
    duplicationPct: Math.round(duplicationPct * 10) / 10,
    components: {
      duplication: Math.round(duplication),
      contradictions: Math.round(contradictions),
      hygiene: Math.round(hygiene),
    },
    input,
  };
}

function grade(score: number): string {
  if (score >= 97) return 'A+';
  if (score >= 93) return 'A';
  if (score >= 90) return 'A-';
  if (score >= 87) return 'B+';
  if (score >= 83) return 'B';
  if (score >= 80) return 'B-';
  if (score >= 77) return 'C+';
  if (score >= 73) return 'C';
  if (score >= 70) return 'C-';
  if (score >= 60) return 'D';
  return 'F';
}
