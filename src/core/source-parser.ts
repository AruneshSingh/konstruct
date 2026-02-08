import type { SkillSource } from '../types/index.ts';

/**
 * Parse a skill source string into a structured SkillSource.
 *
 * Supported formats:
 *   github:owner/repo#ref
 *   github:owner/repo/sub/path#ref
 *   gitlab:owner/repo#ref
 *   git:https://host/repo.git#ref
 *   file:./relative/path
 *   file:/absolute/path
 *
 * Bare shorthand (no prefix, no "://") defaults to GitHub:
 *   anthropics/skills        →  github:anthropics/skills
 *   anthropics/skills#v2     →  github:anthropics/skills#v2
 *
 * When no #ref is given, ref is left undefined so that git clones
 * the remote's default branch (usually main).
 */
export function parseSource(source: string): SkillSource {
  if (source.startsWith('github:')) {
    return parseGitHub(source.slice('github:'.length));
  }
  if (source.startsWith('gitlab:')) {
    return parseGenericGit('gitlab', source.slice('gitlab:'.length));
  }
  if (source.startsWith('git:')) {
    return parseGenericGit('git', source.slice('git:'.length));
  }
  if (source.startsWith('file:')) {
    return { type: 'file', url: source.slice('file:'.length) };
  }

  // No recognised prefix — if it looks like owner/repo (has a slash, no
  // protocol) treat it as a GitHub shorthand.
  if (!source.includes('://') && source.includes('/')) {
    return parseGitHub(source);
  }

  throw new Error(
    `Unknown source format: "${source}".\n\n` +
    `  Supported formats:\n` +
    `    github:owner/repo#ref        GitHub repo (or owner/repo shorthand)\n` +
    `    gitlab:owner/repo#ref        GitLab repo\n` +
    `    git:https://host/repo.git    Arbitrary git URL\n` +
    `    file:./path/to/skill         Local directory\n`
  );
}

// ---------------------------------------------------------------------------
// GitHub  →  github:owner/repo/optional/sub/path#ref
// ---------------------------------------------------------------------------
function parseGitHub(input: string): SkillSource {
  const { base, ref } = splitRef(input);

  // owner/repo is always the first two segments
  const segments = base.split('/');
  if (segments.length < 2) {
    throw new Error(`Invalid github source: "github:${input}" — expected at least owner/repo`);
  }

  const owner = segments[0]!;
  const repo = segments[1]!.replace(/\.git$/, '');
  const subpath = segments.length > 2 ? segments.slice(2).join('/') : undefined;

  return {
    type: 'github',
    url: `https://github.com/${owner}/${repo}.git`,
    ref,
    subpath,
  };
}

// ---------------------------------------------------------------------------
// Generic git / GitLab  →  gitlab:owner/repo#ref  OR  git:https://...#ref
// ---------------------------------------------------------------------------
function parseGenericGit(type: 'gitlab' | 'git', input: string): SkillSource {
  const { base, ref } = splitRef(input);

  // For git: the base is a full URL already
  if (type === 'git') {
    return { type: 'git', url: base.endsWith('.git') ? base : base + '.git', ref };
  }

  // gitlab: owner/repo/optional/sub/path
  const segments = base.split('/');
  if (segments.length < 2) {
    throw new Error(`Invalid gitlab source: "gitlab:${input}" — expected at least owner/repo`);
  }

  const owner = segments[0]!;
  const repo = segments[1]!.replace(/\.git$/, '');
  const subpath = segments.length > 2 ? segments.slice(2).join('/') : undefined;

  return {
    type: 'gitlab',
    url: `https://gitlab.com/${owner}/${repo}.git`,
    ref,
    subpath,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Split "some/path#ref" into { base: "some/path", ref: "ref" | undefined }.
 * Only splits on the LAST '#' so that URLs with '#' in them (rare) still work.
 */
function splitRef(input: string): { base: string; ref: string | undefined } {
  const hashIndex = input.lastIndexOf('#');
  if (hashIndex === -1) return { base: input, ref: undefined };
  return {
    base: input.slice(0, hashIndex),
    ref: input.slice(hashIndex + 1) || undefined,
  };
}
