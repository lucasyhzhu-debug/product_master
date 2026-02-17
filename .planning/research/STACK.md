# Stack Research: v1.2 Multi-Channel Dispatch, Kitchen Simplification, Consignment Revenue

**Domain:** Multi-channel FMCG dispatch planning, consignment revenue recognition, kitchen production aggregation, cross-channel analytics
**Researched:** 2026-02-16
**Confidence:** HIGH (existing codebase covers 95% of needs; zero new npm dependencies required)

---

## Key Finding: No New Dependencies Required

All five v1.2 features are achievable with the existing stack. The codebase already has the integration architecture (adapters, token refresh, cron sync, externalRevenue tables), the UI component library (shadcn/ui, Recharts, Radix primitives), and the real-time infrastructure (Convex subscriptions). The work is schema evolution and feature code, not stack changes.

**v1.2 is a pure feature-build milestone. Do not add new npm packages.**

---

## 1. Existing Stack (DO NOT CHANGE)

Already installed, validated, and sufficient for all v1.2 work.

### Core Technologies

| Technology | Version | Purpose | Why Sufficient for v1.2 |
|------------|---------|---------|-------------------------|
| Convex | ^1.31.7 | Real-time serverless backend | Cron jobs, `"use node"` actions, scheduled functions already power GoBiz sync. Adding 3rd outlet is config change only. |
| React | ^19.2.0 | UI framework | Hooks, context, component model handles all new UI (dispatch planner, manual entry forms, consignment workflow). |
| TypeScript | ~5.9.3 | Type safety | Union types for consignment states, channel discriminators already used in schema. |
| Vite | ^7.2.4 | Build tooling | No changes needed. |
| Tailwind CSS | ^4.1.18 | Styling | Dark mode tokens already applied across all pages in v1.1. |
| shadcn/ui (Radix) | Various | UI components | Tabs, dialogs, selects, checkboxes, tooltips -- all needed components already installed. |
| Recharts | ^3.7.0 | Charts | Already powers SalesAnalytics stacked bar charts. Cross-channel analytics extends same patterns. |
| date-fns | ^4.1.0 | Date manipulation | Week number calculation, date ranges, WIB timezone handling already in k3martCockpit/helpers.ts. |
| Framer Motion | ^11.15.0 | Animations | Swipeable kitchen panels already use this. |
| Sonner | ^2.0.7 | Toast notifications | Used throughout for action feedback. |

### Supporting Libraries (Already Installed)

| Library | Version | v1.2 Use Case |
|---------|---------|---------------|
| convex-helpers | ^0.1.112 | Custom function builders, validators |
| @dnd-kit/core + sortable | ^6.3.1 / ^10.0.0 | Drag-and-drop if dispatch planner needs reorder (already installed) |
| lucide-react | ^0.564.0 | Icons for new channel badges, consignment status indicators |
| canvas-confetti | ^1.9.4 | Optional: celebration on consignment cash collection (already installed) |

---

## 2. Feature-Specific Stack Decisions

### Feature 1: 3rd GoJek Outlet (Tamtem/Legato G958262444)

**Stack change: NONE. Config change only.**

The GoBiz integration architecture already supports N outlets:
- `GOBIZ_CONFIG.merchantIds` array in `convex/integrations/gobiz/config.ts` -- add `"G958262444"`
- `GOBIZ_CONFIG.merchantNames` map -- add `"G958262444": "Legato Tamtem"`
- `GOBIZ_OUTLET_SEED` array -- add `{ externalId: "G958262444", name: "Legato Tamtem", source: "gobiz" }`
- `autoSyncGoBizRevenue` in adapter.ts already iterates all `merchantIds` -- no code change needed
- Run `seedGoBizOutlets` mutation to create the externalOutlets row

**Verification:** The existing `autoSyncGoBizRevenue` cron (7x daily) and `autoRefreshGoBizToken` cron (every 30min) handle all outlets with a single shared token. The GoBiz API uses one credential set across all merchant IDs.

### Feature 2: Multi-Channel Dispatch Planner (evolved K3Mart cockpit)

**Stack change: NONE. Schema evolution + new UI.**

Current K3Mart cockpit (`k3martDispatchPlans`, `k3martStockMovements`) is single-channel. Evolution path:

| Current | Evolution | Stack Impact |
|---------|-----------|-------------|
| `k3martDispatchPlans` table | Add channel-agnostic `dispatchPlans` table OR extend existing with `channel` field | Schema migration only |
| K3Mart-only outlet filter | Multi-source filter (K3Mart, Legato GF, Legato Tamtem) | Convex query filter change |
| `restockTargets` per outlet | Already has `channel` field -- extend to cover all consignment channels | Already designed for this |
| Weekly grid view | Extend to cover all dispatch destinations | React component, same Recharts/Radix primitives |

