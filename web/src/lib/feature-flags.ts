export function isHomeLandingEnabled(): boolean {
  const raw = process.env.WIKI_HOME_LANDING_ENABLED
  if (!raw) return false
  const normalized = raw.trim().toLowerCase()
  if (normalized === '0' || normalized === 'false' || normalized === 'no') return false
  return normalized === '1' || normalized === 'true' || normalized === 'yes'
}