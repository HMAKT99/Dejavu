import type { Decision, Ledger } from '../core/types.js';
import { matchesAny } from './glob.js';

/**
 * Contradiction check: scan changed files against the `detect:` patterns of
 * active decisions, scoped by their `applies_to:` globs. Pure — callers hand
 * in file contents.
 */

export interface ContradictionFinding {
  kind: 'contradiction';
  decision: Pick<Decision, 'id' | 'title' | 'rule'>;
  file: string;
  line: number;
  excerpt: string;
}

interface CompiledRule {
  decision: Decision;
  appliesTo: string[] | null;
  patterns: RegExp[];
}

export interface CompileResult {
  rules: CompiledRule[];
  /** Decisions whose detect: regex failed to compile (surfaced, not fatal). */
  badPatterns: Array<{ id: string; pattern: string; error: string }>;
}

export function compileRules(ledger: Ledger): CompileResult {
  const rules: CompiledRule[] = [];
  const badPatterns: CompileResult['badPatterns'] = [];
  for (const d of ledger.decisions) {
    if (d.status !== 'active' || !d.detect || d.detect.length === 0) continue;
    const patterns: RegExp[] = [];
    for (const raw of d.detect) {
      // Accept both bare regexes and /wrapped/ ones
      const src =
        raw.startsWith('/') && raw.lastIndexOf('/') > 0 ? raw.slice(1, raw.lastIndexOf('/')) : raw;
      try {
        patterns.push(new RegExp(src));
      } catch (err) {
        badPatterns.push({ id: d.id, pattern: raw, error: (err as Error).message });
      }
    }
    if (patterns.length > 0) {
      rules.push({
        decision: d,
        appliesTo: d.appliesTo && d.appliesTo.length > 0 ? d.appliesTo : null,
        patterns,
      });
    }
  }
  return { rules, badPatterns };
}

export function checkFileForContradictions(
  compiled: CompileResult,
  relPath: string,
  content: string,
): ContradictionFinding[] {
  const findings: ContradictionFinding[] = [];
  const applicable = compiled.rules.filter(
    (r) => r.appliesTo === null || matchesAny(relPath, r.appliesTo),
  );
  if (applicable.length === 0) return findings;

  const lines = content.split('\n');
  for (const rule of applicable) {
    let hits = 0;
    for (let i = 0; i < lines.length && hits < 5; i++) {
      const line = lines[i]!;
      if (rule.patterns.some((p) => p.test(line))) {
        hits++;
        findings.push({
          kind: 'contradiction',
          decision: {
            id: rule.decision.id,
            title: rule.decision.title,
            ...(rule.decision.rule !== undefined ? { rule: rule.decision.rule } : {}),
          },
          file: relPath,
          line: i + 1,
          excerpt: line.trim().slice(0, 120),
        });
      }
    }
  }
  return findings;
}
