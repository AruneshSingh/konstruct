/**
 * Integration test: full lifecycle of a local (user) skill.
 *
 * init → add --user → list → install → remove
 *
 * Everything runs in a temp directory; no network calls.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { writeManifest, readManifest, addSkillToManifest, removeSkillFromManifest } from '../../src/core/manifest.ts';
import { writeConfig } from '../../src/core/config.ts';
import { installUserSkill } from '../../src/core/installer.ts';
import { discoverSkills } from '../../src/core/discover.ts';

let projectDir: string;
let skillSourceDir: string;

beforeEach(() => {
  projectDir = mkdtempSync(join(tmpdir(), 'konstruct-int-'));
  skillSourceDir = join(projectDir, 'my-skills', 'greeting');

  // Create a fake user skill directory with SKILL.md + a script
  mkdirSync(skillSourceDir, { recursive: true });
  writeFileSync(
    join(skillSourceDir, 'SKILL.md'),
    '---\nname: greeting\ndescription: Says hello\n---\n\n# Greeting Skill\nJust say hi.\n'
  );
  writeFileSync(join(skillSourceDir, 'run.sh'), '#!/bin/sh\necho hello\n');

  // Create a project-level config pointing to claude
  writeConfig({ version: 1, agents: ['claude'] }, projectDir);
});

afterEach(() => {
  rmSync(projectDir, { recursive: true, force: true });
});

describe('local user-skill lifecycle', () => {
  it('discovers the skill in the source directory', async () => {
    const skills = await discoverSkills(skillSourceDir);
    expect(skills).toHaveLength(1);
    expect(skills[0]?.name).toBe('greeting');
  });

  it('installs a user skill into the agent directory', async () => {
    const result = await installUserSkill(
      { type: 'file', url: skillSourceDir },
      'greeting',
      { customPath: join(projectDir, '.claude', 'skills') }
    );

    expect(result.success).toBe(true);
    expect(result.paths).toHaveLength(1);

    // Verify files were actually copied
    expect(existsSync(join(result.paths[0]!, 'SKILL.md'))).toBe(true);
    expect(existsSync(join(result.paths[0]!, 'run.sh'))).toBe(true);
  });

  it('full add → read → remove round-trip in manifest', async () => {
    // Add
    await addSkillToManifest('greeting', 'file:./my-skills/greeting', {
      cwd: projectDir,
      isUserSkill: true,
    });

    // Read back
    const manifest = await readManifest(projectDir);
    expect(manifest?.userSkills?.greeting).toEqual({ source: 'file:./my-skills/greeting' });
    expect(Object.keys(manifest?.skills ?? {})).toHaveLength(0);

    // Remove
    const removed = await removeSkillFromManifest('greeting', projectDir);
    expect(removed).toBe(true);

    const after = await readManifest(projectDir);
    expect(after?.userSkills?.greeting).toBeUndefined();
  });

  it('installUserSkill returns error for missing source path', async () => {
    const result = await installUserSkill(
      { type: 'file', url: '/does/not/exist' },
      'nope',
      { customPath: join(projectDir, '.claude', 'skills') }
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found/);
  });
});
