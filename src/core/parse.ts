import type { Decision, DecisionStatus, IdPrefix, ParseResult, ParseWarning } from './types.js';

/**
 * Tolerant line-based parser for DECISIONS.md.
 *
 * Contract: content-preserving, format-canonicalizing. Users hand-edit this
 * file and merge conflicts happen, so the parser accepts messy input and
 * never drops content — anything it doesn't recognize lands in extraFields
 * (bullets) or bodyLines (everything else), verbatim.
 */

const HEADING_RE = /^##\s+([DG])-(\d+)\s*[:：\-–—]?\s*(.*)$/;
const BULLET_RE = /^[-*]\s+([A-Za-z_][A-Za-z0-9_ -]*?)\s*:\s*(.*)$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const STATUSES: DecisionStatus[] = ['active', 'superseded', 'deprecated'];

/** Field-name normalization: applies-to / Applies_To / APPLIES TO → applies_to */
function normalizeKey(key: string): string {
  return key
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

function splitList(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

interface OpenBlock {
  decision: Decision;
  headingLine: number;
  sawMetadata: boolean;
}

export function parseLedger(text: string, idPrefix: IdPrefix = 'D'): ParseResult {
  // CRLF tolerance: a checkout with autocrlf (WSL/Windows) must not leave \r
  // inside field values. Canonical output is always LF.
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const warnings: ParseWarning[] = [];
  const decisions: Decision[] = [];
  const preambleLines: string[] = [];
  const seenIds = new Set<string>();

  let open: OpenBlock | null = null;

  const close = () => {
    if (!open) return;
    // Trim trailing blank body lines (block separators, not content).
    const body = open.decision.bodyLines;
    while (body.length > 0 && body[body.length - 1]!.trim() === '') body.pop();
    while (body.length > 0 && body[0]!.trim() === '') body.shift();
    if (!open.sawMetadata) {
      warnings.push({
        line: open.headingLine,
        code: 'missing-metadata',
        message: `${open.decision.id}: no metadata line (date/source/status); defaults applied`,
      });
    }
    decisions.push(open.decision);
    open = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const lineNo = i + 1;

    const heading = raw.match(HEADING_RE);
    if (heading) {
      close();
      const id = `${heading[1]}-${heading[2]}`;
      if (seenIds.has(id)) {
        warnings.push({
          line: lineNo,
          code: 'duplicate-id',
          message: `duplicate decision ID ${id} (merge conflict?); both entries kept`,
        });
      }
      seenIds.add(id);
      open = {
        headingLine: lineNo,
        sawMetadata: false,
        decision: {
          id,
          title: heading[3]!.trim(),
          date: '',
          source: 'unknown',
          status: 'active',
          extraFields: [],
          bodyLines: [],
        },
      };
      continue;
    }

    if (!open) {
      preambleLines.push(raw);
      continue;
    }

    const bullet = raw.match(BULLET_RE);
    if (bullet && !open.sawMetadata && looksLikeMetadataLine(raw)) {
      parseMetadataLine(raw, open.decision, lineNo, warnings);
      open.sawMetadata = true;
      continue;
    }

    if (bullet) {
      const key = normalizeKey(bullet[1]!);
      const value = bullet[2]!.trim();
      assignField(open.decision, key, value, bullet[1]!, lineNo, warnings);
      continue;
    }

    open.decision.bodyLines.push(raw);
  }
  close();

  // Preamble: preserve verbatim, minus trailing blank lines (serializer re-adds separation).
  let preamble = preambleLines.join('\n');
  preamble = preamble.replace(/\n+$/, '');
  if (preamble !== '') preamble += '\n';

  return { ledger: { preamble, decisions, idPrefix }, warnings };
}

/**
 * The metadata line is the first bullet of a block carrying date/source/status,
 * joined by "·" (canonical) — "|" and "," tolerated. Recognize it by content:
 * it must contain a date:, source:, or status: segment.
 */
function looksLikeMetadataLine(raw: string): boolean {
  const stripped = raw.replace(/^[-*]\s+/, '');
  return /(^|[·|,])\s*(date|source|status)\s*:/i.test(stripped);
}

function parseMetadataLine(
  raw: string,
  d: Decision,
  lineNo: number,
  warnings: ParseWarning[],
): void {
  const stripped = raw.replace(/^[-*]\s+/, '');
  const segments = stripped.split(/·|\|/).flatMap((s) => {
    // Only split on commas when both sides look like key:value pairs, so a
    // source like "claude-code session, pair review" survives.
    return s.split(/,(?=\s*[A-Za-z_-]+\s*:)/);
  });

  let sawStatus = false;
  for (const seg of segments) {
    const m = seg.match(/^\s*([A-Za-z_-]+)\s*:\s*(.*?)\s*$/);
    if (!m) {
      if (seg.trim() !== '') {
        d.extraFields.push(['meta', seg.trim()]);
      }
      continue;
    }
    const key = normalizeKey(m[1]!);
    const value = m[2]!.trim();
    switch (key) {
      case 'date':
        d.date = value;
        if (value !== '' && !DATE_RE.test(value)) {
          warnings.push({
            line: lineNo,
            code: 'bad-date',
            message: `${d.id}: date "${value}" is not YYYY-MM-DD; kept as written`,
          });
        }
        break;
      case 'source':
        d.source = value;
        break;
      case 'status': {
        sawStatus = true;
        const status = value.toLowerCase() as DecisionStatus;
        if (STATUSES.includes(status)) {
          d.status = status;
        } else {
          warnings.push({
            line: lineNo,
            code: 'unknown-status',
            message: `${d.id}: unknown status "${value}"; treated as active`,
          });
          d.extraFields.push(['status_raw', value]);
        }
        break;
      }
      default:
        d.extraFields.push([m[1]!.trim(), value]);
    }
  }

  if (!sawStatus) {
    warnings.push({
      line: lineNo,
      code: 'missing-status',
      message: `${d.id}: no status on metadata line; treated as active`,
    });
  }
}

function assignField(
  d: Decision,
  key: string,
  value: string,
  rawKey: string,
  lineNo: number,
  warnings: ParseWarning[],
): void {
  switch (key) {
    case 'context':
      d.context = d.context === undefined ? value : `${d.context} ${value}`;
      break;
    case 'rule':
      d.rule = d.rule === undefined ? value : `${d.rule} ${value}`;
      break;
    case 'supersedes':
      d.supersedes = [...(d.supersedes ?? []), ...splitList(value)];
      break;
    case 'superseded_by':
      d.supersededBy = [...(d.supersededBy ?? []), ...splitList(value)];
      break;
    case 'applies_to':
      d.appliesTo = [...(d.appliesTo ?? []), ...splitList(value)];
      break;
    case 'detect':
      // Regexes may contain commas; each detect: bullet is one pattern.
      d.detect = [...(d.detect ?? []), value];
      break;
    case 'date':
      d.date = value;
      break;
    case 'source':
      d.source = value;
      break;
    case 'status': {
      const status = value.toLowerCase() as DecisionStatus;
      if (STATUSES.includes(status)) {
        d.status = status;
      } else {
        warnings.push({
          line: lineNo,
          code: 'unknown-status',
          message: `${d.id}: unknown status "${value}"; treated as active`,
        });
        d.extraFields.push(['status_raw', value]);
      }
      break;
    }
    default:
      d.extraFields.push([rawKey.trim(), value]);
  }
}
