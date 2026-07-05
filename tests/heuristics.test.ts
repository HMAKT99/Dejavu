import { describe, expect, it } from 'vitest';
import { candidateFingerprint, mineText } from '../src/mining/heuristics.js';

describe('mineText — hits', () => {
  it('explicit decision: marker (both roles)', () => {
    for (const role of ['user', 'assistant'] as const) {
      const [c] = mineText('decision: all dates stored as timestamptz in UTC', role);
      expect(c?.title).toBe('all dates stored as timestamptz in UTC');
      expect(c!.confidence).toBeGreaterThanOrEqual(0.8);
    }
  });

  it("let's use X instead of Y", () => {
    const [c] = mineText("ok, let's use pnpm instead of npm for this project.", 'user');
    expect(c?.title).toBe('Use pnpm, not npm');
    expect(c?.rule).toBe('use pnpm instead of npm');
  });

  it("we'll go with X over Y", () => {
    const [c] = mineText("we'll go with Supabase RLS over API-layer checks here.", 'user');
    expect(c?.title).toBe('Use Supabase RLS, not API-layer checks here');
  });

  it('we should never / always', () => {
    const [c] = mineText('we should never call the database from components.', 'user');
    expect(c?.title).toBe('Never call the database from components');
    expect(c?.rule).toBe('never call the database from components');
  });

  it('imperative always/never line', () => {
    const [c] = mineText('Always validate input at the API boundary', 'user');
    expect(c?.title).toBe('Always validate input at the API boundary');
  });

  it('from now on', () => {
    const [c] = mineText('from now on, keep API route handlers under 30 lines', 'user');
    expect(c?.title).toBe('keep API route handlers under 30 lines');
  });

  it('we decided to', () => {
    const [c] = mineText(
      'after the outage we decided to keep the monolith until 10k users',
      'user',
    );
    expect(c?.title).toBe('keep the monolith until 10k users');
  });

  it('assistant confidence is damped', () => {
    const [u] = mineText("let's use vitest instead of jest.", 'user');
    const [a] = mineText("let's use vitest instead of jest.", 'assistant');
    expect(a!.confidence).toBeLessThan(u!.confidence);
  });

  it('markdown formatting is stripped from titles', () => {
    const [c] = mineText("let's use **pnpm** instead of `npm`.", 'user');
    expect(c?.title).toBe('Use pnpm, not npm');
  });
});

describe('mineText — precision (the part that keeps trust)', () => {
  const noise: Array<[string, 'user' | 'assistant']> = [
    ['should we use pnpm instead of npm?', 'user'], // question
    ['maybe we should always use RLS here', 'user'], // hedged
    ['what if we switch to bun instead of node', 'user'], // deliberation
    ['I ran the tests and they pass now', 'assistant'], // status update
    ['the function never returns null in that branch', 'user'], // "never" mid-sentence
    ['```\n// decision: fake, inside a code fence\nlet x = 1;\n```', 'user'],
    ['we should never', 'user'], // too short to mean anything
    ['perhaps from now on things will be better', 'user'], // hedged
  ];
  for (const [text, role] of noise) {
    it(`ignores: ${text.slice(0, 50).replace(/\n/g, ' ')}`, () => {
      expect(mineText(text, role)).toEqual([]);
    });
  }

  it('assistant does not match user-only patterns', () => {
    expect(mineText('we should never store raw dates.', 'assistant')).toEqual([]);
    expect(mineText('from now on, keep handlers thin.', 'assistant')).toEqual([]);
  });

  it('one candidate per sentence, strongest pattern wins', () => {
    const cs = mineText("decision: let's use pnpm instead of npm", 'user');
    expect(cs).toHaveLength(1);
    expect(cs[0]!.confidence).toBe(0.95);
  });
});

describe('candidateFingerprint', () => {
  it('normalizes punctuation, case, and spacing', () => {
    expect(candidateFingerprint('Use pnpm, not npm!')).toBe(
      candidateFingerprint('use PNPM  not npm'),
    );
    expect(candidateFingerprint('Use pnpm, not npm')).not.toBe(
      candidateFingerprint('Use bun, not npm'),
    );
  });
});
