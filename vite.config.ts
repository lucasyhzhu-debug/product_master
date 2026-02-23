import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import bundlesize from 'vite-plugin-bundlesize'
import { visualizer } from 'rollup-plugin-visualizer'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    bundlesize({
      limits: [
        // Main entry chunk must stay under 500 kB uncompressed
        { name: 'assets/index-*.js', limit: '500 kB', mode: 'uncompressed' },
        // Vendor chunks — stable across deploys, cached by browser
        { name: 'assets/vendor-react-*.js', limit: '350 kB', mode: 'uncompressed' },
        { name: 'assets/vendor-*.js', limit: '350 kB', mode: 'uncompressed' },
        // Page chunks — default 150 kB is fine for all of them
      ],
    }),
    visualizer({
      filename: 'dist/bundle-stats.html',
      open: false,           // do not auto-open in CI
      gzipSize: true,
      brotliSize: true,
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    sourcemap: 'hidden', // required by vite-plugin-bundlesize; 'hidden' avoids exposing maps to browser
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          // Charts: recharts + its d3 sub-packages (d3-scale, d3-shape, etc.)
          if (id.includes('recharts') || id.includes('d3-')) return 'vendor-charts';
          // Animation: framer-motion
          if (id.includes('framer-motion')) return 'vendor-motion';
          // React core + DOM + router: stable across app changes
          // Check react-dom and react-router first, then catch 'react' itself
          if (id.includes('react-dom') || id.includes('/react-router') ||
              id.includes('/react/')) return 'vendor-react';
          // Icons: large library, changes infrequently
          if (id.includes('lucide-react')) return 'vendor-icons';
          // UI primitives: Radix UI + tailwind utilities
          if (id.includes('@radix-ui') || id.includes('class-variance-authority') ||
              id.includes('tailwind-merge') || id.includes('clsx')) return 'vendor-ui';
          // DnD kit (used in dispatch planner / kitchen)
          if (id.includes('@dnd-kit')) return 'vendor-dnd';
          // Convex client runtime
          if (id.includes('convex')) return 'vendor-convex';
          // Everything else from node_modules
          return 'vendor';
        },
      },
    },
  },
})
