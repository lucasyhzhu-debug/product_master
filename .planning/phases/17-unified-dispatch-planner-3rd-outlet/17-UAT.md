---
status: resolved
phase: 17-unified-dispatch-planner-3rd-outlet
source: 17-01-SUMMARY.md, 17-02-SUMMARY.md, 17-03-SUMMARY.md, 17-04-SUMMARY.md, 17-05-SUMMARY.md
started: 2026-02-17T04:10:00Z
updated: 2026-02-21T03:10:30Z
---

## Current Test

[testing complete]

## Tests

### 1. Navigate to Dispatch Planner
expected: In the header navigation, a "Dispatch" link with CalendarRange icon appears for Manager/Admin. Clicking it navigates to /dispatch-planner and shows the Dispatch Planner page with a 7-day grid layout.
result: issue
reported: "the 'back to today' takes me back 1 week too far, the dates at the top doesn't match the calendar below. Also capacity bar hover tooltip is clipped by the section line."
severity: major

### 2. Week Navigation
expected: Above the grid, left/right arrow buttons shift the 7-day view by one week. A "Today" button returns to the current week. The date range label updates (e.g., "Feb 17 - Feb 23, 2026").
result: pass

### 3. Channel Groups Display
expected: The grid shows 4 channel sections: Direct Sales (blue), GoFood (green), K3Mart (orange), and Other Consignment (gray). Each has a colored left border and channel name header. Under GoFood, 3 outlets appear (Legato Goldfinch, GoFood Crystal, Legato Tamtem). Under Other Consignment, 2 outlets (Legato Tamtem, Legato Goldfinch).
result: issue
reported: "they all appear but i don't see the ability to edit any fields apart from other consignments. Also we don't need a commissions % at the channel level in settings, we already track net sales vs gross sales from gofood and k3mart apis"
severity: major

### 4. Open Channel Settings Dialog
expected: A gear icon button on the planner page opens a settings dialog with 4 tabs: Priorities, Channels, Outlets, and Capacity.
result: pass

### 5. Channel Priority Reorder
expected: In the Priorities tab of settings, 4 channels are listed with up/down arrow buttons. Clicking down on "Direct Sales" moves it below "GoFood". The change saves and the planner grid reorders to match the new priority.
result: pass

### 6. Commission Rates and Channel Toggle
expected: In the Channels tab, each channel has an enable/disable switch and a commission rate input (%). Toggling a channel off removes it from the planner grid. Changing commission rate (e.g., GoFood from 19% to 20%) saves on blur.
result: pass
reported: "pass - remove the commissions here - you can combine this with the priority reorder tab to save on clicks"
severity: minor

### 7. Consignment Outlet Management
expected: In the Outlets tab, existing consignment outlets (Legato Tamtem, Legato Goldfinch) are listed. "Add Outlet" button shows an inline form with name, optional commission rate override, and product mapping (internal product → external name + price). Creating an outlet adds it to the planner grid under Other Consignment.
result: pass

### 8. Daily Capacity Setting
expected: In the Capacity tab, a number input shows current daily capacity (default 200). Changing it to a different value (e.g., 250) and saving updates the capacity bars in the grid to use the new threshold.
result: pass

### 9. Edit Future Day Cell
expected: Clicking a future day cell (not today or past) shows an editable number input. Typing a quantity (e.g., 15) and clicking away (blur) saves the value immediately. The cell displays the saved number and the daily total/capacity bar updates.
result: issue
reported: "can't edit anything; only in other consignments do we have editable text boxes; also - have a way for us to edit which products to update or remove - because brochure-how to eat is not a product i need to plan for"
severity: major

### 10. Past Days Are Read-Only
expected: Past day columns have a dimmed/muted background. Clicking a cell in a past day does NOT open an editable input. The cells show actual sales data or "--" placeholder.
result: pass

### 11. Capacity Bar Visualization
expected: Each day column header has a segmented colored bar. The bar shows proportional segments for each channel (blue=Direct, green=GoFood, orange=K3Mart, gray=Consignment). A total number shows below (e.g., "185/200"). If total exceeds capacity, a red indicator appears.
result: pass

### 12. Collapse and Expand Channel Groups
expected: Clicking a channel header row collapses the channel group, hiding outlet/product rows but showing a subtotal row with per-day totals. Clicking again expands to show all outlet and product rows. Animation is smooth.
result: pass

### 13. Simulate Inventory
expected: A "Simulate Inventory" button on the page triggers an inventory check. After clicking, day columns get colored left borders: green (sufficient), yellow (low), or red (out of stock). Hovering shows details of which packaging items are short.
result: issue
reported: "when i click it nothing happens not even a sonner message"
severity: major

## Summary

total: 13
passed: 8
issues: 4
pending: 0
skipped: 0

## Gaps

- truth: "Header date range matches grid column dates, and Back to Today returns to current week"
  status: resolved
  reason: "User reported: header shows Feb 16-22 but grid shows Feb 9-15 (1 week ahead). Back to Today goes 1 week too far back."
  severity: major
  test: 1
  root_cause: "Timezone bug in getCurrentMonday() and getWeekDates() — getDay() uses browser local timezone on Date created with +07:00 offset. When browser timezone != Jakarta, Monday detected as Sunday, shifting everything by 1 week."
  artifacts:
    - path: "src/components/dispatchPlanner/WeekNav.tsx"
      issue: "getCurrentMonday() and formatDateRange() use getDay() without Jakarta timezone"
    - path: "convex/k3martCockpit/helpers.ts"
      issue: "getWeekDates() uses getDay() on Date with +07:00 offset — returns wrong day in UTC"
  missing:
    - "Use toLocaleDateString with timeZone:'Asia/Jakarta' to get day-of-week, or compute day-of-week from UTC offset"
  debug_session: ""

