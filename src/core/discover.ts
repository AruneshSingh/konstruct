import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import matter from 'gray-matter';
import type { Skill } from '../types/index.ts';

const SKILL_FILENAME = 'SKILL.md';
const MAX_DEPTH = 3;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Find all skills under rootPath (optionally narrowed to a subpath).
 * Each skill is the directory that contains a SKILL.md file.
 */
export async function discoverSkills(rootPath: string, subpath?: string): Promise<Skill[]> {
  const searchPath = subpath ? join(rootPath, subpath) : rootPath;
  const skillFiles = await findSkillFiles(searchPath);

  const skills: Skill[] = [];
  for (const file of skillFiles) {
    const skill = await parseSkillFile(file);
    if (skill) skills.push(skill);
  }
  return skills;
}

// ---------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------

/**
 * Recursively find all SKILL.md files up to MAX_DEPTH.
 * Skips directories starting with '.' or '_'.
 */
async function findSkillFiles(dirPath: string, depth: number = 0): Promise<string[]> {
  if (depth > MAX_DEPTH) return [];

  let entries;
  try {
    entries = await readdir(dirPath, { withFileTypes: true });
  } catch {
    return []; // directory doesn't exist or isn't readable
  }

  const results: string[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue;

    const fullPath = join(dirPath, entry.name);

    if (entry.isDirectory()) {
      results.push(...(await findSkillFiles(fullPath, depth + 1)));
    } else if (entry.name.toLowerCase() === SKILL_FILENAME.toLowerCase()) {
      results.push(fullPath);
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Parse a SKILL.md file into a Skill object.
 * Returns null if the required frontmatter fields (name, description) are missing.
 */
async function parseSkillFile(filePath: string): Promise<Skill | null> {
  const content = await readFile(filePath, 'utf-8');

  let data: Record<string, unknown>;
  try {
    const result = matter(content);
    data = result.data as Record<string, unknown>;
  } catch {
    // Malformed YAML frontmatter — fall back to regex extraction of name/description
    data = extractFrontmatterFields(content);
  }

  // If gray-matter returned empty/incomplete data, try regex fallback
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
    path: dirname(filePath), // the whole directory is the skill
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
  if (nameMatch) result.name = nameMatch[1]?.trim();
  if (descMatch) result.description = descMatch[1]?.trim();
  return result;
}
