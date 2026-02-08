import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readConfig, writeConfig, getAgentSkillDirs } from '../../src/core/config.ts';

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'konstruct-cfg-'));
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe('config', () => {
  it('returns null when config does not exist', async () => {
    expect(await readConfig(testDir)).toBeNull();
  });

  it('reads a valid config', async () => {
    const cfg = { version: 1, agents: ['claude'] };
    writeFileSync(join(testDir, 'konstruct.config.json'), JSON.stringify(cfg));
    expect(await readConfig(testDir)).toEqual(cfg);
  });

  it('throws on missing version', async () => {
    writeFileSync(join(testDir, 'konstruct.config.json'), JSON.stringify({ agents: [] }));
    await expect(readConfig(testDir)).rejects.toThrow('"version" must be a number');
  });

  it('throws on missing agents', async () => {
    writeFileSync(join(testDir, 'konstruct.config.json'), JSON.stringify({ version: 1 }));
    await expect(readConfig(testDir)).rejects.toThrow('"agents" must be an array');
  });

  it('writes config correctly', async () => {
    const cfg = { version: 1, agents: ['claude', 'cursor'] };
    await writeConfig(cfg, testDir);
    const raw = JSON.parse(readFileSync(join(testDir, 'konstruct.config.json'), 'utf-8'));
    expect(raw).toEqual(cfg);
  });
});

describe('getAgentSkillDirs', () => {
  it('project-local: maps agents to .<slug>/skills under cwd', () => {
    const dirs = getAgentSkillDirs(['claude', 'cursor'], false, '/home/user/project');
    expect(dirs).toEqual(['/home/user/project/.claude/skills', '/home/user/project/.cursor/skills']);
  });

  it('project-local: unknown slug falls back to .<slug>/skills', () => {
    const dirs = getAgentSkillDirs(['unknownagent'], false, '/home/user/project');
    expect(dirs).toEqual(['/home/user/project/.unknownagent/skills']);
  });

  it('returns customPath when provided', () => {
    const dirs = getAgentSkillDirs(['claude'], false, '/irrelevant', '/custom/path');
    expect(dirs).toEqual(['/custom/path']);
  });
});
