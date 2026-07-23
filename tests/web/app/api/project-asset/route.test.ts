import { describe, it, expect } from 'vitest'
import { GET } from '../../../../../web/app/api/project-asset/route'

function makeRequest(project: string | null, path: string | null): import('next/server').NextRequest {
  const params = new URLSearchParams()
  if (project) params.set('project', project)
  if (path) params.set('path', path)
  return {
    nextUrl: {
      searchParams: params,
    },
  } as unknown as import('next/server').NextRequest
}

describe('GET /api/project-asset', () => {
  it('returns 400 when project parameter is missing', async () => {
    const response = await GET(makeRequest(null, 'README.md'))
    expect(response.status).toBe(400)
  })

  it('returns 400 when path parameter is missing', async () => {
    const response = await GET(makeRequest('workspace-ci', null))
    expect(response.status).toBe(400)
  })

  it('returns 404 for an unknown project', async () => {
    const response = await GET(makeRequest('does-not-exist', 'README.md'))
    expect(response.status).toBe(404)
  })

  it('returns 403 for path traversal attempts', async () => {
    const response = await GET(makeRequest('workspace-ci', '../README.md'))
    expect(response.status).toBe(403)
  })

  it('returns 200 with correct content type for an existing asset', async () => {
    const response = await GET(makeRequest('workspace-ci', 'README.md'))
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toContain('application/octet-stream')
  })

  it('returns 404 for a missing asset', async () => {
    const response = await GET(makeRequest('workspace-ci', 'does-not-exist.png'))
    expect(response.status).toBe(404)
  })
})
