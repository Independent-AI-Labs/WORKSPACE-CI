'use client'

import { configureThemeStorageKey } from '@workspace-ci/web-components/stores/theme'

configureThemeStorageKey('theme')

export { useThemeStore, createThemeStore } from '@workspace-ci/web-components/stores/theme'
export type { Theme, ThemeStore } from '@workspace-ci/web-components/stores/theme'
