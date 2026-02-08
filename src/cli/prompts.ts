import { KNOWN_AGENTS } from '../core/config.ts';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Agent detection (mirrors config.ts env-var resolution)
// ---------------------------------------------------------------------------

const home = homedir();
const configHome = process.env.XDG_CONFIG_HOME?.trim() || join(home, '.config');
const claudeHome = process.env.CLAUDE_CONFIG_DIR?.trim() || join(home, '.claude');
const codexHome = process.env.CODEX_HOME?.trim() || join(home, '.codex');

const AGENT_DETECTORS: Record<string, () => boolean> = {
  claude: () => existsSync(claudeHome),
  cursor: () => existsSync(join(home, '.cursor')),
  windsurf: () => existsSync(join(home, '.codeium', 'windsurf')),
  continue: () => existsSync(join(home, '.continue')),
  copilot: () => existsSync(join(home, '.copilot')),
  gemini: () => existsSync(join(home, '.gemini')),
  augment: () => existsSync(join(home, '.augment')),
  cline: () => existsSync(join(home, '.cline')),
  goose: () => existsSync(join(configHome, 'goose')),
  junie: () => existsSync(join(home, '.junie')),
  kiro: () => existsSync(join(home, '.kiro')),
  opencode: () => existsSync(join(configHome, 'opencode')),
  openhands: () => existsSync(join(home, '.openhands')),
  roo: () => existsSync(join(home, '.roo')),
  trae: () => existsSync(join(home, '.trae')),
  kode: () => existsSync(join(home, '.kode')),
  'qwen-code': () => existsSync(join(home, '.qwen')),
  codex: () => existsSync(codexHome) || existsSync('/etc/codex'),
  amp: () => existsSync(join(configHome, 'agents')),
  kilo: () => existsSync(join(home, '.kilocode')),
  pochi: () => existsSync(join(home, '.pochi')),
  neovate: () => existsSync(join(home, '.neovate')),
  mux: () => existsSync(join(home, '.mux')),
  zencoder: () => existsSync(join(home, '.zencoder')),
  adal: () => existsSync(join(home, '.adal')),
};

export function detectInstalledAgents(): Set<string> {
  const installed = new Set<string>();
  for (const slug of KNOWN_AGENTS) {
    const detect = AGENT_DETECTORS[slug];
    if (detect?.()) installed.add(slug);
  }
  return installed;
}

/**
 * Returns ordered agent slugs and display labels.
 * Detected (installed) agents appear first; the rest follow.
 */
export function getAgentLabels(): { ordered: string[]; labels: string[] } {
  const installed = detectInstalledAgents();
  const detected = KNOWN_AGENTS.filter((a) => installed.has(a));
  const rest = KNOWN_AGENTS.filter((a) => !installed.has(a));
  const ordered = [...detected, ...rest];
  const labels = ordered.map((a) => (installed.has(a) ? `${a} (detected)` : a));
  return { ordered, labels };
}
