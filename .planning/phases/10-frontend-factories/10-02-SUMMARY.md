---
phase: 10-frontend-factories
plan: 02
subsystem: ui
tags: [react, shadcn, table, crud, entity-manager, formbuilder, generic-components]

# Dependency graph
requires:
  - phase: 10-frontend-factories
    plan: 01
    provides: FormBuilder, ConfirmDialog, EmptyState, LoadingState, PageHeader, createMutationHook
  - phase: 09-ui-brand
    provides: Brand tokens, PageHeader, semantic color tokens, dark mode support
provides:
  - "EntityManager: generic CRUD UI with table/card toggle, search, sort, bulk select, form dialogs, delete confirm"
  - "shadcn/ui Table primitives (Table, TableHeader, TableBody, TableRow, TableHead, TableCell)"
  - "EntityColumn/EntityManagerConfig type interfaces for page configuration"
  - "useViewPreference hook for localStorage-persisted view toggle"
affects: [10-frontend-factories-plan-03, locations-manager, ingredients-manager, materials-manager]

# Tech tracking
tech-stack:
  added: []
  patterns: [entity-manager-config-pattern, view-toggle-localStorage, bulk-selection-pattern, auto-card-generation]

key-files:
  created:
    - src/components/ui/table.tsx
    - src/components/shared/EntityManager.tsx
  modified:
    - src/components/shared/index.ts
    - src/pages/IngredientsManager.tsx
    - src/pages/MaterialsManager.tsx

key-decisions:
  - "FormBuilder renders its own submit/cancel buttons inside dialog -- no separate DialogFooter needed"
  - "useViewPreference stores in localStorage under entityManager:{key}:view namespace"
  - "Default card auto-generates from columns config: first column = title, rest = detail rows"
  - "Bulk delete falls back to Promise.all of individual onDelete calls when onBulkDelete not provided"
  - "Sort cycles through asc -> desc -> clear (three-state toggle)"
  - "Undo toast re-creates entity via onCreate with cached form data (not a true undo)"

patterns-established:
  - "EntityManagerConfig pattern: single config object drives entire page layout, data, forms, mutations"
  - "View toggle in PageHeader action slot with localStorage persistence"
  - "FormDialog sub-component: Dialog + FormBuilder + key prop for re-render on edit/create switch"

# Metrics
duration: 5min
completed: 2026-02-14
---

# Phase 10 Plan 02: EntityManager Summary

**Generic EntityManager CRUD component with shadcn Table, table/card view toggle, FormBuilder dialogs, ConfirmDialog delete flow, bulk selection, client-side search and sorting**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-14T12:39:40Z
- **Completed:** 2026-02-14T12:44:40Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- shadcn/ui Table component installed with all 8 primitives (Table, TableHeader, TableBody, TableFooter, TableRow, TableHead, TableCell, TableCaption)
- EntityManager (~400 lines) with table/card view toggle, sortable columns, client-side search, bulk selection, FormBuilder-based create/edit dialogs, ConfirmDialog + optional undo toast for delete
- View preference persisted in localStorage via useViewPreference hook
- Auto-generated default card view from column configuration (no custom cardRender needed for simple entities)
- Barrel export updated for EntityManager, EntityColumn, EntityManagerConfig

## Task Commits

Each task was committed atomically:

1. **Task 1: Install shadcn Table component** - `27a6085` (feat)
2. **Task 2: Create EntityManager generic CRUD component** - `38924ea` (feat)

## Files Created/Modified
- `src/components/ui/table.tsx` - shadcn/ui Table primitives (8 components, React.forwardRef, cn() merge)
- `src/components/shared/EntityManager.tsx` - Generic CRUD UI: EntityManager, EntityColumn, EntityManagerConfig, FormDialog, DefaultCard
- `src/components/shared/index.ts` - Added EntityManager + type exports
- `src/pages/IngredientsManager.tsx` - Fixed delete mutation call args (Rule 3)
- `src/pages/MaterialsManager.tsx` - Fixed delete mutation call args (Rule 3)

## Decisions Made
- FormBuilder renders its own submit/cancel buttons inside dialog (no separate DialogFooter needed) -- keeps FormBuilder self-contained
- useViewPreference stores in localStorage under `entityManager:{key}:view` namespace to avoid collisions
- Auto-generated card: first column = title, remaining columns = detail rows with label prefix
- Bulk delete falls back to `Promise.all(ids.map(onDelete))` when `onBulkDelete` callback not provided
- Sort state cycles asc -> desc -> clear on repeated column header clicks
- Undo toast re-creates entity via `onCreate(cachedFormData)` (pragmatic re-creation, not true undo)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed delete mutation call signature in IngredientsManager and MaterialsManager**
- **Found during:** Task 2 (build verification)
- **Issue:** `deleteMutation.mutate(deleteId as Id<"ingredients">)` passed bare ID string instead of args object `{ id: ... }`. Pre-existing bug from Phase 5 protectedMutation migration -- `useSessionMutation` expects `{ id: Id }`, not bare `Id`.
- **Fix:** Changed to `deleteMutation.mutate({ id: deleteId as Id<"ingredients"> })` in both files
- **Files modified:** `src/pages/IngredientsManager.tsx`, `src/pages/MaterialsManager.tsx`
- **Verification:** `npm run build` passes
- **Committed in:** `38924ea` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Fix was required to unblock build verification. No scope creep.

## Issues Encountered
- shadcn CLI (`npx shadcn@latest add table`) failed due to missing `components.json` config file requiring interactive setup -- manually created table.tsx following standard shadcn/ui pattern (planned fallback in task description)

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- EntityManager ready for consumption in Plan 03 (page migrations: Locations, Ingredients, Materials + 2 new pages)
- Table component ready for any table-based UI
- All existing shared components (FormBuilder, ConfirmDialog, EmptyState, LoadingState) integrate cleanly with EntityManager

---
*Phase: 10-frontend-factories*
*Completed: 2026-02-14*
