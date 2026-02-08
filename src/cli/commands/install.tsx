import { render, Text, Box, Static, useApp } from 'ink';
import { useEffect, useState } from 'react';
import { readManifest, parseSkillEntry } from '../../core/manifest.ts';
import { parseSource } from '../../core/source-parser.ts';
import { installGitSkill, installUserSkill } from '../../core/installer.ts';
import { formatInstallTargets } from '../utils.ts';
import { StatusMessage } from '../components/StatusMessage.tsx';
import { Spinner } from '../components/Spinner.tsx';

interface InstallOptions {
  global?: boolean;
  ssh?: boolean;
}

interface CompletedSkill {
  name: string;
  ok: boolean;
  detail: string;
}

function InstallApp({ options }: { options: InstallOptions }) {
  const { exit } = useApp();
  const [completed, setCompleted] = useState<CompletedSkill[]>([]);
  const [current, setCurrent] = useState<string>();
  const [total, setTotal] = useState(0);
  const [fatalError, setFatalError] = useState<string>();
  const [done, setDone] = useState(false);

  // Exit only after the 'done' render has flushed (spinner cleared from screen)
  useEffect(() => {
    if (done) exit();
  }, [done, exit]);

  useEffect(() => {
    (async () => {
      const manifest = await readManifest();
      if (!manifest) {
        setFatalError('No skills.json found. Run "konstruct init" first.');
        setDone(true);
        return;
      }

      const gitEntries = Object.entries(manifest.skills);
      const userEntries = Object.entries(manifest.userSkills ?? {});
      const count = gitEntries.length + userEntries.length;
      setTotal(count);

      if (count === 0) {
        setDone(true);
        return;
      }

      for (const [name, entry] of gitEntries) {
        setCurrent(name);
        const { source, customPath } = parseSkillEntry(entry);
        const parsed = parseSource(source);
        const result = await installGitSkill(parsed, name, {
          global: options.global,
          ssh: options.ssh,
          customPath,
        });

        setCompleted((prev) => [
          ...prev,
          {
            name,
            ok: result.success,
            detail: result.success
              ? `→ ${formatInstallTargets(result.paths, customPath)}`
              : result.error ?? 'Unknown error',
          },
        ]);
      }

      for (const [name, entry] of userEntries) {
        setCurrent(name);
        const { source, customPath } = parseSkillEntry(entry);
        const parsed = parseSource(source);
        const result = await installUserSkill(parsed, name, {
          global: options.global,
          customPath,
        });

        setCompleted((prev) => [
          ...prev,
          {
            name,
            ok: result.success,
            detail: result.success
              ? `→ ${formatInstallTargets(result.paths, customPath)}`
              : result.error ?? 'Unknown error',
          },
        ]);
      }

      setCurrent(undefined);
      setDone(true);
    })();
  }, []);

  if (fatalError) {
    return <StatusMessage variant="error">{fatalError}</StatusMessage>;
  }

  if (total === 0 && done) {
    return <StatusMessage variant="info">No skills in manifest. Use "konstruct add {'<source>'}" to add some.</StatusMessage>;
  }

  const failures = completed.filter((c) => !c.ok).length;

  return (
    <Box flexDirection="column">
      {total > 0 && <StatusMessage variant="info">Installing {total} skill(s)…</StatusMessage>}
      <Static items={completed}>
        {(item) => (
          <Box key={item.name} flexDirection="column">
            <StatusMessage variant={item.ok ? 'success' : 'error'}>{item.name}</StatusMessage>
            {item.ok ? (
              <Text>  <Text color="cyan">ℹ</Text> {item.detail}</Text>
            ) : (
              <Text>  <Text color="red">✗</Text> {item.detail}</Text>
            )}
          </Box>
        )}
      </Static>
      {current && <Spinner label={current} />}
      {done && (
        <Box marginTop={1}>
          {failures === 0 ? (
            <StatusMessage variant="success">All {total} skill(s) installed.</StatusMessage>
          ) : (
            <StatusMessage variant="error">{failures} of {total} skill(s) failed.</StatusMessage>
          )}
        </Box>
      )}
    </Box>
  );
}

export async function installCommand(options: InstallOptions) {
  const { waitUntilExit } = render(<InstallApp options={options} />);
  await waitUntilExit();
}
