import { deriveScopes } from './scopes'

export interface HitlSession {
  user: { email: string; groups: string[] }
  scopes: string[]
}

/**
 * Stub session provider for the scaffold.
 *
 * The real implementation (REQ-HITL-WEB FR-1) will replace this with
 * NextAuth 5 + Keycloak, re-validating groups server-side on every request.
 */
export async function auth(): Promise<HitlSession | null> {
  return {
    user: {
      email: 'approver@example.com',
      groups: ['hitl-approvers:production'],
    },
    scopes: deriveScopes(['hitl-approvers:production']),
  }
}

export function hasScope(session: HitlSession | null, scope: string): boolean {
  if (!session) return false
  return session.scopes.includes(scope)
}
