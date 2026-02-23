# Phase 23: Bundle Size & Lazy Routes - Research

**Researched:** 2026-02-23
**Domain:** Vite bundle splitting, React.lazy, Suspense, route-level code splitting
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Loading experience:** Simple centered spinner while route chunks load, matching existing loading patterns
- **Spinner design:** Spinning Frollie logo icon (branded)
- **Delay before spinner:** 200ms delay to avoid flash-of-spinner on fast connections
- **No fade transitions:** Pages snap in immediately once loaded; remove existing fade/transition animations
- **Login and landing page stay eager** in main bundle (entry points)
- **All other page routes use React.lazy with Suspense**
- **Separate vendor chunks** for heavy libraries: Recharts, SheetJS, Framer Motion
- **Shared UI (shadcn/ui, layout) stays in main bundle**
- **Route prefetching on hover** — start loading page chunk when user hovers nav link
- **Before/after bundle size comparison** documented in PR description
- **CI size budget guard** — build-time check that fails if bundle grows too large
- **Auto-retry then reload** — silently retry chunk import once on failure, then show "Please reload" prompt
- **Deploy drift detection** — auto-reload on hash mismatch pattern (stale deployment)
- **Console-only error logging** for chunk failures

### Claude's Discretion
- Exact initial bundle size target (under 500 kB threshold)
- Error boundary granularity (per-route recommended for resilience)
- Vite manualChunks configuration details
- Prefetch implementation approach (link hover listener pattern)
- CI size budget threshold value

### Deferred Ideas (OUT OF SCOPE)
- None — discussion stayed within phase scope
</user_constraints>

---

## Summary

The app currently ships a single 1,474.52 kB JS bundle (403.58 kB gzip), triggering Vite's 500 kB warning. All 19 page components are eagerly imported through the `src/pages/index.ts` barrel and bundled together. The fix is route-level code splitting via React.lazy + Suspense, combined with Vite `manualChunks` for stable vendor libraries.

**Critical discovery:** Framer Motion is used in `src/components/layout/Header.tsx` (the scroll-hide animation), which lives in the main bundle (Layout component). This means framer-motion CANNOT be fully deferred to lazy chunks — it must remain in the main bundle. However, it can still be split into a dedicated vendor chunk to improve caching. The user decision to "remove existing fade/transition animations" should be scoped to page-level transition effects, NOT the Header scroll animation (which is functional UX, not a page fade).

**Primary recommendation:** Switch all routes in `App.tsx` from barrel imports to direct `React.lazy(() => import('./pages/PageName'))` calls; configure `build.rollupOptions.output.manualChunks` to separate recharts and other heavy vendors; add `vite-plugin-bundlesize` for CI enforcement; implement a `lazyWithPreload` wrapper for hover prefetching and a retry error boundary.

**Expected result:** Initial bundle well under 400 kB (likely 200–350 kB), eliminating the Vite warning. Recharts (SalesAnalytics/K3MartCockpit) never downloaded unless user visits those routes.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React.lazy + Suspense | Built-in (React 19) | Route-level code splitting | Zero dependencies, first-class React support |
| Vite manualChunks | Built-in (Vite 7) | Vendor chunk splitting for caching | Rollup-native, no extra plugins needed |
| React Router v7 | Already installed | Route structure for lazy boundaries | App already uses this |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vite-plugin-bundlesize | ~1.x | CI size budget enforcement | Add as devDependency for build-time budget guard |
| rollup-plugin-visualizer | ~5.x | Interactive treemap of bundle contents | Dev/analysis tool; add to vite.config.ts with `open: false` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| vite-plugin-bundlesize | size-limit | size-limit requires more setup and a separate `@size-limit/preset-app` package; vite-plugin-bundlesize integrates directly into `vite build` |
| vite-plugin-bundlesize | Vite `chunkSizeWarningLimit` | chunkSizeWarningLimit only warns; vite-plugin-bundlesize fails the build |
| Custom lazyWithPreload | React Router v7 lazy() | RR7's `lazy()` export is for framework mode with data loaders, not library mode; React.lazy is correct for this SPA setup |

