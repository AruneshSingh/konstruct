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
import { settingsAddCommand } from './commands/settings-add.tsx';
import { settingsInstallCommand } from './commands/settings-install.tsx';
import { settingsRemoveCommand } from './commands/settings-remove.tsx';
import { settingsListCommand } from './commands/settings-list.tsx';
import { settingsUpdateCommand } from './commands/settings-update.tsx';

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
  .option('--skill <names...>', 'Install specific skill(s) by name, skipping the selection prompt')
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

// ---------------------------------------------------------------------------
// Settings subcommand group
// ---------------------------------------------------------------------------

const settings = program
  .command('settings')
  .description('Manage settings packages for AI agents');

settings
  .command('add <source>')
  .description('Add a settings package from a git or local source')
  .option('-g, --global', 'Install globally')
  .option('--user', 'Add as a userSettings entry (local, never auto-updated)')
  .option('--path <path>', 'Custom installation path')
  .option('-s, --ssh', 'Use SSH for cloning (default: HTTPS with auto-retry on auth failure)')
  .option('--settings <names...>', 'Install specific settings package(s) by name, skipping the selection prompt')
  .option('--strategy <strategy>', 'Apply strategy: copy, merge, or replace')
  .action(settingsAddCommand);

settings
  .command('install')
  .description('Install all settings packages from settings.json')
  .option('-g, --global', 'Install globally (~/) instead of project-local')
  .option('-s, --ssh', 'Use SSH for cloning (default: HTTPS with auto-retry on auth failure)')
  .action(settingsInstallCommand);

settings
  .command('remove <names...>')
  .description('Remove one or more settings packages by name')
  .option('-g, --global', 'Remove from global (~/) directories instead of project-local')
  .action(settingsRemoveCommand);

settings
  .command('list')
  .description('List all settings packages in the current manifest')
  .option('-g, --global', 'List settings from the global manifest instead of project-local')
  .action(settingsListCommand);

settings
  .command('update')
  .description('Re-install git settings at their manifest refs (skips userSettings)')
  .option('-g, --global', 'Update in global (~/) directories instead of project-local')
  .option('-s, --ssh', 'Use SSH for cloning (default: HTTPS with auto-retry on auth failure)')
  .action(settingsUpdateCommand);

program.parseAsync().catch((err) => {
  console.error(pc.red('\u2717'), err instanceof Error ? err.message : String(err));
  process.exit(1);
});
