import type { ConfigSchema, ConfigField } from '@/types/content'
import { resolvePath, formatValue, formatValueHtml } from '@/lib/utils'
import { Tooltip } from '@/components/ui/Tooltip'

interface SchemaFieldCardsProps {
  schema: ConfigSchema
  values: Record<string, unknown>
}

function getTopLevel(path: string): string {
  const dotIdx = path.indexOf('.')
  const bracketIdx = path.indexOf('[')
  let cutIdx = path.length
  if (dotIdx !== -1) cutIdx = Math.min(cutIdx, dotIdx)
  if (bracketIdx !== -1) cutIdx = Math.min(cutIdx, bracketIdx)
  return path.slice(0, cutIdx)
}

interface FieldGroup {
  topLevel: string
  parent: ConfigField | null
  children: ConfigField[]
}

function groupFields(fields: ConfigField[]): FieldGroup[] {
  const groups = new Map<string, FieldGroup>()
  for (const field of fields) {
    const topLevel = getTopLevel(field.path)
    if (!groups.has(topLevel)) {
      groups.set(topLevel, { topLevel, parent: null, children: [] })
    }
    const group = groups.get(topLevel)!
    if (field.path === topLevel) {
      group.parent = field
    } else {
      group.children.push(field)
    }
  }
  return Array.from(groups.values())
}

export function SchemaFieldCards({ schema, values }: SchemaFieldCardsProps) {
  const groups = groupFields(schema.fields)

  return (
    <div className="schema-cards">
      <p className="schema-cards__desc">{schema.description}</p>
      {groups.map((group) => {
        const value = resolvePath(values, group.topLevel)
        return (
          <div key={group.topLevel} className="schema-card">
            {group.parent ? (
              <div className="schema-card__header">
                <code className="schema-card__path">{group.parent.path}</code>
                <span className="schema-card__type">{group.parent.type}</span>
                {group.parent.required ? (
                  <span className="schema-card__required">Required</span>
                ) : (
                  <span className="schema-card__optional">Optional</span>
                )}
                {group.parent.default !== undefined && (
                  <span className="schema-card__default">
                    Default: {formatValue(group.parent.default)}
                  </span>
                )}
              </div>
            ) : (
              <div className="schema-card__header">
                <code className="schema-card__path">{group.topLevel}</code>
              </div>
            )}
            {group.parent && (
              <p className="schema-card__desc">{group.parent.description}</p>
            )}
            {value !== undefined && (
              <div className="schema-card__value">
                <Tooltip html={formatValueHtml(value)} position="top">
                  <span className="schema-card__value-label">Current: [HOVER TO SHOW VALUE]</span>
                </Tooltip>
              </div>
            )}
            {group.children.length > 0 && (
              <div className="schema-card__children">
                {group.children.map((child, i) => (
                  <div key={i} className="schema-card schema-card--nested">
                    <div className="schema-card__header">
                      <code className="schema-card__path">{child.path}</code>
                      <span className="schema-card__type">{child.type}</span>
                      {child.required ? (
                        <span className="schema-card__required">Required</span>
                      ) : (
                        <span className="schema-card__optional">Optional</span>
                      )}
                      {child.default !== undefined && (
                        <span className="schema-card__default">
                          Default: {formatValue(child.default)}
                        </span>
                      )}
                    </div>
                    <p className="schema-card__desc">{child.description}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
