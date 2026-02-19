import { render, Text, Box, Static, useApp } from 'ink';
import { useEffect, useState } from 'react';
import { readSettingsManifest, parseSettingsEntry } from '../../core/settings-manifest.ts';
import { parseSource } from '../../core/source-parser.ts';
import { installGitSettings, installUserSettings } from '../../core/settings-installer.ts';
import { formatInstallTargets } from '../utils.ts';
import { StatusMessage } from '../components/StatusMessage.tsx';
import { Spinner } from '../components/Spinner.tsx';

interface SettingsInstallOptions {
  global?: boolean;
  ssh?: boolean;
}

interface CompletedSettings {
  name: string;
  ok: boolean;
  detail: string;
}

function SettingsInstallApp({ options }: { options: SettingsInstallOptions }) {
  const { exit } = useApp();
  const [completed, setCompleted] = useState<CompletedSettings[]>([]);
  const [current, setCurrent] = useState<string>();
  const [total, setTotal] = useState(0);
  const [fatalError, setFatalError] = useState<string>();
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (done) exit();
  }, [done, exit]);

  useEffect(() => {
    (async () => {
      const manifest = await readSettingsManifest();
      if (!manifest) {
        setFatalError('No settings.json found. Run "konstruct init" first.');
        setDone(true);
        return;
      }

      const gitEntries = Object.entries(manifest.settings);
      const userEntries = Object.entries(manifest.userSettings ?? {});
      const count = gitEntries.length + userEntries.length;
      setTotal(count);

      if (count === 0) {
        setDone(true);
        return;
      }

      for (const [name, entry] of gitEntries) {
        setCurrent(name);
        const { source, customPath, strategy } = parseSettingsEntry(entry);
        const parsed = parseSource(source);
        const result = await installGitSettings(parsed, name, {
          global: options.global,
          ssh: options.ssh,
          customPath,
          strategy,
        });

        setCompleted((prev) => [
          ...prev,
          {
            name,
            ok: result.success,
            detail: result.success
              ? `→ ${formatInstallTargets(result.paths, customPath)} (${result.strategy})`
              : result.error ?? 'Unknown error',
          },
        ]);
      }

      for (const [name, entry] of userEntries) {
        setCurrent(name);
        const { source, customPath, strategy } = parseSettingsEntry(entry);
        const parsed = parseSource(source);
        const result = await installUserSettings(parsed, name, {
          global: options.global,
          customPath,
          strategy,
        });

        setCompleted((prev) => [
          ...prev,
          {
            name,
            ok: result.success,
            detail: result.success
              ? `→ ${formatInstallTargets(result.paths, customPath)} (${result.strategy})`
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
    return <StatusMessage variant="info">No settings in manifest. Use "konstruct settings add {'<source>'}" to add some.</StatusMessage>;
  }

  const failures = completed.filter((c) => !c.ok).length;

  return (
    <Box flexDirection="column">
      {total > 0 && <StatusMessage variant="info">Installing {total} settings package(s)…</StatusMessage>}
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
            <StatusMessage variant="success">All {total} settings package(s) installed.</StatusMessage>
          ) : (
            <StatusMessage variant="error">{failures} of {total} settings package(s) failed.</StatusMessage>
          )}
        </Box>
      )}
    </Box>
  );
}

export async function settingsInstallCommand(options: SettingsInstallOptions) {
  const { waitUntilExit } = render(<SettingsInstallApp options={options} />);
  await waitUntilExit();
}
