import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import matter from 'gray-matter';
import type { SettingsPackage } from '../types/index.ts';

const SETTINGS_FILENAME = 'SETTINGS.md';
const MAX_DEPTH = 3;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Find all settings packages under rootPath (optionally narrowed to a subpath).
 * Each settings package is the directory that contains a SETTINGS.md file.
 */
export async function discoverSettings(rootPath: string, subpath?: string): Promise<SettingsPackage[]> {
  const searchPath = subpath ? join(rootPath, subpath) : rootPath;
  const settingsFiles = await findSettingsFiles(searchPath);

  const packages: SettingsPackage[] = [];
  for (const file of settingsFiles) {
    const pkg = await parseSettingsFile(file);
    if (pkg) packages.push(pkg);
  }
  return packages;
}

// ---------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------

/**
 * Recursively find all SETTINGS.md files up to MAX_DEPTH.
 * Skips directories starting with '.' or '_'.
 */
async function findSettingsFiles(dirPath: string, depth: number = 0): Promise<string[]> {
  if (depth > MAX_DEPTH) return [];

  let entries;
  try {
    entries = await readdir(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }

  const results: string[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue;

    const fullPath = join(dirPath, entry.name);

    if (entry.isDirectory()) {
      results.push(...(await findSettingsFiles(fullPath, depth + 1)));
    } else if (entry.name.toLowerCase() === SETTINGS_FILENAME.toLowerCase()) {
      results.push(fullPath);
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Parse a SETTINGS.md file into a SettingsPackage object.
 * Returns null if the required frontmatter fields (name, description) are missing.
 */
async function parseSettingsFile(filePath: string): Promise<SettingsPackage | null> {
  const content = await readFile(filePath, 'utf-8');

  let data: Record<string, unknown>;
  try {
    const result = matter(content);
    data = result.data as Record<string, unknown>;
  } catch {
    data = extractFrontmatterFields(content);
  }

  if (!data.name || !data.description) {
    const fallbackData = extractFrontmatterFields(content);
    if (fallbackData.name && fallbackData.description) {
      data = fallbackData;
    }
  }

  if (!data.name || !data.description) return null;

  return {
    name: String(data.name),
    description: String(data.description),
    path: dirname(filePath),
    metadata: data,
  };
}

/** Extract name and description via regex when gray-matter can't parse the YAML. */
function extractFrontmatterFields(content: string): Record<string, unknown> {
  const block = content.match(/^---\n([\s\S]*?)\n---/);
  if (!block) return {};

  const result: Record<string, unknown> = {};
  const nameMatch = block[1]?.match(/^name:\s*(.+)$/m);
  const descMatch = block[1]?.match(/^description:\s*(.+)$/m);
  const strategyMatch = block[1]?.match(/^strategy:\s*(.+)$/m);
  if (nameMatch) result.name = nameMatch[1]?.trim();
  if (descMatch) result.description = descMatch[1]?.trim();
  if (strategyMatch) result.strategy = strategyMatch[1]?.trim();
  return result;
}
