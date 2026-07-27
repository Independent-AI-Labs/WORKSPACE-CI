import { randomBytes, createHmac } from 'node:crypto'

const CSRF_SECRET = process.env.CSRF_SECRET ?? 'hitl-csrf-secret-dev-only'

export function createCsrfToken(sessionId: string): string {
  const random = randomBytes(16).toString('hex')
  const payload = `${sessionId}:${random}`
  const signature = createHmac('sha256', CSRF_SECRET).update(payload).digest('hex')
  return `${payload}:${signature}`
}

export function verifyCsrfToken(token: string, sessionId: string): boolean {
  const parts = token.split(':')
  if (parts.length !== 3) return false
  const [tokenSessionId, random, signature] = parts
  if (tokenSessionId !== sessionId) return false
  const expected = createHmac('sha256', CSRF_SECRET)
    .update(`${tokenSessionId}:${random}`)
    .digest('hex')
  return signature === expected
}