**Installation:**
```bash
npm install --save-dev vite-plugin-bundlesize rollup-plugin-visualizer
```

---

## Architecture Patterns

### Key Structural Finding: The Barrel Problem

The current `src/pages/index.ts` barrel exports ALL page components. App.tsx imports from this barrel:

```typescript
// Current (EAGER — all pages bundled together)
import { IngredientsManager, OrderManager, ... } from "@/pages";
```

This defeats tree-shaking for lazy loading. **The fix is to replace barrel imports in App.tsx with direct React.lazy imports:**

```typescript
// Target (LAZY — each page is its own chunk)
const IngredientsManager = lazy(() => import('./pages/IngredientsManager').then(m => ({ default: m.IngredientsManager })));
```

Or if page files export a default:
```typescript
const IngredientsManager = lazy(() => import('./pages/IngredientsManager'));
```

**The barrel file `src/pages/index.ts` does NOT need to be deleted** — it may still be used elsewhere. App.tsx simply stops importing from it.

### Framer Motion: Cannot Be Deferred

`Header.tsx` imports `motion` from `framer-motion` for the scroll-hide animation. Header is used inside `<Layout>`, which wraps all routes. Therefore framer-motion will always be in the main bundle. However, splitting it into a named `framer-motion` chunk (via manualChunks) still provides cache benefits: the framer-motion chunk has a stable hash across deploys that don't touch it.

This means the user decision to "separate vendor chunks for Framer Motion" achieves cache optimization, but not initial-load deferral for Framer Motion.

### Vite Configuration Pattern

```typescript
// Source: Verified via official Vite docs + Mykola Aleksandrov 2025 article
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import bundlesize from 'vite-plugin-bundlesize'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    bundlesize({
      limits: [
        { name: 'assets/index-*.js', limit: '500 kB', mode: 'uncompressed' },
      ],
    }),
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('recharts') || id.includes('d3-')) return 'vendor-charts';
            if (id.includes('framer-motion')) return 'vendor-motion';
            if (id.includes('react-dom') || id.includes('react-router')) return 'vendor-react';
            if (id.includes('lucide-react')) return 'vendor-icons';
            if (id.includes('@radix-ui') || id.includes('class-variance') || id.includes('tailwind-merge') || id.includes('clsx')) return 'vendor-ui';
            return 'vendor';
          }
        },
      },
    },
  },
})
```

**Note on recharts / d3:** Recharts depends on d3 sub-packages (d3-scale, d3-shape, etc.). Including `id.includes('d3-')` in the chart vendor chunk is important to group those together.

### React.lazy Pattern for Named Exports

The pages use named exports (`export function IngredientsManager`). React.lazy requires a default export. The `.then(m => ({ default: m.PageName }))` pattern handles this:

```typescript
// Source: React 19 official docs pattern
import { lazy, Suspense } from 'react';

const IngredientsManager = lazy(() =>
  import('./pages/IngredientsManager').then(m => ({ default: m.IngredientsManager }))
);
```

### Suspense Placement

Wrap route groups in a single `<Suspense>` at the router level, not per-route. This avoids multiple nested fallbacks:

```typescript
// Source: verified pattern
<Suspense fallback={<RouteLoadingFallback />}>
  <Routes>
    {/* lazy routes here */}
  </Routes>
</Suspense>
```

### The RouteLoadingFallback Component

Per context decisions: spinning Frollie logo, 200ms delay before showing, full-page centered:

```typescript
// Renders nothing for first 200ms, then shows spinning logo
function RouteLoadingFallback() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShow(true), 200);
    return () => clearTimeout(t);
  }, []);

  if (!show) return null;

  return (
    <div className="flex items-center justify-center min-h-screen">
      <UtensilsCrossed className="h-8 w-8 text-primary animate-spin" />
    </div>
  );
}
```

