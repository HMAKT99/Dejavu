import { Command } from 'commander';
import { LedgerError } from '../core/ledger.js';
import { LayerViolationError, SelfCheckError } from '../io/atomic.js';
import { registerInit } from './commands/init.js';
import { registerProject } from './commands/project.js';
import { registerRemember } from './commands/remember.js';
import { registerReview } from './commands/review.js';
import { fail } from './ui.js';
import { VERSION } from './version.js';

/** CLI entry. The only file allowed to call process.exit. */

const program = new Command()
  .name('dejavu')
  .description('Decision memory for AI-assisted codebases. Your AI already wrote this.')
  .version(VERSION);

registerInit(program);
registerRemember(program);
registerReview(program);
registerProject(program);

try {
  await program.parseAsync(process.argv);
} catch (err) {
  if (err instanceof LedgerError || err instanceof SelfCheckError) {
    fail((err as Error).message);
    process.exit(1);
  }
  if (err instanceof LayerViolationError) {
    fail(`layer violation: ${(err as Error).message}`);
    process.exit(1);
  }
  fail(`internal error: ${(err as Error).stack ?? String(err)}`);
  process.exit(2);
}
