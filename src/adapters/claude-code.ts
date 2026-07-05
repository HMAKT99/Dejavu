import type { ProjectionAdapter } from './types.js';

export const claudeCode: ProjectionAdapter = {
  name: 'claude-code',
  displayName: 'Claude Code (CLAUDE.md)',
  detect: (repoFiles) => repoFiles.includes('CLAUDE.md') || repoFiles.includes('.claude'),
  projectTarget: () => 'CLAUDE.md',
  // Claude Code auto-loads CLAUDE.local.md and treats it as personal context;
  // machine-level (G-) preferences may be projected here — never into CLAUDE.md.
  localTarget: 'CLAUDE.local.md',
};
