import { serializeDecision } from '../core/serialize.js';
import type { Decision, Ledger } from '../core/types.js';
import {
  type ContradictionFinding,
  checkFileForContradictions,
  compileRules,
} from '../enforce/contradiction.js';
import type { DuplicateFinding, DuplicationIndex } from '../enforce/duplication.js';

/**
 * Pure MCP tool handlers. The server wiring (stdio, SDK) lives in server.ts;
 * everything here takes data and returns data so tests need no transport.
 */

export interface SearchHit {
  id: string;
  title: string;
  status: string;
  rule?: string;
  score: number;
}

export function searchDecisions(ledger: Ledger, query: string, limit = 10): SearchHit[] {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 1);
  if (terms.length === 0) return [];

  const hits: SearchHit[] = [];
  for (const d of ledger.decisions) {
    const haystacks: Array<[string, number]> = [
      [d.title.toLowerCase(), 3],
      [(d.rule ?? '').toLowerCase(), 2],
      [(d.context ?? '').toLowerCase(), 1],
      [d.id.toLowerCase(), 5],
    ];
    let score = 0;
    for (const term of terms) {
      for (const [text, weight] of haystacks) {
        if (text.includes(term)) score += weight;
      }
    }
    if (score > 0) {
      // Active decisions matter more than historical ones
      if (d.status === 'active') score += 2;
      const hit: SearchHit = { id: d.id, title: d.title, status: d.status, score };
      if (d.rule !== undefined) hit.rule = d.rule;
      hits.push(hit);
    }
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

export function getDecision(ledger: Ledger, id: string): string | null {
  const d = ledger.decisions.find((x) => x.id.toLowerCase() === id.toLowerCase());
  return d ? serializeDecision(d) : null;
}

export interface CheckResult {
  contradictions: ContradictionFinding[];
  duplicates: Array<{
    fn: string;
    existing: string;
    location: string;
    similarity: number;
  }>;
}

export function checkSnippet(
  ledger: Ledger,
  index: DuplicationIndex,
  code: string,
  filePath: string,
): CheckResult {
  const compiled = compileRules(ledger);
  const contradictions = checkFileForContradictions(compiled, filePath, code);

  index.addFile(filePath, code);
  const dupFindings: DuplicateFinding[] = index.checkFiles(new Set([filePath]));
  const duplicates = dupFindings.map((f) => ({
    fn: `${f.fn.name}()`,
    existing: `${f.existing.name}()`,
    location: `${f.existing.file}:${f.existing.line}`,
    similarity: Math.round(f.similarity * 100) / 100,
  }));
  return { contradictions, duplicates };
}

/** Render active decisions compactly for tool output. */
export function listActive(ledger: Ledger): Array<Pick<Decision, 'id' | 'title' | 'rule'>> {
  return ledger.decisions
    .filter((d) => d.status === 'active')
    .map((d) => {
      const out: Pick<Decision, 'id' | 'title' | 'rule'> = { id: d.id, title: d.title };
      if (d.rule !== undefined) out.rule = d.rule;
      return out;
    });
}
