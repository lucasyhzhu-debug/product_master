---
phase: 27-bring-back-sales-analytics-and-k3mart-co
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/layout/Header.tsx
  - src/components/layout/MobileBottomNav.tsx
autonomous: true
requirements: [NAV-01, NAV-02]

must_haves:
  truths:
    - "Sales Analytics appears in desktop Header main bar after Home"
    - "K3Mart Cockpit appears in desktop Header Depots dropdown"
    - "Sales appears as 5th primary tab in mobile bottom nav (after Home, before Orders)"
    - "K3Mart Cockpit appears in mobile More sheet"
    - "Both items use correct permission (canAccessSalesAnalytics)"
  artifacts:
    - path: "src/components/layout/Header.tsx"
      provides: "Desktop nav with Sales Analytics and K3Mart Cockpit restored"
      contains: "TrendingUp"
    - path: "src/components/layout/MobileBottomNav.tsx"
      provides: "Mobile nav with Sales tab and K3Mart in More sheet"
      contains: "TrendingUp"
  key_links:
    - from: "src/components/layout/Header.tsx"
      to: "/sales"
      via: "mainNavItems entry"
      pattern: "path.*sales.*TrendingUp"
    - from: "src/components/layout/Header.tsx"
      to: "/k3mart-cockpit"
      via: "depotItems entry"
      pattern: "path.*k3mart-cockpit.*Store"
    - from: "src/components/layout/MobileBottomNav.tsx"
      to: "/sales"
      via: "primaryTabs entry"
      pattern: "path.*sales.*TrendingUp"
    - from: "src/components/layout/MobileBottomNav.tsx"
      to: "/k3mart-cockpit"
      via: "moreItems entry"
      pattern: "path.*k3mart-cockpit.*Store"
---

<objective>
Re-enable Sales Analytics and K3Mart Cockpit navigation items in both desktop Header and mobile MobileBottomNav.

Purpose: These pages were hidden in quick task 24 for bandwidth conservation until March 1st. That period is over -- restore navigation access.
Output: Both nav components updated with Sales Analytics and K3Mart Cockpit visible again.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/components/layout/Header.tsx
@src/components/layout/MobileBottomNav.tsx
</context>

## Git Workflow
**Branch:** `feature/27-restore-sales-k3mart-nav`
**Checkpoints:** None (fully autonomous)

## Implementation Waves
### Wave 1: Frontend [PARALLEL]
| Agent | Task | Files |
|-------|------|-------|
| react-ui-builder | Uncomment Sales Analytics + K3Mart nav items | Header.tsx, MobileBottomNav.tsx |

### Wave 2: Verification [SEQUENTIAL]
| Agent | Task |
|-------|------|
| code-auditor | Type check + pattern compliance |
| Bash | npm run build |

## Documentation Updates
- [ ] CHANGELOG.md

## Success Criteria
- [ ] `npm run type-check` passes
- [ ] `npm run build` succeeds
- [ ] Sales Analytics visible in desktop nav after Home
- [ ] K3Mart Cockpit visible in Depots dropdown
- [ ] Sales tab visible in mobile bottom nav
- [ ] K3Mart Cockpit visible in mobile More sheet

<tasks>

<task type="auto">
  <name>Task 1: Restore Sales Analytics and K3Mart Cockpit nav items</name>
  <files>src/components/layout/Header.tsx, src/components/layout/MobileBottomNav.tsx</files>
  <action>
In `src/components/layout/Header.tsx`:
1. Uncomment TrendingUp and Store in the lucide-react import block (lines 17-19). Remove the "BANDWIDTH CONSERVATION" comment above them.
2. In `mainNavItems` array, uncomment the Sales Analytics entry (line 85). Position it AFTER Home and BEFORE Orders. Remove the bandwidth conservation comment. The entry should be: `{ path: '/sales', label: 'Sales', icon: TrendingUp, permission: 'canAccessSalesAnalytics' }`
3. In `depotItems` array, uncomment the K3Mart Cockpit entry (line 95). Position it BEFORE GoFood Depot. Remove the bandwidth conservation comment. The entry should be: `{ path: '/k3mart-cockpit', label: 'K3 Mart', icon: Store, permission: 'canAccessSalesAnalytics' }`

In `src/components/layout/MobileBottomNav.tsx`:
1. Uncomment TrendingUp and Store in the lucide-react import block (lines 4-5, 17). Remove the "BANDWIDTH CONSERVATION" comment.
2. In `primaryTabs` array, uncomment the Sales Analytics entry (line 49). Position it AFTER Home and BEFORE Orders. Remove the bandwidth conservation comment. The entry should be: `{ path: '/sales', icon: TrendingUp, label: 'Sales', permission: 'canAccessSalesAnalytics' }`
3. In `moreItems` array, uncomment the K3Mart Cockpit entry (line 57). Position it as first item in the list. Remove the bandwidth conservation comment. The entry should be: `{ path: '/k3mart-cockpit', icon: Store, label: 'K3 Mart', permission: 'canAccessSalesAnalytics' }`

Do NOT modify HubPage -- it already has both links.
  </action>
  <verify>
    <automated>cd "D:/Claude/Product Manager/product_master" && npx tsc --noEmit 2>&1 | head -20</automated>
    <manual>Visually confirm Sales appears between Home and Orders in Header; K3 Mart appears in Depots dropdown</manual>
  </verify>
  <done>
    - TrendingUp and Store icons imported (not commented) in both files
    - Sales Analytics entry present in mainNavItems (Header) and primaryTabs (MobileBottomNav) after Home, before Orders
    - K3Mart Cockpit entry present in depotItems (Header) and moreItems (MobileBottomNav) as first item
    - All "BANDWIDTH CONSERVATION" comments removed from both files
    - npm run build passes
  </done>
</task>

</tasks>

<verification>
- `npm run type-check` passes with no errors
- `npm run build` succeeds
- grep confirms TrendingUp and Store are imported (not commented) in both files
- grep confirms `/sales` route in mainNavItems and primaryTabs
- grep confirms `/k3mart-cockpit` route in depotItems and moreItems
- No "BANDWIDTH CONSERVATION" comments remain in either file
</verification>

<success_criteria>
- Sales Analytics and K3Mart Cockpit are navigable from both desktop and mobile layouts
- Both use `canAccessSalesAnalytics` permission (manager + admin only)
- Build passes cleanly with no type errors
</success_criteria>

<output>
After completion, create `.planning/quick/27-bring-back-sales-analytics-and-k3mart-co/27-SUMMARY.md`
</output>
