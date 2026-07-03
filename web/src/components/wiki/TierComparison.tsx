import type { HookTier } from '@/types/hooks'
import type { HookRecord } from '@/types/hooks'
import { hookRunsInTier } from '@/types/hooks'

const TIERS: HookTier[] = ['strict', 'poc']


interface TierComparisonProps {
  hooks: HookRecord[]
}

export function TierComparison({ hooks }: TierComparisonProps) {
  return (
    <section className="tier-comparison" aria-label="Tier and stage matrix">
      <h2>Enforcement Tier Matrix</h2>
      <table className="tier-comparison__table">
        <thead>
          <tr>
            <th>Hook</th>
            <th>Stage</th>
            {TIERS.map((tier) => (
              <th key={tier}>{tier}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {hooks.map((hook) => (
            <tr key={hook.id}>
              <td>{hook.id}</td>
              <td>{hook.stage}</td>
              {TIERS.map((tier) => (
                <td key={tier}>
                  {hookRunsInTier(hook, tier) ? (
                    <i className="ri-check-line text-ok" aria-label="Runs" />
                  ) : (
                    <i
                      className="ri-close-line text-muted"
                      aria-label="Does not run"
                    />
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
