/**
 * Minimal glob → RegExp for `applies_to:` patterns. Supports the forms
 * vibecoders actually write: `**`, `*`, `?`, `{a,b}`, and directory prefixes.
 * ~40 lines instead of a dependency; decision matching never needs more.
 */

const SPECIAL = /[.+^$()|[\]\\]/g;

export function globToRegExp(glob: string): RegExp {
  let g = glob.trim();
  // "src/api/" means everything under it
  if (g.endsWith('/')) g += '**';
  let re = '';
  for (let i = 0; i < g.length; i++) {
    const c = g[i]!;
    if (c === '*') {
      if (g[i + 1] === '*') {
        // `**` crosses directory boundaries; swallow a following slash so
        // `src/**/x` also matches `src/x`
        re += g[i + 2] === '/' ? '(?:.*/)?' : '.*';
        i += g[i + 2] === '/' ? 2 : 1;
      } else {
        re += '[^/]*';
      }
    } else if (c === '?') {
      re += '[^/]';
    } else if (c === '{') {
      const end = g.indexOf('}', i);
      if (end === -1) {
        re += '\\{';
      } else {
        const alts = g
          .slice(i + 1, end)
          .split(',')
          .map((a) => a.replace(SPECIAL, '\\$&'));
        re += `(?:${alts.join('|')})`;
        i = end;
      }
    } else {
      re += c.replace(SPECIAL, '\\$&');
    }
  }
  // A bare name like "package.json" or "utils" matches at any depth
  const anchored = g.includes('/') ? `^${re}$` : `(?:^|/)${re}$`;
  return new RegExp(anchored);
}

export function matchesAny(relPath: string, globs: string[]): boolean {
  return globs.some((glob) => globToRegExp(glob).test(relPath));
}
