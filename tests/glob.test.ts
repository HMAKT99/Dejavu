import { describe, expect, it } from 'vitest';
import { globToRegExp, matchesAny } from '../src/enforce/glob.js';

const match = (glob: string, p: string) => globToRegExp(glob).test(p);

describe('globToRegExp', () => {
  it('** crosses directories', () => {
    expect(match('src/api/**', 'src/api/users.ts')).toBe(true);
    expect(match('src/api/**', 'src/api/v2/users.ts')).toBe(true);
    expect(match('src/api/**', 'src/web/users.ts')).toBe(false);
  });

  it('src/**/x matches src/x too', () => {
    expect(match('src/**/index.ts', 'src/index.ts')).toBe(true);
    expect(match('src/**/index.ts', 'src/a/b/index.ts')).toBe(true);
  });

  it('* stays within a directory', () => {
    expect(match('src/*.ts', 'src/a.ts')).toBe(true);
    expect(match('src/*.ts', 'src/sub/a.ts')).toBe(false);
  });

  it('? matches one non-slash char', () => {
    expect(match('file.?s', 'file.ts')).toBe(true);
    expect(match('file.?s', 'file.s')).toBe(false);
  });

  it('{a,b} alternation', () => {
    expect(match('src/**/*.{ts,tsx}', 'src/app/x.tsx')).toBe(true);
    expect(match('src/**/*.{ts,tsx}', 'src/app/x.js')).toBe(false);
  });

  it('bare names match at any depth', () => {
    expect(match('package.json', 'package.json')).toBe(true);
    expect(match('package.json', 'apps/web/package.json')).toBe(true);
    expect(match('package.json', 'notpackage.json')).toBe(false);
  });

  it('trailing slash means everything under', () => {
    expect(match('supabase/', 'supabase/migrations/001.sql')).toBe(true);
  });

  it('regex metacharacters in paths are literal', () => {
    expect(match('src/(group)/*.ts', 'src/(group)/a.ts')).toBe(true);
    expect(match('a+b/*.ts', 'a+b/x.ts')).toBe(true);
    expect(match('a+b/*.ts', 'aab/x.ts')).toBe(false);
  });

  it('matchesAny', () => {
    expect(matchesAny('src/api/x.ts', ['lib/**', 'src/api/**'])).toBe(true);
    expect(matchesAny('docs/x.md', ['lib/**', 'src/api/**'])).toBe(false);
  });
});
