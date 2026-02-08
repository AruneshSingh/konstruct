import simpleGit from 'simple-git';
import { join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

const CLONE_TIMEOUT_MS = 60_000; // 60 seconds

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class GitCloneError extends Error {
  readonly url: string;
  readonly isTimeout: boolean;
  readonly isAuthError: boolean;

  constructor(message: string, url: string, isTimeout = false, isAuthError = false) {
    super(message);
    this.name = 'GitCloneError';
    this.url = url;
    this.isTimeout = isTimeout;
    this.isAuthError = isAuthError;
  }

  /** Infer auth transport from the URL. */
  getAuthType(): 'ssh' | 'https' {
    return this.url.startsWith('git@') || this.url.startsWith('ssh://') ? 'ssh' : 'https';
  }
}

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

/**
 * Convert an HTTPS GitHub or GitLab URL to its SSH equivalent.
 * Returns null for any URL that is not a recognised host (generic git: URLs,
 * already-SSH URLs, etc.).
 *
 *   https://github.com/owner/repo.git  →  git@github.com:owner/repo.git
 *   https://gitlab.com/group/proj.git  →  git@gitlab.com:group/proj.git
 */
export function httpsToSshUrl(url: string): string | null {
  const match = url.match(/^https:\/\/(github\.com|gitlab\.com)\/(.+)$/);
  if (!match) return null;
  return `git@${match[1]}:${match[2]}`;
}

// ---------------------------------------------------------------------------
// Troubleshooting guide
// ---------------------------------------------------------------------------

/**
 * Build a numbered troubleshooting guide for auth failures.
 * `transport` indicates which transport(s) were actually attempted before
 * giving up: 'https', 'ssh', or 'both'.
 */
export function formatAuthTroubleshootingGuide(
  url: string,
  transport: 'https' | 'ssh' | 'both'
): string {
  // Strip .git suffix and protocol for a clean display URL
  const displayUrl = url.replace(/^(https?:\/\/|git@|ssh:\/\/)/, '').replace(/\.git$/, '').replace(':', '/');

  let guide = `Authentication failed for ${displayUrl}.\n\n  Troubleshooting steps:\n\n`;
  guide += `    1. Verify the repository exists and you have access.\n\n`;

  if (transport === 'https' || transport === 'both') {
    guide += `    ${transport === 'both' ? '2' : '2'}. HTTPS — check your credential state:\n`;
    guide += `         gh auth status\n`;
    guide += `         gh auth login\n\n`;
  }

  if (transport === 'ssh' || transport === 'both') {
    const num = transport === 'both' ? '3' : '2';
    guide += `    ${num}. SSH — check your key state:\n`;
    guide += `         ssh-add -l                     # list loaded keys\n`;
    guide += `         ssh -T git@github.com          # test the connection\n\n`;
  }

  if (transport === 'both') {
    guide += `    4. If using corporate SSO, make sure your SSH key or\n`;
    guide += `       token has been authorized for your organization.\n`;
  }

  return guide.trimEnd();
}

// ---------------------------------------------------------------------------
// Clone
// ---------------------------------------------------------------------------

/**
 * Shallow-clone a repository into a new temp directory.
 * Returns the path to the cloned directory.
 *
 * When `options.ssh` is true the URL is converted to SSH before cloning.
 * When `options.ssh` is false (default) and the clone fails with an auth error
 * on a GitHub/GitLab URL, it automatically retries with the SSH equivalent.
 */
export async function cloneRepo(url: string, ref?: string, options?: { ssh?: boolean }): Promise<string> {
  const useSsh = options?.ssh ?? false;

  if (useSsh) {
    // Explicit SSH mode: convert if possible, otherwise use the URL as-is
    const sshUrl = httpsToSshUrl(url) ?? url;
    return attemptClone(sshUrl, ref, url, 'ssh');
  }

  // Default: try HTTPS first
  try {
    return await attemptClone(url, ref, url, 'https');
  } catch (e) {
    if (!(e instanceof GitCloneError) || !e.isAuthError) throw e;

    // Auth failure on HTTPS — try SSH if we can convert the URL
    const sshUrl = httpsToSshUrl(url);
    if (!sshUrl) {
      // Non-convertible URL (generic git: host) — surface HTTPS guide only
      throw new GitCloneError(formatAuthTroubleshootingGuide(url, 'https'), url, false, true);
    }

    console.error('  ! HTTPS auth failed, retrying with SSH…');
    return attemptClone(sshUrl, ref, url, 'both');
  }
}

// ---------------------------------------------------------------------------
// Single clone attempt
// ---------------------------------------------------------------------------

/**
 * Try to clone `url` into a fresh temp directory.  On failure the temp dir is
 * removed and a `GitCloneError` is thrown.
 *
 * `originalUrl` is the URL the user originally typed (used in error messages).
 * `transportsTried` tracks which transports have been attempted so far — used
 * to produce the right troubleshooting guide if this attempt also fails.
 */
async function attemptClone(
  url: string,
  ref: string | undefined,
  originalUrl: string,
  transportsTried: 'https' | 'ssh' | 'both'
): Promise<string> {
  const tempDir = await mkdtemp(join(tmpdir(), 'konstruct-'));
  const git = simpleGit({ timeout: { block: CLONE_TIMEOUT_MS } });

  const cloneOptions: string[] = ['--depth', '1'];
  if (ref) cloneOptions.push('--branch', ref);

  try {
    await git.clone(url, tempDir, cloneOptions);
    return tempDir;
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});

    const msg = error instanceof Error ? error.message : String(error);
    const isTimeout = msg.includes('block timeout') || msg.includes('timed out');
    const isAuthError =
      msg.includes('Authentication failed') ||
      msg.includes('could not read Username') ||
      msg.includes('Permission denied') ||
      msg.includes('Repository not found');

    if (isTimeout) {
      throw new GitCloneError(
        `Clone timed out after 60 s — this often happens with private repos.\n` +
          formatAuthTroubleshootingGuide(originalUrl, transportsTried),
        originalUrl,
        true,
        false
      );
    }

    if (isAuthError) {
      throw new GitCloneError(
        formatAuthTroubleshootingGuide(originalUrl, transportsTried),
        originalUrl,
        false,
        true
      );
    }

    throw new GitCloneError(`Failed to clone ${url}: ${msg}`, originalUrl, false, false);
  }
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

/**
 * Remove a temp directory that was created by cloneRepo.
 * Validates that the path is actually under OS tmpdir to prevent accidents.
 */
export async function cleanupTempDir(dir: string): Promise<void> {
  const { realpathSync } = await import('node:fs');
  const { sep } = await import('node:path');
  const normalizedDir = realpathSync(dir);
  const normalizedTmpDir = realpathSync(tmpdir());

  if (!normalizedDir.startsWith(normalizedTmpDir + sep) && normalizedDir !== normalizedTmpDir) {
    throw new Error('Attempted to clean up a directory outside of the system temp directory');
  }

  await rm(dir, { recursive: true, force: true });
}
