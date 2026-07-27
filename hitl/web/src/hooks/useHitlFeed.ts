'use client'

import { useEffect, useRef, useState } from 'react'

export type WebSocketStatus = 'closed' | 'open' | 'error'

/**
 * WebSocket feed lifecycle (FR-2.4).
 *
 * Scaffold: the hook exposes status and a no-op connect. A real ticket is
 * fetched from /api/hitl/ws-ticket and the socket is opened in a client
 * effect once the relay endpoint is available.
 */
export function useHitlFeed() {
  const [status, setStatus] = useState<WebSocketStatus>('closed')
  const socketRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    return () => {
      socketRef.current?.close()
      socketRef.current = null
    }
  }, [])

  return {
    status,
    connect: () => {
      setStatus('closed')
    },
  }
}
