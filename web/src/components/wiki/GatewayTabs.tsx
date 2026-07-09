'use client'

import { useState } from 'react'
import { GrafanaEmbed } from './GrafanaEmbed'
import type { GrafanaDashboardConfig } from '@/lib/branding'

interface GatewayTabsProps {
  dashboards: GrafanaDashboardConfig[]
}

export function GatewayTabs({ dashboards }: GatewayTabsProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const active = dashboards[activeIndex]

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
            {d.title}
          </button>
        ))}
      </div>
      <div className="gateway-tabs__panel" role="tabpanel">
        <GrafanaEmbed src={active.url} title={active.title} />
      </div>
    </div>
  )
}
