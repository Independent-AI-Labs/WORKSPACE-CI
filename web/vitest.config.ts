import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { builtinModules } from 'node:module'

const configDir = process.cwd()
const webNodeModules = path.resolve(configDir, 'node_modules')

const bareBuiltins = [...builtinModules].filter(m => !m.startsWith('node:'))
const builtinPattern = bareBuiltins
  .map(m => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .join('|')

const bareImportRegex = new RegExp(
  `^(?!node:|${builtinPattern}(?:/|$))(@[^/]+/[^/]+|[^@/.][^/]*)`
)

export default defineConfig({
  plugins: [react()],
  server: {
    fs: { allow: [path.resolve(configDir, '..')] },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    deps: {
      moduleDirectories: ['node_modules', webNodeModules],
    },
    setupFiles: [path.resolve(configDir, '../tests/web/setup.ts')],
    include: ['../tests/web/**/*.test.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        '../tests/web/**',
        'src/types/**',
        'src/data/**',
        'src/content/**',
      ],
      thresholds: {
        lines: 90,
        branches: 85,
        functions: 90,
        statements: 90,
        'src/hooks/': { lines: 95, branches: 90, functions: 95, statements: 95 },
        'src/components/wiki/playground/': {
          lines: 80,
          branches: 75,
          functions: 80,
          statements: 80,
        },
      },
    },
  },
  resolve: {
    alias: [
      { find: '@/', replacement: path.resolve(configDir, './src') + '/' },
      {
        find: bareImportRegex,
        replacement: webNodeModules + '/$1',
      },
    ],
  },
})