**Frollie logo icon:** The app uses `UtensilsCrossed` from lucide-react as the brand icon (visible in Header.tsx SheetTitle). Use this as the spinner. Tailwind's `animate-spin` handles the rotation.

### lazyWithPreload Pattern for Hover Prefetching

```typescript
// Source: blog.maximeheckel.com pattern + Mykola 2025 article "warm" pattern
type LazyComponent<T> = React.LazyExoticComponent<React.ComponentType<T>> & {
  preload: () => void;
};

function lazyWithPreload<T>(factory: () => Promise<{ default: React.ComponentType<T> }>): LazyComponent<T> {
  const Component = lazy(factory) as LazyComponent<T>;
  Component.preload = factory; // calling factory() pre-fetches the chunk
  return Component;
}

// Usage in App.tsx:
const IngredientsManager = lazyWithPreload(() =>
  import('./pages/IngredientsManager').then(m => ({ default: m.IngredientsManager }))
);
```

Nav links call `ComponentName.preload()` on mouse enter:

```typescript
// In Header or MobileBottomNav nav items
onMouseEnter={() => IngredientsManager.preload?.()}
onFocus={() => IngredientsManager.preload?.()}
```

**Scope:** Header desktop nav items and MobileBottomNav primaryTabs. Not every possible link in the app — just the main nav entries. Hover on the link pre-fetches; the browser caches the chunk so navigation is instant.

### Error Boundary for Chunk Load Failures

Per context: auto-retry once silently, then show "Please reload" prompt. Detect deploy drift (hash mismatch) via error message pattern.

```typescript
// ChunkErrorBoundary.tsx — per-route placement recommended for resilience
class ChunkErrorBoundary extends React.Component {
  state = { error: null, retried: false };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    if (!this.state.retried) {
      // Deploy drift: stale chunk hash — auto-reload
      if (error.message?.includes('Failed to fetch dynamically imported module') ||
          error.message?.includes('Importing a module script failed')) {
        window.location.reload();
        return;
      }
      // Network failure: retry once
      this.setState({ retried: true, error: null });
    }
    console.error('[ChunkLoadError]', error);
  }

  render() {
    if (this.state.error && this.state.retried) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[200px] gap-4">
          <p className="text-muted-foreground">Something went wrong loading this page.</p>
          <button onClick={() => window.location.reload()}>Please reload</button>
        </div>
      );
    }
    return this.props.children;
  }
}
```

**Placement:** Wrap each lazy route element individually (per-route error boundary). This way a chunk failure on one page doesn't take down the entire app.

### Removing Existing Page Fade Transitions

Search for `motion.div` or CSS transition classes on page wrapper elements. The specific "fade" transitions that caused issues are likely `AnimatePresence` + page-level `motion.div` wrappers. These should be removed or replaced with immediate render. The Header's `motion.header` scroll-hide animation should be PRESERVED.

### Recommended Project Structure (no changes needed)

The existing `src/pages/` and `src/components/` structure stays the same. Only `App.tsx` and `vite.config.ts` change significantly, plus the addition of:

```
src/
├── components/
│   └── shared/
│       └── ChunkErrorBoundary.tsx   # new — handles lazy load failures
│       └── RouteLoadingFallback.tsx # new — 200ms delayed spinner
├── lib/
│   └── lazyWithPreload.ts           # new — preload wrapper utility
```

### Anti-Patterns to Avoid

