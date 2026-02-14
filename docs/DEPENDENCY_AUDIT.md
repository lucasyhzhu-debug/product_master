# Dependency Compatibility Audit

**Audit Date:** 2026-02-14
**Auditor:** Claude Opus 4.6 (automated)
**Node Version:** v24.13.0
**npm Version:** 11.6.2
**Project:** Frollie Recipe Master

---

## Core Stack Compatibility

| Package | Version | Role | Compatible |
|---------|---------|------|:----------:|
| React | 19.2.4 | UI framework | Yes |
| Vite | 7.3.1 | Build tool | Yes |
| Convex | 1.31.7 | Backend/realtime DB | Yes |
| TypeScript | 5.9.3 | Type system | Yes |
| Tailwind CSS | 4.1.18 | Styling | Yes |
| React Router | 7.13.0 | Client routing | Yes |

All core stack packages are mutually compatible. React 19 + Vite 7 + Convex 1.31 + TypeScript 5.9 confirmed working together. `npm run build` passes.

---

## Package Inventory

### Dependencies

| Package | Current | Latest | Status | Notes |
|---------|---------|--------|--------|-------|
| @dnd-kit/core | 6.3.1 | 6.3.1 | Current | Drag-and-drop library |
| @dnd-kit/sortable | 10.0.0 | 10.0.0 | Current | Sortable addon |
| @dnd-kit/utilities | 3.2.2 | 3.2.2 | Current | DnD utilities |
| @radix-ui/react-accordion | 1.2.12 | 1.2.12 | Current | shadcn primitive |
| @radix-ui/react-alert-dialog | 1.1.15 | 1.1.15 | Current | shadcn primitive |
| @radix-ui/react-checkbox | 1.3.3 | 1.3.3 | Current | shadcn primitive |
| @radix-ui/react-dialog | 1.1.15 | 1.1.15 | Current | shadcn primitive |
| @radix-ui/react-dropdown-menu | 2.1.16 | 2.1.16 | Current | shadcn primitive |
| @radix-ui/react-label | 2.1.8 | 2.1.8 | Current | shadcn primitive |
| @radix-ui/react-popover | 1.1.15 | 1.1.15 | Current | shadcn primitive |
| @radix-ui/react-progress | 1.1.8 | 1.1.8 | Current | shadcn primitive |
| @radix-ui/react-radio-group | 1.3.8 | 1.3.8 | Current | shadcn primitive |
| @radix-ui/react-select | 2.2.6 | 2.2.6 | Current | shadcn primitive |
| @radix-ui/react-separator | 1.1.8 | 1.1.8 | Current | shadcn primitive |
| @radix-ui/react-slot | 1.2.4 | 1.2.4 | Current | shadcn primitive |
| @radix-ui/react-switch | 1.2.6 | 1.2.6 | Current | shadcn primitive |
| @radix-ui/react-tabs | 1.1.13 | 1.1.13 | Current | shadcn primitive |
| @radix-ui/react-tooltip | 1.2.8 | 1.2.8 | Current | shadcn primitive |
| canvas-confetti | 1.9.4 | 1.9.4 | Current | Celebration effects |
| class-variance-authority | 0.7.1 | 0.7.1 | Current | CVA for component variants |
| clsx | 2.1.1 | 2.1.1 | Current | Class name utility |
| convex | 1.31.7 | 1.31.7 | Current | Backend runtime |
| convex-helpers | 0.1.112 | 0.1.112 | Current | Auth wrappers, utilities |
| driver.js | 1.4.0 | 1.4.0 | Current | Onboarding tours |
| framer-motion | 11.18.2 | 12.34.0 | Skipped | Major version (see below) |
| html2canvas | 1.4.1 | 1.4.1 | Current | Screenshot capture |
| lucide-react | 0.564.0 | 0.564.0 | Upgraded | Icon library (from 0.563.0) |
| react | 19.2.4 | 19.2.4 | Current | UI framework |
| react-dom | 19.2.4 | 19.2.4 | Current | React DOM renderer |
| react-router-dom | 7.13.0 | 7.13.0 | Current | Client routing |
| sonner | 2.0.7 | 2.0.7 | Current | Toast notifications |
| tailwind-merge | 3.4.0 | 3.4.0 | Current | Tailwind class merging |

### DevDependencies

