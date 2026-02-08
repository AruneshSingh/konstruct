import { render, Text, Box } from 'ink';
import { useEffect, useState } from 'react';
import { readManifest } from '../../core/manifest.ts';
import { readConfig, getAgentSkillDirs, KONSTRUCT_DIR } from '../../core/config.ts';
import { discoverSkills } from '../../core/discover.ts';
import { StatusMessage } from '../components/StatusMessage.tsx';

interface ListOptions {
  global?: boolean;
}

interface ListState {
  installed: [string, unknown][];
  user: [string, unknown][];
  untracked: { name: string; path: string }[];
  error?: string;
  done: boolean;
}

function ListApp({ options }: { options: ListOptions }) {
  const [state, setState] = useState<ListState>({
    installed: [],
    user: [],
    untracked: [],
    done: false,
  });

  useEffect(() => {
    (async () => {
      const isGlobal = options.global ?? false;

      const manifest = await readManifest(isGlobal ? KONSTRUCT_DIR : undefined);
      if (!manifest) {
        setState((s) => ({ ...s, error: 'No skills.json found. Run "konstruct init" first.', done: true }));
        return;
      }

      const config = await readConfig(process.cwd(), isGlobal);
      const agents =
        config && config.agents.length > 0
          ? config.agents
          : config?.global?.defaultAgents ?? ['claude'];
      const dirs = getAgentSkillDirs(agents, isGlobal);

      const installedEntries = Object.entries(manifest.skills);
      const userEntries = Object.entries(manifest.userSkills ?? {});
      const manifestNames = new Set([
        ...installedEntries.map(([name]) => name),
        ...userEntries.map(([name]) => name),
      ]);

      const untracked: { name: string; path: string }[] = [];
      for (const dir of dirs) {
        const discovered = await discoverSkills(dir);
        for (const skill of discovered) {
          if (!manifestNames.has(skill.name) && !untracked.some((u) => u.name === skill.name)) {
            untracked.push({ name: skill.name, path: skill.path });
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
    return <StatusMessage variant="info">No skills found. Use "konstruct add {'<source>'}" to add some.</StatusMessage>;
  }

  return (
    <Box flexDirection="column">
      {state.installed.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Installed skills:</Text>
          {state.installed.map(([name]) => (
            <Text key={name}>  <Text color="cyan">{name}</Text></Text>
          ))}
        </Box>
      )}
      {state.user.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>User skills:</Text>
          {state.user.map(([name]) => (
            <Text key={name}>  <Text color="cyan">{name}</Text></Text>
          ))}
        </Box>
      )}
      {state.untracked.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Untracked skills:</Text>
          {state.untracked.map(({ name }) => (
            <Text key={name}>  <Text color="cyan">{name}</Text></Text>
          ))}
        </Box>
      )}
      <Text>{''}</Text>
    </Box>
  );
}

export async function listCommand(options: ListOptions = {}) {
  const { waitUntilExit } = render(<ListApp options={options} />);
  await waitUntilExit();
}
