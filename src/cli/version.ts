// Injected at build time by tsup's `define` — no runtime package.json read,
// which keeps `bun build --compile` working. Falls back for dev (tsx/vitest).
declare const __DEJAVU_VERSION__: string | undefined;

export const VERSION: string =
  typeof __DEJAVU_VERSION__ === 'string' ? __DEJAVU_VERSION__ : '0.0.0-dev';
