/**
 * A discovered skill parsed from a SKILL.md file.
 */
export interface Skill {
  name: string;
  description: string;
  /** Absolute path to the directory containing SKILL.md */
  path: string;
  metadata?: Record<string, unknown>;
}

/**
 * A parsed skill source reference.
 */
export interface SkillSource {
  type: 'github' | 'gitlab' | 'git' | 'file';
  /** The resolved URL (e.g. https://github.com/owner/repo.git) or local path */
  url: string;
  /** Git ref: tag, branch, or commit SHA */
  ref?: string;
  /** Sub-directory within the repo that contains the skill */
  subpath?: string;
}

/**
 * Skill entry in manifest with source and optional custom path
 */
export interface SkillEntry {
  source: string;
  path?: string;
}

/**
 * The skills.json manifest — the declarative list of skills for a project.
 */
export interface SkillsManifest {
  name: string;
  version: string;
  /** Git-based skills, updated by `konstruct update` */
  skills: Record<string, SkillEntry>;
  /** Local user-created skills, never auto-updated */
  userSkills?: Record<string, SkillEntry>;
}

/**
 * konstruct.config.json — agent preferences and install paths.
 */
export interface KonstructConfig {
  version: number;
  /** Agents for this scope (project or global) */
  agents: string[];
  /** Override: install everything here instead of per-agent dirs */
  customInstallPath?: string;
  global?: {
    defaultAgents: string[];
  };
}

/**
 * Options passed into install functions.
 */
export interface InstallOptions {
  /** Install to global (~/) rather than project (./) directories */
  global?: boolean;
  /** Override installation path */
  customPath?: string;
  /** Override the agent list from config */
  agents?: string[];
  /** Use SSH URLs directly. When false (default), HTTPS is tried first and
   *  SSH is retried automatically on auth failure for GitHub/GitLab. */
  ssh?: boolean;
}

/**
 * Result of a single skill installation.
 */
export interface InstallResult {
  success: boolean;
  skill: string;
  /** All paths the skill was copied to (one per agent) */
  paths: string[];
  error?: string;
}
