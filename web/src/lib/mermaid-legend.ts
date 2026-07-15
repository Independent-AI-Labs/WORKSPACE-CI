/** Visual scale for sample-shape nodes inside `subgraph legend [Legend]`. */
export const LEGEND_SUBGRAPH_SCALE = 0.72

/** Workflow convention: legend sample nodes use a `leg*` id prefix. */
export const LEGEND_NODE_ID_PREFIX = 'leg'

const LEGEND_CLUSTER_SELECTOR = 'g[data-id="legend"]'
const LEGEND_NODE_SELECTOR = `g.node[data-id^="${LEGEND_NODE_ID_PREFIX}"]`

function getBBoxSafe(el: SVGGraphicsElement): DOMRect | null {
  try {
    const bbox = el.getBBox()
    if (bbox.width <= 0 && bbox.height <= 0) return null
    return bbox
  } catch (err) {
    console.warn('mermaid legend: getBBox failed:', err)
    return null
  }
}

function centeredScaleTransform(cx: number, cy: number, scale: number): string {
  return `translate(${cx} ${cy}) scale(${scale}) translate(${-cx} ${-cy})`
}

function appendTransform(el: SVGGraphicsElement, transform: string): void {
  const existing = el.getAttribute('transform')?.trim()
  el.setAttribute('transform', existing ? `${existing} ${transform}` : transform)
}

/** Mermaid edge ids look like `L_legTrigger_legInput_0`. */
export function isLegendInternalEdge(edgeId: string): boolean {
  const parts = edgeId.split('_')
  if (parts[0] !== 'L' || parts.length < 3) return false
  const start = parts[1]
  const end = parts[2]
  return (
    start.startsWith(LEGEND_NODE_ID_PREFIX) && end.startsWith(LEGEND_NODE_ID_PREFIX)
  )
}

function collectLegendNodes(svg: SVGSVGElement): SVGGElement[] {
  return [...svg.querySelectorAll<SVGGElement>(LEGEND_NODE_SELECTOR)]
}

function unionBBox(elements: SVGGraphicsElement[]): DOMRect | null {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const el of elements) {
    const bbox = getBBoxSafe(el)
    if (!bbox) continue
    minX = Math.min(minX, bbox.x)
    minY = Math.min(minY, bbox.y)
    maxX = Math.max(maxX, bbox.x + bbox.width)
    maxY = Math.max(maxY, bbox.y + bbox.height)
  }

  if (!isFinite(minX)) return null
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
    top: minY,
    left: minX,
    right: maxX,
    bottom: maxY,
    toJSON: () => ({}),
  } as DOMRect
}

function scaleLegendEdges(
  svg: SVGSVGElement,
  transform: string,
): void {
  for (const path of svg.querySelectorAll<SVGPathElement>('path[data-id]')) {
    const edgeId = path.getAttribute('data-id') ?? ''
    if (!isLegendInternalEdge(edgeId)) continue
    appendTransform(path, transform)
  }
}

function refitLegendClusterOutline(
  cluster: SVGGElement,
  nodes: SVGGElement[],
): void {
  const bounds = unionBBox(nodes)
  if (!bounds) return

  const paddingX = 16
  const paddingTop = 28
  const paddingBottom = 12
  const x = bounds.x - paddingX
  const y = bounds.y - paddingTop
  const width = bounds.width + paddingX * 2
  const height = bounds.height + paddingTop + paddingBottom

  const rects = [...cluster.querySelectorAll<SVGRectElement>('rect')]
  if (rects.length === 0) return

  const outer = rects.reduce((largest, rect) => {
    const largestArea =
      parseFloat(largest.getAttribute('width') || '0') *
      parseFloat(largest.getAttribute('height') || '0')
    const rectArea =
      parseFloat(rect.getAttribute('width') || '0') *
      parseFloat(rect.getAttribute('height') || '0')
    return rectArea >= largestArea ? rect : largest
  })

  outer.setAttribute('x', String(x))
  outer.setAttribute('y', String(y))
  outer.setAttribute('width', String(width))
  outer.setAttribute('height', String(height))

  const inner = rects.find((rect) => rect !== outer)
  if (inner) {
    const inset = 2
    inner.setAttribute('x', String(x + inset))
    inner.setAttribute('y', String(y + paddingTop - 6))
    inner.setAttribute('width', String(Math.max(0, width - inset * 2)))
    inner.setAttribute('height', String(Math.max(0, height - paddingTop - paddingBottom + 6)))
  }

  const label = cluster.querySelector<SVGGElement>('.cluster-label')
  if (label) {
    label.setAttribute('transform', `translate(${x + 8}, ${y + 14})`)
  }
}

/**
 * Shrinks the legend sample shapes (not just the subgraph outline). Mermaid
 * renders legend nodes as siblings of the cluster group, so we scale each
 * `leg*` node, its internal links, then resize the legend container to fit.
 */
export function scaleLegendSubgraph(svg: SVGSVGElement): void {
  if (svg.dataset.legendScaled === 'true') return

  const legendNodes = collectLegendNodes(svg)
  if (legendNodes.length === 0) return

  const before = unionBBox(legendNodes)
  if (!before) return

  const cx = before.x + before.width / 2
  const cy = before.y + before.height / 2
  const transform = centeredScaleTransform(cx, cy, LEGEND_SUBGRAPH_SCALE)

  for (const node of legendNodes) {
    appendTransform(node, transform)
  }
  scaleLegendEdges(svg, transform)

  const cluster = svg.querySelector<SVGGElement>(LEGEND_CLUSTER_SELECTOR)
  if (cluster) {
    refitLegendClusterOutline(cluster, legendNodes)
  }

  svg.dataset.legendScaled = 'true'
}