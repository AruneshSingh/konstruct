import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import type { SkillsManifest, SkillEntry } from '../types/index.ts';
import { exists } from '../utils/fs.ts';
import { parseSource } from './source-parser.ts';

const MANIFEST_FILENAME = 'skills.json';

// ---------------------------------------------------------------------------
// Helper to extract source and path from SkillEntry
// ---------------------------------------------------------------------------

/**
 * Extract source URL and optional custom path from a skill entry.
 */
export function parseSkillEntry(entry: SkillEntry): { source: string; customPath?: string } {
  return { source: entry.source, customPath: entry.path };
}

// ---------------------------------------------------------------------------
// Read / Write
// ---------------------------------------------------------------------------

/**
 * Read and validate skills.json from cwd.
 */
export async function readManifest(cwd: string = process.cwd()): Promise<SkillsManifest | null> {
  const manifestPath = join(cwd, MANIFEST_FILENAME);
  if (!(await exists(manifestPath))) return null;

  const raw = await readFile(manifestPath, 'utf-8');
  let manifest: unknown;
  try {
    manifest = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Invalid JSON in ${manifestPath}: ${e instanceof Error ? e.message : e}`);
  }
  validateManifest(manifest);
  return manifest;
}

/**
 * Write skills.json to cwd.
 */
export async function writeManifest(manifest: SkillsManifest, cwd: string = process.cwd()): Promise<void> {
  await mkdir(cwd, { recursive: true });
  const manifestPath = join(cwd, MANIFEST_FILENAME);
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
}

// ---------------------------------------------------------------------------
// Mutation helpers
// ---------------------------------------------------------------------------

/**
 * Add a skill entry to the manifest. Creates skills.json if it doesn't exist.
 */
export async function addSkillToManifest(
  skillName: string,
  source: string,
  options: { cwd?: string; isUserSkill?: boolean; customPath?: string } = {}
): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  let manifest = await readManifest(cwd);

  if (!manifest) {
    manifest = {
      name: basename(cwd),
      version: '1.0.0',
      skills: {},
    };
  }

  // Always use object format
  const entry: SkillEntry = {
    source,
    ...(options.customPath && { path: options.customPath }),
  };

  if (options.isUserSkill) {
    if (!manifest.userSkills) manifest.userSkills = {};
    manifest.userSkills[skillName] = entry;
  } else {
    manifest.skills[skillName] = entry;
  }

  await writeManifest(manifest, cwd);
}

/**
 * Remove a skill by name from either skills or userSkills.
 * Returns true if something was removed.
 */
export async function removeSkillFromManifest(skillName: string, cwd: string = process.cwd()): Promise<boolean> {
  const manifest = await readManifest(cwd);
  if (!manifest) return false;

  let removed = false;

  if (manifest.skills[skillName]) {
    delete manifest.skills[skillName];
    removed = true;
  }
  if (manifest.userSkills?.[skillName]) {
    delete manifest.userSkills[skillName];
    removed = true;
  }

  if (removed) await writeManifest(manifest, cwd);
  return removed;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateManifest(manifest: unknown): asserts manifest is SkillsManifest {
  if (!manifest || typeof manifest !== 'object') {
    throw new Error('Invalid skills.json: must be a JSON object');
  }

  const m = manifest as Record<string, unknown>;

  if (typeof m.name !== 'string') {
    throw new Error('Invalid skills.json: "name" must be a string');
  }
  if (typeof m.version !== 'string') {
    throw new Error('Invalid skills.json: "version" must be a string');
  }
  if (!m.skills || typeof m.skills !== 'object' || Array.isArray(m.skills)) {
    throw new Error('Invalid skills.json: "skills" must be an object');
  }

  // Validate each git skill entry
  for (const [name, entry] of Object.entries(m.skills as Record<string, unknown>)) {
    validateSkillEntry(entry, name, false);
  }

  // Validate userSkills if present
  if (m.userSkills !== undefined) {
    if (typeof m.userSkills !== 'object' || Array.isArray(m.userSkills)) {
      throw new Error('Invalid skills.json: "userSkills" must be an object');
    }
    for (const [name, entry] of Object.entries(m.userSkills as Record<string, unknown>)) {
      validateSkillEntry(entry, name, true);
    }
  }
}

function validateSkillEntry(entry: unknown, name: string, isUserSkill: boolean): asserts entry is SkillEntry {
  if (!entry || typeof entry !== 'object') {
    throw new Error(`Invalid skills.json: ${isUserSkill ? 'userSkill' : 'skill'} "${name}" must be an object`);
  }

  const e = entry as Record<string, unknown>;

  if (typeof e.source !== 'string') {
    throw new Error(`Invalid skills.json: ${isUserSkill ? 'userSkill' : 'skill'} "${name}" must have a "source" string`);
  }

  if (e.path !== undefined && typeof e.path !== 'string') {
    throw new Error(`Invalid skills.json: ${isUserSkill ? 'userSkill' : 'skill'} "${name}" path must be a string if provided`);
  }

  // Validate source format
  const parsed = parseSource(e.source);

  if (isUserSkill && parsed.type !== 'file') {
    throw new Error(`Invalid skills.json: userSkill "${name}" must use the file: prefix`);
  }
}
