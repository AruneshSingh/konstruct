import { render, Box, useApp } from 'ink';
import { useState, useCallback, useEffect } from 'react';
import { parseSource } from '../../core/source-parser.ts';
import { addSettingsToManifest, readSettingsManifest } from '../../core/settings-manifest.ts';
import { installGitSettings, installUserSettings, discoverSettingsFromSource } from '../../core/settings-installer.ts';
import { KONSTRUCT_DIR } from '../../core/config.ts';
import { formatInstallTargets } from '../utils.ts';
import { Banner } from '../components/Banner.tsx';
import { StatusMessage } from '../components/StatusMessage.tsx';
import { Spinner } from '../components/Spinner.tsx';
import { Select } from '../components/Select.tsx';
import { MultiSelect } from '../components/MultiSelect.tsx';
import type { SkillSource, SettingsStrategy } from '../../types/index.ts';

interface SettingsAddOptions {
  global?: boolean;
  user?: boolean;
  path?: string;
  ssh?: boolean;
  settings?: string[];
  strategy?: SettingsStrategy;
}

type Phase = 'parsing' | 'no-manifest' | 'discovering' | 'selecting' | 'installing' | 'done';

function SettingsAddApp({ source, options: initialOptions }: { source: string; options: SettingsAddOptions }) {
  const { exit } = useApp();
  const [phase, setPhase] = useState<Phase>('parsing');
  const [messages, setMessages] = useState<{ variant: 'success' | 'error' | 'info' | 'warn'; text: string }[]>([]);
  const [spinnerLabel, setSpinnerLabel] = useState('');
  const [settings, setSettings] = useState<{ name: string; description: string; repoPath: string; strategy?: string }[]>([]);
  const [parsed, setParsed] = useState<SkillSource | null>(null);
  const [options, setOptions] = useState(initialOptions);

  useEffect(() => {
    if (phase === 'done') exit();
  }, [phase, exit]);

  function finish() {
    setSpinnerLabel('');
    setPhase('done');
  }

  function addMsg(variant: 'success' | 'error' | 'info' | 'warn', text: string) {
    setMessages((prev) => [...prev, { variant, text }]);
  }

  const [initialized, setInitialized] = useState(false);
  if (!initialized) {
    setInitialized(true);
    (async () => {
      let parsedSource: SkillSource;
      try {
        parsedSource = parseSource(source);
      } catch (e) {
        addMsg('error', e instanceof Error ? e.message : String(e));
        finish();
        return;
      }
      setParsed(parsedSource);

      if (!options.global) {
        const localManifest = await readSettingsManifest(process.cwd());
        if (!localManifest) {
          addMsg('warn', 'No settings.json found in the current directory.');
          setPhase('no-manifest');
          return;
        }
      }

      await startInstall(parsedSource, options);
    })();
  }

  const onNoManifestSelect = useCallback(async (index: number) => {
    const opts = { ...options };
    if (index === 0) {
      opts.global = true;
      setOptions(opts);
    } else {
      const { initCommand } = await import('./init.tsx');
      await initCommand();
    }
    if (parsed) await startInstall(parsed, opts);
  }, [options, parsed]);

  async function startInstall(parsedSource: SkillSource, opts: SettingsAddOptions) {
    if (parsedSource.type === 'file' || opts.user) {
      if (opts.user && parsedSource.type !== 'file') {
        addMsg('error', '--user flag requires a file: source (e.g. file:./my-settings)');
        finish();
        return;
      }

      const settingsName = deriveSettingsName(source, parsedSource);
      setSpinnerLabel(`Adding "${settingsName}"…`);
      setPhase('installing');

      const result = await installUserSettings(parsedSource, settingsName, {
        global: opts.global,
        customPath: opts.path,
        strategy: opts.strategy,
      });

      if (!result.success) {
        addMsg('error', result.error ?? 'Unknown error');
        finish();
        return;
      }

      addMsg('success', `Added "${settingsName}" (strategy: ${result.strategy})`);
      await addSettingsToManifest(settingsName, source, {
        isUserSettings: true,
        cwd: opts.global ? KONSTRUCT_DIR : undefined,
        customPath: opts.path,
        strategy: result.strategy !== 'copy' ? result.strategy : undefined,
      });
      addMsg('info', `Installed to: ${formatInstallTargets(result.paths, opts.path)}`);
      addMsg('info', 'Added to settings.json');
      finish();
      return;
    }

    setSpinnerLabel('Cloning and discovering settings…');
    setPhase('discovering');

    let discovered: { name: string; description: string; repoPath: string; strategy?: string }[];
    try {
      discovered = await discoverSettingsFromSource(parsedSource, { ssh: opts.ssh });
    } catch (e) {
      addMsg('error', e instanceof Error ? e.message : String(e));
      finish();
      return;
    }

    addMsg('success', 'Discovery complete');

    if (discovered.length === 0) {
      addMsg('error', 'No SETTINGS.md files found in that repository.');
      finish();
      return;
    }

    if (opts.settings) {
      const notFound = opts.settings.filter(s => !discovered.some(d => d.name === s));
      if (notFound.length > 0) {
        addMsg('error', `Settings not found: ${notFound.join(', ')}`);
        setSpinnerLabel('');
        setSettings(discovered);
        setPhase('selecting');
        return;
      }
      const picks = discovered.filter(d => opts.settings!.includes(d.name));
      await installPicks(parsedSource, opts, picks, discovered);
      return;
    }

    if (discovered.length === 1) {
      addMsg('info', `Found 1 settings package: "${discovered[0]!.name}"`);
      await installPicks(parsedSource, opts, [discovered[0]!], discovered);
    } else {
      setSpinnerLabel('');
      setSettings(discovered);
      setPhase('selecting');
    }
  }

  const onSettingsConfirm = useCallback(async (indices: number[]) => {
    if (indices.length === 0) {
      addMsg('info', 'Nothing selected.');
      finish();
      return;
    }
    const picks = indices.map((i) => settings[i]!);
    if (parsed) await installPicks(parsed, options, picks, settings);
  }, [settings, parsed, options]);

  async function installPicks(
    parsedSource: SkillSource,
    opts: SettingsAddOptions,
    picks: { name: string; repoPath: string; strategy?: string }[],
    allSettings: { name: string; repoPath: string }[],
  ) {
    setPhase('installing');
    let installed = 0;

    for (const chosen of picks) {
      const persistedSource =
        parsedSource.subpath || allSettings.length === 1
          ? source
          : serializeSource(parsedSource, chosen.repoPath);

      const installSource: SkillSource = {
        ...parsedSource,
        subpath: chosen.repoPath || undefined,
      };

      const effectiveStrategy = opts.strategy
        ?? (chosen.strategy as SettingsStrategy | undefined)
        ?? 'copy';

      setSpinnerLabel(`Installing "${chosen.name}"…`);
      const result = await installGitSettings(installSource, chosen.name, {
        global: opts.global,
        customPath: opts.path,
        ssh: opts.ssh,
        strategy: effectiveStrategy,
      });

      if (!result.success) {
        addMsg('error', result.error ?? 'Unknown error');
        continue;
      }

      addMsg('success', `Installed "${chosen.name}" (strategy: ${result.strategy})`);
      await addSettingsToManifest(chosen.name, persistedSource, {
        cwd: opts.global ? KONSTRUCT_DIR : undefined,
        customPath: opts.path,
        strategy: result.strategy !== 'copy' ? result.strategy : undefined,
      });
      addMsg('info', `Installed to: ${formatInstallTargets(result.paths, opts.path)}`);
      installed++;
    }

    addMsg('info', `${installed}/${picks.length} settings package(s) added to settings.json`);
    finish();
  }

  return (
    <Box flexDirection="column">
      <Banner />
      {messages.map((m, i) => (
        <StatusMessage key={i} variant={m.variant}>{m.text}</StatusMessage>
      ))}
      {phase === 'no-manifest' && (
        <Select
          prompt="How would you like to proceed?"
          items={['Install globally (default agents)', 'Initialize this project and install here']}
          onSelect={onNoManifestSelect}
        />
      )}
      {phase === 'selecting' && settings.length > 0 && (
        <MultiSelect
          prompt="Select settings packages to install:"
          items={settings.map((s) => s.name)}
          onConfirm={onSettingsConfirm}
        />
      )}
      {(phase === 'discovering' || phase === 'installing') && spinnerLabel && (
        <Spinner label={spinnerLabel} />
      )}
    </Box>
  );
}

