import type { Command } from 'commander';
import { serveStdio } from '../../mcp/server.js';
import { resolveWorkspace } from '../workspace.js';

export function registerServe(program: Command): void {
  program
    .command('serve')
    .description(
      'run the MCP server (stdio) — search_decisions, get_decision, check_against_decisions',
    )
    .action(async () => {
      const ws = await resolveWorkspace({ cwd: process.cwd(), global: false });
      await serveStdio({ root: ws.displayRoot, ledgerLoc: ws.ledgerLoc });
      // keep the process alive; the transport owns stdin/stdout now
      await new Promise(() => {});
    });
}
