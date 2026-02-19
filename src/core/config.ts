import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { KonstructConfig } from '../types/index.ts';
import { exists } from '../utils/fs.ts';

const CONFIG_FILENAME = 'konstruct.config.json';

/** ~/.konstruct — single home for all global konstruct state */
export const KONSTRUCT_DIR = join(homedir(), '.konstruct');

// ---------------------------------------------------------------------------
// Agent registry 
// ---------------------------------------------------------------------------

import { existsSync } from 'node:fs';

const home = homedir();

// Env-var overrides — resolved once at load time.
const configHome   = process.env.XDG_CONFIG_HOME?.trim()      || join(home, '.config');
const claudeHome   = process.env.CLAUDE_CONFIG_DIR?.trim()    || join(home, '.claude');
const codexHome    = process.env.CODEX_HOME?.trim()           || join(home, '.codex');

interface AgentEntry {
  slug: string;
  /** Relative path from cwd used for project-local installs. */
  skillsDir: string;
  /** Absolute path where global skills live (undefined = global not supported). */
  globalSkillsDir: string | undefined;
  /** Relative path from cwd for project-local settings (copy mode). */
  settingsDir: string;
  /** Absolute path where global settings live (copy mode). */
  globalSettingsDir: string | undefined;
  /** Absolute path to the agent's settings file (merge/replace mode). */
  settingsFile?: string;
  /** Absolute path to the agent's global settings file (merge/replace mode). */
  globalSettingsFile?: string;
  /** Returns true when the agent appears to be installed on this machine. */
  detectInstalled: () => boolean;
}

/**
 * Full agent registry.  Each entry's `detectInstalled` and `globalSkillsDir`
 * use the env-resolved base paths above
 */
