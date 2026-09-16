'use client'

import { useState } from 'react'
import { GrafanaEmbed } from './GrafanaEmbed'
import type { GrafanaDashboardConfig } from '@/lib/branding'

interface GatewayTabsProps {
  dashboards: GrafanaDashboardConfig[]
}

function trimSharedPrefix(titles: string[]): string[] {
  if (titles.length < 2) return titles
  let prefix = titles[0]
  for (const t of titles.slice(1)) {
    while (prefix && !t.startsWith(prefix)) prefix = prefix.slice(0, -1)
  }
  const cut = prefix.lastIndexOf(' ')
  if (cut <= 0) return titles
  return titles.map((t) => t.slice(cut + 1))
}

export function GatewayTabs({ dashboards }: GatewayTabsProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const active = dashboards[activeIndex]
  const labels = trimSharedPrefix(dashboards.map((d) => d.title))

  return (
    <div className="gateway-tabs">
      <div className="gateway-tabs__bar" role="tablist">
        {dashboards.map((d, i) => (
          <button
            key={d.title}
            role="tab"
            aria-selected={i === activeIndex}
            className={'gateway-tabs__tab' + (i === activeIndex ? ' is-active' : '')}
            onClick={() => setActiveIndex(i)}
          >
            {labels[i]}
          </button>
        ))}
      </div>
      <div className="gateway-tabs__panel" role="tabpanel">
        <GrafanaEmbed src={active.url} title={active.title} />
      </div>
    </div>
  )
}