- **Importing lazy components from barrel files:** `import { Page } from '@/pages'` in the lazy factory breaks code splitting — Rollup cannot split barrels. Always use the direct file path.
- **Nesting Suspense inside ProtectedRoute:** Keep the single Suspense boundary above all Routes to avoid spinner flicker on auth checks.
- **Putting Suspense inside the Layout component:** Layout renders on every route; the Suspense should be above/around Routes, not inside Layout.
- **Using React Router v7's `lazy()` export:** That's for framework mode data loaders, not library mode page splitting. Use React's `lazy()` from `react`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Bundle size visualization | Custom build output parser | rollup-plugin-visualizer | Generates interactive treemap HTML; identifies exact culprits |
| CI size budget enforcement | Shell script parsing Vite output | vite-plugin-bundlesize | Integrates into build step; fails build on violation |
| Vendor chunk splitting | Complex custom bundler config | Vite manualChunks function | Rollup-native, well-documented, zero extra deps |

**Key insight:** The entire problem is solved with React.lazy + Vite config. No new runtime libraries needed.

---

## Common Pitfalls

### Pitfall 1: Barrel Import Defeats Code Splitting
**What goes wrong:** Using `import('./pages/index').then(m => m.IngredientsManager)` — the barrel causes Rollup to include ALL pages in one chunk.
**Why it happens:** Rollup cannot statically analyze which named export is needed when the factory imports the whole barrel.
**How to avoid:** In lazy factories, always import the specific file: `import('./pages/IngredientsManager')`.
**Warning signs:** Build output shows a single large chunk containing all page code.

### Pitfall 2: framer-motion Always in Main Bundle
**What goes wrong:** Expecting framer-motion to be lazy-loaded because it's listed as a "vendor chunk."
**Why it happens:** `Header.tsx` imports framer-motion, and Header is in Layout (main bundle). No amount of manualChunks config can defer it.
**How to avoid:** Accept this. Benefit is cache stability of the vendor-motion chunk, not initial-load deferral.
**Warning signs:** Wondering why initial bundle still includes framer-motion despite manualChunks.

### Pitfall 3: Named Export vs Default Export with React.lazy
**What goes wrong:** `lazy(() => import('./pages/IngredientsManager'))` fails TypeScript — IngredientsManager is a named export, not default.
**Why it happens:** React.lazy requires a module with a default export.
**How to avoid:** Use `.then(m => ({ default: m.IngredientsManager }))` pattern, OR add `export default` to each page file (more invasive change).
**Warning signs:** TypeScript error: "Module ... has no exported member 'default'".

### Pitfall 4: Suspense + React Router Ordering
**What goes wrong:** Wrapping `<BrowserRouter>` in Suspense, or putting Suspense inside `<Routes>`. React Router navigation with lazy routes needs Suspense above the route render.
**Why it happens:** Suspense must wrap the component that throws the "promise" (the lazy render).
**How to avoid:** Place `<Suspense>` inside `<BrowserRouter>` but wrapping `<Routes>` — not outside BrowserRouter, not inside individual Routes.

### Pitfall 5: ChunkSizeWarningLimit Masking the Problem
**What goes wrong:** Raising `build.chunkSizeWarningLimit` in vite.config.ts to silence the warning without actually fixing bundle size.
**Why it happens:** Quick fix temptation.
**How to avoid:** Don't touch `chunkSizeWarningLimit`. Instead, ensure the main bundle genuinely drops below 500 kB.

### Pitfall 6: SalesAnalytics/K3MartCockpit Still Compiled Despite Commented-Out Routes
**What goes wrong:** Even with routes commented out, if the pages are still exported from `src/pages/index.ts` and that barrel is imported anywhere, they're included in the bundle.
**Why it happens:** Tree-shaking works per-module, and barrels tie all exports together.
**How to avoid:** Once routes are lazy, the pages/index.ts barrel no longer needs to be imported in App.tsx. Lazy route factories only reference the specific page files. Pages that have no lazy factory in App.tsx simply aren't bundled.

---

## Code Examples

Verified patterns from official sources:

