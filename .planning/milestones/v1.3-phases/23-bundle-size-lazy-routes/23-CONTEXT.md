# Phase 23: Bundle Size & Lazy Routes - Context

**Gathered:** 2026-02-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Reduce the 1,474 kB single JS bundle by implementing route-level code splitting with React.lazy, chunking heavy vendor libraries, and adding route prefetching. Eliminate the Vite bundle size warning. Add a CI size budget to prevent regression.

</domain>

<decisions>
## Implementation Decisions

### Loading experience
- Simple centered spinner while route chunks load — match existing loading patterns in the app
- **Spinner design: spinning Frollie logo icon** — playful branded touch
- 200ms delay before showing spinner to avoid flash-of-spinner on fast connections
- **No fade transitions** — pages snap in immediately once loaded
- **Remove any existing fade/transition animations** that have caused issues previously

### Chunk splitting strategy
- **Login and landing page stay eager** (in main bundle) — they're the entry points
- All other page routes use React.lazy with Suspense
- **Separate vendor chunks** for heavy libraries: Recharts, SheetJS, Framer Motion — only downloaded when a page needs them
- Shared UI components (shadcn/ui, layout) stay in the main bundle — every page needs them
- **Route prefetching on hover** — start loading a page chunk when user hovers its nav link

### Performance targets
- Claude's discretion on exact initial bundle size target — goal is well under 500 kB to eliminate Vite warning
- **Before/after bundle size comparison** documented in the PR description
- Users mostly on good WiFi — aggressive size optimization is nice-to-have, not critical
- **CI size budget guard** — add a build-time check that fails if bundle grows too large

### Error recovery
- **Auto-retry then reload** — silently retry chunk import once on failure, then show a "Please reload" prompt
- **Deploy drift detection** — if chunk load fails with hash mismatch pattern (stale deployment), auto-reload the page to get fresh assets
- Console-only error logging for chunk failures — no external error tracking
- Error boundary placement: Claude's discretion (per-route vs app-level)

### Claude's Discretion
- Exact initial bundle size target (under 500 kB threshold)
- Error boundary granularity (per-route recommended for resilience)
- Vite manualChunks configuration details
- Prefetch implementation approach (link hover listener pattern)
- CI size budget threshold value

</decisions>

<specifics>
## Specific Ideas

- Spinner should be the Frollie logo icon spinning — "it would be so funny" per user
- Remove all existing page fade/transition animations — they caused issues before
- Before/after metrics should be captured clearly in the PR for visibility

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 23-bundle-size-lazy-routes*
*Context gathered: 2026-02-23*