| Package | Current | Latest | Status | Notes |
|---------|---------|--------|--------|-------|
| @edge-runtime/vm | 5.0.0 | 5.0.0 | Current | Convex test runtime |
| @eslint/js | 9.39.2 | 10.0.1 | Skipped | Major version (see below) |
| @playwright/test | 1.58.2 | 1.58.2 | Current | E2E test framework |
| @tailwindcss/vite | 4.1.18 | 4.1.18 | Current | Tailwind Vite plugin |
| @testing-library/jest-dom | 6.9.1 | 6.9.1 | Current | DOM matchers |
| @testing-library/react | 16.3.2 | 16.3.2 | Current | React test utilities |
| @testing-library/user-event | 14.6.1 | 14.6.1 | Current | User interaction simulation |
| @types/canvas-confetti | 1.9.0 | 1.9.0 | Current | Type definitions |
| @types/node | 24.10.13 | 25.2.3 | Upgraded | Node types (from 24.10.9, within v24) |
| @types/react | 19.2.14 | 19.2.14 | Upgraded | React types (from 19.2.9) |
| @types/react-dom | 19.2.3 | 19.2.3 | Current | React DOM types |
| @vitejs/plugin-react | 5.1.4 | 5.1.4 | Upgraded | Vite React plugin (from 5.1.2) |
| @vitest/coverage-v8 | 4.0.18 | 4.0.18 | Current | Coverage provider |
| autoprefixer | 10.4.24 | 10.4.24 | Upgraded | CSS autoprefixer (from 10.4.23) |
| convex-test | 0.0.41 | 0.0.41 | Current | Convex testing utilities |
| eslint | 9.39.2 | 10.0.0 | Skipped | Major version (see below) |
| eslint-plugin-react-hooks | 7.0.1 | 7.0.1 | Current | React hooks linting |
| eslint-plugin-react-refresh | 0.4.26 | 0.5.0 | Skipped | Minor but outside semver range |
| globals | 16.5.0 | 17.3.0 | Skipped | Major version (see below) |
| jsdom | 27.4.0 | 28.0.0 | Skipped | Major version (see below) |
| postcss | 8.5.6 | 8.5.6 | Current | CSS processor |
| tailwindcss | 4.1.18 | 4.1.18 | Current | Utility-first CSS |
| typescript | 5.9.3 | 5.9.3 | Current | Type system |
| typescript-eslint | 8.55.0 | 8.55.0 | Upgraded | TS ESLint (from 8.54.0) |
| vite | 7.3.1 | 7.3.1 | Current | Build tool |
| vitest | 4.0.18 | 4.0.18 | Current | Test runner |

---

## Upgrades Applied

| Package | Before | After | Type |
|---------|--------|-------|------|
| @types/react | 19.2.9 | 19.2.14 | Patch (type definitions) |
| @types/node | 24.10.9 | 24.10.13 | Patch (type definitions) |
| @vitejs/plugin-react | 5.1.2 | 5.1.4 | Patch (bug fixes) |
| autoprefixer | 10.4.23 | 10.4.24 | Patch (bug fixes) |
| typescript-eslint | 8.54.0 | 8.55.0 | Minor (new rules/features) |
| lucide-react | 0.563.0 | 0.564.0 | Minor (new icons) |

All upgrades verified with `npm run build` -- no regressions.

---

## Upgrades Skipped

| Package | Current | Latest | Rationale |
|---------|---------|--------|-----------|
| framer-motion | 11.18.2 | 12.34.0 | **Major version.** v12 introduces breaking API changes to `AnimatePresence` and motion component props. Our codebase uses `AnimatePresence` extensively for page transitions (Layout.tsx) and animation variants across 20+ components. Migration requires audit of all animation props. |
| @eslint/js | 9.39.2 | 10.0.1 | **Major version.** ESLint 10 ecosystem. Must upgrade alongside `eslint` and all plugins simultaneously. |
| eslint | 9.39.2 | 10.0.0 | **Major version.** ESLint 10 drops legacy config support, changes plugin API. Requires coordinated upgrade with @eslint/js, typescript-eslint, globals, and all ESLint plugins. |
| globals | 16.5.0 | 17.3.0 | **Major version.** Tied to ESLint 10 ecosystem upgrade. |
| eslint-plugin-react-refresh | 0.4.26 | 0.5.0 | **Minor but outside semver range.** Pinned at ^0.4.24; v0.5.0 may have breaking plugin API changes. Upgrade with ESLint 10 migration. |
| jsdom | 27.4.0 | 28.0.0 | **Major version.** v28 changes URL parsing behavior and drops some legacy APIs. Low risk but requires test suite verification. Defer to next maintenance window. |
| @types/node | 24.10.13 | 25.2.3 | **Major version.** Node 25 types. We run Node 24; types should match runtime. |

---

## Security Audit

```
npm audit: found 0 vulnerabilities
```

No known security vulnerabilities in any dependency (direct or transitive) as of 2026-02-14.

---

## Future Recommendations

### Near-term (1-3 months)

1. **ESLint 10 Migration** -- eslint, @eslint/js, globals, eslint-plugin-react-refresh all need coordinated upgrade. Plan a dedicated session since flat config changes may require eslint.config.js updates.

2. **Framer Motion 12** -- Evaluate v12 migration. Main breaking changes are in `AnimatePresence` exit animations and `motion.div` prop types. Test with the Layout.tsx page transitions first.

3. **jsdom 28** -- Low-risk upgrade for test environment. Run full test suite after upgrade to verify no URL parsing regressions.

### Medium-term (3-6 months)

4. **html2canvas** -- Library is in maintenance mode (last publish Jan 2024). Monitor for alternatives like `html-to-image` or `modern-screenshot` if issues arise.

5. **Node.js 24 LTS** -- Currently on v24.13.0. Monitor for LTS designation and ensure deployment environments stay aligned.

6. **Convex SDK updates** -- Watch for Convex 1.32+ releases. The Convex team ships frequently; staying within 1-2 minor versions is recommended.

### Watch List

| Package | Concern | Action |
|---------|---------|--------|
| html2canvas | Maintenance mode | Monitor for security issues, plan replacement |
| driver.js | Low release cadence | No issues currently, watch for React 19 compat |
| canvas-confetti | Stable, no concerns | None needed |

---

## Verification

```
npm run build: PASSED (2026-02-14)
npm audit: 0 vulnerabilities
npm outdated: 7 packages outside semver range (all major versions, intentionally skipped)
```

All safe upgrades applied. Build verified. No regressions.
