---
phase: 33-combine-sync-actions-into-platform-health
plan: 33
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/salesAnalytics/PlatformSyncPanel.tsx
  - src/components/salesAnalytics/SettingsTab.tsx
autonomous: true
requirements: [QUICK-33]
must_haves:
  truths:
    - "K3Mart platform health card expands to show Sync Sales (with date range) and Refresh Stores buttons"
    - "GoBiz platform health card expands to show Sync Journals button with date range inputs"
    - "Internal Orders platform health card expands to show Sync button (no date filter)"
    - "The standalone Sync Actions section is completely removed"
    - "BigSeller expand/collapse continues to work exactly as before"
  artifacts:
    - path: "src/components/salesAnalytics/PlatformSyncPanel.tsx"
      provides: "Reusable sync panel component with date range inputs + sync button + loading state"
      min_lines: 60
    - path: "src/components/salesAnalytics/SettingsTab.tsx"
      provides: "Updated settings tab with per-platform expandable sync sections, no standalone sync actions"
  key_links:
    - from: "src/components/salesAnalytics/PlatformSyncPanel.tsx"
      to: "src/hooks/convex/useExternalData.ts"
      via: "sync hook consumption (useSyncK3MartSales, useSyncGoBiz, etc.)"
      pattern: "useSyncK3MartSales|useSyncGoBiz|useSyncInternalOrders|useDiscoverK3MartOutlets"
    - from: "src/components/salesAnalytics/SettingsTab.tsx"
      to: "src/components/salesAnalytics/PlatformSyncPanel.tsx"
      via: "renders PlatformSyncPanel inside each expanded platform card"
      pattern: "PlatformSyncPanel"
---

<objective>
Move all sync action buttons from the standalone "Sync Actions" section into their respective platform health card expandable dropdowns, following the existing BigSeller expand/collapse pattern.

Purpose: Consolidate scattered sync controls into contextually appropriate locations — each platform's health card becomes the single place to view status AND trigger syncs.
Output: Updated SettingsTab with inline sync panels per platform card, standalone sync section removed.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/components/salesAnalytics/SettingsTab.tsx
@src/components/salesAnalytics/BigSellerSyncPanel.tsx
@src/components/salesAnalytics/IntegrationHealthCard.tsx
@src/hooks/convex/useExternalData.ts

