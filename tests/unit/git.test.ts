import { describe, it, expect } from 'vitest';
import { httpsToSshUrl, formatAuthTroubleshootingGuide } from '../../src/core/git.ts';

// ---------------------------------------------------------------------------
// httpsToSshUrl
// ---------------------------------------------------------------------------

describe('httpsToSshUrl', () => {
  it('converts GitHub HTTPS to SSH', () => {
    expect(httpsToSshUrl('https://github.com/owner/repo.git')).toBe('git@github.com:owner/repo.git');
  });

  it('converts GitLab HTTPS to SSH', () => {
    expect(httpsToSshUrl('https://gitlab.com/group/project.git')).toBe('git@gitlab.com:group/project.git');
  });

  it('returns null for non-GitHub/GitLab HTTPS', () => {
    expect(httpsToSshUrl('https://example.com/owner/repo.git')).toBeNull();
  });

  it('returns null for an already-SSH URL', () => {
    expect(httpsToSshUrl('git@github.com:owner/repo.git')).toBeNull();
  });

  it('returns null for ssh:// protocol URLs', () => {
    expect(httpsToSshUrl('ssh://git@github.com/owner/repo.git')).toBeNull();
  });

  it('preserves nested paths beyond owner/repo', () => {
    expect(httpsToSshUrl('https://github.com/org/repo.git')).toBe('git@github.com:org/repo.git');
  });

  it('works without .git suffix', () => {
    expect(httpsToSshUrl('https://github.com/owner/repo')).toBe('git@github.com:owner/repo');
  });
});

// ---------------------------------------------------------------------------
// formatAuthTroubleshootingGuide
// ---------------------------------------------------------------------------

describe('formatAuthTroubleshootingGuide', () => {
  it('includes the display URL in all cases', () => {
    const guide = formatAuthTroubleshootingGuide('https://github.com/myorg/myrepo.git', 'https');
    expect(guide).toContain('github.com/myorg/myrepo');
  });

  it('https transport — contains gh auth steps, no ssh-add', () => {
    const guide = formatAuthTroubleshootingGuide('https://github.com/org/repo.git', 'https');
    expect(guide).toContain('gh auth status');
    expect(guide).toContain('gh auth login');
    expect(guide).not.toContain('ssh-add');
  });

  it('ssh transport — contains ssh steps, no gh auth login', () => {
    const guide = formatAuthTroubleshootingGuide('https://github.com/org/repo.git', 'ssh');
    expect(guide).toContain('ssh-add -l');
    expect(guide).toContain('ssh -T git@github.com');
    expect(guide).not.toContain('gh auth login');
  });

  it('both transports — contains both sets of steps', () => {
    const guide = formatAuthTroubleshootingGuide('https://github.com/org/repo.git', 'both');
    expect(guide).toContain('gh auth status');
    expect(guide).toContain('gh auth login');
    expect(guide).toContain('ssh-add -l');
    expect(guide).toContain('ssh -T git@github.com');
  });

  it('both transports — includes SSO note', () => {
    const guide = formatAuthTroubleshootingGuide('https://github.com/org/repo.git', 'both');
    expect(guide).toContain('SSO');
  });

  it('strips .git suffix from display URL', () => {
    const guide = formatAuthTroubleshootingGuide('https://github.com/org/repo.git', 'https');
    expect(guide).not.toContain('.git');
    expect(guide).toContain('github.com/org/repo');
  });

  it('strips git@ prefix from SSH URLs in display', () => {
    const guide = formatAuthTroubleshootingGuide('git@github.com:org/repo.git', 'ssh');
    // The display URL at the top should be clean (no git@ prefix, no .git, colon → slash)
    expect(guide).toContain('github.com/org/repo');
    // The first line ("Authentication failed for …") should not have git@
    const firstLine = guide.split('\n')[0]!;
    expect(firstLine).not.toContain('git@');
  });
});
