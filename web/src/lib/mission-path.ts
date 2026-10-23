export function missionPath(mission: { id: string; slug?: string | null }, suffix = '') {
  return `/missoes/${encodeURIComponent(mission.slug || mission.id)}${suffix}`;
}
