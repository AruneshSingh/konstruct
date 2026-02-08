import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readManifest, writeManifest, addSkillToManifest, removeSkillFromManifest } from '../../src/core/manifest.ts';

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'konstruct-test-'));
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe('manifest', () => {
  it('returns null when skills.json does not exist', async () => {
    expect(await readManifest(testDir)).toBeNull();
  });

  it('reads a valid manifest', async () => {
    const manifest = { name: 'proj', version: '1.0.0', skills: {} };
    writeFileSync(join(testDir, 'skills.json'), JSON.stringify(manifest));

    const result = await readManifest(testDir);
    expect(result).toEqual(manifest);
  });

  it('throws on invalid manifest (missing name)', async () => {
    writeFileSync(join(testDir, 'skills.json'), JSON.stringify({ version: '1.0.0', skills: {} }));
    await expect(readManifest(testDir)).rejects.toThrow('"name" must be a string');
  });

  it('throws on invalid manifest (skills not object)', async () => {
    writeFileSync(join(testDir, 'skills.json'), JSON.stringify({ name: 'x', version: '1.0.0', skills: [] }));
    await expect(readManifest(testDir)).rejects.toThrow('"skills" must be an object');
  });

  it('throws when userSkill does not use file: prefix', async () => {
    writeFileSync(
      join(testDir, 'skills.json'),
      JSON.stringify({
        name: 'x',
        version: '1.0.0',
        skills: {},
        userSkills: { bad: { source: 'github:a/b' } },
      })
    );
    await expect(readManifest(testDir)).rejects.toThrow('must use the file: prefix');
  });

  it('writes manifest correctly', async () => {
    const manifest = { name: 'test', version: '2.0.0', skills: { foo: { source: 'github:a/b#main' } } };
    await writeManifest(manifest, testDir);

    const raw = JSON.parse(readFileSync(join(testDir, 'skills.json'), 'utf-8'));
    expect(raw).toEqual(manifest);
  });

  it('addSkillToManifest creates manifest if missing', async () => {
    await addSkillToManifest('deploy', 'github:org/repo#v1', { cwd: testDir });
    const m = await readManifest(testDir);
    expect(m?.skills.deploy).toEqual({ source: 'github:org/repo#v1' });
  });

  it('addSkillToManifest adds to userSkills', async () => {
    await addSkillToManifest('local', 'file:./skills/local', { cwd: testDir, isUserSkill: true });
    const m = await readManifest(testDir);
    expect(m?.userSkills?.local).toEqual({ source: 'file:./skills/local' });
  });

  it('removeSkillFromManifest removes from skills', async () => {
    await writeManifest({ name: 'x', version: '1.0.0', skills: { a: { source: 'github:o/r#m' } } }, testDir);
    const removed = await removeSkillFromManifest('a', testDir);
    expect(removed).toBe(true);
    const m = await readManifest(testDir);
    expect(m?.skills.a).toBeUndefined();
  });

  it('removeSkillFromManifest returns false for unknown skill', async () => {
    await writeManifest({ name: 'x', version: '1.0.0', skills: {} }, testDir);
    expect(await removeSkillFromManifest('nope', testDir)).toBe(false);
  });
});
