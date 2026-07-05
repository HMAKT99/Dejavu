import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Where each tool keeps its session transcripts for a given repo.
 * Env overrides exist so tests (and unusual setups) can point anywhere.
 */

export interface SessionFile {
  /** Absolute path. */
  file: string;
  /** Short label for evidence display, e.g. "claude-code session 3b46606c". */
  label: string;
}

const MAX_SESSIONS = 25;
const MAX_SESSION_BYTES = 50 * 1024 * 1024;

/** Claude Code: ~/.claude/projects/<slug>/*.jsonl, slug = cwd with / and . → - */
export function claudeProjectSlug(repoRoot: string): string {
  return repoRoot.replace(/[/.]/g, '-');
}

export async function claudeCodeSessions(
  repoRoot: string,
  env: NodeJS.ProcessEnv,
): Promise<SessionFile[]> {
  const base =
    env.DEJAVU_CLAUDE_PROJECTS && env.DEJAVU_CLAUDE_PROJECTS !== ''
      ? env.DEJAVU_CLAUDE_PROJECTS
      : path.join(os.homedir(), '.claude', 'projects');
  const dir = path.join(base, claudeProjectSlug(repoRoot));
  return listJsonl(dir, 'claude-code');
}

/**
 * OpenClaw: transcripts live at ~/.openclaw/agents/<agentId>/sessions/*.jsonl
 * (verified against the OpenClaw docs). $DEJAVU_OPENCLAW_SESSIONS overrides
 * with a flat directory of .jsonl files (tests, unusual setups). Sessions are
 * cwd-filtered by the miner via their session header.
 */
export async function openclawSessions(env: NodeJS.ProcessEnv): Promise<SessionFile[]> {
  if (env.DEJAVU_OPENCLAW_SESSIONS && env.DEJAVU_OPENCLAW_SESSIONS !== '') {
    return listJsonl(env.DEJAVU_OPENCLAW_SESSIONS, 'openclaw');
  }
  const agentsDir = path.join(os.homedir(), '.openclaw', 'agents');
  let agents: string[];
  try {
    agents = await fs.readdir(agentsDir);
  } catch {
    return [];
  }
  const out: SessionFile[] = [];
  for (const agent of agents) {
    out.push(...(await listJsonl(path.join(agentsDir, agent, 'sessions'), 'openclaw')));
  }
  return out.slice(0, MAX_SESSIONS);
}

async function listJsonl(dir: string, tool: string): Promise<SessionFile[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }
  const files: Array<{ file: string; mtime: number }> = [];
  for (const name of entries) {
    if (!name.endsWith('.jsonl')) continue;
    const file = path.join(dir, name);
    try {
      const st = await fs.stat(file);
      if (st.isFile() && st.size <= MAX_SESSION_BYTES) files.push({ file, mtime: st.mtimeMs });
    } catch {
      /* raced away */
    }
  }
  files.sort((a, b) => b.mtime - a.mtime);
  return files.slice(0, MAX_SESSIONS).map(({ file }) => ({
    file,
    label: `${tool} session ${path.basename(file, '.jsonl').slice(0, 8)}`,
  }));
}
