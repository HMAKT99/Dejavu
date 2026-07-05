import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { VERSION } from '../cli/version.js';
import type { Ledger } from '../core/types.js';
import { DuplicationIndex } from '../enforce/duplication.js';
import { supportedFile } from '../enforce/functions.js';
import { allRepoFiles, readScannable } from '../io/gitFiles.js';
import type { LedgerLocation } from '../io/ledgerStore.js';
import { loadLedger } from '../io/ledgerStore.js';
import { checkSnippet, getDecision, listActive, searchDecisions } from './handlers.js';

/**
 * `dejavu serve` — MCP over stdio. Any MCP-speaking agent (Claude Code,
 * Cursor, Codex, next year's tools) can query the ledger on demand; new
 * tools are supported the day they speak MCP.
 *
 * The ledger is re-read on every call (cheap, always fresh); the duplication
 * index is built lazily on first check and reused for the session.
 */

const TOOLS = [
  {
    name: 'search_decisions',
    description:
      "Search this repository's decision ledger (DECISIONS.md) by keyword. Returns matching decisions with id, title, status, and rule. Use before introducing a new library, pattern, or architectural approach.",
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'keywords, e.g. "authorization" or "date handling"' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_decision',
    description:
      'Fetch one decision by ID (e.g. "D-014") — full markdown block including context, rule, and supersede links.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'decision ID like D-014' } },
      required: ['id'],
    },
  },
  {
    name: 'check_against_decisions',
    description:
      "Check a code snippet against this repository's decisions BEFORE writing it to a file: flags contradictions of active decisions and near-duplicates of functions that already exist in the repo.",
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'the code you are about to write' },
        file_path: {
          type: 'string',
          description: 'repo-relative path the code is destined for (improves scoping)',
        },
      },
      required: ['code'],
    },
  },
  {
    name: 'list_active_decisions',
    description: 'List every active (binding) decision in this repository.',
    inputSchema: { type: 'object', properties: {} },
  },
] as const;

export interface ServeContext {
  root: string;
  ledgerLoc: LedgerLocation;
}

export function createServer(ctx: ServeContext): Server {
  const server = new Server({ name: 'dejavu', version: VERSION }, { capabilities: { tools: {} } });

  let indexPromise: Promise<DuplicationIndex> | null = null;
  const buildIndex = (): Promise<DuplicationIndex> => {
    indexPromise ??= (async () => {
      const index = new DuplicationIndex();
      for (const rel of await allRepoFiles(ctx.root)) {
        if (!supportedFile(rel)) continue;
        const content = await readScannable(ctx.root, rel);
        if (content !== null) index.addFile(rel, content);
      }
      return index;
    })();
    return indexPromise;
  };

  const freshLedger = async (): Promise<Ledger> => (await loadLedger(ctx.ledgerLoc)).ledger;

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [...TOOLS] }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args = {} } = req.params;
    const text = await dispatch(name, args as Record<string, unknown>);
    return { content: [{ type: 'text', text }] };
  });

  async function dispatch(name: string, args: Record<string, unknown>): Promise<string> {
    const ledger = await freshLedger();
    switch (name) {
      case 'search_decisions': {
        const hits = searchDecisions(ledger, String(args.query ?? ''));
        return hits.length === 0 ? 'No matching decisions.' : JSON.stringify(hits, null, 2);
      }
      case 'get_decision': {
        const block = getDecision(ledger, String(args.id ?? ''));
        return block ?? `No decision with ID "${args.id}".`;
      }
      case 'check_against_decisions': {
        const code = String(args.code ?? '');
        const filePath = typeof args.file_path === 'string' ? args.file_path : '_snippet_.ts';
        const result = checkSnippet(ledger, await buildIndex(), code, filePath);
        if (result.contradictions.length === 0 && result.duplicates.length === 0) {
          return 'OK — no contradictions, no duplicates.';
        }
        const parts: string[] = [];
        for (const c of result.contradictions) {
          parts.push(
            `CONTRADICTION of ${c.decision.id} (${c.decision.title}) at line ${c.line}: "${c.excerpt}"${c.decision.rule ? ` — rule: ${c.decision.rule}` : ''}`,
          );
        }
        for (const d of result.duplicates) {
          parts.push(
            `DUPLICATE: ${d.fn} is ${Math.round(d.similarity * 100)}% similar to ${d.existing} at ${d.location} — reuse it instead.`,
          );
        }
        return parts.join('\n');
      }
      case 'list_active_decisions': {
        const active = listActive(ledger);
        return active.length === 0 ? 'No active decisions.' : JSON.stringify(active, null, 2);
      }
      default:
        return `Unknown tool: ${name}`;
    }
  }

  return server;
}

/** Resolves when the client disconnects — callers should then exit. */
export async function serveStdio(ctx: ServeContext): Promise<void> {
  const server = createServer(ctx);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdout belongs to the protocol; humans get stderr.
  console.error(
    `dejavu MCP server ready (${ctx.root}) — tools: ${TOOLS.map((t) => t.name).join(', ')}`,
  );
  await new Promise<void>((resolve) => {
    server.onclose = resolve;
    // Belt and braces: some clients just drop the pipe without a clean close.
    process.stdin.once('end', resolve);
    process.stdin.once('close', resolve);
  });
}
