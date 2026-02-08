import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { discoverSkills } from '../../src/core/discover.ts';

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'konstruct-disc-'));
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

function writeSkill(dir: string, name: string, description: string) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'SKILL.md'),
    `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`
  );
}

describe('discoverSkills', () => {
  it('finds a single SKILL.md at root', async () => {
    writeSkill(testDir, 'my-skill', 'A test skill');
    const skills = await discoverSkills(testDir);
    expect(skills).toHaveLength(1);
    expect(skills[0]?.name).toBe('my-skill');
    expect(skills[0]?.description).toBe('A test skill');
  });

  it('finds nested skills', async () => {
    writeSkill(join(testDir, 'skills', 'deploy'), 'deploy', 'Deploy skill');
    writeSkill(join(testDir, 'skills', 'review'), 'review', 'Review skill');
    const skills = await discoverSkills(testDir);
    expect(skills).toHaveLength(2);
    expect(skills.map((s) => s.name).sort()).toEqual(['deploy', 'review']);
  });

  it('skips directories starting with . or _', async () => {
    writeSkill(join(testDir, '.hidden'), 'hidden', 'Should be skipped');
    writeSkill(join(testDir, '_internal'), 'internal', 'Should also be skipped');
    writeSkill(join(testDir, 'visible'), 'visible', 'Should be found');

    const skills = await discoverSkills(testDir);
    expect(skills).toHaveLength(1);
    expect(skills[0]?.name).toBe('visible');
  });

  it('returns empty when no SKILL.md exists', async () => {
    writeFileSync(join(testDir, 'README.md'), '# nothing');
    expect(await discoverSkills(testDir)).toHaveLength(0);
  });

  it('skips SKILL.md missing required frontmatter', async () => {
    mkdirSync(join(testDir, 'bad'), { recursive: true });
    writeFileSync(join(testDir, 'bad', 'SKILL.md'), '---\nname: only-name\n---\n');
    expect(await discoverSkills(testDir)).toHaveLength(0);
  });

  it('respects subpath option', async () => {
    writeSkill(join(testDir, 'a'), 'skill-a', 'A');
    writeSkill(join(testDir, 'b'), 'skill-b', 'B');

    const skills = await discoverSkills(testDir, 'b');
    expect(skills).toHaveLength(1);
    expect(skills[0]?.name).toBe('skill-b');
  });
});