<interfaces>
<!-- Backend action signatures (from convex/integrations/*/adapter.ts) -->

K3Mart syncK3MartSales args:
  - triggeredBy: v.optional(v.string())
  - fromDate: v.optional(v.string())    // YYYY-MM-DD
  - toDate: v.optional(v.string())      // YYYY-MM-DD

K3Mart discoverK3MartOutlets args:
  - triggeredBy: v.optional(v.string())

GoBiz syncGoBizRevenue args:
  - daysBack: v.optional(v.number())    // defaults to GOBIZ_CONFIG.sync.defaultDaysBack
  - triggeredBy: v.optional(v.string())

Internal syncInternalOrders args:
  - triggeredBy: v.optional(v.string())  // No date filter — scans all completed orders

<!-- Frontend hook signatures (from src/hooks/convex/useExternalData.ts) -->
useSyncK3MartSales() -> useAction(api.integrations.k3mart.adapter.syncK3MartSales)
useDiscoverK3MartOutlets() -> useAction(api.integrations.k3mart.adapter.discoverK3MartOutlets)
useSyncGoBiz() -> useAction(api.integrations.gobiz.adapter.syncGoBizRevenue)
useSyncInternalOrders() -> useAction(api.integrations.internal.adapter.syncInternalOrders)

<!-- Platform IDs (from convex/integrations/registry.ts) -->
PlatformId = "k3mart" | "gobiz" | "internal" | "grabfood" | "bigseller" | "consignment"
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create PlatformSyncPanel component</name>
  <files>src/components/salesAnalytics/PlatformSyncPanel.tsx</files>
  <action>
Create a reusable sync panel component that renders inside expanded platform health card sections. This is a simpler version of BigSellerSyncPanel (which has 5-step progress tracking we don't need here).

Props interface:
```typescript
interface PlatformSyncPanelProps {
  platformId: "k3mart" | "gobiz" | "internal";
  // Date range support varies by platform
  showDateRange: boolean;
  // Optional secondary action (K3Mart has "Refresh Stores" alongside "Sync Sales")
  secondaryAction?: {
    label: string;
    loadingLabel: string;
    onAction: () => Promise<void>;
  };
  // Primary sync function — receives fromDate/toDate if showDateRange is true
  onSync: (params: { fromDate?: string; toDate?: string }) => Promise<void>;
  // Loading states
  isSyncing: boolean;
}
```

Implementation:
- Date range inputs (start date, end date) with 31-day max range validation — same pattern as BigSellerSyncPanel (Input type="date", h-8 text-xs w-[130px], "Start Date" and "End Date" labels). Only shown when `showDateRange` is true.
- Default startDate = 30 days ago, default endDate = today (same as BigSellerSyncPanel).
- "Sync Now" primary button with Loader2 spinning icon when syncing, RefreshCw icon when idle.
- Optional secondary button rendered inline (e.g., "Refresh Stores" for K3Mart).
- Use `toast` for date validation errors only (31-day max, start before end). Do NOT toast on sync success/failure — the parent (SettingsTab) already handles toasts in the existing handler functions. PlatformSyncPanel just calls onSync/secondaryAction and lets the parent handle results.
- For Internal platform (showDateRange=false): just renders the sync button, no date inputs.
- Style: match BigSellerSyncPanel layout — `space-y-3`, flex-wrap items-end gap-2, same Input and Button sizing.
- Do NOT include progress tracking or summary cards (those are BigSeller-specific features).
  </action>
  <verify>
    <automated>npx tsc --noEmit --pretty 2>&1 | head -20</automated>
  </verify>
  <done>PlatformSyncPanel.tsx exists with typed props, renders date inputs conditionally, sync button with loading state, and optional secondary action button. TypeScript compiles cleanly.</done>
</task>

<task type="auto">
  <name>Task 2: Wire PlatformSyncPanel into SettingsTab and remove Sync Actions section</name>
  <files>src/components/salesAnalytics/SettingsTab.tsx</files>
  <action>
Modify SettingsTab to:

1. **Add expand state for K3Mart, GoBiz, and Internal** — add three new useState booleans:
   - `k3martExpanded`, `gobizExpanded`, `internalExpanded` (all default false)

2. **Add expand/collapse chevron buttons** for K3Mart, GoBiz, and Internal cards in the health card grid. Follow the exact same pattern used for BigSeller (lines 206-230 in current file):
   - For each platform card in the `.map()`, add a conditional block checking `health.platformId === "k3mart"` (and gobiz, internal).
   - Render a chevron toggle button (Button variant="ghost" size="sm" h-7 w-7 p-0) in a div alongside the IntegrationHealthCard, using the same `flex items-center` wrapper as BigSeller.
   - For K3Mart, no badge needed (unlike BigSeller's unmapped SKU badge).

3. **Render PlatformSyncPanel in expanded sections** — for each of the three platforms, add a conditional expanded section below the card row (same pattern as BigSeller's `border-t px-4 py-3 space-y-4 bg-muted/20`):

   **K3Mart** (`health.platformId === "k3mart" && k3martExpanded`):
   - `showDateRange={true}`
   - `onSync` calls the existing `handleSyncK3MartSales` but modified to accept and pass `fromDate`/`toDate` params from the panel. Update handleSyncK3MartSales to accept optional `{ fromDate, toDate }` and pass them to `syncK3MartSales({ triggeredBy: "settings", fromDate, toDate })`.
   - `secondaryAction` wires to existing `handleDiscoverK3MartOutlets` with label "Refresh Stores" / loadingLabel "Discovering..."
   - `isSyncing={syncingK3MartSales || discoveringK3Mart}`

   **GoBiz** (`health.platformId === "gobiz" && gobizExpanded`):
   - `showDateRange={true}`
   - `onSync` calls `handleSyncGoBiz` but converts the date range to `daysBack`. Update handleSyncGoBiz to accept optional `{ fromDate, toDate }` — if both provided, compute daysBack as `Math.ceil((Date.now() - new Date(fromDate).getTime()) / (24*60*60*1000))`, otherwise use default (no daysBack param). Pass `{ triggeredBy: "settings", daysBack }` to syncGoBiz.
   - No secondary action.
   - `isSyncing={syncingGoBiz}`

   **Internal** (`health.platformId === "internal" && internalExpanded`):
   - `showDateRange={false}` — internal sync has no date parameters
   - `onSync` calls existing `handleSyncInternal` (ignores date params since showDateRange is false).
   - No secondary action.
   - `isSyncing={syncingInternal}`

4. **Remove the entire "Sync Actions" section** — delete the `{canViewHealth && (...)}` block (lines ~254-289 in current file) that renders the standalone sync buttons with the "Sync Actions" h3 heading.

5. **Generalize the expand toggle rendering** — instead of only checking `health.platformId === "bigseller"` for the chevron button, expand the conditional to also cover k3mart, gobiz, internal. Each gets its own expand state variable. The chevron button pattern is identical for all four platforms.

6. **Import PlatformSyncPanel** at the top of the file.

7. **Keep all existing handler functions** (handleSyncK3MartSales, handleDiscoverK3MartOutlets, handleSyncGoBiz, handleSyncInternal) but update their signatures to accept optional date params as described above. The toast handling stays in SettingsTab.
  </action>
  <verify>
    <automated>npm run build 2>&1 | tail -5</automated>
  </verify>
  <done>
- K3Mart health card has expand toggle; when expanded shows date range inputs + "Sync Now" + "Refresh Stores" buttons.
- GoBiz health card has expand toggle; when expanded shows date range inputs + "Sync Now" button.
- Internal Orders health card has expand toggle; when expanded shows "Sync Now" button (no date inputs).
- BigSeller expand/collapse unchanged (still uses BigSellerSyncPanel + BigSellerOrdersTable).
- Standalone "Sync Actions" section completely removed.
- `npm run build` passes.
  </done>
</task>

</tasks>

<verification>
1. `npm run build` passes without errors
2. No TypeScript errors from `npx tsc --noEmit`
3. Visual check: Settings tab shows no "Sync Actions" section
4. Visual check: K3Mart, GoBiz, Internal cards each have chevron expand toggles
5. Visual check: Expanding K3Mart shows date inputs + two buttons (Sync Sales, Refresh Stores)
6. Visual check: Expanding GoBiz shows date inputs + one button
7. Visual check: Expanding Internal shows just one sync button (no date inputs)
8. BigSeller expand still works identically to before
</verification>

<success_criteria>
- All sync controls consolidated into their respective platform health cards
- "Sync Actions" section removed from the Settings tab
- Date range inputs work for K3Mart (fromDate/toDate) and GoBiz (converted to daysBack)
- Internal Orders sync works without date parameters
- Build passes, no TypeScript errors
</success_criteria>

<output>
After completion, create `.planning/quick/33-combine-sync-actions-into-platform-healt/33-SUMMARY.md`
</output>
