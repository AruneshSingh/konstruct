import { render, Box, useApp } from 'ink';
import { useState, useCallback, useEffect } from 'react';
import { writeManifest, readManifest } from '../../core/manifest.ts';
import { readConfig, writeConfig, KONSTRUCT_DIR } from '../../core/config.ts';
import type { KonstructConfig } from '../../types/index.ts';
import { basename } from 'node:path';
import { Banner } from '../components/Banner.tsx';
import { StatusMessage } from '../components/StatusMessage.tsx';
import { MultiSelect } from '../components/MultiSelect.tsx';
import { getAgentLabels } from '../prompts.ts';

interface InitOptions {
  global?: boolean;
}

type Phase = 'init' | 'select-agents' | 'done';

function InitApp({ options }: { options: InitOptions }) {
  const { exit } = useApp();
  const [phase, setPhase] = useState<Phase>('init');
  const [messages, setMessages] = useState<{ variant: 'success' | 'warn' | 'info'; text: string }[]>([]);
  const [showAgentPrompt, setShowAgentPrompt] = useState(false);
  const [agentLabels, setAgentLabels] = useState<string[]>([]);
  const [agentSlugs, setAgentSlugs] = useState<string[]>([]);
  const [cwd] = useState(() => options.global ? KONSTRUCT_DIR : process.cwd());
  const [scope] = useState(() => options.global ? 'global' : 'project');

  // Exit only after the 'done' render has flushed
  useEffect(() => {
    if (phase === 'done') exit();
  }, [phase, exit]);

  const [initialized, setInitialized] = useState(false);
  if (!initialized) {
    setInitialized(true);
    (async () => {
      const msgs: typeof messages = [];

      // --- skills.json ---
      const existingManifest = await readManifest(cwd);
      if (existingManifest) {
        msgs.push({ variant: 'warn', text: `${scope} skills.json already exists — skipping.` });
      } else {
        await writeManifest(
          { name: basename(cwd), version: '1.0.0', skills: {} },
          cwd,
        );
        msgs.push({ variant: 'success', text: `Created ${scope} skills.json` });
      }

      // --- konstruct.config.json ---
      const existingConfig = await readConfig(cwd);
      if (existingConfig) {
        msgs.push({ variant: 'warn', text: `${scope} konstruct.config.json already exists — skipping.` });
        msgs.push({
          variant: 'info',
          text: options.global
            ? 'Global configuration created. Use "konstruct add -g <source>" to add global skills.'
            : 'Run "konstruct add <source>" to add your first skill.',
        });
        setMessages(msgs);
        setPhase('done');
      } else {
        msgs.push({
          variant: 'info',
          text: options.global
            ? 'Which AI agents do you want as global defaults?'
            : 'Which AI agents do you use in this project?',
        });
        setMessages(msgs);

        const { ordered, labels } = getAgentLabels();
        setAgentSlugs(ordered);
        setAgentLabels(labels);
        setShowAgentPrompt(true);
        setPhase('select-agents');
      }
    })();
  }

  const onAgentsConfirm = useCallback(async (indices: number[]) => {
    const agents = indices.length === 0 ? ['claude'] : indices.map((i) => agentSlugs[i]!);

    const config: KonstructConfig = {
      version: 1,
      agents,
      ...(options.global && { global: { defaultAgents: agents } }),
    };
    await writeConfig(config, cwd);

    setMessages((prev) => [
      ...prev,
      { variant: 'success', text: `Created ${scope} konstruct.config.json (agents: ${agents.join(', ')})` },
      {
        variant: 'info',
        text: options.global
          ? 'Global configuration created. Use "konstruct add -g <source>" to add global skills.'
          : 'Run "konstruct add <source>" to add your first skill.',
      },
    ]);
    setShowAgentPrompt(false);
    setPhase('done');
  }, [agentSlugs, cwd, scope, options.global]);

  return (
    <Box flexDirection="column">
      <Banner />
      {messages.map((m, i) => (
        <StatusMessage key={i} variant={m.variant}>{m.text}</StatusMessage>
      ))}
      {showAgentPrompt && (
        <MultiSelect
          prompt="Select your preferred AI agent(s)"
          items={agentLabels}
          onConfirm={onAgentsConfirm}
        />
      )}
    </Box>
  );
}

export async function initCommand(options: InitOptions = {}) {
  const { waitUntilExit } = render(<InitApp options={options} />);
  await waitUntilExit();
}