**Key decision:** Extend `k3martDispatchPlans` with a `channel` discriminator rather than creating a parallel table. The existing schema already has `outletId` (references `externalOutlets`) which can point to any outlet, not just K3Mart. The table name is misleading but the schema is already channel-agnostic.

**No new library needed.** The weekly planner UI pattern (grid of dates x products x outlets) reuses existing Radix Tabs, Tailwind grid, and date-fns week utilities.

### Feature 3: Kitchen Simplification with Audio Alerts

**Stack change: NONE. Use native Web Audio API for sound.**

| Concern | Decision | Rationale |
|---------|----------|-----------|
| Audio alerts | Web Audio API (`AudioContext`) | Zero-dependency. Browser-native. Works on mobile Chrome/Safari. No npm package needed. |
| Audio library alternative | Do NOT add `howler.js` or `use-sound` | Overkill for simple beep/chime alerts. AudioContext can generate tones procedurally with ~15 lines of code. |
| Notification API | Do NOT use | Custom sound was removed from the Notification API spec in 2018. Browser notifications cannot play custom sounds. |
| Aggregated daily targets | Convex query aggregation | Already done in `productionTargets` + `productionProductTargets` queries. Simplification is UI-only. |

**Audio implementation pattern (no dependency):**
```typescript
// Utility: play a simple alert tone using Web Audio API
function playAlertTone(frequency = 800, duration = 200) {
  const ctx = new AudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.frequency.value = frequency;
  gain.gain.value = 0.3;
  osc.start();
  osc.stop(ctx.currentTime + duration / 1000);
}
```

**Important constraint:** AudioContext requires a user gesture (click/tap) to initialize on mobile browsers. The kitchen view should initialize AudioContext on first user interaction, then reuse it for subsequent alerts. This is a browser security policy, not a library limitation.

### Feature 4: Cross-Channel Analytics with Manual Sales Entry

**Stack change: NONE. Existing schema already designed for this.**

The `externalRevenue` table already supports manual entry:
- `dataOrigin: "manual_entry"` -- already in the schema union
- `source: v.union("k3mart", "gobiz", "internal")` -- extend union to add `"shopee"`, `"tiktok"`, `"direct"`
- `confidence: "manual"` -- already in the schema union

| Concern | Decision | Rationale |
|---------|----------|-----------|
| Manual sales form | Convex mutation + React form | Standard pattern already used in 15+ entity pages |
| CSV upload for Shopee/TikTok | `dataOrigin: "csv_upload"` already in schema | Parse CSV client-side with native `FileReader` + `String.split()`. Do NOT add `papaparse` -- the CSV format is simple (date, product, quantity, price). |
| Cross-channel chart | Extend existing Recharts stacked bar | Already platform-colored in SalesAnalytics OverviewTab. Add new channel colors. |
| Channel selector | Existing Radix Select component | Already have `orders.channel` union with 10+ channels |

**Schema evolution needed:** Add new source literals to `externalRevenue.source` union. Current: `"k3mart" | "gobiz" | "internal"`. Needed: add `"shopee" | "tiktok" | "direct"`. This is a schema.ts change, not a library change.

### Feature 5: Consignment Revenue Recognition Workflow

**Stack change: NONE. New tables + state machine in Convex.**

Consignment flow is a business logic pattern (production -> dispatch -> sale confirmation -> cash collection), not a technology problem. Implementation uses:

| Component | Technology | Notes |
|-----------|-----------|-------|
| State machine | Convex union types + mutation guards | Same pattern as order status transitions (`statusTransitions.ts`) |
| Cash collection tracking | New `consignmentSettlements` table | Convex table + mutations |
| Settlement schedule | Convex cron or scheduled function | K3Mart: 2x/month, Legato: 1x/week. Use `crons.ts` pattern. |
| Revenue recognition date | Timestamp field on settlement record | When cash is collected, not when product is dispatched |
| Reporting | Extend existing `externalRevenue` queries | Already has `periodStart`/`periodEnd` for time-range queries |

**Key schema additions (no npm changes):**
- `consignmentBatches` table: tracks dispatched inventory per outlet per date
- `consignmentSettlements` table: tracks cash collection events
- State: `dispatched` -> `sale_confirmed` -> `settled` -> `reconciled`

---

