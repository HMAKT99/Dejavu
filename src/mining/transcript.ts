/**
 * Tolerant reader for agent session transcripts (JSONL). Handles the Claude
 * Code shape (message.content as string or typed array) and any tool using a
 * similar {role, content} convention (OpenClaw). Bad lines are skipped —
 * a truncated transcript should never break mining.
 */

export interface TranscriptMessage {
  role: 'user' | 'assistant';
  text: string;
  uuid?: string;
  timestamp?: string;
}

/**
 * The working directory a session ran in, when the transcript records one
 * (Claude Code puts `cwd` on message lines; OpenClaw on its session header).
 * null = unknown → callers must NOT filter the session out.
 */
export function sessionCwd(jsonl: string): string | null {
  let inspected = 0;
  for (const line of jsonl.split('\n')) {
    if (line.trim() === '' || inspected >= 25) break;
    inspected++;
    try {
      const obj = JSON.parse(line);
      if (typeof obj.cwd === 'string' && obj.cwd !== '') return obj.cwd;
    } catch {
      /* skip */
    }
  }
  return null;
}

export function parseTranscript(jsonl: string): TranscriptMessage[] {
  const out: TranscriptMessage[] = [];
  for (const line of jsonl.split('\n')) {
    if (line.trim() === '') continue;
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    const type = obj.type;
    if (type !== 'user' && type !== 'assistant') continue;
    if (obj.isMeta === true || obj.isSidechain === true) continue;

    const message = obj.message as Record<string, unknown> | undefined;
    const role = (message?.role ?? type) as string;
    if (role !== 'user' && role !== 'assistant') continue;

    const text = extractText(message?.content ?? obj.content);
    if (text === '' || text.startsWith('<')) continue; // harness/meta payloads

    const msg: TranscriptMessage = { role, text };
    if (typeof obj.uuid === 'string') msg.uuid = obj.uuid;
    if (typeof obj.timestamp === 'string') msg.timestamp = obj.timestamp;
    out.push(msg);
  }
  return out;
}

function extractText(content: unknown): string {
  if (typeof content === 'string') return content.trim();
  if (!Array.isArray(content)) return '';
  const parts: string[] = [];
  for (const item of content) {
    if (typeof item === 'string') parts.push(item);
    else if (item && typeof item === 'object' && (item as { type?: string }).type === 'text') {
      const t = (item as { text?: unknown }).text;
      if (typeof t === 'string') parts.push(t);
    }
    // thinking / tool_use / tool_result blocks are not conversation
  }
  return parts.join('\n').trim();
}
