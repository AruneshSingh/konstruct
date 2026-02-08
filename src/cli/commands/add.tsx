import { render, Box, useApp } from 'ink';
import { useState, useCallback, useEffect } from 'react';
import { parseSource } from '../../core/source-parser.ts';
import { addSkillToManifest, readManifest } from '../../core/manifest.ts';
import { installGitSkill, installUserSkill, discoverSkillsFromSource } from '../../core/installer.ts';
import { KONSTRUCT_DIR } from '../../core/config.ts';
import { formatInstallTargets } from '../utils.ts';
import { Banner } from '../components/Banner.tsx';
import { StatusMessage } from '../components/StatusMessage.tsx';
import { Spinner } from '../components/Spinner.tsx';
import { Select } from '../components/Select.tsx';
import { MultiSelect } from '../components/MultiSelect.tsx';
import type { SkillSource } from '../../types/index.ts';

interface AddOptions {
  global?: boolean;
  user?: boolean;
  path?: string;
  ssh?: boolean;
  skill?: string[];
}

type Phase = 'parsing' | 'no-manifest' | 'discovering' | 'selecting' | 'installing' | 'done';

function AddApp({ source, options: initialOptions }: { source: string; options: AddOptions }) {
  const { exit } = useApp();
  const [phase, setPhase] = useState<Phase>('parsing');
  const [messages, setMessages] = useState<{ variant: 'success' | 'error' | 'info' | 'warn'; text: string }[]>([]);
  const [spinnerLabel, setSpinnerLabel] = useState('');
  const [skills, setSkills] = useState<{ name: string; description: string; repoPath: string }[]>([]);
  const [parsed, setParsed] = useState<SkillSource | null>(null);
  const [options, setOptions] = useState(initialOptions);

  // Exit only after the 'done' phase has rendered (spinner cleared from screen)
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
      // Parse source
      let parsedSource: SkillSource;
      try {
        parsedSource = parseSource(source);
      } catch (e) {
        addMsg('error', e instanceof Error ? e.message : String(e));
        finish();
        return;
      }
      setParsed(parsedSource);

      // Check manifest
      if (!options.global) {
        const localManifest = await readManifest(process.cwd());
        if (!localManifest) {
          addMsg('warn', 'No skills.json found in the current directory.');
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
      // Initialize project first
      const { initCommand } = await import('./init.tsx');
      await initCommand();
    }
    if (parsed) await startInstall(parsed, opts);
  }, [options, parsed]);

  async function startInstall(parsedSource: SkillSource, opts: AddOptions) {
    // User skill (file:)
    if (parsedSource.type === 'file' || opts.user) {
      if (opts.user && parsedSource.type !== 'file') {
        addMsg('error', '--user flag requires a file: source (e.g. file:./my-skill)');
        finish();
        return;
      }

      const skillName = deriveSkillName(source, parsedSource);
      setSpinnerLabel(`Adding "${skillName}"…`);
      setPhase('installing');

      const result = await installUserSkill(parsedSource, skillName, {
        global: opts.global,
        customPath: opts.path,
      });

      if (!result.success) {
        addMsg('error', result.error ?? 'Unknown error');
        finish();
        return;
      }

      addMsg('success', `Added "${skillName}"`);
      await addSkillToManifest(skillName, source, {
        isUserSkill: true,
        cwd: opts.global ? KONSTRUCT_DIR : undefined,
        customPath: opts.path,
      });
      addMsg('info', `Installed to: ${formatInstallTargets(result.paths, opts.path)}`);
      addMsg('info', 'Added to skills.json');
      finish();
      return;
    }

    // Git skill — discover
    setSpinnerLabel('Cloning and discovering skills…');
    setPhase('discovering');

    let discovered: { name: string; description: string; repoPath: string }[];
    try {
      discovered = await discoverSkillsFromSource(parsedSource, { ssh: opts.ssh });
    } catch (e) {
      addMsg('error', e instanceof Error ? e.message : String(e));
      finish();
      return;
    }

    addMsg('success', 'Discovery complete');

    if (discovered.length === 0) {
      addMsg('error', 'No SKILL.md files found in that repository.');
      finish();
      return;
    }

    if (opts.skill) {
      const notFound = opts.skill.filter(s => !discovered.some(d => d.name === s));
      if (notFound.length > 0) {
        addMsg('error', `Skill(s) not found: ${notFound.join(', ')}`);
        setSpinnerLabel('');
        setSkills(discovered);
        setPhase('selecting');
        return;
      }
      const picks = discovered.filter(d => opts.skill!.includes(d.name));
      await installPicks(parsedSource, opts, picks, discovered);
      return;
    }

    if (discovered.length === 1) {
      addMsg('info', `Found 1 skill: "${discovered[0]!.name}"`);
      await installPicks(parsedSource, opts, [discovered[0]!], discovered);
    } else {
      setSpinnerLabel('');
      setSkills(discovered);
      setPhase('selecting');
    }
  }

  const onSkillsConfirm = useCallback(async (indices: number[]) => {
    if (indices.length === 0) {
      addMsg('info', 'Nothing selected.');
      finish();
      return;
    }
    const picks = indices.map((i) => skills[i]!);
    if (parsed) await installPicks(parsed, options, picks, skills);
  }, [skills, parsed, options]);

  async function installPicks(
    parsedSource: SkillSource,
    opts: AddOptions,
    picks: { name: string; repoPath: string }[],
    allSkills: { name: string; repoPath: string }[],
  ) {
    setPhase('installing');
    let installed = 0;

    for (const chosen of picks) {
      const persistedSource =
        parsedSource.subpath || allSkills.length === 1
          ? source
          : serializeSource(parsedSource, chosen.repoPath);

      const installSource: SkillSource = {
        ...parsedSource,
        subpath: chosen.repoPath || undefined,
      };

      setSpinnerLabel(`Installing "${chosen.name}"…`);
      const result = await installGitSkill(installSource, chosen.name, {
        global: opts.global,
        customPath: opts.path,
        ssh: opts.ssh,
      });

      if (!result.success) {
        addMsg('error', result.error ?? 'Unknown error');
        continue;
      }

      addMsg('success', `Installed "${chosen.name}"`);
      await addSkillToManifest(chosen.name, persistedSource, {
        cwd: opts.global ? KONSTRUCT_DIR : undefined,
        customPath: opts.path,
      });
      addMsg('info', `Installed to: ${formatInstallTargets(result.paths, opts.path)}`);
      installed++;
    }

    addMsg('info', `${installed}/${picks.length} skill(s) added to skills.json`);
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
      {phase === 'selecting' && skills.length > 0 && (
        <MultiSelect
          prompt="Select skills to install:"
          items={skills.map((s) => s.name)}
          onConfirm={onSkillsConfirm}
        />
      )}
      {(phase === 'discovering' || phase === 'installing') && spinnerLabel && (
        <Spinner label={spinnerLabel} />
      )}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Helpers (unchanged from original)
// ---------------------------------------------------------------------------

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

function deriveSkillName(source: string, parsed: { subpath?: string; url: string }): string {
  if (parsed.subpath) {
    const segments = parsed.subpath.split('/').filter(Boolean);
    if (segments.length > 0) return segments[segments.length - 1]!;
  }

  if (source.startsWith('file:')) {
    const path = source.slice('file:'.length).replace(/\/+$/, '');
    const segments = path.split('/').filter(Boolean);
    return segments[segments.length - 1] ?? 'skill';
  }

  try {
    const url = new URL(parsed.url);
    const parts = url.pathname.split('/').filter(Boolean);
    const repo = parts[parts.length - 1]?.replace(/\.git$/, '');
    return repo ?? 'skill';
  } catch {
    return 'skill';
  }
}

export async function addCommand(source: string, options: AddOptions) {
  const { waitUntilExit } = render(<AddApp source={source} options={options} />);
  await waitUntilExit();
}
