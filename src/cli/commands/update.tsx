import { render, Text, Box, Static, useApp } from 'ink';
import { useEffect, useState } from 'react';
import { readManifest, parseSkillEntry } from '../../core/manifest.ts';
import { parseSource } from '../../core/source-parser.ts';
import { installGitSkill, checkSkillForUpdates } from '../../core/installer.ts';
import { KONSTRUCT_DIR } from '../../core/config.ts';
import { formatInstallTargets } from '../utils.ts';
import { StatusMessage } from '../components/StatusMessage.tsx';
import { Spinner } from '../components/Spinner.tsx';
import { DiffView } from '../components/DiffView.tsx';

interface UpdateOptions {
  global?: boolean;
  ssh?: boolean;
}

interface CompletedSkill {
  name: string;
  status: 'updated' | 'up-to-date' | 'installed' | 'failed';
  detail?: string;
  diff?: { added: string[]; changed: string[]; removed: string[] };
}

function UpdateApp({ options }: { options: UpdateOptions }) {
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
      const manifest = await readManifest(options.global ? KONSTRUCT_DIR : undefined);
      if (!manifest) {
        setFatalError('No skills.json found. Run "konstruct init" first.');
        setDone(true);
        return;
      }

      const gitEntries = Object.entries(manifest.skills);
      setTotal(gitEntries.length);

      if (gitEntries.length === 0) {
        setDone(true);
        return;
      }

      for (const [name, entry] of gitEntries) {
        setCurrent(`${name} — checking…`);
        const { source, customPath } = parseSkillEntry(entry);
        const parsed = parseSource(source);

        let diff;
        try {
          diff = await checkSkillForUpdates(parsed, name, {
            global: options.global,
            ssh: options.ssh,
            customPath,
          });
        } catch (e) {
          setCompleted((prev) => [
            ...prev,
            { name, status: 'failed', detail: e instanceof Error ? e.message : String(e) },
          ]);
          continue;
        }

        // Not installed at all — do a full install
        if (diff === null) {
          setCurrent(`${name} — installing…`);
          const result = await installGitSkill(parsed, name, {
            global: options.global,
            ssh: options.ssh,
            customPath,
          });
          setCompleted((prev) => [
            ...prev,
            result.success
              ? { name, status: 'installed', detail: `installed → ${formatInstallTargets(result.paths, customPath)}` }
              : { name, status: 'failed', detail: result.error },
          ]);
          continue;
        }

        // Already up to date
        if (diff.upToDate) {
          setCompleted((prev) => [...prev, { name, status: 'up-to-date' }]);
          continue;
        }

        // Has changes — update
        setCurrent(`${name} — updating…`);
        const result = await installGitSkill(parsed, name, {
          global: options.global,
          ssh: options.ssh,
          customPath,
        });
        setCompleted((prev) => [
          ...prev,
          result.success
            ? { name, status: 'updated', diff }
            : { name, status: 'failed', detail: result.error },
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
    return <StatusMessage variant="info">No git skills to update.</StatusMessage>;
  }

  const updated = completed.filter((c) => c.status === 'updated' || c.status === 'installed').length;
  const upToDate = completed.filter((c) => c.status === 'up-to-date').length;
  const failures = completed.filter((c) => c.status === 'failed').length;

  return (
    <Box flexDirection="column">
      {total > 0 && (
        <StatusMessage variant="info">
          Checking {total} git skill(s)… (userSkills are skipped)
        </StatusMessage>
      )}
      <Static items={completed}>
        {(item) => (
          <Box key={item.name} flexDirection="column">
            <StatusMessage variant={item.status === 'failed' ? 'error' : 'success'}>
              {item.name}
              {item.status === 'up-to-date' && <Text dimColor> up to date</Text>}
              {item.detail && ` ${item.detail}`}
            </StatusMessage>
            {item.diff && <DiffView diff={item.diff} />}
          </Box>
        )}
      </Static>
      {current && <Spinner label={current} />}
      {done && (
        <Box flexDirection="column" marginTop={1}>
          {failures > 0 && <StatusMessage variant="error">{failures} skill(s) failed.</StatusMessage>}
          {updated > 0 && <StatusMessage variant="success">{updated} skill(s) updated.</StatusMessage>}
          {upToDate > 0 && <StatusMessage variant="info">{upToDate} skill(s) already up to date.</StatusMessage>}
        </Box>
      )}
    </Box>
  );
}

export async function updateCommand(options: UpdateOptions = {}) {
  const { waitUntilExit } = render(<UpdateApp options={options} />);
  await waitUntilExit();
}
