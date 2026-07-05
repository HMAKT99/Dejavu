/**
 * Decision-moment heuristics. Precision over recall: a polluted review queue
 * kills trust faster than a missed decision. Works with zero LLM calls.
 */

export interface MinedCandidate {
  title: string;
  rule?: string;
  confidence: number;
  /** The sentence that triggered the match, verbatim. */
  excerpt: string;
}

export type SpeakerRole = 'user' | 'assistant';

interface Pattern {
  re: RegExp;
  confidence: number;
  /** Which speakers this pattern is trusted for. */
  roles: SpeakerRole[];
  /** Explicit markers are deliberate whoever typed them — skip the damping. */
  neverDampen?: boolean;
  build(m: RegExpMatchArray): { title: string; rule?: string };
}

const PATTERNS: Pattern[] = [
  {
    // "decision: all dates in UTC" — the explicit marker, both speakers
    re: /\bdecision\s*:\s*(.{5,140})/i,
    confidence: 0.95,
    roles: ['user', 'assistant'],
    neverDampen: true,
    build: (m) => ({ title: clean(m[1]!) }),
  },
  {
    // "let's use pnpm instead of npm" / "we'll go with X over Y"
    re: /\b(?:let'?s|we(?:'ll| will| should| can)?|going to|I'?ll)\s+(?:use|go with|stick with|switch to|adopt|standardize on)\s+(.{2,60}?)\s+(?:instead of|over|rather than|not)\s+(.{2,40}?)(?:[.,;!]|$)/i,
    confidence: 0.85,
    roles: ['user', 'assistant'],
    build: (m) => ({
      title: `Use ${clean(m[1]!)}, not ${trimFiller(clean(m[2]!))}`,
      rule: `use ${clean(m[1]!)} instead of ${trimFiller(clean(m[2]!))}`,
    }),
  },
  {
    // "we should always validate at the edge" / "we should never store raw dates"
    re: /\b(?:we|you)\s+should\s+(always|never)\s+(.{5,100}?)(?:[.,;!]|$)/i,
    confidence: 0.8,
    roles: ['user'],
    build: (m) => ({
      title: `${cap(m[1]!.toLowerCase())} ${clean(m[2]!)}`,
      rule: `${m[1]!.toLowerCase()} ${clean(m[2]!)}`,
    }),
  },
  {
    // "always use timestamptz" / "never call the DB from components" (imperative user line)
    re: /^(always|never)\s+(.{5,100}?)(?:[.,;!]|$)/i,
    confidence: 0.8,
    roles: ['user'],
    build: (m) => ({
      title: `${cap(m[1]!.toLowerCase())} ${clean(m[2]!)}`,
      rule: `${m[1]!.toLowerCase()} ${clean(m[2]!)}`,
    }),
  },
  {
    // "from now on, keep API routes thin"
    re: /\bfrom now on,?\s+(.{5,120}?)(?:[.,;!]|$)/i,
    confidence: 0.8,
    roles: ['user'],
    build: (m) => ({ title: clean(m[1]!), rule: clean(m[1]!) }),
  },
  {
    // "we decided to keep the monolith"
    re: /\b(?:we|I)(?:'ve)?\s+decided\s+to\s+(.{5,120}?)(?:[.,;!]|$)/i,
    confidence: 0.75,
    roles: ['user', 'assistant'],
    build: (m) => ({ title: clean(m[1]!) }),
  },
];

/** Assistant statements are more speculative; damp their confidence. */
const ASSISTANT_PENALTY = 0.15;

function clean(s: string): string {
  return s
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[.,;:!\s]+$/, '')
    .trim();
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "npm for this project" → "npm": cut the alternative at trailing filler. */
function trimFiller(s: string): string {
  const cut = s.split(/\s+(?:for|in|on|at|with|because|since|so|going|right)\b/)[0]!;
  return cut.trim() === '' ? s : cut.trim();
}

/** Strip fenced code blocks — code is not conversation. */
function withoutCodeFences(text: string): string {
  return text.replace(/```[\s\S]*?```/g, ' ');
}

export function mineText(text: string, role: SpeakerRole): MinedCandidate[] {
  const out: MinedCandidate[] = [];
  const seen = new Set<string>();
  const sentences = withoutCodeFences(text)
    .split(/\n+|(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 10 && s.length <= 600);

  for (const sentence of sentences) {
    if (sentence.endsWith('?')) continue; // questions aren't decisions
    if (/\b(should we|shall we|do you want|what if|maybe|perhaps|might)\b/i.test(sentence)) {
      continue; // deliberation, not commitment
    }
    for (const p of PATTERNS) {
      if (!p.roles.includes(role)) continue;
      const m = sentence.match(p.re);
      if (!m) continue;
      const built = p.build(m);
      if (built.title.length < 8) continue;
      const key = built.title.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const damp = role === 'assistant' && !p.neverDampen;
      const confidence = damp
        ? Math.round(Math.max(0.3, p.confidence - ASSISTANT_PENALTY) * 100) / 100
        : p.confidence;
      const candidate: MinedCandidate = {
        title: built.title.slice(0, 120),
        confidence,
        excerpt: sentence.slice(0, 200),
      };
      if (built.rule !== undefined) candidate.rule = built.rule.slice(0, 200);
      out.push(candidate);
      break; // one candidate per sentence — strongest pattern wins (list order)
    }
  }
  return out;
}

/** Stable fingerprint for dedup across runs: normalized title. */
export function candidateFingerprint(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .join('-');
}
