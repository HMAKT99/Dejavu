import { agentsMd } from './agents-md.js';
import { claudeCode } from './claude-code.js';
import { cursor } from './cursor.js';
import { openclaw } from './openclaw.js';
import type { ProjectionAdapter } from './types.js';

export const adapters: ProjectionAdapter[] = [claudeCode, agentsMd, cursor, openclaw];

export function findAdapter(name: string): ProjectionAdapter | undefined {
  return adapters.find((a) => a.name === name);
}
