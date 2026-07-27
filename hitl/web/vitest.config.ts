import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const configDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(configDir, '../..')

export default defineConfig({
  plugins: [react()],
  server: {
    fs: { allow: [repoRoot] },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    deps: {
      moduleDirectories: [
        'node_modules',
        path.resolve(repoRoot, 'node_modules'),
      ],
    },
    setupFiles: [path.resolve(repoRoot, 'tests/hitl/web/setup.ts')],
    include: [
      path.resolve(repoRoot, 'tests/hitl/web/**/*.test.{ts,tsx}'),
    ],
    exclude: ['**/node_modules/**', '**/dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{ts,tsx}', 'app/**/*.{ts,tsx}'],
      exclude: ['node_modules/**', 'web-components/**'],
      // Scaffold thresholds; rise as the implementation matures.
      thresholds: {
        lines: 10,
        branches: 10,
        functions: 10,
        statements: 10,
      },
    },
  },
  resolve: {
    alias: [
      { find: '@/lib/', replacement: path.resolve(configDir, './app/lib') + '/' },
      { find: '@/components/', replacement: path.resolve(configDir, './src/components') + '/' },
      { find: '@/hooks/', replacement: path.resolve(configDir, './src/hooks') + '/' },
      { find: '@/types/', replacement: path.resolve(configDir, './src/types') + '/' },
      { find: '@/styles/', replacement: path.resolve(configDir, './src/styles') + '/' },
    ],
  },
})
