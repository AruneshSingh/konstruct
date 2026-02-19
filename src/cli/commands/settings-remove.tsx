import { render, Box, useApp } from 'ink';
import { useEffect, useState } from 'react';
import { removeSettingsFromManifest, readSettingsManifest } from '../../core/settings-manifest.ts';
import { readConfig, getAgentSettingsDirs, KONSTRUCT_DIR } from '../../core/config.ts';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { exists } from '../../utils/fs.ts';
import { StatusMessage } from '../components/StatusMessage.tsx';

interface SettingsRemoveOptions {
  global?: boolean;
}

interface SettingsStatus {
  name: string;
  status: 'success' | 'error' | 'warn';
  message: string;
}

function SettingsRemoveApp({ names, options }: { names: string[]; options: SettingsRemoveOptions }) {
  const { exit } = useApp();
  const [results, setResults] = useState<SettingsStatus[]>([]);
  const [done, setDone] = useState(false);
  const [fatalError, setFatalError] = useState<string>();

  useEffect(() => {
    if (done) exit();
  }, [done, exit]);

  useEffect(() => {
    (async () => {
      const isGlobal = options.global ?? false;
      const manifestCwd = isGlobal ? KONSTRUCT_DIR : undefined;
      const manifest = await readSettingsManifest(manifestCwd);

      if (!isGlobal && !manifest) {
        setFatalError('No settings.json found.');
        setDone(true);
        return;
      }

      const config = await readConfig(process.cwd(), isGlobal);
      const agents =
        config && config.agents.length > 0
          ? config.agents
          : config?.global?.defaultAgents ?? ['claude'];
      const dirs = getAgentSettingsDirs(agents, isGlobal);

      const statuses: SettingsStatus[] = [];

      for (const name of names) {
        const entry = manifest
          ? manifest.settings[name] ?? manifest.userSettings?.[name]
          : undefined;
        const inManifest = !!entry;

        let onDisk = false;
        if (isGlobal) {
          for (const dir of dirs) {
            if (await exists(join(dir, name))) { onDisk = true; break; }
          }
        }

        if (!inManifest && !onDisk) {
          statuses.push({
            name,
            status: 'error',
            message: `Settings "${name}" not found${isGlobal ? ' in global settings directories' : ' in settings.json'}`,
          });
          continue;
        }

        // Warn about merge-mode settings that can't be auto-reversed
        if (entry?.strategy === 'merge') {
          statuses.push({
            name,
            status: 'warn',
            message: `Settings "${name}" used merge strategy — merged values cannot be auto-reversed. Please manually edit your agent settings files if needed.`,
          });
        }

        if (inManifest) await removeSettingsFromManifest(name, manifestCwd);

        // Remove copied directories (copy/replace mode)
        for (const dir of dirs) {
          await rm(join(dir, name), { recursive: true, force: true }).catch(() => {});
        }

        statuses.push({ name, status: 'success', message: `Removed "${name}"` });
      }

      setResults(statuses);
      setDone(true);
    })();
  }, []);

  return (
    <Box flexDirection="column">
      {fatalError && <StatusMessage variant="error">{fatalError}</StatusMessage>}
      {results.map((r) => (
        <StatusMessage key={r.name} variant={r.status === 'error' ? 'error' : r.status === 'warn' ? 'warn' : 'success'}>{r.message}</StatusMessage>
      ))}
      {done && !fatalError && results.length > 1 && (
        <StatusMessage variant="info">
          {results.filter((r) => r.status === 'success').length}/{names.length} settings package(s) removed
        </StatusMessage>
      )}
    </Box>
  );
}

export async function settingsRemoveCommand(names: string[], options: SettingsRemoveOptions = {}) {
  const { waitUntilExit } = render(<SettingsRemoveApp names={names} options={options} />);
  await waitUntilExit();
}
