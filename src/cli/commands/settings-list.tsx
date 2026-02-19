import { render, Text, Box } from 'ink';
import { useEffect, useState } from 'react';
import { readSettingsManifest } from '../../core/settings-manifest.ts';
import { readConfig, getAgentSettingsDirs, KONSTRUCT_DIR } from '../../core/config.ts';
import { discoverSettings } from '../../core/settings-discover.ts';
import { StatusMessage } from '../components/StatusMessage.tsx';

interface SettingsListOptions {
  global?: boolean;
}

interface ListState {
  installed: [string, unknown][];
  user: [string, unknown][];
  untracked: { name: string; path: string }[];
  error?: string;
  done: boolean;
}

function SettingsListApp({ options }: { options: SettingsListOptions }) {
  const [state, setState] = useState<ListState>({
    installed: [],
    user: [],
    untracked: [],
    done: false,
  });

  useEffect(() => {
    (async () => {
      const isGlobal = options.global ?? false;

      const manifest = await readSettingsManifest(isGlobal ? KONSTRUCT_DIR : undefined);
      if (!manifest) {
        setState((s) => ({ ...s, error: 'No settings.json found. Run "konstruct init" first.', done: true }));
        return;
      }

      const config = await readConfig(process.cwd(), isGlobal);
      const agents =
        config && config.agents.length > 0
          ? config.agents
          : config?.global?.defaultAgents ?? ['claude'];
      const dirs = getAgentSettingsDirs(agents, isGlobal);

      const installedEntries = Object.entries(manifest.settings);
      const userEntries = Object.entries(manifest.userSettings ?? {});
      const manifestNames = new Set([
        ...installedEntries.map(([name]) => name),
        ...userEntries.map(([name]) => name),
      ]);

      const untracked: { name: string; path: string }[] = [];
      for (const dir of dirs) {
        const discovered = await discoverSettings(dir);
        for (const pkg of discovered) {
          if (!manifestNames.has(pkg.name) && !untracked.some((u) => u.name === pkg.name)) {
            untracked.push({ name: pkg.name, path: pkg.path });
          }
        }
      }

      setState({
        installed: installedEntries,
        user: userEntries,
        untracked,
        done: true,
      });
    })();
  }, []);

  if (state.error) {
    return <StatusMessage variant="error">{state.error}</StatusMessage>;
  }

  if (!state.done) return null;

  const hasAnything = state.installed.length > 0 || state.user.length > 0 || state.untracked.length > 0;
  if (!hasAnything) {
    return <StatusMessage variant="info">No settings found. Use "konstruct settings add {'<source>'}" to add some.</StatusMessage>;
  }

  return (
    <Box flexDirection="column">
      {state.installed.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Installed settings:</Text>
          {state.installed.map(([name]) => (
            <Text key={name}>  <Text color="cyan">{name}</Text></Text>
          ))}
        </Box>
      )}
      {state.user.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>User settings:</Text>
          {state.user.map(([name]) => (
            <Text key={name}>  <Text color="cyan">{name}</Text></Text>
          ))}
        </Box>
      )}
      {state.untracked.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Untracked settings:</Text>
          {state.untracked.map(({ name }) => (
            <Text key={name}>  <Text color="cyan">{name}</Text></Text>
          ))}
        </Box>
      )}
      <Text>{''}</Text>
    </Box>
  );
}

export async function settingsListCommand(options: SettingsListOptions = {}) {
  const { waitUntilExit } = render(<SettingsListApp options={options} />);
  await waitUntilExit();
}
