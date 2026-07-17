import { describe, it, expect } from 'vitest'
import {
  clampScale,
  GESTURE_CANVAS_ZOOM_ORIGIN,
  hostLocalTouchCentroid,
  measureGestureCanvasDrawRect,
  measureGestureCanvasDrawRectFromSize,
  resolveGestureCanvasPinchTransform,
  touchCentroid,
  touchDistance,
} from '@/lib/gesture-canvas'

const HOST = { width: 400, height: 500 }
const IMAGE = { width: 1000, height: 1000 }

describe('gesture-canvas', () => {
  it('exposes a top-quarter viewport anchor', () => {
    expect(GESTURE_CANVAS_ZOOM_ORIGIN).toBe('50% 30%')
  })

  it('measures touch distance', () => {
    expect(touchDistance({ clientX: 0, clientY: 0 }, { clientX: 3, clientY: 4 })).toBe(5)
  })

  it('measures touch centroid', () => {
    expect(
      touchCentroid({ clientX: 0, clientY: 0 }, { clientX: 10, clientY: 20 }),
    ).toEqual({ x: 5, y: 10 })
  })

  it('converts touch centroid to host-local coordinates', () => {
    expect(
      hostLocalTouchCentroid(
        { clientX: 20, clientY: 40 },
        { clientX: 40, clientY: 80 },
        { left: 10, top: 20 },
      ),
    ).toEqual({ x: 20, y: 40 })
  })

  it('clamps scale', () => {
    expect(clampScale(0.25)).toBe(0.5)
    expect(clampScale(0.75)).toBe(0.75)
    expect(clampScale(2)).toBe(2)
    expect(clampScale(9)).toBe(4)
  })

  it('pins the top of the image at the top-quarter viewport anchor', () => {
    const image = { naturalWidth: 1000, naturalHeight: 1000 } as HTMLImageElement
    const layout = measureGestureCanvasDrawRect(
      image,
      HOST,
      1,
      { scale: 1, translateX: 0, translateY: 0 },
    )
    expect(layout).not.toBeNull()
    expect(layout!.offsetX + layout!.drawWidth * 0.5).toBeCloseTo(200, 5)
    expect(layout!.offsetY).toBeCloseTo(50, 5)
  })

  it('shifts the draw rect when panning', () => {
    const base = measureGestureCanvasDrawRectFromSize(
      IMAGE,
      HOST,
      1,
      { scale: 1, translateX: 0, translateY: 0 },
    )
    const panned = measureGestureCanvasDrawRectFromSize(
      IMAGE,
      HOST,
      1,
      { scale: 1, translateX: 30, translateY: -20 },
    )
    expect(panned!.offsetX).toBeCloseTo(base!.offsetX + 30, 5)
    expect(panned!.offsetY).toBeCloseTo(base!.offsetY - 20, 5)
  })

  it('grows downward from the image top when zooming', () => {
    const base = measureGestureCanvasDrawRectFromSize(
      IMAGE,
      HOST,
      1,
      { scale: 1, translateX: 0, translateY: 0 },
    )
    const zoomed = measureGestureCanvasDrawRectFromSize(
      IMAGE,
      HOST,
      1,
      { scale: 2, translateX: 0, translateY: 0 },
    )
    expect(zoomed!.drawWidth).toBeCloseTo(base!.drawWidth * 2, 5)
    expect(zoomed!.drawHeight).toBeCloseTo(base!.drawHeight * 2, 5)
    expect(zoomed!.offsetX + zoomed!.drawWidth * 0.5).toBeCloseTo(200, 5)
    expect(zoomed!.offsetY).toBeCloseTo(-50, 5)
    expect(base!.offsetY).toBeCloseTo(50, 5)
  })

  it('keeps the pinch focal point stable when zooming', () => {
    const focalX = 220
    const focalY = 280
    const start = measureGestureCanvasDrawRectFromSize(
      IMAGE,
      HOST,
      1,
      { scale: 1, translateX: 0, translateY: 0 },
    )!
    const pinchStart = {
      distance: 100,
      focalX,
      focalY,
      transform: { scale: 1, translateX: 0, translateY: 0 },
    }
    const next = resolveGestureCanvasPinchTransform(
      pinchStart,
      200,
      focalX,
      focalY,
      HOST,
      IMAGE,
      1,
    )
    const zoomed = measureGestureCanvasDrawRectFromSize(IMAGE, HOST, 1, next)!
    const imageFx = (focalX - start.offsetX) / start.drawWidth
    const imageFy = (focalY - start.offsetY) / start.drawHeight

    expect(zoomed.offsetX + zoomed.drawWidth * imageFx).toBeCloseTo(focalX, 5)
    expect(zoomed.offsetY + zoomed.drawHeight * imageFy).toBeCloseTo(focalY, 5)
    expect(next.scale).toBe(2)
  })

  it('pans by moving the pinch focal point', () => {
    const pinchStart = {
      distance: 120,
      focalX: 200,
      focalY: 250,
      transform: { scale: 1, translateX: 0, translateY: 0 },
    }
    const next = resolveGestureCanvasPinchTransform(
      pinchStart,
      120,
      230,
      270,
      HOST,
      IMAGE,
      1,
    )
    expect(next.scale).toBe(1)
    expect(next.translateX).toBeCloseTo(30, 5)
    expect(next.translateY).toBeCloseTo(20, 5)
  })
})