### Full App.tsx Route Conversion Pattern
```typescript
// Source: React 19 docs + verified pattern (Mykola 2025 article)
import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { lazyWithPreload } from '@/lib/lazyWithPreload';
import { RouteLoadingFallback } from '@/components/shared/RouteLoadingFallback';
import { ChunkErrorBoundary } from '@/components/shared/ChunkErrorBoundary';

// EAGER: entry points stay in main bundle
import Login from "@/pages/Login";
import { HubPage } from '@/pages/HubPage'; // zero Convex bandwidth, worth keeping eager

// LAZY: all other pages
const IngredientsManager = lazyWithPreload(() =>
  import('./pages/IngredientsManager').then(m => ({ default: m.IngredientsManager }))
);
const OrderManager = lazyWithPreload(() =>
  import('./pages/OrderManager').then(m => ({ default: m.OrderManager }))
);
// ... etc for each page

function App() {
  return (
    <TooltipProvider>
      <BrowserRouter>
        <ChunkErrorBoundary>
          <Suspense fallback={<RouteLoadingFallback />}>
            <Routes>
              {/* ... routes using lazy components ... */}
            </Routes>
          </Suspense>
        </ChunkErrorBoundary>
      </BrowserRouter>
      <Toaster />
    </TooltipProvider>
  );
}
```

### lazyWithPreload Utility
```typescript
// Source: blog.maximeheckel.com preloading pattern
// src/lib/lazyWithPreload.ts
import { lazy } from 'react';

export type PreloadableComponent<T extends React.ComponentType<unknown>> =
  React.LazyExoticComponent<T> & { preload: () => void };

export function lazyWithPreload<T extends React.ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>
): PreloadableComponent<T> {
  const Component = lazy(factory) as PreloadableComponent<T>;
  Component.preload = () => { factory(); }; // fire-and-forget; browser caches
  return Component;
}
```

### Vite Config with manualChunks
```typescript
// Source: Vite docs + Mykola Aleksandrov 2025 article (verified via WebFetch)
// vite.config.ts
build: {
  rollupOptions: {
    output: {
      manualChunks(id) {
        if (!id.includes('node_modules')) return;
        if (id.includes('recharts') || id.includes('d3-')) return 'vendor-charts';
        if (id.includes('framer-motion')) return 'vendor-motion';
        if (id.includes('react-dom') || id.includes('/react-router')) return 'vendor-react';
        if (id.includes('lucide-react')) return 'vendor-icons';
        if (id.includes('@radix-ui') || id.includes('class-variance-authority') ||
            id.includes('tailwind-merge') || id.includes('clsx')) return 'vendor-ui';
        if (id.includes('@dnd-kit')) return 'vendor-dnd';
        if (id.includes('convex')) return 'vendor-convex';
        return 'vendor';
      },
    },
  },
},
```

### Nav Link with Prefetch
```typescript
// Source: Mykola 2025 "warm" pattern (verified via WebFetch)
// In Header.tsx nav items, add onMouseEnter/onFocus to call preload
// Example for a nav link to IngredientsManager:
<Link
  to="/ingredients"
  onMouseEnter={() => IngredientsManager.preload?.()}
  onFocus={() => IngredientsManager.preload?.()}
>
  Ingredients
</Link>
```

**Implementation note:** Header.tsx builds nav items from a `mainNavItems` array with path/permission metadata. The prefetch integration requires either (a) adding a `preload` function to each nav item object, or (b) building a map from path to preload function. Option (a) is cleaner.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single bundle | Route-level chunks | Vite 2.0+ / React 16.6+ | Each page is a separate JS file |
| No vendor splitting | manualChunks | Vite 2.9+ | Vendors cached separately; content hash stable across deploys |
| Warning-only budget | vite-plugin-bundlesize | 2023+ | Fails build on regression |
| splitVendorChunkPlugin | manualChunks function | Vite 3.0+ | splitVendorChunkPlugin removed in Vite 4+; manualChunks is the standard |

**Deprecated/outdated:**
- `splitVendorChunkPlugin`: Removed in Vite 4+. Use `manualChunks` directly.
- Rolldown `advancedChunks`: Future replacement for `manualChunks`, not stable in Vite 7 yet. Stick with `manualChunks`.

