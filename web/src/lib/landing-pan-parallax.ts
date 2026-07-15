export type NormalizedPointer = { x: number; y: number }

export type ParallaxOffset = { x: number; y: number }

export type ParallaxMax = { x: number; y: number }

export const DEFAULT_PARALLAX_MAX: ParallaxMax = { x: 4, y: 3 }

export function normalizeWindowPointer(
  clientX: number,
  clientY: number,
  innerWidth: number,
  innerHeight: number,
): NormalizedPointer {
  if (innerWidth <= 0 || innerHeight <= 0) {
    return { x: 0, y: 0 }
  }

  const x = (clientX / innerWidth - 0.5) * 2
  const y = (clientY / innerHeight - 0.5) * 2

  return {
    x: Math.max(-1, Math.min(1, x)),
    y: Math.max(-1, Math.min(1, y)),
  }
}

export function parallaxOffset(
  norm: NormalizedPointer,
  max: ParallaxMax = DEFAULT_PARALLAX_MAX,
): ParallaxOffset {
  return {
    x: -norm.x * max.x,
    y: -norm.y * max.y,
  }
}