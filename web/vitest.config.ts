import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const configDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(configDir, '..')

export default defineConfig({
  root: repoRoot,
  plugins: [react()],
  server: {
    fs: { allow: [repoRoot] },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    deps: {
      moduleDirectories: ['node_modules', path.resolve(repoRoot, 'node_modules')],
    },
    setupFiles: ['tests/web/setup.ts'],
    include: ['tests/web/**/*.test.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['web/src/**/*.{ts,tsx}'],
      exclude: [
        'tests/web/**',
        'web-components/**',
        '**/web-components/**',
        'node_modules/@workspace-ci/web-components/**',
        'web/src/types/**',
        'web/src/data/**',
        'web/src/content/**',
      ],
      // Earned thresholds (2026-07-25): floors match the actual coverage of
      // the post-extraction tree and may only rise from here.
      thresholds: {
        lines: 68,
        branches: 58,
        functions: 67,
        statements: 66,
        'web/src/hooks/': { lines: 73, branches: 57, functions: 76, statements: 73 },
      },
    },
  },
  resolve: {
    dedupe: ['next', 'react', 'react-dom'],
    alias: [
      { find: '@/', replacement: path.resolve(configDir, './src') + '/' },
    ],
  },
})
