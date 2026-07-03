import type { ConfigSchema } from '@/types/content'
import type { ConfigField } from '@/types/content'
import { resolvePath, formatValue } from '@/lib/utils'

interface ConfigFieldTableProps {
  schema: ConfigSchema
  values: Record<string, unknown>
}

export function ConfigFieldTable({ schema, values }: ConfigFieldTableProps) {
  return (
    <section className="config-fields" aria-label="Configuration fields">
      <p className="config-fields__desc">{schema.description}</p>
      <table className="config-field-table">
        <thead>
          <tr>
            <th>Path</th>
            <th>Type</th>
            <th>Required</th>
            <th>Default</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          {schema.fields.map((field, i) => (
            <ConfigFieldRow
              key={i}
              field={field}
              value={resolvePath(values, field.path)}
            />
          ))}
        </tbody>
      </table>
    </section>
  )
}

function ConfigFieldRow({
  field,
  value,
}: {
  field: ConfigField
  value: unknown
}) {
  const depth = field.path.split('.').length - 1
  return (
    <tr>
      <td style={{ paddingLeft: `${depth * 1}rem` }}>
        <code>{field.path}</code>
      </td>
      <td>{field.type}</td>
      <td>
        {field.required ? (
          <span className="required-badge">Required</span>
        ) : (
          <span className="optional-badge">Optional</span>
        )}
      </td>
      <td>
        {field.default !== undefined
          ? formatValue(field.default)
          : formatValue(value)}
      </td>
      <td>{field.description}</td>
    </tr>
  )
}
