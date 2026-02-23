---
status: resolved
trigger: "Production site completely broken after a recent code change — `Uncaught ReferenceError: Cannot access 'E' before initialization` in bundled `vendor-BoGX653r.js:1:23918`"
created: 2026-02-23T00:00:00Z
updated: 2026-02-23T00:01:00Z
---

## Current Focus

hypothesis: CONFIRMED — circular chunk dependency between vendor and vendor-react caused by `scheduler` package being misclassified
test: build with scheduler added to vendor-react chunk
expecting: TDZ error gone, build succeeds, no circular imports
next_action: fix vite.config.ts manualChunks to include scheduler in vendor-react chunk

## Symptoms

expected: Website loads normally after deploy
actual: Site completely fails to load — blank page or crash
errors:
  - vendor-BoGX653r.js:1 Uncaught ReferenceError: Cannot access 'E' before initialization at vendor-BoGX653r.js:1:23918
  - [DEPRECATED] Default export is deprecated. Instead use `import { create } from 'zustand'`.
reproduction: Load the production site
started: After a recent code change / commit

## Eliminated

- hypothesis: zustand default import
  evidence: zustand is not in package.json or node_modules at all
  timestamp: 2026-02-23T00:01:00Z

- hypothesis: circular deps in app barrel files (src/hooks/convex/index.ts)
  evidence: barrel file only re-exports, no circular structure visible
  timestamp: 2026-02-23T00:01:00Z

## Evidence

- timestamp: 2026-02-23T00:00:00Z
  checked: git log --oneline -20
  found: Recent commits include Phase 24 features and bundle splitting (feat(23))
  implication: Bundle splitting commit added manualChunks to vite.config.ts — prime suspect

- timestamp: 2026-02-23T00:01:00Z
  checked: dist/assets/vendor-BoGX653r.js position 23918
  found: E.createElement("div"... — E is React imported from vendor-react chunk
  implication: vendor bundle imports React from vendor-react; if vendor-react also imports from vendor → circular TDZ

- timestamp: 2026-02-23T00:01:00Z
  checked: vendor-react-CQ1imDHB.js first line
  found: import{r as yv,c as vv,o as gv,s as pv,f as Sv,a as bv,h as Ev,b as eh,l as Tv}from"./vendor-BoGX653r.js"
  implication: vendor-react IMPORTS from vendor — circular dependency confirmed

- timestamp: 2026-02-23T00:02:00Z
  checked: vendor-BoGX653r.js for scheduler/unstable_scheduleCallback
  found: unstable_scheduleCallback found at position 2981 in vendor bundle
  implication: The `scheduler` npm package (React's scheduler) ended up in the generic `vendor` chunk instead of `vendor-react`

- timestamp: 2026-02-23T00:02:00Z
  checked: manualChunks logic in vite.config.ts
  found: vendor-react condition is `id.includes('react-dom') || id.includes('/react-router') || id.includes('/react/')`
  implication: `scheduler` package path is `node_modules/scheduler/...` — doesn't match any vendor-react condition, falls to generic `vendor`. react-dom needs scheduler → vendor-react imports vendor. sonner in vendor imports React from vendor-react → circular TDZ

## Resolution

root_cause: Two packages were misclassified by manualChunks in vite.config.ts, creating a circular cross-chunk import (vendor ↔ vendor-react) that causes TDZ errors at bundle load time:
  1. `scheduler` (react-dom's runtime dep) — path doesn't contain /react/, fell to generic `vendor`. react-dom in vendor-react imported scheduler from vendor.
  2. `@floating-ui/react` — path contains `/react/dist/` which accidentally matched `id.includes('/react/')`, pulling it into vendor-react. But its deps (@floating-ui/core, /dom) fell to vendor. So vendor-react imported floating-ui from vendor, while vendor imported React from vendor-react — circular TDZ.
fix: |
  Two-pronged fix in vite.config.ts:
  1. Made React chunk matching more precise: replaced `id.includes('/react/')` with exact package name checks (`/node_modules/react/`, `/node_modules/react-dom/`, etc.) and added `/node_modules/scheduler/`.
  2. Added `@floating-ui` to the vendor-ui chunk condition alongside @radix-ui (Radix uses floating-ui directly for positioning).
  Result: vendor-react now has zero imports from other vendor chunks. Circular dependency eliminated. All 78 chunk size checks pass.
verification: |
  - npm run build: 78 checks pass, 0 failures
  - vendor-react imports from: [] (no cross-chunk imports)
  - vendor imports from vendor-react only (one-directional)
  - scheduler in vendor: NO
  - floating-ui in vendor: NO (moved to vendor-ui)
  - All chunks under 350kB limit
files_changed: [vite.config.ts]
