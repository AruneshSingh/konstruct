import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import type { SettingsManifest, SettingsEntry, SettingsStrategy } from '../types/index.ts';
import { exists } from '../utils/fs.ts';
import { parseSource } from './source-parser.ts';

const MANIFEST_FILENAME = 'settings.json';

// ---------------------------------------------------------------------------
// Helper to extract source, path, and strategy from SettingsEntry
// ---------------------------------------------------------------------------

export function parseSettingsEntry(entry: SettingsEntry): {
  source: string;
  customPath?: string;
  strategy?: SettingsStrategy;
} {
  return { source: entry.source, customPath: entry.path, strategy: entry.strategy };
}

// ---------------------------------------------------------------------------
// Read / Write
// ---------------------------------------------------------------------------

export async function readSettingsManifest(cwd: string = process.cwd()): Promise<SettingsManifest | null> {
  const manifestPath = join(cwd, MANIFEST_FILENAME);
  if (!(await exists(manifestPath))) return null;

  const raw = await readFile(manifestPath, 'utf-8');
  let manifest: unknown;
  try {
    manifest = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Invalid JSON in ${manifestPath}: ${e instanceof Error ? e.message : e}`);
  }
  validateSettingsManifest(manifest);
  return manifest;
}

export async function writeSettingsManifest(manifest: SettingsManifest, cwd: string = process.cwd()): Promise<void> {
  await mkdir(cwd, { recursive: true });
  const manifestPath = join(cwd, MANIFEST_FILENAME);
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
}

// ---------------------------------------------------------------------------
// Mutation helpers
// ---------------------------------------------------------------------------

export async function addSettingsToManifest(
  settingsName: string,
  source: string,
  options: { cwd?: string; isUserSettings?: boolean; customPath?: string; strategy?: SettingsStrategy } = {}
): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  let manifest = await readSettingsManifest(cwd);

  if (!manifest) {
    manifest = {
      name: basename(cwd),
      version: '1.0.0',
      settings: {},
    };
  }

  const entry: SettingsEntry = {
    source,
    ...(options.customPath && { path: options.customPath }),
    ...(options.strategy && { strategy: options.strategy }),
  };

  if (options.isUserSettings) {
    if (!manifest.userSettings) manifest.userSettings = {};
    manifest.userSettings[settingsName] = entry;
  } else {
    manifest.settings[settingsName] = entry;
  }

  await writeSettingsManifest(manifest, cwd);
}

export async function removeSettingsFromManifest(settingsName: string, cwd: string = process.cwd()): Promise<boolean> {
  const manifest = await readSettingsManifest(cwd);
  if (!manifest) return false;

  let removed = false;

  if (manifest.settings[settingsName]) {
    delete manifest.settings[settingsName];
    removed = true;
  }
  if (manifest.userSettings?.[settingsName]) {
    delete manifest.userSettings[settingsName];
    removed = true;
  }

  if (removed) await writeSettingsManifest(manifest, cwd);
  return removed;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const VALID_STRATEGIES: SettingsStrategy[] = ['copy', 'merge', 'replace'];

function validateSettingsManifest(manifest: unknown): asserts manifest is SettingsManifest {
  if (!manifest || typeof manifest !== 'object') {
    throw new Error('Invalid settings.json: must be a JSON object');
  }

  const m = manifest as Record<string, unknown>;

  if (typeof m.name !== 'string') {
    throw new Error('Invalid settings.json: "name" must be a string');
  }
  if (typeof m.version !== 'string') {
    throw new Error('Invalid settings.json: "version" must be a string');
  }
  if (!m.settings || typeof m.settings !== 'object' || Array.isArray(m.settings)) {
    throw new Error('Invalid settings.json: "settings" must be an object');
  }

  for (const [name, entry] of Object.entries(m.settings as Record<string, unknown>)) {
    validateSettingsEntry(entry, name, false);
  }

  if (m.userSettings !== undefined) {
    if (typeof m.userSettings !== 'object' || Array.isArray(m.userSettings)) {
      throw new Error('Invalid settings.json: "userSettings" must be an object');
    }
    for (const [name, entry] of Object.entries(m.userSettings as Record<string, unknown>)) {
      validateSettingsEntry(entry, name, true);
    }
  }
}

function validateSettingsEntry(entry: unknown, name: string, isUserSettings: boolean): asserts entry is SettingsEntry {
  if (!entry || typeof entry !== 'object') {
    throw new Error(`Invalid settings.json: ${isUserSettings ? 'userSettings' : 'settings'} "${name}" must be an object`);
  }

  const e = entry as Record<string, unknown>;

  if (typeof e.source !== 'string') {
    throw new Error(`Invalid settings.json: ${isUserSettings ? 'userSettings' : 'settings'} "${name}" must have a "source" string`);
  }

  if (e.path !== undefined && typeof e.path !== 'string') {
    throw new Error(`Invalid settings.json: ${isUserSettings ? 'userSettings' : 'settings'} "${name}" path must be a string if provided`);
  }

  if (e.strategy !== undefined) {
    if (typeof e.strategy !== 'string' || !VALID_STRATEGIES.includes(e.strategy as SettingsStrategy)) {
      throw new Error(`Invalid settings.json: ${isUserSettings ? 'userSettings' : 'settings'} "${name}" strategy must be one of: ${VALID_STRATEGIES.join(', ')}`);
    }
  }

  const parsed = parseSource(e.source);

  if (isUserSettings && parsed.type !== 'file') {
    throw new Error(`Invalid settings.json: userSettings "${name}" must use the file: prefix`);
  }
}
