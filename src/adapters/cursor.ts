import type { ProjectionAdapter } from './types.js';

export const cursor: ProjectionAdapter = {
  name: 'cursor',
  displayName: 'Cursor (.cursorrules)',
  detect: (repoFiles) => repoFiles.includes('.cursorrules') || repoFiles.includes('.cursor'),
  projectTarget: () => '.cursorrules',
  // .cursorrules is committed and Cursor has no uncommitted per-user rules
  // file at the repo level; machine-level preferences are not projected.
};
