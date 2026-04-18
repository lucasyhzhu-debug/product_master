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
        { name: 'assets/vendor-react-*.js', limit: '500 kB', mode: 'uncompressed' },
        // Bumped to 600 kB: phase 72 added xlsx (~50 kB) and phase 80 added recharts
        // + analytics dashboard vendor footprint. If vendor keeps growing, split
        // xlsx or recharts into their own chunks via manualChunks below.
        { name: 'assets/vendor-*.js', limit: '600 kB', mode: 'uncompressed' },
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
          // Nivo (heatmaps only on /analytics) — isolate to its own chunk so it
          // stays out of the main vendor bundle and only loads with AnalyticsDashboard.
          if (id.includes('@nivo') || id.includes('@react-spring')) return 'vendor-nivo';
          // Animation: framer-motion
          if (id.includes('framer-motion')) return 'vendor-motion';
          // React core + DOM + router + scheduler: stable across app changes
          // IMPORTANT: Use precise patterns to avoid accidental matches.
          //
          // Pitfall 1: id.includes('/react/') accidentally captures @floating-ui/react
          //   (its path contains /react/dist/ which matches /react/), pulling it into
          //   vendor-react while its deps (@floating-ui/core, /dom) stay in vendor —
          //   causing a circular cross-chunk TDZ error at runtime.
          //
          // Pitfall 2: scheduler (react-dom's runtime dep) doesn't match /react/ and
          //   falls to vendor, causing vendor-react→vendor→vendor-react circular imports.
          //
          // Fix: match only the exact React core packages by name, and co-locate
          //   @floating-ui/* with @radix-ui in vendor-ui (handled below).
          if (id.includes('/node_modules/react/') ||
              id.includes('/node_modules/react-dom/') ||
              id.includes('/node_modules/react-router/') ||
              id.includes('/node_modules/react-router-dom/') ||
              id.includes('/node_modules/scheduler/')) return 'vendor-react';
          // Icons: large library, changes infrequently
          if (id.includes('lucide-react')) return 'vendor-icons';
          // UI primitives: Radix UI + floating-ui (Radix's positioning engine) + tailwind utilities
          // @floating-ui/* must be in the same chunk as @radix-ui — Radix imports from it directly.
          if (id.includes('@radix-ui') || id.includes('@floating-ui') ||
              id.includes('class-variance-authority') ||
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
