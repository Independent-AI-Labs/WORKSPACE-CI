process.env.CSRF_SECRET = 'test-secret'

const { createCsrfToken, verifyCsrfToken } = await import('@/lib/csrf')

describe('csrf', () => {
  it('creates a verifiable token', () => {
    const token = createCsrfToken('session-1')
    expect(verifyCsrfToken(token, 'session-1')).toBe(true)
  })

  it('rejects a token for a different session', () => {
    const token = createCsrfToken('session-1')
    expect(verifyCsrfToken(token, 'session-2')).toBe(false)
  })

  it('rejects malformed tokens', () => {
    expect(verifyCsrfToken('bad', 'session-1')).toBe(false)
  })
})
