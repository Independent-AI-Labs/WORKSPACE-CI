import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/test/**',
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
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
})