## 3. What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `howler.js` / `use-sound` | Overkill for simple alert tones. Adds 15KB+ for what AudioContext does in 15 lines. | Native Web Audio API `AudioContext` |
| `papaparse` | CSV parsing for Shopee/TikTok exports is simple tabular data. Native `FileReader` + `split()` handles it. | Native browser APIs |
| `zustand` / `jotai` | State management libraries. Convex real-time queries already serve as the reactive store. Local UI state is minimal. | React `useState` + Convex `useQuery` |
| `react-table` / `@tanstack/table` | Tempting for dispatch grid, but adds complexity. The grid is a fixed product x date matrix, not a dynamic table. | Tailwind CSS grid + manual rendering |
| `xstate` | State machine library. The consignment workflow has 4 states and linear transitions. Union types + switch statements suffice. | Convex union types + helper functions |
| `recharts` upgrade | Already on ^3.7.0 which is current. Do not upgrade mid-milestone. | Keep current version |
| New charting library | Recharts already handles stacked bars, line charts, and tooltips. No need for `nivo`, `victory`, or `chart.js`. | Recharts ^3.7.0 |
| `date-fns-tz` | Timezone handling is already manual (WIB = UTC+7 offset). The codebase consistently uses `+ 7 * 60 * 60 * 1000`. Don't introduce a second timezone approach mid-project. | Continue manual WIB offset pattern |

---

## 4. Schema Evolution (Not Stack, But Critical)

These are the data model changes needed. No npm packages, just `convex/schema.ts` updates.

### New Tables

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `consignmentBatches` | Track dispatched inventory to consignment outlets | `outletId`, `date`, `menuProductId`, `quantityDispatched`, `quantitySold`, `quantityReturned`, `status` |
| `consignmentSettlements` | Cash collection events | `outletId`, `periodStart`, `periodEnd`, `expectedAmount`, `collectedAmount`, `collectedAt`, `status` |

### Schema Modifications

| Table | Change | Reason |
|-------|--------|--------|
| `externalRevenue.source` | Add `"shopee"`, `"tiktok"`, `"direct"` to union | Cross-channel analytics manual entry |
| `orders.channel` | Add `"gofood_tamtem"` to union | 3rd GoJek outlet channel tracking |
| `externalOutlets.source` | Potentially add `"legato"` or reuse `"gobiz"` | Legato consignment outlets if distinct from GoBiz |
| `k3martDispatchPlans` | Add `channel` field or rename conceptually | Multi-channel dispatch (may keep table name for backward compat) |
| `kitchenConfig` | Add `audioAlertEnabled`, `alertThresholdPct` | Kitchen audio alert preferences |

---

## 5. Installation

```bash
# No new packages to install.
# v1.2 is purely feature code on top of the existing stack.

# Verify current stack is healthy:
npm run type-check
npm run build
```

---

## 6. Version Compatibility

All existing packages are compatible. No version conflicts.

| Package | Current Version | Status | Notes |
|---------|----------------|--------|-------|
| convex | ^1.31.7 | Current | Supports all needed features (crons, actions, scheduled functions) |
| react | ^19.2.0 | Current | Stable release, no breaking changes expected |
| recharts | ^3.7.0 | Current | Stacked bar charts, tooltips, responsive containers all working |
| date-fns | ^4.1.0 | Current | Week number, date range, format utilities all used |
| tailwindcss | ^4.1.18 | Current | Dark mode, custom tokens, responsive grid all working |

---

## 7. Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| Web Audio API for alerts | `howler.js` | Dependency for trivial use case. AudioContext is 15 lines. |
| Native FileReader for CSV | `papaparse` | Shopee/TikTok CSVs are simple. No complex parsing needed. |
| Manual WIB offset | `date-fns-tz` | Existing codebase uses manual offset consistently. Mixing approaches creates bugs. |
| Extend `k3martDispatchPlans` | New `dispatchPlans` table | Existing table schema is already channel-agnostic via `outletId`. Renaming is cosmetic. |
| Convex union types for state | `xstate` | 4-state linear workflow. State machine library is overkill. |
| Extend existing crons.ts | Runtime cron component | Built-in crons are sufficient. Only need to add settlement reminder crons. |

---

## Sources

- Codebase analysis: `convex/integrations/gobiz/config.ts`, `convex/integrations/gobiz/adapter.ts`, `convex/schema.ts` (59 tables), `convex/crons.ts` -- HIGH confidence
- Codebase analysis: `convex/k3martCockpit/`, `convex/reports/dailySales.ts`, `src/pages/SalesAnalytics.tsx` -- HIGH confidence
- Web Audio API: [MDN Notifications API](https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API), [OurCodeWorld AudioContext guide](https://ourcodeworld.com/articles/read/1627/how-to-easily-generate-a-beep-notification-sound-with-javascript) -- HIGH confidence (browser-native API)
- Convex scheduling: [Convex Cron Jobs docs](https://docs.convex.dev/scheduling/cron-jobs), [Convex Scheduled Functions docs](https://docs.convex.dev/scheduling/scheduled-functions) -- HIGH confidence
- `package.json` analysis: all 35 dependencies verified current -- HIGH confidence

---
*Stack research for: v1.2 Multi-Channel Dispatch, Kitchen Simplification, Consignment Revenue*
*Researched: 2026-02-16*
