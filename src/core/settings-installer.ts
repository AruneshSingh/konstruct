import { mkdir, rm, cp, readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve, join, relative } from 'node:path';
import type { SkillSource, InstallOptions, SettingsInstallResult, SettingsStrategy } from '../types/index.ts';
import { readConfig, getAgentSettingsDirs, getAgentSettingsFiles } from './config.ts';
import { cloneRepo, cleanupTempDir } from './git.ts';
import { discoverSettings } from './settings-discover.ts';
import { exists, hashDirectory, diffHashes } from '../utils/fs.ts';
import { deepMerge } from '../utils/merge.ts';

// ---------------------------------------------------------------------------
// Git settings installation
// ---------------------------------------------------------------------------

export interface SettingsInstallOptions extends InstallOptions {
  strategy?: SettingsStrategy;
}

export async function installGitSettings(
  source: SkillSource,
  settingsName: string,
  options: SettingsInstallOptions = {}
): Promise<SettingsInstallResult> {
  const strategy = options.strategy ?? 'copy';

  let tempDir: string | undefined;
  try {
    tempDir = await cloneRepo(source.url, source.ref, { ssh: options.ssh });

    const packages = await discoverSettings(tempDir, source.subpath);

    let pkg = packages.find((s) => s.name === settingsName);
    if (!pkg && packages.length === 1) {
      pkg = packages[0];
    }

    if (!pkg) {
      const found = packages.map((s) => `"${s.name}"`).join(', ');
      throw new Error(
        `Settings "${settingsName}" not found in ${source.url}${source.subpath ? `/${source.subpath}` : ''}. ` +
          (found ? `Found: ${found}` : 'No SETTINGS.md files discovered.')
      );
    }

    // Resolve strategy: CLI flag > SETTINGS.md frontmatter > default "copy"
    const effectiveStrategy = options.strategy
      ?? (pkg.metadata?.strategy as SettingsStrategy | undefined)
      ?? 'copy';

    const installedPaths = await applySettings(pkg.path, settingsName, effectiveStrategy, options);

    return { success: true, settings: settingsName, paths: installedPaths, strategy: effectiveStrategy };
  } catch (error) {
    return {
      success: false,
      settings: settingsName,
      paths: [],
      strategy,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    if (tempDir) await cleanupTempDir(tempDir).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Discovery-only (no install) — used by `settings add` to let the user pick
// ---------------------------------------------------------------------------

export async function discoverSettingsFromSource(
  source: SkillSource,
  options: { ssh?: boolean } = {}
): Promise<{ name: string; description: string; repoPath: string; strategy?: string }[]> {
  const tempDir = await cloneRepo(source.url, source.ref, { ssh: options.ssh });
  try {
    const packages = await discoverSettings(tempDir, source.subpath);
    return packages.map((s) => ({
      name: s.name,
      description: s.description,
      repoPath: relative(tempDir, s.path),
      strategy: s.metadata?.strategy as string | undefined,
    }));
  } finally {
    await cleanupTempDir(tempDir).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Update check
// ---------------------------------------------------------------------------

export interface SettingsDiff {
  added: string[];
  removed: string[];
  changed: string[];
  upToDate: boolean;
}

export async function checkSettingsForUpdates(
  source: SkillSource,
  settingsName: string,
  options: SettingsInstallOptions = {}
): Promise<SettingsDiff | null> {
  const installDirs = await resolveInstallDirs(options);
  const localPath = join(installDirs[0]!, settingsName);

  if (!(await exists(localPath))) return null;

  let tempDir: string | undefined;
  try {
    tempDir = await cloneRepo(source.url, source.ref, { ssh: options.ssh });

    const packages = await discoverSettings(tempDir, source.subpath);
    let pkg = packages.find((s) => s.name === settingsName);
    if (!pkg && packages.length === 1) pkg = packages[0];
    if (!pkg) return null;

    const [remoteHashes, localHashes] = await Promise.all([
      hashDirectory(pkg.path),
      hashDirectory(localPath),
    ]);

    const diff = diffHashes(localHashes, remoteHashes);
    return { ...diff, upToDate: diff.added.length === 0 && diff.removed.length === 0 && diff.changed.length === 0 };
  } finally {
    if (tempDir) await cleanupTempDir(tempDir).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// User settings installation
// ---------------------------------------------------------------------------

export async function installUserSettings(
  source: SkillSource,
  settingsName: string,
  options: SettingsInstallOptions = {}
): Promise<SettingsInstallResult> {
  const strategy = options.strategy ?? 'copy';
  const sourcePath = resolve(source.url);

  if (!(await exists(sourcePath))) {
    return {
      success: false,
      settings: settingsName,
      paths: [],
      strategy,
      error: `User settings path not found: ${sourcePath}`,
    };
  }

  try {
    // Discover to get strategy from SETTINGS.md if not overridden
    const packages = await discoverSettings(sourcePath);
    const pkg = packages.length > 0 ? packages[0] : undefined;
    const effectiveStrategy = options.strategy
      ?? (pkg?.metadata?.strategy as SettingsStrategy | undefined)
      ?? 'copy';

    const installedPaths = await applySettings(sourcePath, settingsName, effectiveStrategy, options);
    return { success: true, settings: settingsName, paths: installedPaths, strategy: effectiveStrategy };
  } catch (error) {
    return {
      success: false,
      settings: settingsName,
      paths: [],
      strategy,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ---------------------------------------------------------------------------
// Core apply logic
// ---------------------------------------------------------------------------

async function applySettings(
  sourcePath: string,
  settingsName: string,
  strategy: SettingsStrategy,
  options: SettingsInstallOptions
): Promise<string[]> {
  if (strategy === 'copy') {
    const installDirs = await resolveInstallDirs(options);
    return copyToAll(sourcePath, settingsName, installDirs);
  }

  // merge or replace — apply to agent settings files
  const config = await getEffectiveConfig(options.global ?? false);
  const agents =
    options.agents ??
    (config.agents.length > 0 ? config.agents : config.global?.defaultAgents ?? ['claude']);

  const agentFiles = getAgentSettingsFiles(agents, options.global);
  if (agentFiles.length === 0) {
    // Fallback to copy mode if no agents support file-based settings
    const installDirs = await resolveInstallDirs(options);
    return copyToAll(sourcePath, settingsName, installDirs);
  }

  // Find JSON files in the settings package to merge/replace with
  const jsonFiles = await findJsonFiles(sourcePath);
  const paths: string[] = [];

  for (const { filePath: agentFile } of agentFiles) {
    for (const jsonFile of jsonFiles) {
      const sourceContent = await readFile(jsonFile, 'utf-8');
      let sourceData: Record<string, unknown>;
      try {
        sourceData = JSON.parse(sourceContent);
      } catch {
        continue; // skip non-JSON files
      }

      if (strategy === 'replace') {
        await mkdir(join(agentFile, '..'), { recursive: true });
        await writeFile(agentFile, JSON.stringify(sourceData, null, 2) + '\n', 'utf-8');
      } else {
        // merge
        let existing: Record<string, unknown> = {};
        if (await exists(agentFile)) {
          try {
            existing = JSON.parse(await readFile(agentFile, 'utf-8'));
          } catch {
            existing = {};
          }
        }
        const merged = deepMerge(existing, sourceData);
        await mkdir(join(agentFile, '..'), { recursive: true });
        await writeFile(agentFile, JSON.stringify(merged, null, 2) + '\n', 'utf-8');
      }
      paths.push(agentFile);
    }
  }

  return paths;
}

async function findJsonFiles(dirPath: string): Promise<string[]> {
  const results: string[] = [];
  let entries;
  try {
    entries = await readdir(dirPath, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'SETTINGS.md') continue;
    const fullPath = join(dirPath, entry.name);
    if (entry.isFile() && entry.name.endsWith('.json')) {
      results.push(fullPath);
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

async function resolveInstallDirs(options: SettingsInstallOptions): Promise<string[]> {
  if (options.customPath) return [options.customPath];

  const config = await getEffectiveConfig(options.global ?? false);
  const agents =
    options.agents ??
    (config.agents.length > 0 ? config.agents : config.global?.defaultAgents ?? ['claude']);

  return getAgentSettingsDirs(agents, options.global, process.cwd());
}

async function copyToAll(sourcePath: string, settingsName: string, installDirs: string[]): Promise<string[]> {
  const paths: string[] = [];
  for (const dir of installDirs) {
    const targetPath = join(dir, settingsName);
    await mkdir(dir, { recursive: true });
    await rm(targetPath, { recursive: true, force: true });
    await cp(sourcePath, targetPath, { recursive: true });
    paths.push(targetPath);
  }
  return paths;
}

async function getEffectiveConfig(global: boolean) {
  const { readConfig } = await import('./config.ts');
  if (global) {
    const g = await readConfig(process.cwd(), true);
    return g ?? { version: 1, agents: ['claude'] };
  }

  const project = await readConfig();
  if (project) return project;

  const g = await readConfig(process.cwd(), true);
  return g ?? { version: 1, agents: ['claude'] };
}
