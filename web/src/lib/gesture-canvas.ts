/** Horizontal center of the image used as the zoom pivot. */
export const GESTURE_CANVAS_IMAGE_ORIGIN_X = 0.5
/** Top edge of the image used as the zoom pivot. */
export const GESTURE_CANVAS_IMAGE_ORIGIN_Y = 0

/** Viewport X where the image pivot is pinned on screen. */
export const GESTURE_CANVAS_VIEWPORT_ANCHOR_X = 0.5
/** Viewport Y where the image top is pinned on screen (top quarter of the card). */
export const GESTURE_CANVAS_VIEWPORT_ANCHOR_Y = 0.25

export const GESTURE_CANVAS_ZOOM_ORIGIN = '50% 25%'
export const GESTURE_CANVAS_BASE_ZOOM = 1
export const GESTURE_CANVAS_MIN_SCALE = 0.5
export const GESTURE_CANVAS_MAX_SCALE = 4

export function touchDistance(
  a: { clientX: number; clientY: number },
  b: { clientX: number; clientY: number },
): number {
  return Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY)
}

export function touchCentroid(
  a: { clientX: number; clientY: number },
  b: { clientX: number; clientY: number },
): { x: number; y: number } {
  return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 }
}

export function hostLocalTouchPoint(
  touch: { clientX: number; clientY: number },
  hostRect: Pick<DOMRect, 'left' | 'top'>,
): { x: number; y: number } {
  return { x: touch.clientX - hostRect.left, y: touch.clientY - hostRect.top }
}

export function hostLocalTouchCentroid(
  a: { clientX: number; clientY: number },
  b: { clientX: number; clientY: number },
  hostRect: Pick<DOMRect, 'left' | 'top'>,
): { x: number; y: number } {
  const centroid = touchCentroid(a, b)
  return { x: centroid.x - hostRect.left, y: centroid.y - hostRect.top }
}

export function clampScale(scale: number): number {
  return Math.min(GESTURE_CANVAS_MAX_SCALE, Math.max(GESTURE_CANVAS_MIN_SCALE, scale))
}

export interface GestureCanvasViewport {
  width: number
  height: number
}

export interface GestureCanvasImageSize {
  width: number
  height: number
}

export interface GestureCanvasTransformState {
  scale: number
  translateX: number
  translateY: number
}

export interface GestureCanvasDrawRect {
  drawWidth: number
  drawHeight: number
  offsetX: number
  offsetY: number
}

export interface GestureCanvasPinchStart {
  distance: number
  focalX: number
  focalY: number
  transform: GestureCanvasTransformState
}

export function measureGestureCanvasDrawRectFromSize(
  image: GestureCanvasImageSize,
  host: GestureCanvasViewport,
  baseZoom: number,
  transform: GestureCanvasTransformState,
): GestureCanvasDrawRect | null {
  const iw = image.width
  const ih = image.height
  if (!iw || !ih || host.width <= 0 || host.height <= 0) return null

  const fitScale = Math.min(host.width / iw, host.height / ih)
  const drawWidth = iw * fitScale * baseZoom * transform.scale
  const drawHeight = ih * fitScale * baseZoom * transform.scale
  const anchorX = host.width * GESTURE_CANVAS_VIEWPORT_ANCHOR_X
  const anchorY = host.height * GESTURE_CANVAS_VIEWPORT_ANCHOR_Y
  const offsetX =
    anchorX - drawWidth * GESTURE_CANVAS_IMAGE_ORIGIN_X + transform.translateX
  const offsetY =
    anchorY - drawHeight * GESTURE_CANVAS_IMAGE_ORIGIN_Y + transform.translateY

  return { drawWidth, drawHeight, offsetX, offsetY }
}

export function measureGestureCanvasDrawRect(
  image: HTMLImageElement,
  host: GestureCanvasViewport,
  baseZoom: number,
  transform: GestureCanvasTransformState,
): GestureCanvasDrawRect | null {
  return measureGestureCanvasDrawRectFromSize(
    { width: image.naturalWidth, height: image.naturalHeight },
    host,
    baseZoom,
    transform,
  )
}

export function resolveGestureCanvasPinchTransform(
  pinchStart: GestureCanvasPinchStart,
  distance: number,
  focalX: number,
  focalY: number,
  host: GestureCanvasViewport,
  image: GestureCanvasImageSize,
  baseZoom: number,
): GestureCanvasTransformState {
  if (pinchStart.distance <= 0) return { ...pinchStart.transform }

  const newScale = clampScale(pinchStart.transform.scale * (distance / pinchStart.distance))
  const startLayout = measureGestureCanvasDrawRectFromSize(
    image,
    host,
    baseZoom,
    pinchStart.transform,
  )
  if (!startLayout || startLayout.drawWidth <= 0 || startLayout.drawHeight <= 0) {
    return { ...pinchStart.transform, scale: newScale }
  }

  const imageFx = (pinchStart.focalX - startLayout.offsetX) / startLayout.drawWidth
  const imageFy = (pinchStart.focalY - startLayout.offsetY) / startLayout.drawHeight

  const fitScale = Math.min(host.width / image.width, host.height / image.height)
  const newDrawWidth = image.width * fitScale * baseZoom * newScale
  const newDrawHeight = image.height * fitScale * baseZoom * newScale
  const anchorX = host.width * GESTURE_CANVAS_VIEWPORT_ANCHOR_X
  const anchorY = host.height * GESTURE_CANVAS_VIEWPORT_ANCHOR_Y
  const newOffsetX = anchorX - newDrawWidth * GESTURE_CANVAS_IMAGE_ORIGIN_X
  const newOffsetY = anchorY - newDrawHeight * GESTURE_CANVAS_IMAGE_ORIGIN_Y

  return {
    scale: newScale,
    translateX: focalX - newOffsetX - newDrawWidth * imageFx,
    translateY: focalY - newOffsetY - newDrawHeight * imageFy,
  }
}

/** @deprecated Use measureGestureCanvasDrawRect */
export function measureGestureCanvasDrawSize(
  image: HTMLImageElement,
  host: GestureCanvasViewport,
  baseZoom = GESTURE_CANVAS_BASE_ZOOM,
): GestureCanvasDrawRect | null {
  return measureGestureCanvasDrawRect(image, host, baseZoom, {
    scale: 1,
    translateX: 0,
    translateY: 0,
  })
}