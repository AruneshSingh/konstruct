import { AGENT_REGISTRY } from '../core/config.ts';

/** Map absolute globalSkillsDir → agent slug for display. */
const globalDirToSlug = new Map(
  AGENT_REGISTRY.filter((a) => a.globalSkillsDir).map((a) => [a.globalSkillsDir!, a.slug])
);

/** Map absolute globalSettingsDir → agent slug for display. */
const globalSettingsDirToSlug = new Map(
  AGENT_REGISTRY.filter((a) => a.globalSettingsDir).map((a) => [a.globalSettingsDir!, a.slug])
);

/**
 * Turn a list of install paths into a human-friendly display string.
 * - Custom path: show the path as-is
 * - Agent paths: show just the agent names (e.g. "claude, cursor")
 */
export function formatInstallTargets(paths: string[], customPath?: string): string {
  if (customPath) return customPath;

  const agents: string[] = [];
  for (const p of paths) {
    // Check global dirs: path is like <globalSkillsDir>/<skillName> or <globalSettingsDir>/<name>
    const parent = p.replace(/\/[^/]+$/, ''); // strip skill/settings name
    const slug = globalDirToSlug.get(parent) ?? globalSettingsDirToSlug.get(parent);
    if (slug) {
      agents.push(slug);
      continue;
    }

    // Check project-local dirs: path contains .<agent>/(skills|rules|settings)/<name>
    const localMatch = p.match(/\.([^/.]+)\/(?:skills|rules|settings)\/[^/]+$/);
    if (localMatch) {
      agents.push(localMatch[1]!);
      continue;
    }

    // Check settings file paths (merge/replace mode): path ends with settings.json
    const settingsFileMatch = p.match(/\.([^/.]+)\/settings\.json$/);
    if (settingsFileMatch) {
      agents.push(settingsFileMatch[1]!);
      continue;
    }

    // Fallback: show the full path
    agents.push(p);
  }

  return agents.join(', ');
}
