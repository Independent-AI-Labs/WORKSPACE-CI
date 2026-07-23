import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { join, normalize, resolve, sep } from 'path'
import { getProjectBySlug, resolveRepoDir } from '@/lib/project-registry'

const EXT_TO_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
}

function mimeTypeFor(path: string): string {
  const ext = path.toLowerCase().slice(path.lastIndexOf('.'))
  return EXT_TO_MIME[ext] ?? 'application/octet-stream'
}

function isPathInside(target: string, root: string): boolean {
  const normalizedRoot = normalize(resolve(root))
  const normalizedTarget = normalize(resolve(target))
  return normalizedTarget === normalizedRoot || normalizedTarget.startsWith(normalizedRoot + sep)
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const projectSlug = request.nextUrl.searchParams.get('project')
  const assetPath = request.nextUrl.searchParams.get('path')

  if (!projectSlug || !assetPath) {
    return NextResponse.json(
      { error: 'Missing required query parameters: project, path' },
      { status: 400 },
    )
  }

  const project = getProjectBySlug(projectSlug)
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  const repoDir = resolveRepoDir(project)
  const resolved = resolve(join(repoDir, assetPath.replace(/^\/+/, '')))

  if (!isPathInside(resolved, repoDir)) {
    return NextResponse.json({ error: 'Asset path outside project directory' }, { status: 403 })
  }

  let buffer: Buffer
  try {
    buffer = await readFile(resolved)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 })
    }
    console.error('project-asset read failed:', err)
    return NextResponse.json({ error: 'Failed to read asset' }, { status: 500 })
  }

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': mimeTypeFor(resolved),
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
