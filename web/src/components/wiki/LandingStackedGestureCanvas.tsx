'use client'

import { useCallback, useEffect, useRef } from 'react'
import {
  GESTURE_CANVAS_BASE_ZOOM,
  measureGestureCanvasDrawRect,
  type GestureCanvasTransformState,
} from '@/lib/gesture-canvas'
import { useGestureCanvasTransform } from '@/hooks/useGestureCanvasTransform'

interface LandingStackedGestureCanvasProps {
  src: string
  baseZoom?: number
}

export function LandingStackedGestureCanvas({
  src,
  baseZoom = GESTURE_CANVAS_BASE_ZOOM,
}: LandingStackedGestureCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const transformRef = useRef<GestureCanvasTransformState>({
    scale: 1,
    translateX: 0,
    translateY: 0,
  })
  const baseZoomRef = useRef(baseZoom)
  const paintFrameRef = useRef<number | null>(null)
  const repaintRef = useRef<(() => void) | null>(null)
  const layoutContextRef = useRef<{
    baseZoom: number
    getImageSize: () => { width: number; height: number } | null
  } | null>(null)
  baseZoomRef.current = baseZoom
  layoutContextRef.current = {
    baseZoom: baseZoomRef.current,
    getImageSize: () => {
      const image = imageRef.current
      if (!image?.naturalWidth || !image.naturalHeight) return null
      return { width: image.naturalWidth, height: image.naturalHeight }
    },
  }

  const paint = useCallback(() => {
    const host = hostRef.current
    const canvas = canvasRef.current
    const image = imageRef.current
    if (!host || !canvas || !image?.naturalWidth) return

    const width = host.clientWidth
    const height = host.clientHeight
    if (width <= 0 || height <= 0) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.floor(width * dpr)
    canvas.height = Math.floor(height * dpr)
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'

    const layout = measureGestureCanvasDrawRect(
      image,
      { width, height },
      baseZoomRef.current,
      transformRef.current,
    )
    if (!layout) return

    ctx.drawImage(
      image,
      layout.offsetX,
      layout.offsetY,
      layout.drawWidth,
      layout.drawHeight,
    )
  }, [])

  const schedulePaint = useCallback(() => {
    if (paintFrameRef.current !== null) return
    paintFrameRef.current = requestAnimationFrame(() => {
      paintFrameRef.current = null
      paint()
    })
  }, [paint])

  repaintRef.current = schedulePaint

  const { resetTransform } = useGestureCanvasTransform(
    hostRef,
    transformRef,
    repaintRef,
    layoutContextRef,
  )

  const resetTransformRef = useRef(resetTransform)
  resetTransformRef.current = resetTransform

  useEffect(() => {
    resetTransformRef.current()
    let cancelled = false
    const image = new Image()
    image.decoding = 'async'

    const onReady = () => {
      if (cancelled) return
      imageRef.current = image
      schedulePaint()
    }

    image.onload = onReady
    image.onerror = onReady
    image.src = src
    if (image.complete) onReady()

    return () => {
      cancelled = true
      image.onload = null
      image.onerror = null
      imageRef.current = null
      if (paintFrameRef.current !== null) {
        cancelAnimationFrame(paintFrameRef.current)
        paintFrameRef.current = null
      }
    }
  }, [src, schedulePaint])

  useEffect(() => {
    schedulePaint()
  }, [baseZoom, schedulePaint])

  useEffect(() => {
    const host = hostRef.current
    if (!host || typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(() => {
      schedulePaint()
    })
    observer.observe(host)
    return () => observer.disconnect()
  }, [schedulePaint])

  return (
    <div ref={hostRef} className="landing-stage__gesture-canvas-host">
      <canvas ref={canvasRef} className="landing-stage__gesture-canvas" aria-hidden="true" />
    </div>
  )
}