import { WikiShell } from '@/components/wiki/WikiShell'
import { ConfigFieldTable } from '@/components/wiki/ConfigFieldTable'
import { FeedbackWidget } from '@/components/wiki/FeedbackWidget'
import { getGuardConfig } from '@/lib/yaml-loader'
import { getGuardConfigSchema } from '@/lib/yaml-loader'
import { notFound } from 'next/navigation'
import { dump } from 'js-yaml'
import type { Metadata } from 'next'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ name: string }>
}): Promise<Metadata> {
  const { name } = await params
  return {
    title: `Guard: ${name}`,
  }
}

export default async function GuardDetailPage({
  params,
}: {
  params: Promise<{ name: string }>
}) {
  const { name } = await params

  let values: Record<string, unknown>
  try {
    values = await getGuardConfig(name)
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      notFound()
    }
    throw e
  }

  const schema = await getGuardConfigSchema(name)
  const rawYaml = dump(values, { indent: 2 })

  return (
    <WikiShell>
      <article className="config-detail guard-detail">
        <h1>{name}</h1>
        {schema ? (
          <ConfigFieldTable schema={schema} values={values} />
        ) : (
          <p className="warning">
            No schema file found. Showing raw YAML only.
          </p>
        )}
        <section className="config-detail__raw">
          <h2>Raw YAML</h2>
          <pre>
            <code>{rawYaml}</code>
          </pre>
        </section>
        <FeedbackWidget targetId={name} targetType="guard" />
      </article>
    </WikiShell>
  )
}
