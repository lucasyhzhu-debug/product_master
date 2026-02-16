---
phase: 09-ui-brand
plan: 05
subsystem: ui
tags: [dark-mode, skeleton-screens, empty-state, kitchen-redesign, header-redesign, css-variables]

# Dependency graph
requires:
  - phase: 09-01
    provides: ThemeProvider, teal brand CSS tokens, index.css dark mode section
  - phase: 09-02
    provides: PageHeader, PageContainer, Layout components
  - phase: 09-03
    provides: Standard page audit (15 pages consistent)
  - phase: 09-04
    provides: Complex page audit, kitchen station CSS variables, component-level color cleanup
provides:
  - Page-specific skeleton screens (TablePageSkeleton, EditorPageSkeleton, DashboardSkeleton)
  - Enhanced EmptyState with 96px icon circle, dashed border, warmer spacing
  - Full dark mode support across entire app (ThemeContext re-enabled, 60+ CSS variables)
  - Kitchen UI dark mode consistency (20 components, zero hardcoded hex colors)
  - Non-kitchen dark mode fixes (22 files with dark: variants)
  - Compact header user menu (role-colored name pill, theme toggle dropdown)
affects: [phase-09-complete]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ThemeContext with light/dark/system toggle, persisted to localStorage"
    - "CSS variable dark overrides for station, status, channel, role, flip display colors"
    - "Role-colored user identity: ROLE_COLORS map with CSS variable bg/text pairs"
    - "Responsive user pill: full name on sm+, 2-letter initials on mobile"
---

## What was built

### Skeleton Screens
- `src/components/shared/skeletons.tsx`: Three page-type-specific skeleton templates (TablePageSkeleton, EditorPageSkeleton, DashboardSkeleton) using shadcn Skeleton with animate-pulse
- `src/components/shared/LoadingState.tsx`: Updated to re-export skeleton templates, LoadingPage now uses TablePageSkeleton

### Enhanced EmptyState
- `src/components/shared/EmptyState.tsx`: Larger 96px icon circle (was 64px), border-dashed card, gentler icon opacity, relaxed line-height, prominent CTA button

### Dark Mode — Full App
- **ThemeContext re-enabled**: `light`/`dark`/`system` modes with localStorage persistence, system preference listener, automatic `<html>` class toggle
- **60+ CSS variables added to index.css**: Dark overrides for all station colors (production/boxing/stickering/packing), GoFood/K3 Mart channel colors, kitchen status colors, flip number display, semantic status/channel/role tokens
- **20 kitchen component files**: All hardcoded hex colors replaced with CSS variables (`text-[var(--color-station-*)]`, `bg-[var(--color-kitchen-*)]`, `text-foreground`, `bg-muted`, `border-border`)
- **22 non-kitchen files**: Added `dark:` variants to all status badges, channel indicators, role colors, margin indicators, severity displays

### Header Redesign
- Removed avatar/photo upload entirely
- Replaced name + "Administrator" badge + logout button with single role-colored pill
- Wide screens: full name on role-colored background (purple=admin, blue=manager, green=order_staff, orange=kitchen)
- Narrow/mobile: 2-letter initials on role-colored circle
- Click opens dropdown: dark/light mode toggle + sign out
- Mobile hamburger menu also includes theme toggle (light/dark/system with icons)

## Key files

### Created
- `src/components/shared/skeletons.tsx`

### Modified (key files)
- `src/index.css` — 60+ dark mode CSS variables
- `src/contexts/ThemeContext.tsx` — Full re-enablement
- `src/components/layout/Header.tsx` — Compact user menu with role colors + theme toggle
- `src/components/shared/EmptyState.tsx` — Enhanced styling
- `src/components/shared/LoadingState.tsx` — Skeleton re-exports
- 20 kitchen component files — CSS variable migration
- 22 non-kitchen component files — dark: variant additions

## Self-Check: PASSED

- [x] Page-specific skeleton templates exist (3 exports from skeletons.tsx)
- [x] EmptyState has 96px icon circle (w-24 h-24)
- [x] Dark mode toggles correctly via user dropdown
- [x] Kitchen components use CSS variables (zero hardcoded hex remaining)
- [x] Non-kitchen components have dark: variants
- [x] Header shows role-colored name pill (initials on mobile)
- [x] `npm run build` passes
- [x] User visually approved dark mode across all pages
