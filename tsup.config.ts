import { readFileSync } from 'node:fs';
import { defineConfig } from 'tsup';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
  entry: { cli: 'src/cli/main.ts' },
  format: 'esm',
  target: 'node20',
  platform: 'node',
  clean: true,
  minify: false,
  banner: { js: '#!/usr/bin/env node' },
  define: { __DEJAVU_VERSION__: JSON.stringify(pkg.version) },
  noExternal: [/.*/],
});