function serializeSource(parsed: { type: string; url: string; ref?: string }, repoPath: string): string {
  const ref = parsed.ref ? `#${parsed.ref}` : '';

  if (parsed.type === 'github') {
    const match = parsed.url.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/);
    if (match) return `github:${match[1]}/${match[2]}/${repoPath}${ref}`;
  }

  if (parsed.type === 'gitlab') {
    const match = parsed.url.match(/gitlab\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/);
    if (match) return `gitlab:${match[1]}/${match[2]}/${repoPath}${ref}`;
  }

  return `git:${parsed.url}${ref}`;
}

function deriveSettingsName(source: string, parsed: { subpath?: string; url: string }): string {
  if (parsed.subpath) {
    const segments = parsed.subpath.split('/').filter(Boolean);
    if (segments.length > 0) return segments[segments.length - 1]!;
  }

  if (source.startsWith('file:')) {
    const path = source.slice('file:'.length).replace(/\/+$/, '');
    const segments = path.split('/').filter(Boolean);
    return segments[segments.length - 1] ?? 'settings';
  }

  try {
    const url = new URL(parsed.url);
    const parts = url.pathname.split('/').filter(Boolean);
    const repo = parts[parts.length - 1]?.replace(/\.git$/, '');
    return repo ?? 'settings';
  } catch {
    return 'settings';
  }
}

export async function settingsAddCommand(source: string, options: SettingsAddOptions) {
  const { waitUntilExit } = render(<SettingsAddApp source={source} options={options} />);
  await waitUntilExit();
}
