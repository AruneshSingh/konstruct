import { AGENT_REGISTRY } from '../core/config.ts';

/** Map absolute globalSkillsDir → agent slug for display. */
const globalDirToSlug = new Map(
  AGENT_REGISTRY.filter((a) => a.globalSkillsDir).map((a) => [a.globalSkillsDir!, a.slug])
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
    // Check global dirs: path is like <globalSkillsDir>/<skillName>
    const parent = p.replace(/\/[^/]+$/, ''); // strip skill name
    const slug = globalDirToSlug.get(parent);
    if (slug) {
      agents.push(slug);
      continue;
    }

    // Check project-local dirs: path contains .<agent>/skills/<skillName>
    const localMatch = p.match(/\.([^/.]+)\/(?:skills|rules)\/[^/]+$/);
    if (localMatch) {
      agents.push(localMatch[1]!);
      continue;
    }

    // Fallback: show the full path
    agents.push(p);
  }

  return agents.join(', ');
}
