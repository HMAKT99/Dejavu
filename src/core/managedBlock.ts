/**
 * Managed blocks: the only region of another tool's context file DejaVu will
 * ever touch. Everything outside the markers is sacred — corrupting a user's
 * CLAUDE.md is a project-killing bug, so every operation here either succeeds
 * cleanly or throws without producing output.
 */

export const BEGIN_MARKER = '<!-- dejavu:begin -->';
export const END_MARKER = '<!-- dejavu:end -->';

export class ManagedBlockError extends Error {}

interface BlockSpan {
  /** Index of the first char of the begin marker line. */
  start: number;
  /** Index just past the end marker line's trailing newline (or EOF). */
  end: number;
}

/**
 * Find the managed block, validating marker integrity. Returns null when no
 * markers exist. Throws on anything ambiguous — a begin without an end, an
 * end before a begin, or multiple blocks — because guessing wrong means
 * eating user content.
 */
function findBlock(text: string): BlockSpan | null {
  const begins: number[] = [];
  const ends: number[] = [];
  for (let i = text.indexOf(BEGIN_MARKER); i !== -1; i = text.indexOf(BEGIN_MARKER, i + 1)) {
    begins.push(i);
  }
  for (let i = text.indexOf(END_MARKER); i !== -1; i = text.indexOf(END_MARKER, i + 1)) {
    ends.push(i);
  }

  if (begins.length === 0 && ends.length === 0) return null;
  if (begins.length !== 1 || ends.length !== 1) {
    throw new ManagedBlockError(
      `expected exactly one dejavu:begin/dejavu:end pair, found ${begins.length} begin(s) and ${ends.length} end(s) — fix the markers by hand, nothing was written`,
    );
  }
  const begin = begins[0]!;
  const end = ends[0]!;
  if (end < begin) {
    throw new ManagedBlockError(
      'dejavu:end marker appears before dejavu:begin — fix the markers by hand, nothing was written',
    );
  }

  // Expand to whole lines: start at the beginning of the begin-marker line,
  // finish after the end-marker line's newline.
  const start = text.lastIndexOf('\n', begin - 1) + 1; // 0 when begin is on line 1
  let stop = text.indexOf('\n', end);
  stop = stop === -1 ? text.length : stop + 1;
  return { start, end: stop };
}

/** Wrap rendered content in markers. Content is trimmed; markers own their lines. */
export function wrapBlock(content: string): string {
  return `${BEGIN_MARKER}\n${content.trim()}\n${END_MARKER}\n`;
}

/**
 * Insert or replace the managed block. New blocks are appended at the end of
 * the file, separated by one blank line. Existing blocks are replaced in
 * place. Bytes outside the block are preserved exactly.
 */
export function upsertManagedBlock(text: string, content: string): string {
  const block = wrapBlock(content);
  const span = findBlock(text);

  if (span === null) {
    if (text === '') return block;
    const sep = text.endsWith('\n\n') ? '' : text.endsWith('\n') ? '\n' : '\n\n';
    return `${text}${sep}${block}`;
  }
  return text.slice(0, span.start) + block + text.slice(span.end);
}

/**
 * Remove the managed block entirely, collapsing the blank line that separated
 * it from preceding content. A file that only ever contained the block
 * becomes empty (callers may then delete it).
 */
export function removeManagedBlock(text: string): string {
  const span = findBlock(text);
  if (span === null) return text;
  let before = text.slice(0, span.start);
  let after = text.slice(span.end);
  // Collapse the separator blank line we added on insert so removal restores
  // the surroundings exactly (no stray blank lines left behind).
  if (before.endsWith('\n\n')) {
    if (after === '') before = before.slice(0, -1);
    else if (after.startsWith('\n')) after = after.slice(1);
  }
  return before + after;
}

/** True when the file's managed block already equals this content. */
export function blockIsCurrent(text: string, content: string): boolean {
  const span = findBlock(text);
  if (span === null) return false;
  return text.slice(span.start, span.end) === wrapBlock(content);
}

/** True when the file contains a managed block (valid pair). */
export function hasManagedBlock(text: string): boolean {
  return findBlock(text) !== null;
}
