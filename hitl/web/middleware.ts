import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
  void request
  // TODO: enforce session once NextAuth 5 + Keycloak integration lands.
  // Guarded paths: /feed/* and /api/hitl/*.
  return NextResponse.next()
}

export const config = {
  matcher: ['/feed/:path*', '/api/hitl/:path*'],
}
