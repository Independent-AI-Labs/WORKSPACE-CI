import { WikiShell } from '@/components/wiki/WikiShell'
import { FeedbackWidget } from '@/components/wiki/FeedbackWidget'
import { HookBadge } from '@/components/wiki/HookBadge'
import { getRequiredHooks } from '@/lib/yaml-loader'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

import type { HookRecord } from '@/types/hooks'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  return {
    title: `Hook: ${id}`,
  }
}

export default async function HookDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const manifest = await getRequiredHooks()
  const hook: HookRecord | undefined = manifest.hooks.find((h: HookRecord) => h.id === id)

  if (!hook) {
    notFound()
  }

  return (
    <WikiShell>
      <article className="hook-detail">
        <h1>{hook.id}</h1>
        <div className="hook-detail__badges">
          <HookBadge variant="stage" value={hook.stage} />
          <HookBadge variant="kind" value={hook.kind} />
          <HookBadge variant="tier" value={hook.safety ? 'safety' : 'strict'} />
        </div>
        <dl className="hook-detail__meta">
          <dt>Entry</dt>
          <dd><code>{hook.entry}</code></dd>
          <dt>Stage</dt>
          <dd>{hook.stage}</dd>
          <dt>Kind</dt>
          <dd>{hook.kind}</dd>
          <dt>Mandatory</dt>
          <dd>{hook.mandatory ? 'Yes' : 'No (exemptable)'}</dd>
          <dt>Safety tier</dt>
          <dd>{hook.safety ? 'Yes (runs at POC)' : 'No (strict only)'}</dd>
          <dt>Pass filenames</dt>
          <dd>{hook.pass_filenames ? 'Yes' : 'No'}</dd>
          <dt>Always run</dt>
          <dd>{hook.always_run ? 'Yes' : 'No'}</dd>
          {hook.files && (
            <>
              <dt>Files scope</dt>
              <dd><code>{hook.files}</code></dd>
            </>
          )}
          {hook.files_types && (
            <>
              <dt>File types</dt>
              <dd>{hook.files_types.join(', ')}</dd>
            </>
          )}
          <dt>Applicable to</dt>
          <dd>{hook.applicable_to.join(', ')}</dd>
        </dl>
        <FeedbackWidget targetId={hook.id} targetType="hook" />
      </article>
    </WikiShell>
  )
}