- truth: "Capacity bar hover tooltip is fully visible above other content"
  status: resolved
  reason: "User reported: hover information is clipped by the section line, should appear over it or use click-to-expand"
  severity: cosmetic
  test: 1
  root_cause: "CSS overflow/z-index issue — tooltip from CapacityBar is clipped by parent container overflow"
  artifacts:
    - path: "src/components/dispatchPlanner/CapacityBar.tsx"
      issue: "Tooltip or popover clipped by parent overflow:hidden or low z-index"
  missing:
    - "Add overflow-visible to capacity bar container or use Popover/Portal for tooltip rendering"
  debug_session: ""

- truth: "All channel cells are editable for future days, not just Other Consignment"
  status: resolved
  reason: "User reported: can't edit any fields apart from other consignments"
  severity: major
  test: 3
  root_cause: "Direct Sales cells hardcoded isReadOnly:true in queries.ts lines 289-308 (all 3 scenarios). K3Mart intentionally read-only. GoFood correctly set but needs verification. Only Consignment uses isReadOnly:isPast pattern."
  artifacts:
    - path: "convex/dispatchPlanner/queries.ts"
      issue: "Direct Sales assembleDirectChannel hardcodes isReadOnly:true for all cells (lines 289-308)"
    - path: "src/components/dispatchPlanner/ChannelGroup.tsx"
      issue: "Line 271: cellReadOnly = !isEditable || cell?.isReadOnly — compounds backend flag"
  missing:
    - "Change Direct Sales cells from isReadOnly:true to isReadOnly:isPast (matching Consignment pattern)"
    - "Verify GoFood future cells correctly editable end-to-end"
  debug_session: ""

- truth: "Commission % is not needed at channel level — net/gross already tracked from APIs"
  status: resolved
  reason: "User reported: we don't need commissions % at the channel level in settings, we already track net sales vs gross sales from gofood and k3mart apis"
  severity: minor
  test: 3
  root_cause: "commissionRate field exists on dispatchChannelConfig (schema line 1267) and dispatchConsignmentOutlets (line 1285) but is unused — GoFood/K3Mart already provide net/gross via externalRevenue table"
  artifacts:
    - path: "convex/schema.ts"
      issue: "dispatchChannelConfig.commissionRate (line 1267) and dispatchConsignmentOutlets.commissionRate (line 1285) — unused fields"
    - path: "convex/dispatchPlanner/mutations.ts"
      issue: "updateChannelConfig, addConsignmentOutlet, updateConsignmentOutlet accept commissionRate params"
    - path: "src/components/dispatchPlanner/ChannelSettingsDialog.tsx"
      issue: "Commission rate input fields in ChannelSettingsRow (lines 463-487) and OutletEditForm (lines 769-784)"
  missing:
    - "Remove commissionRate from schema, mutations, seed data, and all UI inputs"
  debug_session: ""

- truth: "Merge Channels tab into Priorities tab — combine enable/disable toggle with priority reorder"
  status: resolved
  reason: "User reported: remove the commissions here, combine this with the priority reorder tab to save on clicks"
  severity: minor
  test: 6
  root_cause: "Separate Priorities tab (ChannelPriorityList lines 214-298) and Channels tab (ChannelSettingsList lines 303-491) in ChannelSettingsDialog.tsx — redundant separation"
  artifacts:
    - path: "src/components/dispatchPlanner/ChannelSettingsDialog.tsx"
      issue: "4-tab layout (lines 132-200) with separate Priorities and Channels tabs that should be merged"
  missing:
    - "Merge ChannelPriorityList and ChannelSettingsList into single component with priority arrows + enable/disable toggle per row"
    - "Reduce tabs from 4 to 3 (Channels, Outlets, Capacity)"
  debug_session: ""

- truth: "Manager can configure which products appear in the planner grid (exclude non-plannable items like Brochure)"
  status: resolved
  reason: "User reported: have a way for us to edit which products to update or remove - brochure-how to eat is not a product i need to plan for"
  severity: major
  test: 9
  root_cause: "Query loads ALL active menuProducts without filtering by productType. assembleXxxChannel functions include packaging-only items (like Brochure-How to Eat) in the grid."
  artifacts:
    - path: "convex/dispatchPlanner/queries.ts"
      issue: "Lines 146-153: loads all active menuProducts. assembleGofoodChannel, assembleK3martChannel, assembleConsignmentChannel don't filter by productType"
    - path: "convex/schema.ts"
      issue: "menuProducts.productType field (line 70-73) exists with 'food'|'packaging' but not used for filtering"
  missing:
    - "Filter products in backend query: only include productType==='food' or undefined (exclude 'packaging')"
    - "Optionally add product visibility toggle in Settings for manual exclusions"
  debug_session: ""

- truth: "Simulate Inventory button triggers inventory check and shows visual feedback"
  status: resolved
  reason: "User reported: when i click it nothing happens not even a sonner message"
  severity: major
  test: 13
  root_cause: "Render-time state update bug in DispatchPlanner.tsx lines 134-137: setSimulationLoading(false) called during render body instead of useEffect. No toast feedback on completion or error."
  artifacts:
    - path: "src/pages/DispatchPlanner.tsx"
      issue: "Lines 134-137: render-time state update violates React rules, causes unstable re-renders. Lines 126-130: handleSimulate sets state but no toast on completion."
    - path: "convex/dispatchPlanner/queries.ts"
      issue: "simulateInventory query (lines 654-790) is implemented but frontend never stabilizes to display results"
  missing:
    - "Move simulation completion detection into useEffect hook"
    - "Add toast.success/toast.error for simulation feedback"
    - "Verify componentStock query path exists (line 695)"
  debug_session: ""
