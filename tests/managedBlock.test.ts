import { describe, expect, it } from 'vitest';
import {
  BEGIN_MARKER,
  blockIsCurrent,
  END_MARKER,
  hasManagedBlock,
  ManagedBlockError,
  removeManagedBlock,
  upsertManagedBlock,
  wrapBlock,
} from '../src/core/managedBlock.js';

const USER_FILE = `# My CLAUDE.md

My own instructions.
- keep tests green
`;

describe('upsertManagedBlock', () => {
  it('appends a block to a file without one, separated by a blank line', () => {
    const out = upsertManagedBlock(USER_FILE, 'CONTENT');
    expect(out).toBe(`${USER_FILE}\n${BEGIN_MARKER}\nCONTENT\n${END_MARKER}\n`);
  });

  it('creates a bare block in an empty file', () => {
    expect(upsertManagedBlock('', 'X')).toBe(`${BEGIN_MARKER}\nX\n${END_MARKER}\n`);
  });

  it('replaces an existing block in place, leaving surroundings byte-identical', () => {
    const withBlock = upsertManagedBlock(`${USER_FILE}\ntrailing user text\n`, 'OLD');
    const updated = upsertManagedBlock(withBlock, 'NEW');
    expect(updated).toContain('NEW');
    expect(updated).not.toContain('OLD');
    expect(updated).toContain('# My CLAUDE.md');
    expect(updated).toContain('trailing user text');
    // Everything outside the block is untouched
    expect(removeManagedBlock(updated)).toBe(removeManagedBlock(withBlock));
  });

  it('replaces a block that sits in the middle of user content', () => {
    const text = `before\n\n${BEGIN_MARKER}\nold\n${END_MARKER}\n\nafter\n`;
    const out = upsertManagedBlock(text, 'new');
    expect(out).toBe(`before\n\n${BEGIN_MARKER}\nnew\n${END_MARKER}\n\nafter\n`);
  });

  it('is idempotent', () => {
    const once = upsertManagedBlock(USER_FILE, 'SAME');
    expect(upsertManagedBlock(once, 'SAME')).toBe(once);
  });

  it('throws on begin without end — and never returns partial output', () => {
    const corrupt = `${USER_FILE}\n${BEGIN_MARKER}\norphaned\n`;
    expect(() => upsertManagedBlock(corrupt, 'X')).toThrow(ManagedBlockError);
  });

  it('throws on end before begin', () => {
    const corrupt = `${END_MARKER}\nweird\n${BEGIN_MARKER}\n`;
    expect(() => upsertManagedBlock(corrupt, 'X')).toThrow(ManagedBlockError);
  });

  it('throws on multiple blocks (merge-conflict artifact)', () => {
    const twice = `${wrapBlock('a')}\nmiddle\n${wrapBlock('b')}`;
    expect(() => upsertManagedBlock(twice, 'X')).toThrow(ManagedBlockError);
  });
});

describe('removeManagedBlock', () => {
  it('append → remove restores the original file exactly (reversibility)', () => {
    const projected = upsertManagedBlock(USER_FILE, 'CONTENT');
    expect(removeManagedBlock(projected)).toBe(USER_FILE);
  });

  it('a file that was only our block becomes empty', () => {
    expect(removeManagedBlock(wrapBlock('X'))).toBe('');
  });

  it('returns input unchanged when no block exists', () => {
    expect(removeManagedBlock(USER_FILE)).toBe(USER_FILE);
  });

  it('preserves content after the block', () => {
    const text = `before\n\n${wrapBlock('X')}\nafter\n`;
    expect(removeManagedBlock(text)).toBe('before\n\nafter\n');
  });
});

describe('blockIsCurrent / hasManagedBlock', () => {
  it('detects current and stale content', () => {
    const projected = upsertManagedBlock(USER_FILE, 'v1');
    expect(blockIsCurrent(projected, 'v1')).toBe(true);
    expect(blockIsCurrent(projected, 'v2')).toBe(false);
    expect(blockIsCurrent(USER_FILE, 'v1')).toBe(false);
  });

  it('hasManagedBlock', () => {
    expect(hasManagedBlock(USER_FILE)).toBe(false);
    expect(hasManagedBlock(upsertManagedBlock(USER_FILE, 'x'))).toBe(true);
  });
});
