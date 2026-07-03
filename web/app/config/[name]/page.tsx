import { WikiShell } from '@/components/wiki/WikiShell'
import { ConfigFieldTable } from '@/components/wiki/ConfigFieldTable'
import { FeedbackWidget } from '@/components/wiki/FeedbackWidget'
import { getConfigSchema } from '@/lib/yaml-loader'
import { getConfigValue } from '@/lib/yaml-loader'
import { notFound } from 'next/navigation'
import { dump } from 'js-yaml'

export default async function ConfigDetailPage({
  params,
}: {
  params: Promise<{ name: string }>
}) {
  const { name } = await params
  const [schema, values] = await Promise.all([
    getConfigSchema(name),
    getConfigValue(name),
  ])

  if (!schema && !values) {
    notFound()
  }

  const rawYaml = values ? dump(values, { indent: 2 }) : ''

  return (
    <WikiShell>
      <article className="config-detail">
        <h1>{name}</h1>
        {schema ? (
          <ConfigFieldTable schema={schema} values={values ?? {}} />
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
        <FeedbackWidget targetId={name} targetType="config" />
      </article>
    </WikiShell>
  )
}
