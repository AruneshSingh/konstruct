import { Command } from 'commander';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import pc from 'picocolors';

import { initCommand } from './commands/init.tsx';
import { addCommand } from './commands/add.tsx';
import { installCommand } from './commands/install.tsx';
import { removeCommand } from './commands/remove.tsx';
import { listCommand } from './commands/list.tsx';
import { updateCommand } from './commands/update.tsx';
import { defaultsCommand } from './commands/defaults.tsx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function getVersion(): string {
  // Works from both src/cli/ (tsx dev) and dist/ (bundled)
  const candidates = [
    resolve(__dirname, '..', '..', 'package.json'),
    resolve(__dirname, '..', 'package.json'),
  ];
  for (const pkgPath of candidates) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      if (pkg.version) return pkg.version;
    } catch {
      // try next
    }
  }
  return '0.0.0';
}

const program = new Command();

program
  .name('konstruct')
  .description('Package manager for AI agent skills')
  .version(getVersion());

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

program
  .command('init')
  .description('Initialize skills.json and konstruct.config.json')
  .option('-g, --global', 'Initialize global configuration (~/.konstruct/) instead of project-local')
  .action(initCommand);

program
  .command('install')
  .description('Install all skills from skills.json')
  .option('-g, --global', 'Install globally (~/) instead of project-local')
  .option('-s, --ssh', 'Use SSH for cloning (default: HTTPS with auto-retry on auth failure)')
  .action(installCommand);

program
  .command('add <source>')
  .description('Add a skill from a git or local source')
  .option('-g, --global', 'Install globally')
  .option('--user', 'Add as a userSkill (local, never auto-updated)')
  .option('--path <path>', 'Custom installation path')
  .option('-s, --ssh', 'Use SSH for cloning (default: HTTPS with auto-retry on auth failure)')
  .action(addCommand);

program
  .command('remove <names...>')
  .description('Remove one or more skills by name')
  .option('-g, --global', 'Remove from global (~/) directories instead of project-local')
  .action(removeCommand);

program
  .command('list')
  .description('List all skills in the current manifest')
  .option('-g, --global', 'List skills from the global manifest instead of project-local')
  .action(listCommand);

program
  .command('update')
  .description('Re-install git skills at their manifest refs (skips userSkills)')
  .option('-g, --global', 'Update in global (~/) directories instead of project-local')
  .option('-s, --ssh', 'Use SSH for cloning (default: HTTPS with auto-retry on auth failure)')
  .action(updateCommand);

program
  .command('defaults')
  .description('View and update default agent preferences')
  .action(defaultsCommand);

program.parseAsync().catch((err) => {
  console.error(pc.red('\u2717'), err instanceof Error ? err.message : String(err));
  process.exit(1);
});
