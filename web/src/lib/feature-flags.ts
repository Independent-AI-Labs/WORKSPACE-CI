export function isHomeLandingEnabled(): boolean {
  const raw = process.env.WIKI_HOME_LANDING_ENABLED
  if (!raw) return false
  const normalized = raw.trim().toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes'
}