export const AGENT_REGISTRY: AgentEntry[] = [
  {
    slug: 'claude',
    skillsDir: '.claude/skills',
    globalSkillsDir: join(claudeHome, 'skills'),
    settingsDir: '.claude/settings',
    globalSettingsDir: join(claudeHome, 'settings'),
    settingsFile: join('.claude', 'settings.json'),
    globalSettingsFile: join(claudeHome, 'settings.json'),
    detectInstalled: () => existsSync(claudeHome),
  },
  {
    slug: 'cursor',
    skillsDir: '.cursor/skills',
    globalSkillsDir: join(home, '.cursor', 'skills'),
    settingsDir: '.cursor/settings',
    globalSettingsDir: join(home, '.cursor', 'settings'),
    detectInstalled: () => existsSync(join(home, '.cursor')),
  },
  {
    slug: 'windsurf',
    skillsDir: '.windsurf/skills',
    globalSkillsDir: join(home, '.codeium', 'windsurf', 'skills'),
    settingsDir: '.windsurf/settings',
    globalSettingsDir: join(home, '.codeium', 'windsurf', 'settings'),
    detectInstalled: () => existsSync(join(home, '.codeium', 'windsurf')),
  },
  {
    slug: 'continue',
    skillsDir: '.continue/skills',
    globalSkillsDir: join(home, '.continue', 'skills'),
    settingsDir: '.continue/settings',
    globalSettingsDir: join(home, '.continue', 'settings'),
    detectInstalled: () => existsSync(join(home, '.continue')),
  },
  {
    slug: 'copilot',
    skillsDir: '.copilot/skills',
    globalSkillsDir: join(home, '.copilot', 'skills'),
    settingsDir: '.copilot/settings',
    globalSettingsDir: join(home, '.copilot', 'settings'),
    detectInstalled: () => existsSync(join(home, '.copilot')),
  },
  {
    slug: 'gemini',
    skillsDir: '.gemini/skills',
    globalSkillsDir: join(home, '.gemini', 'skills'),
    settingsDir: '.gemini/settings',
    globalSettingsDir: join(home, '.gemini', 'settings'),
    detectInstalled: () => existsSync(join(home, '.gemini')),
  },
  {
    slug: 'augment',
    skillsDir: '.augment/rules',
    globalSkillsDir: join(home, '.augment', 'rules'),
    settingsDir: '.augment/settings',
    globalSettingsDir: join(home, '.augment', 'settings'),
    detectInstalled: () => existsSync(join(home, '.augment')),
  },
  {
    slug: 'cline',
    skillsDir: '.cline/skills',
    globalSkillsDir: join(home, '.cline', 'skills'),
    settingsDir: '.cline/settings',
    globalSettingsDir: join(home, '.cline', 'settings'),
    detectInstalled: () => existsSync(join(home, '.cline')),
  },
  {
    slug: 'goose',
    skillsDir: '.goose/skills',
    globalSkillsDir: join(configHome, 'goose', 'skills'),
    settingsDir: '.goose/settings',
    globalSettingsDir: join(configHome, 'goose', 'settings'),
    detectInstalled: () => existsSync(join(configHome, 'goose')),
  },
  {
    slug: 'junie',
    skillsDir: '.junie/skills',
    globalSkillsDir: join(home, '.junie', 'skills'),
    settingsDir: '.junie/settings',
    globalSettingsDir: join(home, '.junie', 'settings'),
    detectInstalled: () => existsSync(join(home, '.junie')),
  },
  {
    slug: 'kiro',
    skillsDir: '.kiro/skills',
    globalSkillsDir: join(home, '.kiro', 'skills'),
    settingsDir: '.kiro/settings',
    globalSettingsDir: join(home, '.kiro', 'settings'),
    detectInstalled: () => existsSync(join(home, '.kiro')),
  },
  {
    slug: 'opencode',
    skillsDir: '.opencode/skills',
    globalSkillsDir: join(configHome, 'opencode', 'skills'),
    settingsDir: '.opencode/settings',
    globalSettingsDir: join(configHome, 'opencode', 'settings'),
    detectInstalled: () => existsSync(join(configHome, 'opencode')),
  },
  {
    slug: 'openhands',
    skillsDir: '.openhands/skills',
    globalSkillsDir: join(home, '.openhands', 'skills'),
    settingsDir: '.openhands/settings',
    globalSettingsDir: join(home, '.openhands', 'settings'),
    detectInstalled: () => existsSync(join(home, '.openhands')),
  },
  {
    slug: 'roo',
    skillsDir: '.roo/skills',
    globalSkillsDir: join(home, '.roo', 'skills'),
    settingsDir: '.roo/settings',
    globalSettingsDir: join(home, '.roo', 'settings'),
    detectInstalled: () => existsSync(join(home, '.roo')),
  },
  {
    slug: 'trae',
    skillsDir: '.trae/skills',
    globalSkillsDir: join(home, '.trae', 'skills'),
    settingsDir: '.trae/settings',
    globalSettingsDir: join(home, '.trae', 'settings'),
    detectInstalled: () => existsSync(join(home, '.trae')),
  },
  {
    slug: 'kode',
    skillsDir: '.kode/skills',
    globalSkillsDir: join(home, '.kode', 'skills'),
    settingsDir: '.kode/settings',
    globalSettingsDir: join(home, '.kode', 'settings'),
    detectInstalled: () => existsSync(join(home, '.kode')),
  },
  {
    slug: 'qwen-code',
    skillsDir: '.qwen/skills',
    globalSkillsDir: join(home, '.qwen', 'skills'),
    settingsDir: '.qwen/settings',
    globalSettingsDir: join(home, '.qwen', 'settings'),
    detectInstalled: () => existsSync(join(home, '.qwen')),
  },
  {
    slug: 'codex',
    skillsDir: '.codex/skills',
    globalSkillsDir: join(codexHome, 'skills'),
    settingsDir: '.codex/settings',
    globalSettingsDir: join(codexHome, 'settings'),
    detectInstalled: () => existsSync(codexHome) || existsSync('/etc/codex'),
  },
  {
    slug: 'amp',
    skillsDir: '.agents/skills',
    globalSkillsDir: join(configHome, 'agents', 'skills'),
    settingsDir: '.agents/settings',
    globalSettingsDir: join(configHome, 'agents', 'settings'),
    detectInstalled: () => existsSync(join(configHome, 'agents')),
  },
  {
    slug: 'kilo',
    skillsDir: '.kilocode/skills',
    globalSkillsDir: join(home, '.kilocode', 'skills'),
    settingsDir: '.kilocode/settings',
    globalSettingsDir: join(home, '.kilocode', 'settings'),
    detectInstalled: () => existsSync(join(home, '.kilocode')),
  },
  {
    slug: 'pochi',
    skillsDir: '.pochi/skills',
    globalSkillsDir: join(home, '.pochi', 'skills'),
    settingsDir: '.pochi/settings',
    globalSettingsDir: join(home, '.pochi', 'settings'),
    detectInstalled: () => existsSync(join(home, '.pochi')),
  },
  {
    slug: 'neovate',
    skillsDir: '.neovate/skills',
    globalSkillsDir: join(home, '.neovate', 'skills'),
    settingsDir: '.neovate/settings',
    globalSettingsDir: join(home, '.neovate', 'settings'),
    detectInstalled: () => existsSync(join(home, '.neovate')),
  },
  {
    slug: 'mux',
    skillsDir: '.mux/skills',
    globalSkillsDir: join(home, '.mux', 'skills'),
    settingsDir: '.mux/settings',
    globalSettingsDir: join(home, '.mux', 'settings'),
    detectInstalled: () => existsSync(join(home, '.mux')),
  },
  {
    slug: 'zencoder',
    skillsDir: '.zencoder/skills',
    globalSkillsDir: join(home, '.zencoder', 'skills'),
    settingsDir: '.zencoder/settings',
    globalSettingsDir: join(home, '.zencoder', 'settings'),
    detectInstalled: () => existsSync(join(home, '.zencoder')),
  },
  {
    slug: 'adal',
    skillsDir: '.adal/skills',
    globalSkillsDir: join(home, '.adal', 'skills'),
    settingsDir: '.adal/settings',
    globalSettingsDir: join(home, '.adal', 'settings'),
    detectInstalled: () => existsSync(join(home, '.adal')),
  },
  {
    slug: 'openclaw',
    skillsDir: '.openclaw/skills',
    globalSkillsDir: join(home, '.openclaw', 'skills'),
    settingsDir: '.openclaw/settings',
    globalSettingsDir: join(home, '.openclaw', 'settings'),
    detectInstalled: () => existsSync(join(home, '.openclaw')),
  },
];

