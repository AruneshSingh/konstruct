import { mkdir, rm, cp } from 'node:fs/promises';
import { resolve, join, relative } from 'node:path';
import type { SkillSource, InstallOptions, InstallResult } from '../types/index.ts';
import { readConfig, getAgentSkillDirs } from './config.ts';
import { cloneRepo, cleanupTempDir } from './git.ts';
import { discoverSkills } from './discover.ts';
import { exists, hashDirectory, diffHashes } from '../utils/fs.ts';

// ---------------------------------------------------------------------------
// Git skill installation
// ---------------------------------------------------------------------------

/**
 * Clone a git-based skill source, discover skills inside, copy the matching
 * skill directory into every configured agent skills directory.
 */
export async function installGitSkill(
  source: SkillSource,
  skillName: string,
  options: InstallOptions = {}
): Promise<InstallResult> {
  const installDirs = await resolveInstallDirs(options);

  let tempDir: string | undefined;
  try {
    tempDir = await cloneRepo(source.url, source.ref, { ssh: options.ssh });

    const skills = await discoverSkills(tempDir, source.subpath);

    // If only one skill found, use it regardless of name match (common case:
    // a repo that IS a single skill).  Otherwise require an exact name match.
    let skill = skills.find((s) => s.name === skillName);
    if (!skill && skills.length === 1) {
      skill = skills[0];
    }

    if (!skill) {
      const found = skills.map((s) => `"${s.name}"`).join(', ');
      throw new Error(
        `Skill "${skillName}" not found in ${source.url}${source.subpath ? `/${source.subpath}` : ''}. ` +
          (found ? `Found: ${found}` : 'No SKILL.md files discovered.')
      );
    }

    const installedPaths = await copyToAll(skill.path, skillName, installDirs);

    return { success: true, skill: skillName, paths: installedPaths };
  } catch (error) {
    return {
      success: false,
      skill: skillName,
      paths: [],
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    if (tempDir) await cleanupTempDir(tempDir).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Discovery-only (no install) — used by `add` to let the user pick
// ---------------------------------------------------------------------------

/**
 * Clone the source, discover all skills, clean up, return the list.
 * Each entry includes `repoPath` — the path of the skill directory relative
 * to the repo root.  The caller uses this as the subpath when persisting to
 * the manifest so that install/update can narrow the search correctly.
 */
export async function discoverSkillsFromSource(
  source: SkillSource,
  options: { ssh?: boolean } = {}
): Promise<{ name: string; description: string; repoPath: string }[]> {
  const tempDir = await cloneRepo(source.url, source.ref, { ssh: options.ssh });
  try {
    const skills = await discoverSkills(tempDir, source.subpath);
    return skills.map((s) => ({
      name: s.name,
      description: s.description,
      repoPath: relative(tempDir, s.path), // e.g. "skills/canvas-design"
    }));
  } finally {
    await cleanupTempDir(tempDir).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Update check — diff remote vs what's on disk, no side effects
// ---------------------------------------------------------------------------

export interface SkillDiff {
  added: string[];
  removed: string[];
  changed: string[];
  /** True when added + removed + changed are all empty */
  upToDate: boolean;
}

/**
 * Clone the source, find the skill, hash it, hash the local install, diff.
 * Does NOT modify anything on disk.  Returns null if the skill isn't installed
 * locally yet (caller should treat that as "needs install").
 */
export async function checkSkillForUpdates(
  source: SkillSource,
  skillName: string,
  options: InstallOptions = {}
): Promise<SkillDiff | null> {
  const installDirs = await resolveInstallDirs(options);
  // Use the first agent dir as the reference for diffing
  const localPath = join(installDirs[0]!, skillName);

  if (!(await exists(localPath))) return null; // not installed

  let tempDir: string | undefined;
  try {
    tempDir = await cloneRepo(source.url, source.ref, { ssh: options.ssh });

    const skills = await discoverSkills(tempDir, source.subpath);
    let skill = skills.find((s) => s.name === skillName);
    if (!skill && skills.length === 1) skill = skills[0];
    if (!skill) return null; // can't find it upstream — treat as needing install

    const [remoteHashes, localHashes] = await Promise.all([
      hashDirectory(skill.path),
      hashDirectory(localPath),
    ]);

    const diff = diffHashes(localHashes, remoteHashes);
    return { ...diff, upToDate: diff.added.length === 0 && diff.removed.length === 0 && diff.changed.length === 0 };
  } finally {
    if (tempDir) await cleanupTempDir(tempDir).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// User skill installation
// ---------------------------------------------------------------------------

/**
 * Copy a local user skill into every configured agent skills directory.
 */
export async function installUserSkill(
  source: SkillSource,
  skillName: string,
  options: InstallOptions = {}
): Promise<InstallResult> {
  const installDirs = await resolveInstallDirs(options);

  const sourcePath = resolve(source.url);
  if (!(await exists(sourcePath))) {
    return {
      success: false,
      skill: skillName,
      paths: [],
      error: `User skill path not found: ${sourcePath}`,
    };
  }

  try {
    const installedPaths = await copyToAll(sourcePath, skillName, installDirs);
    return { success: true, skill: skillName, paths: installedPaths };
  } catch (error) {
    return {
      success: false,
      skill: skillName,
      paths: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Determine the list of directories to install into.
 * Short-circuits to [customPath] if provided — avoids config/prompt entirely.
 */
async function resolveInstallDirs(options: InstallOptions): Promise<string[]> {
  if (options.customPath) return [options.customPath];

  const config = await getEffectiveConfig(options.global ?? false);
  const agents =
    options.agents ??
    (config.agents.length > 0 ? config.agents : config.global?.defaultAgents ?? ['claude']);

  return getAgentSkillDirs(agents, options.global, process.cwd());
}

/**
 * Copy sourcePath into <dir>/<skillName> for every dir in installDirs.
 */
async function copyToAll(sourcePath: string, skillName: string, installDirs: string[]): Promise<string[]> {
  const paths: string[] = [];
  for (const dir of installDirs) {
    const targetPath = join(dir, skillName);
    await mkdir(dir, { recursive: true });
    await rm(targetPath, { recursive: true, force: true });
    await cp(sourcePath, targetPath, { recursive: true });
    paths.push(targetPath);
  }
  return paths;
}

/**
 * Resolve the effective config: project-level first, then global.
 * Falls back to a sensible default (claude agent) if nothing exists on disk.
 * Does NOT prompt interactively — core layer must stay non-interactive.
 */
async function getEffectiveConfig(global: boolean) {
  if (global) {
    const g = await readConfig(process.cwd(), true);
    return g ?? { version: 1, agents: ['claude'] };
  }

  const project = await readConfig();
  if (project) return project;

  const g = await readConfig(process.cwd(), true);
  return g ?? { version: 1, agents: ['claude'] };
}
