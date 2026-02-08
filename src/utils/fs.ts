import { access, constants, readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';

/** Returns true if a path exists (file or directory). */
export async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Walk a directory tree and return a Map of  relativePath → sha256 hash
 * for every file.  Used to diff two copies of the same skill.
 */
export async function hashDirectory(dirPath: string): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  await walkAndHash(dirPath, dirPath, result);
  return result;
}

async function walkAndHash(root: string, current: string, out: Map<string, string>): Promise<void> {
  let entries;
  try {
    entries = await readdir(current, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const full = join(current, entry.name);
    if (entry.isDirectory()) {
      await walkAndHash(root, full, out);
    } else {
      const content = await readFile(full);
      const hash = createHash('sha256').update(content).digest('hex');
      out.set(relative(root, full), hash);
    }
  }
}

/**
 * Compare two directory hash maps and return a human-readable diff summary.
 *   added   — files in `remote` that are not in `local`
 *   removed — files in `local` that are not in `remote`
 *   changed — files present in both but with different hashes
 */
export function diffHashes(
  local: Map<string, string>,
  remote: Map<string, string>
): { added: string[]; removed: string[]; changed: string[] } {
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];

  for (const [path, hash] of remote) {
    if (!local.has(path)) {
      added.push(path);
    } else if (local.get(path) !== hash) {
      changed.push(path);
    }
  }

  for (const path of local.keys()) {
    if (!remote.has(path)) {
      removed.push(path);
    }
  }

  return { added, removed, changed };
}
