import type { HookRecord } from '@/types/hooks'
import { StageFilter } from '@/components/wiki/StageFilter'
import { TierFilter } from '@/components/wiki/TierFilter'
import { HookBadge } from '@/components/wiki/HookBadge'
import Link from 'next/link'

interface HookTableProps {
  hooks: HookRecord[]
}

export function HookTable({ hooks }: HookTableProps) {
  return (
    <div className="hook-table">
      <div className="hook-table__filters">
        <StageFilter hooks={hooks} />
        <TierFilter hooks={hooks} />
      </div>
      <table className="hook-table__table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Stage</th>
            <th>Kind</th>
            <th>Entry</th>
            <th>Tier</th>
            <th>Mandatory</th>
          </tr>
        </thead>
        <tbody>
          {hooks.map((hook) => (
            <tr key={hook.id}>
              <td>
                <Link href={`/hooks/${hook.id}`} className="hook-table__link">
                  {hook.id}
                </Link>
              </td>
              <td>
                <HookBadge variant="stage" value={hook.stage} />
              </td>
              <td>
                <HookBadge variant="kind" value={hook.kind} />
              </td>
              <td>
                <code className="hook-table__entry">{hook.entry}</code>
              </td>
              <td>
                {hook.safety ? (
                  <HookBadge variant="tier" value="safety" />
                ) : (
                  <HookBadge variant="tier" value="strict" />
                )}
              </td>
              <td>{hook.mandatory ? 'Yes' : 'No'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
