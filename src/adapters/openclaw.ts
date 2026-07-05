import type { ProjectionAdapter } from './types.js';

export const openclaw: ProjectionAdapter = {
  name: 'openclaw',
  displayName: 'OpenClaw (MEMORY.md)',
  detect: (repoFiles) => repoFiles.includes('MEMORY.md') || repoFiles.includes('.openclaw'),
  projectTarget: () => 'MEMORY.md',
};
