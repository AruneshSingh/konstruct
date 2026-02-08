import { render, Box, useApp } from 'ink';
import { useState, useCallback, useEffect } from 'react';
import { readConfig, writeConfig, KONSTRUCT_DIR, KNOWN_AGENTS } from '../../core/config.ts';
import { readManifest } from '../../core/manifest.ts';
import type { KonstructConfig } from '../../types/index.ts';
import { StatusMessage } from '../components/StatusMessage.tsx';
import { Select } from '../components/Select.tsx';
import { MultiSelect } from '../components/MultiSelect.tsx';
import { getAgentLabels } from '../prompts.ts';

type Phase = 'scope' | 'display' | 'select-agents' | 'done';

function DefaultsApp() {
  const { exit } = useApp();
  const [phase, setPhase] = useState<Phase>('scope');
  const [isGlobal, setIsGlobal] = useState(false);
  const [hasLocalManifest, setHasLocalManifest] = useState(false);
  const [currentAgents, setCurrentAgents] = useState<string[]>([]);
  const [config, setConfig] = useState<KonstructConfig | null>(null);
  const [orderedSlugs, setOrderedSlugs] = useState<string[]>([]);
  const [labels, setLabels] = useState<string[]>([]);
  const [result, setResult] = useState<{ agents: string[]; scope: string }>();

  // Exit only after the 'done' render has flushed
  useEffect(() => {
    if (phase === 'done') exit();
  }, [phase, exit]);

  // Initialize: check for local manifest
  const [initialized, setInitialized] = useState(false);
  if (!initialized) {
    setInitialized(true);
    (async () => {
      const localManifest = await readManifest(process.cwd());
      if (localManifest) {
        setHasLocalManifest(true);
        // show scope selection
      } else {
        // skip scope selection, go straight to global
        setIsGlobal(true);
        await loadConfig(true);
      }
    })();
  }

  async function loadConfig(global: boolean) {
    const cwd = process.cwd();
    const cfg = await readConfig(cwd, global);
    setConfig(cfg);

    const agents = global
      ? cfg?.global?.defaultAgents ?? cfg?.agents ?? []
      : cfg?.agents ?? [];
    setCurrentAgents(agents);

    const { ordered, labels: lbls } = getAgentLabels();
    setOrderedSlugs(ordered);
    setLabels(lbls);
    setPhase('display');
  }

  const onScopeSelect = useCallback(async (index: number) => {
    const global = index === 1;
    setIsGlobal(global);
    await loadConfig(global);
  }, []);

  const onAgentsConfirm = useCallback(async (indices: number[]) => {
    const agents = indices.length === 0 ? ['claude'] : indices.map((i) => orderedSlugs[i]!);
    const scope = isGlobal ? 'global' : 'project';
    const cwd = process.cwd();

    if (config) {
      if (isGlobal) {
        if (!config.global) config.global = { defaultAgents: agents };
        else config.global.defaultAgents = agents;
      } else {
        config.agents = agents;
      }
      await writeConfig(config, cwd, isGlobal);
    } else {
      const newConfig: KonstructConfig = {
        version: 1,
        agents: isGlobal ? [] : agents,
        ...(isGlobal && { global: { defaultAgents: agents } }),
      };
      await writeConfig(newConfig, cwd, isGlobal);
    }

    setResult({ agents, scope });
    setPhase('done');
  }, [config, isGlobal, orderedSlugs]);

  return (
    <Box flexDirection="column">
      {phase === 'scope' && hasLocalManifest && (
        <Select
          prompt="Update project defaults or global defaults?"
          items={['Project', 'Global']}
          onSelect={onScopeSelect}
        />
      )}
      {phase === 'scope' && !hasLocalManifest && (
        <StatusMessage variant="info">No skills.json in current directory — updating global defaults.</StatusMessage>
      )}
      {phase === 'display' && (
        <Box flexDirection="column">
          {currentAgents.length > 0 ? (
            <StatusMessage variant="info">Current default agents: {currentAgents.join(', ')}</StatusMessage>
          ) : (
            <StatusMessage variant="warn">No default agents configured.</StatusMessage>
          )}
        </Box>
      )}
      {(phase === 'display' || phase === 'select-agents') && labels.length > 0 && (
        <MultiSelect
          prompt="Select your default agent(s)"
          items={labels}
          onConfirm={onAgentsConfirm}
        />
      )}
      {phase === 'done' && result && (
        <StatusMessage variant="success">
          Updated {result.scope} default agents: {result.agents.join(', ')}
        </StatusMessage>
      )}
    </Box>
  );
}

export async function defaultsCommand() {
  const { waitUntilExit } = render(<DefaultsApp />);
  await waitUntilExit();
}
