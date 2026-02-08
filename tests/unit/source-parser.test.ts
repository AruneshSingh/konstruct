import { describe, it, expect } from 'vitest';
import { parseSource } from '../../src/core/source-parser.ts';

describe('parseSource', () => {
  // --- GitHub ---
  it('parses github:owner/repo', () => {
    expect(parseSource('github:acme/tools')).toEqual({
      type: 'github',
      url: 'https://github.com/acme/tools.git',
      ref: undefined,
      subpath: undefined,
    });
  });

  it('parses github:owner/repo#ref', () => {
    expect(parseSource('github:acme/tools#v1.2.3')).toEqual({
      type: 'github',
      url: 'https://github.com/acme/tools.git',
      ref: 'v1.2.3',
      subpath: undefined,
    });
  });

  it('parses github:owner/repo/sub/path#ref', () => {
    expect(parseSource('github:acme/tools/skills/deploy#main')).toEqual({
      type: 'github',
      url: 'https://github.com/acme/tools.git',
      ref: 'main',
      subpath: 'skills/deploy',
    });
  });

  it('strips .git suffix from repo name', () => {
    expect(parseSource('github:acme/tools.git#main').url).toBe('https://github.com/acme/tools.git');
  });

  // --- GitLab ---
  it('parses gitlab:owner/repo#ref', () => {
    expect(parseSource('gitlab:mygroup/myrepo#develop')).toEqual({
      type: 'gitlab',
      url: 'https://gitlab.com/mygroup/myrepo.git',
      ref: 'develop',
      subpath: undefined,
    });
  });

  it('parses gitlab:owner/repo/subpath', () => {
    expect(parseSource('gitlab:mygroup/myrepo/sub')).toEqual({
      type: 'gitlab',
      url: 'https://gitlab.com/mygroup/myrepo.git',
      ref: undefined,
      subpath: 'sub',
    });
  });

  // --- Generic git ---
  it('parses git:https://host/repo.git#ref', () => {
    expect(parseSource('git:https://example.com/repo.git#abc123')).toEqual({
      type: 'git',
      url: 'https://example.com/repo.git',
      ref: 'abc123',
    });
  });

  it('appends .git when missing', () => {
    expect(parseSource('git:https://example.com/repo#main').url).toBe('https://example.com/repo.git');
  });

  // --- File ---
  it('parses file:./relative', () => {
    expect(parseSource('file:./my-skill')).toEqual({
      type: 'file',
      url: './my-skill',
    });
  });

  it('parses file:/absolute', () => {
    expect(parseSource('file:/home/user/skill')).toEqual({
      type: 'file',
      url: '/home/user/skill',
    });
  });

  // --- Errors ---
  it('throws on unknown prefix', () => {
    expect(() => parseSource('http://example.com')).toThrow('Unknown source format');
  });

  it('throws on github with only owner', () => {
    expect(() => parseSource('github:onlyowner')).toThrow('expected at least owner/repo');
  });

  // --- Bare shorthand (defaults to GitHub) ---
  it('treats owner/repo as github shorthand', () => {
    expect(parseSource('anthropics/skills')).toEqual({
      type: 'github',
      url: 'https://github.com/anthropics/skills.git',
      ref: undefined,
      subpath: undefined,
    });
  });

  it('bare owner/repo#ref picks up the ref', () => {
    expect(parseSource('anthropics/skills#develop')).toEqual({
      type: 'github',
      url: 'https://github.com/anthropics/skills.git',
      ref: 'develop',
      subpath: undefined,
    });
  });

  it('bare owner/repo/sub/path#ref parses subpath and ref', () => {
    expect(parseSource('anthropics/skills/skills/canvas-design#main')).toEqual({
      type: 'github',
      url: 'https://github.com/anthropics/skills.git',
      ref: 'main',
      subpath: 'skills/canvas-design',
    });
  });

  it('does not treat a bare URL with :// as shorthand', () => {
    expect(() => parseSource('https://example.com/repo')).toThrow('Unknown source format');
  });

  it('does not treat a single word with no slash as shorthand', () => {
    expect(() => parseSource('justanowner')).toThrow('Unknown source format');
  });

  // --- Edge cases ---
  it('handles empty ref after #', () => {
    // "github:a/b#" → ref is undefined (empty string normalised away)
    expect(parseSource('github:a/b#').ref).toBeUndefined();
  });
});
