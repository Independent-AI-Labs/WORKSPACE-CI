export interface ConfigField {
  path: string
  type: string
  required: boolean
  default?: unknown
  description: string
}

export interface ConfigSchema {
  config: string
  description: string
  fields: ConfigField[]
}

export interface ConfigEntry {
  name: string
  hasSchema: boolean
  link: string
}

export interface GuardConfigEntry {
  name: string
  title: string
  link: string
}
