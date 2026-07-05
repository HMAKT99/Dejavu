import type { ProjectionAdapter } from './types.js';

export const agentsMd: ProjectionAdapter = {
  name: 'agents-md',
  displayName: 'AGENTS.md (Codex, Jules, Amp, ...)',
  detect: (repoFiles) => repoFiles.includes('AGENTS.md'),
  projectTarget: () => 'AGENTS.md',
  // The AGENTS.md convention has no per-user local variant; machine-level
  // preferences are not projected for this tool.
};
