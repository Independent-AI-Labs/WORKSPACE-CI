import { randomBytes, createHmac } from 'node:crypto'

function loadCsrfSecret(): string {
  const secret = process.env.CSRF_SECRET
  if (!secret) {
    throw new Error('CSRF_SECRET environment variable must be set')
  }
  return secret
}

const CSRF_SECRET = loadCsrfSecret()

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
