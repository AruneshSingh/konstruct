import { render, Text, Box, useApp } from 'ink';
import { useEffect, useState } from 'react';
import { removeSkillFromManifest, readManifest } from '../../core/manifest.ts';
import { readConfig, getAgentSkillDirs, KONSTRUCT_DIR } from '../../core/config.ts';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { exists } from '../../utils/fs.ts';
import { StatusMessage } from '../components/StatusMessage.tsx';

interface RemoveOptions {
  global?: boolean;
}

interface SkillStatus {
  name: string;
  status: 'success' | 'error' | 'warn';
  message: string;
}

function RemoveApp({ names, options }: { names: string[]; options: RemoveOptions }) {
  const { exit } = useApp();
  const [results, setResults] = useState<SkillStatus[]>([]);
  const [done, setDone] = useState(false);
  const [fatalError, setFatalError] = useState<string>();

  // Exit only after the 'done' render has flushed
  useEffect(() => {
    if (done) exit();
  }, [done, exit]);

  useEffect(() => {
    (async () => {
      const isGlobal = options.global ?? false;
      const manifestCwd = isGlobal ? KONSTRUCT_DIR : undefined;
      const manifest = await readManifest(manifestCwd);

      if (!isGlobal && !manifest) {
        setFatalError('No skills.json found.');
        setDone(true);
        return;
      }

      const config = await readConfig(process.cwd(), isGlobal);
      const agents =
        config && config.agents.length > 0
          ? config.agents
          : config?.global?.defaultAgents ?? ['claude'];
      const dirs = getAgentSkillDirs(agents, isGlobal);

      const statuses: SkillStatus[] = [];

      for (const name of names) {
        const inManifest = manifest
          ? name in manifest.skills || (manifest.userSkills ? name in manifest.userSkills : false)
          : false;

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
            message: `Skill "${name}" not found${isGlobal ? ' in global skill directories' : ' in skills.json'}`,
          });
          continue;
        }

        if (inManifest) await removeSkillFromManifest(name, manifestCwd);

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
        <StatusMessage key={r.name} variant={r.status === 'success' ? 'success' : 'error'}>{r.message}</StatusMessage>
      ))}
      {done && !fatalError && results.length > 1 && (
        <StatusMessage variant="info">
          {results.filter((r) => r.status === 'success').length}/{names.length} skill(s) removed
        </StatusMessage>
      )}
    </Box>
  );
}

export async function removeCommand(names: string[], options: RemoveOptions = {}) {
  const { waitUntilExit } = render(<RemoveApp names={names} options={options} />);
  await waitUntilExit();
}
