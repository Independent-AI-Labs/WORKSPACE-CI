'use client'

import { useCallback, useEffect, useRef, type RefObject } from 'react'
import {
  hostLocalTouchCentroid,
  resolveGestureCanvasPinchTransform,
  touchDistance,
  type GestureCanvasImageSize,
  type GestureCanvasPinchStart,
  type GestureCanvasTransformState,
} from '@/lib/gesture-canvas'

export interface GestureCanvasLayoutContext {
  baseZoom: number
  getImageSize: () => GestureCanvasImageSize | null
}

export function useGestureCanvasTransform(
  hostRef: RefObject<HTMLElement | null>,
  transformRef: RefObject<GestureCanvasTransformState>,
  onTransformChange: RefObject<(() => void) | null>,
  layoutContextRef: RefObject<GestureCanvasLayoutContext | null>,
  initialScale = 1,
) {
  const pinchStartRef = useRef<GestureCanvasPinchStart | null>(null)

  const notifyTransformChange = useCallback(() => {
    onTransformChange.current?.()
  }, [onTransformChange])

  const resetTransform = useCallback(() => {
    transformRef.current = { scale: initialScale, translateX: 0, translateY: 0 }
    pinchStartRef.current = null
    notifyTransformChange()
  }, [initialScale, notifyTransformChange, transformRef])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const readHostViewport = () => ({
      width: host.clientWidth,
      height: host.clientHeight,
    })

    const beginPinch = (a: Touch, b: Touch) => {
      const hostRect = host.getBoundingClientRect()
      const focal = hostLocalTouchCentroid(a, b, hostRect)
      pinchStartRef.current = {
        distance: touchDistance(a, b),
        focalX: focal.x,
        focalY: focal.y,
        transform: { ...transformRef.current },
      }
    }

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length < 2) return

      event.stopPropagation()
      event.preventDefault()

      const a = event.touches[0]
      const b = event.touches[1]
      if (!a || !b) return
      beginPinch(a, b)
    }

    const onTouchMove = (event: TouchEvent) => {
      if (event.touches.length < 2) return

      event.stopPropagation()
      event.preventDefault()

      const a = event.touches[0]
      const b = event.touches[1]
      if (!a || !b) return

      if (!pinchStartRef.current) {
        beginPinch(a, b)
      }

      const pinchStart = pinchStartRef.current
      if (!pinchStart) return

      const layoutContext = layoutContextRef.current
      const image = layoutContext?.getImageSize()
      if (!layoutContext || !image?.width || !image?.height) return

      const hostRect = host.getBoundingClientRect()
      const focal = hostLocalTouchCentroid(a, b, hostRect)
      const distance = touchDistance(a, b)

      transformRef.current = resolveGestureCanvasPinchTransform(
        pinchStart,
        distance,
        focal.x,
        focal.y,
        readHostViewport(),
        image,
        layoutContext.baseZoom,
      )
      notifyTransformChange()
    }

    const onTouchEnd = () => {
      pinchStartRef.current = null
    }

    const opts = { passive: false, capture: true } as const
    host.addEventListener('touchstart', onTouchStart, opts)
    host.addEventListener('touchmove', onTouchMove, opts)
    host.addEventListener('touchend', onTouchEnd, opts)
    host.addEventListener('touchcancel', onTouchEnd, opts)

    return () => {
      host.removeEventListener('touchstart', onTouchStart, opts)
      host.removeEventListener('touchmove', onTouchMove, opts)
      host.removeEventListener('touchend', onTouchEnd, opts)
      host.removeEventListener('touchcancel', onTouchEnd, opts)
    }
  }, [hostRef, layoutContextRef, notifyTransformChange, transformRef])

  return { resetTransform }
}