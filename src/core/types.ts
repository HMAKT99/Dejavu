/**
 * Core data model. Everything in src/core is pure: no fs, no process, no
 * ambient clock — functions take data and return data. DECISIONS.md (markdown)
 * is the source of truth; .dejavu/index.json is always derived from it.
 */

export type DecisionStatus = 'active' | 'superseded' | 'deprecated';

/** 'D' = repo ledger (committed), 'G' = global/machine ledger (~/.dejavu, never committed). */
export type IdPrefix = 'D' | 'G';

export interface Decision {
  /** Stable ID like "D-014" or "G-003". Never reused, never renumbered. */
  id: string;
  title: string;
  /** Kept as written (loosely validated); canonical form is YYYY-MM-DD. */
  date: string;
  /** Where the decision came from: "manual", "claude-code session", ... */
  source: string;
  status: DecisionStatus;
  context?: string;
  rule?: string;
  supersedes?: string[];
  supersededBy?: string[];
  /** Glob patterns scoping enforcement (Milestone 3); stored from day 1. */
  appliesTo?: string[];
  /** Regex hints for contradiction detection (Milestone 3); stored raw. */
  detect?: string[];
  /** Unknown "- key: value" bullets, order preserved. Nothing is ever dropped. */
  extraFields: Array<[string, string]>;
  /** Non-bullet free-text lines inside the block, verbatim. */
  bodyLines: string[];
}

export interface Ledger {
  /** Everything before the first decision heading, verbatim. */
  preamble: string;
  /** Document order (append order). */
  decisions: Decision[];
  idPrefix: IdPrefix;
}

export interface ParseWarning {
  /** 1-based line number in the source text. */
  line: number;
  code:
    | 'missing-status'
    | 'unknown-status'
    | 'duplicate-id'
    | 'missing-metadata'
    | 'bad-date'
    | 'cross-layer-ref';
  message: string;
}

export interface ParseResult {
  ledger: Ledger;
  warnings: ParseWarning[];
}

/** A not-yet-committed decision: what `remember` builds and miners emit. */
export interface DecisionDraft {
  title: string;
  context?: string;
  rule?: string;
  appliesTo?: string[];
  detect?: string[];
  supersedes?: string[];
  /** Target the global (machine) ledger instead of the repo ledger. */
  global?: boolean;
}

/** One pending item in .dejavu/queue.jsonl awaiting `dejavu review`. */
export interface QueueItem {
  /** Schema version, for forward compatibility with Milestone 4 miners. */
  v: 1;
  /** "q-" + UUID. */
  qid: string;
  /** ISO datetime. */
  createdAt: string;
  /** "manual" | "remember --queue" | later "miner:claude-code" etc. */
  source: string;
  /** Miner confidence 0..1 (Milestone 4). */
  confidence?: number;
  /** Supporting evidence pointers (Milestone 4). */
  evidence?: Array<{ file?: string; excerpt?: string }>;
  draft: DecisionDraft;
}

export interface IndexEntry {
  id: string;
  title: string;
  date: string;
  source: string;
  status: DecisionStatus;
  rule?: string;
  appliesTo?: string[];
  detect?: string[];
  supersedes?: string[];
  /** Derived from link structure, not just the written field. */
  supersededBy?: string[];
}

export interface IndexFile {
  version: 1;
  generatedAt: string;
  decisions: IndexEntry[];
  /** Structural inconsistencies found while indexing (e.g. hand-edited status). */
  warnings: string[];
}
