'use client'

import { useThemeStore } from '@/stores/theme-store'

export function CapabilityGauge() {
  const theme = useThemeStore((s) => s.theme)

  return (
    <div className="capability-gauge">
      <iframe
        src={`/embed/workspace-capabilities.html?theme=${theme}`}
        title="Workspace capabilities"
      />
    </div>
  )
}
