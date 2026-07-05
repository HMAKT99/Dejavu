import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Ledger, QueueItem } from '../core/types.js';
import { candidateFingerprint, type MinedCandidate, mineText } from './heuristics.js';
import { claudeCodeSessions, openclawSessions, type SessionFile } from './sources.js';
import { parseTranscript, sessionCwd } from './transcript.js';

/**
 * Mining pipeline: sessions + #decision: comments → deduped candidates.
 * Pure aside from reading session files; queue writes stay in the CLI layer.
 */

export type MiningSource = 'claude-code' | 'openclaw' | 'comments';
export const ALL_SOURCES: MiningSource[] = ['claude-code', 'openclaw', 'comments'];

export interface MinedItem extends MinedCandidate {
  source: MiningSource;
  evidence: { file: string; excerpt: string };
  fingerprint: string;
}

// "// decision: ..." · "# decision: ..." · "/* decision: ... */" · "<!-- decision: ... -->"
const COMMENT_DECISION = /(?:\/\/|#|\/\*|<!--)\s*decision\s*:\s*(.+?)(?:\s*(?:\*\/|-->))?\s*$/i;

export function mineComments(rel: string, content: string): MinedItem[] {
  const out: MinedItem[] = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i]!.match(COMMENT_DECISION);
    if (!m) continue;
    const title = m[1]!.trim().slice(0, 120);
    if (title.length < 8) continue;
    out.push({
      title,
      confidence: 0.9,
      excerpt: lines[i]!.trim().slice(0, 200),
      source: 'comments',
      evidence: { file: `${rel}:${i + 1}`, excerpt: lines[i]!.trim().slice(0, 200) },
      fingerprint: candidateFingerprint(title),
    });
  }
  return out;
}

export async function mineSessionFile(
  session: SessionFile,
  source: MiningSource,
  /** When set, sessions that RECORD a different cwd are skipped (unknown cwd is kept). */
  onlyCwd?: string,
): Promise<MinedItem[]> {
  let raw: string;
  try {
    raw = await fs.readFile(session.file, 'utf8');
  } catch {
    return [];
  }
  if (onlyCwd !== undefined) {
    const cwd = sessionCwd(raw);
    if (cwd !== null && path.resolve(cwd) !== path.resolve(onlyCwd)) return [];
  }
  const out: MinedItem[] = [];
  for (const msg of parseTranscript(raw)) {
    for (const c of mineText(msg.text, msg.role)) {
      out.push({
        ...c,
        source,
        evidence: { file: session.label, excerpt: c.excerpt },
        fingerprint: candidateFingerprint(c.title),
      });
    }
  }
  return out;
}

export async function mineSessions(
  repoRoot: string,
  sources: MiningSource[],
  env: NodeJS.ProcessEnv,
): Promise<MinedItem[]> {
  const out: MinedItem[] = [];
  if (sources.includes('claude-code')) {
    for (const s of await claudeCodeSessions(repoRoot, env)) {
      out.push(...(await mineSessionFile(s, 'claude-code')));
    }
  }
  if (sources.includes('openclaw')) {
    // OpenClaw sessions are per-agent, not per-repo — scope by recorded cwd.
    for (const s of await openclawSessions(env)) {
      out.push(...(await mineSessionFile(s, 'openclaw', repoRoot)));
    }
  }
  return out;
}

/**
 * Dedupe: within this run (highest confidence wins), against fingerprints
 * already processed in past runs (approved OR rejected — a rejection must
 * stick), against the current queue, and against ledger decision titles.
 */
export function dedupeCandidates(
  candidates: MinedItem[],
  seenFingerprints: Set<string>,
  queue: QueueItem[],
  ledger: Ledger,
): MinedItem[] {
  const blocked = new Set<string>(seenFingerprints);
  for (const item of queue) blocked.add(candidateFingerprint(item.draft.title));
  for (const d of ledger.decisions) blocked.add(candidateFingerprint(d.title));

  const byFp = new Map<string, MinedItem>();
  for (const c of candidates) {
    if (blocked.has(c.fingerprint)) continue;
    const existing = byFp.get(c.fingerprint);
    if (!existing || c.confidence > existing.confidence) byFp.set(c.fingerprint, c);
  }
  return [...byFp.values()].sort((a, b) => b.confidence - a.confidence);
}
