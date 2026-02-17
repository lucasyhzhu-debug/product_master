---
phase: quick-6
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/pages/K3MartCockpit.tsx
autonomous: true

must_haves:
  truths:
    - "User can see disabled outlets in Outlet Settings dialog"
    - "Disabled outlets remain visible when toggled off"
    - "Product Settings tab shows all outlets (active + inactive) in dropdown"
  artifacts:
    - path: "src/pages/K3MartCockpit.tsx"
      provides: "Outlet settings modal data with all outlets"
      min_lines: 800
  key_links:
    - from: "src/pages/K3MartCockpit.tsx"
      to: "outletSettingsData"
      via: "settingsModalData.outlets"
      pattern: "outletSettingsData.*outlets"
---

<objective>
Fix disabled outlets disappearing from Outlet Settings dialog when toggled off.

Purpose: Users need to see and re-enable disabled outlets. Currently, disabling an outlet makes it vanish from the settings UI.
Output: Outlet Settings modal shows all outlets (active + inactive) and Product Settings dropdown includes disabled outlets.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

**Bug root cause:** `settingsModalData` (line 374) builds outlets list from `outletStockData?.outlets` which filters `isActive === true` in the backend query. This causes disabled outlets to disappear from the modal.

**Fix:** Use `outletSettingsData.outlets` instead, which fetches ALL outlets regardless of active status from `getOutletSettings` query.
</context>

<tasks>

<task type="auto">
  <name>Replace outlet data source in settingsModalData</name>
  <files>src/pages/K3MartCockpit.tsx</files>
  <action>
In `src/pages/K3MartCockpit.tsx` line 374, change the `settingsModalData` useMemo to use `outletSettingsData.outlets` instead of `outletStockData.outlets`.

**Current code (line 374-378):**
```typescript
const outlets = (outletStockData?.outlets ?? []).map((o: any) => ({
  outletId: o._id as string,
  outletName: o.name as string,
  isActive: o.isActive !== false,
}));
```

**Replace with:**
```typescript
const outlets = (outletSettingsData?.outlets ?? []).map((o: any) => ({
  outletId: o.outletId as string,
  outletName: o.outletName as string,
  isActive: o.isActive !== false,
}));
```

**Why:** `outletSettingsData` comes from `getOutletSettings` query which returns ALL outlets (active + inactive) with fields `outletId`, `outletName`, `isActive`. The current `outletStockData` filters only active outlets.

**Impact:** This fixes both issues:
1. Outlet Toggle Settings tab - disabled outlets remain visible in list
2. Product Settings tab - outlet dropdown shows all outlets (since it uses the same `outlets` array)

Update the useMemo dependency array (line 412) from:
```typescript
}, [outletStockData, outletSettingsData]);
```
to:
```typescript
}, [outletSettingsData]);
```
(Remove `outletStockData` since we no longer use it in this memo)
  </action>
  <verify>
1. `npm run type-check` passes (no TypeScript errors)
2. Search for `settingsModalData` in K3MartCockpit.tsx confirms it only references `outletSettingsData`
3. Grep for field mapping: `outletId.*outletName.*isActive` pattern exists in modified lines
  </verify>
  <done>
- `settingsModalData` builds outlets list from `outletSettingsData` (not `outletStockData`)
- TypeScript compilation succeeds
- Dependency array only includes `outletSettingsData`
  </done>
</task>

</tasks>

<verification>
**Type check:**
```bash
npm run type-check
```

**Build verification:**
```bash
npm run build
```

**Visual verification (manual):**
1. Open K3Mart Cockpit
2. Click Settings button (top-right)
3. In Outlet Toggle Settings tab, toggle an outlet to inactive
4. Verify the outlet remains visible in the list (greyed out or marked inactive)
5. Switch to Product Settings tab
6. Verify the outlet dropdown includes the disabled outlet
</verification>

<success_criteria>
- [ ] TypeScript type-check passes
- [ ] Production build succeeds
- [ ] `settingsModalData` uses `outletSettingsData.outlets` (not `outletStockData.outlets`)
- [ ] Field mapping changed from `_id/name` to `outletId/outletName`
- [ ] Disabled outlets remain visible in Outlet Settings dialog
- [ ] Product Settings dropdown shows all outlets (active + inactive)
</success_criteria>

<output>
After completion, create `.planning/quick/6-show-disabled-outlets-in-outlet-settings/6-SUMMARY.md`
</output>