---

## Open Questions

1. **Which pages are heaviest?**
   - What we know: SalesAnalytics uses recharts (largest single vendor not in main bundle). K3MartCockpit uses framer-motion heavily.
   - What's unclear: Exact per-page sizes before splitting.
   - Recommendation: Run `rollup-plugin-visualizer` during the phase to get exact numbers for PR before/after comparison.

2. **HubPage: lazy or eager?**
   - What we know: HubPage has zero Convex bandwidth (static nav cards only). It IS the landing page for manager/admin.
   - What's unclear: Whether it's large enough to justify lazy loading.
   - Recommendation: Keep HubPage eager (it's the manager/admin landing page, similar to Login). Very lightweight.

3. **Header framer-motion removal scope**
   - What we know: Context says "remove existing fade/transition animations that caused issues." Header uses `motion.header` for scroll-hide.
   - What's unclear: Whether the scroll-hide animation is one of the "problematic" ones.
   - Recommendation: PRESERVE the Header scroll-hide animation — it's functional UX (hides header on scroll to give more reading space), not a page fade. The CONTEXT.md specifically refers to page-level fade-in transitions. Only remove `AnimatePresence`/`motion.div` wrappers on page/route components.

4. **Pages barrel file `src/pages/index.ts`**
   - What we know: SalesAnalytics and K3MartCockpit are exported from the barrel but their routes are commented out.
   - Recommendation: Leave the barrel file intact (other tools may reference it). App.tsx simply stops importing from it; instead uses direct lazy imports.

---

## Sources

### Primary (HIGH confidence)
- React 19 official docs (lazy, Suspense, code-splitting) — React.lazy API and Suspense fallback patterns
- Vite 7 official docs — manualChunks, build.rollupOptions configuration
- App.tsx and src/pages/index.ts — direct code inspection showing current eager import structure
- `npm run build` output — confirmed 1,474.52 kB single bundle, 500 kB warning

### Secondary (MEDIUM confidence)
- [Mykola Aleksandrov Oct 2025 — React.lazy + Suspense + manualChunks](http://www.mykolaaleksandrov.dev/posts/2025/10/react-lazy-suspense-vite-manualchunks/) — Confirmed via WebFetch: manualChunks function pattern, prefetch "warm" pattern, measured ~95% main bundle reduction
- [Mykola Aleksandrov Nov 2025 — Taming large chunks in Vite + React](https://www.mykolaaleksandrov.dev/posts/2025/11/taming-large-chunks-vite-react/) — Confirmed via WebFetch: vendor split-by-stability strategy, recharts in chart-vendor chunk
- [vite-plugin-bundlesize GitHub](https://github.com/drwpow/vite-plugin-bundlesize) — Confirmed via WebFetch: fails build by default on limit violation, `allowFail` option available
- [Maxime Heckel — Preloading views with React.lazy](https://blog.maximeheckel.com/posts/preloading-views-with-react/) — lazyWithPreload pattern

### Tertiary (LOW confidence)
- [Codemzy — Fix ChunkLoadError in React](https://www.codemzy.com/blog/fix-chunkloaderror-react) — sessionStorage retry pattern; cross-verified with multiple sources
- [Plain English — Dealing with code splitting network failures](https://plainenglish.io/blog/how-to-deal-with-network-failures-from-code-splitting) — retry + error boundary patterns

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — built-in React + Vite features, no experimental APIs
- Architecture: HIGH — verified via direct code inspection + official docs
- Pitfalls: HIGH — framer-motion/Header finding is from direct code inspection, not speculation
- Prefetch pattern: MEDIUM — verified via WebFetch on 2025 article, aligns with React docs

**Research date:** 2026-02-23
**Valid until:** 2026-06-01 (stable APIs — React.lazy and Vite manualChunks are mature)
