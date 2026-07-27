import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const configDir = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    passWithNoTests: true,
    setupFiles: [path.resolve(configDir, 'tests/setup.ts')],
    include: ['tests/**/*.test.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/types/**'],
      // Earned thresholds (2026-07-25): floors match the actual coverage of
      // the extracted Slice 1 code; they may only rise as Slices 2-3 land
      // and backfill tests arrive.
      thresholds: {
        lines: 65,
        branches: 54,
        functions: 65,
        statements: 63,
      },
    },
  },
})