/** Quick lookup: slug → entry */
const AGENT_MAP = new Map(AGENT_REGISTRY.map((e) => [e.slug, e]));

/** Exported slug list (preserves insertion order) for prompts / tests. */
const KNOWN_AGENTS = AGENT_REGISTRY.map((e) => e.slug);

// ---------------------------------------------------------------------------
// Read / Write
// ---------------------------------------------------------------------------

/**
 * Read a konstruct config from disk.
 * @param cwd   Working directory (ignored when global is true).
 * @param global Read from ~/.konstruct/konstruct.config.json instead of cwd.
 */
export async function readConfig(
  cwd: string = process.cwd(),
  global: boolean = false
): Promise<KonstructConfig | null> {
  const configPath = global ? join(KONSTRUCT_DIR, CONFIG_FILENAME) : join(cwd, CONFIG_FILENAME);

  if (!(await exists(configPath))) return null;

  const raw = await readFile(configPath, 'utf-8');
  let config: KonstructConfig;
  try {
    config = JSON.parse(raw) as KonstructConfig;
  } catch (e) {
    throw new Error(`Invalid JSON in ${configPath}: ${e instanceof Error ? e.message : e}`);
  }
  validateConfig(config);
  return config;
}

/**
 * Write a konstruct config to disk.
 */
export async function writeConfig(
  config: KonstructConfig,
  cwd: string = process.cwd(),
  global: boolean = false
): Promise<void> {
  const dir = global ? KONSTRUCT_DIR : cwd;
  if (global) await mkdir(dir, { recursive: true });
  await writeFile(join(dir, CONFIG_FILENAME), JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

// ---------------------------------------------------------------------------
// Agent directory resolution
// ---------------------------------------------------------------------------

/**
 * Given a list of agent slugs, return the skill directories for each one.
 *
 * Global: returns each agent's absolute `globalSkillsDir` (skips agents that
 *         don't support global installs).
 * Project-local: joins cwd with the agent's relative `skillsDir`.
 * Unknown slugs fall back to `.<slug>/skills` under cwd.
 *
 * If customPath is provided it overrides everything (single directory).
 */
export function getAgentSkillDirs(
  agents: string[],
  global: boolean = false,
  cwd: string = process.cwd(),
  customPath?: string
): string[] {
  if (customPath) return [customPath];

  const dirs: string[] = [];
  for (const slug of agents) {
    const entry = AGENT_MAP.get(slug);
    if (global) {
      // globalSkillsDir is already absolute; skip if agent doesn't support global
      if (entry?.globalSkillsDir) dirs.push(entry.globalSkillsDir);
    } else {
      // project-local: relative skillsDir joined with cwd, or fallback
      dirs.push(join(cwd, entry?.skillsDir ?? `.${slug}/skills`));
    }
  }
  return dirs;
}

/**
 * Given a list of agent slugs, return the settings directories for each one.
 * Mirrors getAgentSkillDirs but uses settingsDir / globalSettingsDir.
 */
export function getAgentSettingsDirs(
  agents: string[],
  global: boolean = false,
  cwd: string = process.cwd(),
  customPath?: string
): string[] {
  if (customPath) return [customPath];

  const dirs: string[] = [];
  for (const slug of agents) {
    const entry = AGENT_MAP.get(slug);
    if (global) {
      if (entry?.globalSettingsDir) dirs.push(entry.globalSettingsDir);
    } else {
      dirs.push(join(cwd, entry?.settingsDir ?? `.${slug}/settings`));
    }
  }
  return dirs;
}

/**
 * Return agent slugs paired with their settings file paths for merge-capable agents.
 * Only includes agents that have a settingsFile / globalSettingsFile defined.
 */
export function getAgentSettingsFiles(
  agents: string[],
  global: boolean = false,
  cwd: string = process.cwd(),
): { slug: string; filePath: string }[] {
  const result: { slug: string; filePath: string }[] = [];
  for (const slug of agents) {
    const entry = AGENT_MAP.get(slug);
    if (!entry) continue;
    if (global) {
      if (entry.globalSettingsFile) result.push({ slug, filePath: entry.globalSettingsFile });
    } else {
      if (entry.settingsFile) result.push({ slug, filePath: join(cwd, entry.settingsFile) });
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateConfig(config: unknown): asserts config is KonstructConfig {
  if (!config || typeof config !== 'object') {
    throw new Error('Invalid konstruct.config.json: must be a JSON object');
  }
  const c = config as Record<string, unknown>;
  if (typeof c.version !== 'number') {
    throw new Error('Invalid konstruct.config.json: "version" must be a number');
  }
  if (!Array.isArray(c.agents)) {
    throw new Error('Invalid konstruct.config.json: "agents" must be an array');
  }
}

// Export KNOWN_AGENTS for use in prompts / tests
export { KNOWN_AGENTS };
