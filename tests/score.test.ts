import { describe, expect, it } from 'vitest';
import { computeScore } from '../src/enforce/score.js';

const base = {
  totalFunctions: 100,
  duplicatedFunctions: 0,
  contradictionCount: 0,
  activeDecisionCount: 5,
  enforceableDecisionCount: 5,
};

describe('computeScore', () => {
  it('clean repo with enforceable decisions scores 100 / A+', () => {
    const card = computeScore(base);
    expect(card.score).toBe(100);
    expect(card.grade).toBe('A+');
  });

  it('duplication drags the score down proportionally', () => {
    const card = computeScore({ ...base, duplicatedFunctions: 10 });
    expect(card.duplicationPct).toBe(10);
    expect(card.components.duplication).toBe(27); // 45 * (1 - 10/25)
    expect(card.score).toBe(82);
  });

  it('25%+ duplication zeroes the duplication component', () => {
    const card = computeScore({ ...base, duplicatedFunctions: 30 });
    expect(card.components.duplication).toBe(0);
  });

  it('each contradiction costs 7 points', () => {
    expect(computeScore({ ...base, contradictionCount: 2 }).score).toBe(86);
    expect(computeScore({ ...base, contradictionCount: 10 }).components.contradictions).toBe(0);
  });

  it('no decisions at all → hygiene 0', () => {
    const card = computeScore({
      ...base,
      activeDecisionCount: 0,
      enforceableDecisionCount: 0,
    });
    expect(card.components.hygiene).toBe(0);
    expect(card.score).toBe(80);
  });

  it('unenforceable decisions earn half the hygiene points', () => {
    const card = computeScore({ ...base, enforceableDecisionCount: 0 });
    expect(card.components.hygiene).toBe(10);
  });

  it('empty repo (no functions) does not divide by zero', () => {
    const card = computeScore({ ...base, totalFunctions: 0, duplicatedFunctions: 0 });
    expect(card.duplicationPct).toBe(0);
    expect(card.score).toBe(100);
  });

  it('grades map sensibly', () => {
    expect(computeScore({ ...base, contradictionCount: 1 }).grade).toBe('A');
    expect(computeScore({ ...base, duplicatedFunctions: 10 }).grade).toBe('B-');
    expect(computeScore({ ...base, duplicatedFunctions: 30, contradictionCount: 5 }).grade).toBe(
      'F',
    );
  });
});
