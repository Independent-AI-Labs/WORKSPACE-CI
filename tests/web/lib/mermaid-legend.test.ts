import { describe, it, expect, beforeEach } from 'vitest'
import {
  LEGEND_SUBGRAPH_SCALE,
  isLegendInternalEdge,
  scaleLegendSubgraph,
} from '@/lib/mermaid-legend'

function makeSvg(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 400 200')
  document.body.appendChild(svg)
  return svg
}

function makeNode(id: string, x: number, y: number, w: number, h: number): SVGGElement {
  const node = document.createElementNS('http://www.w3.org/2000/svg', 'g')
  node.setAttribute('class', 'node')
  node.setAttribute('data-id', id)
  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  rect.setAttribute('x', String(x))
  rect.setAttribute('y', String(y))
  rect.setAttribute('width', String(w))
  rect.setAttribute('height', String(h))
  node.appendChild(rect)
  node.getBBox = () =>
    ({
      x,
      y,
      width: w,
      height: h,
      top: y,
      left: x,
      right: x + w,
      bottom: y + h,
      toJSON: () => ({}),
    }) as DOMRect
  return node
}

function makeLegendDiagram(): {
  svg: SVGSVGElement
  cluster: SVGGElement
  legTrigger: SVGGElement
  legInput: SVGGElement
  clusterRect: SVGRectElement
} {
  const svg = makeSvg()
  const cluster = document.createElementNS('http://www.w3.org/2000/svg', 'g')
  cluster.setAttribute('data-id', 'legend')
  cluster.setAttribute('class', 'cluster')
  const clusterRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  clusterRect.setAttribute('x', '0')
  clusterRect.setAttribute('y', '0')
  clusterRect.setAttribute('width', '300')
  clusterRect.setAttribute('height', '80')
  cluster.appendChild(clusterRect)
  svg.appendChild(cluster)

  const legTrigger = makeNode('legTrigger', 20, 30, 60, 30)
  const legInput = makeNode('legInput', 100, 30, 60, 30)
  svg.appendChild(legTrigger)
  svg.appendChild(legInput)

  const internalEdge = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  internalEdge.setAttribute('data-id', 'L_legTrigger_legInput_0')
  internalEdge.setAttribute('d', 'M80,45 L100,45')
  svg.appendChild(internalEdge)

  const externalEdge = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  externalEdge.setAttribute('data-id', 'L_legInput_operator_0')
  externalEdge.setAttribute('d', 'M160,45 L220,45')
  svg.appendChild(externalEdge)

  return { svg, cluster, legTrigger, legInput, clusterRect }
}

describe('isLegendInternalEdge', () => {
  it('matches only edges between legend sample nodes', () => {
    expect(isLegendInternalEdge('L_legTrigger_legInput_0')).toBe(true)
    expect(isLegendInternalEdge('L_legInput_operator_0')).toBe(false)
    expect(isLegendInternalEdge('L_operator_launch_0')).toBe(false)
  })
})

describe('scaleLegendSubgraph', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('scales legend nodes, not the untouched cluster transform', () => {
    const { svg, cluster, legTrigger, legInput } = makeLegendDiagram()
    scaleLegendSubgraph(svg)

    expect(cluster.getAttribute('transform')).toBeNull()
    expect(legTrigger.getAttribute('transform')).toContain(`scale(${LEGEND_SUBGRAPH_SCALE})`)
    expect(legInput.getAttribute('transform')).toContain(`scale(${LEGEND_SUBGRAPH_SCALE})`)
    expect(svg.dataset.legendScaled).toBe('true')
  })

  it('scales only internal legend edges', () => {
    const { svg } = makeLegendDiagram()
    scaleLegendSubgraph(svg)
    const internal = svg.querySelector('path[data-id="L_legTrigger_legInput_0"]')!
    const external = svg.querySelector('path[data-id="L_legInput_operator_0"]')!
    expect(internal.getAttribute('transform')).toContain(`scale(${LEGEND_SUBGRAPH_SCALE})`)
    expect(external.getAttribute('transform')).toBeNull()
  })

  it('resizes the legend cluster outline to the scaled nodes', () => {
    const { svg, clusterRect } = makeLegendDiagram()
    scaleLegendSubgraph(svg)
    expect(Number(clusterRect.getAttribute('width'))).toBeLessThan(300)
    expect(Number(clusterRect.getAttribute('height'))).toBeLessThan(80)
  })

  it('does nothing when no legend nodes are present', () => {
    const svg = makeSvg()
    scaleLegendSubgraph(svg)
    expect(svg.dataset.legendScaled).toBeUndefined()
  })

  it('only scales once per svg', () => {
    const { svg, legTrigger } = makeLegendDiagram()
    scaleLegendSubgraph(svg)
    const first = legTrigger.getAttribute('transform')
    scaleLegendSubgraph(svg)
    expect(legTrigger.getAttribute('transform')).toBe(first)
  })
})