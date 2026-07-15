export function isHomeLandingEnabled(): boolean {
  const raw = process.env.WIKI_HOME_LANDING_ENABLED
  if (!raw) {
    // Dev default: Home at /. Prod stays off until explicitly enabled in compose.
    return process.env.NODE_ENV !== 'production'
  }
  const normalized = raw.trim().toLowerCase()
  if (normalized === '0' || normalized === 'false' || normalized === 'no') return false
  return normalized === '1' || normalized === 'true' || normalized === 'yes'
}