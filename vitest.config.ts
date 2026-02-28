import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: [
      'src/**/*.{test,spec}.{ts,tsx}',
      'convex/**/*.{test,spec}.{ts,tsx}',
      'tests/**/*.{test,spec}.{ts,tsx}',
    ],
    exclude: ['node_modules', 'dist', 'convex/_generated', 'tests/e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/lib/**/*.ts', 'convex/lib/**/*.ts', 'convex/orders/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.test.tsx', '**/node_modules/**'],
    },
    // Ensure deps are properly transformed (needed for convex-test import.meta.glob)
    server: {
      deps: {
        inline: ['convex-test'],
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
