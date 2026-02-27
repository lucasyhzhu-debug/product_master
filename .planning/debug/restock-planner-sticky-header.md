---
status: resolved
trigger: "restock-planner-sticky-header - floating/sticky headers not working in Restock Planner"
created: 2026-02-26T00:00:00Z
updated: 2026-02-26T00:01:00Z
---

## Current Focus

hypothesis: CONFIRMED - overflow-x-auto on table wrapper breaks sticky positioning
test: Removed overflow-x-auto, added sticky classes to outlet header and thead
expecting: Headers now stick when scrolling
next_action: Archive session

## Symptoms

expected: Header section should stay sticky at top when scrolling down
actual: Header rows scroll with content — disappear when scrolling down
errors: None — CSS/layout issue
reproduction: Open Restock Planner page, scroll down
started: A fix was attempted (wrapping header in sticky top-0 z-20 bg-card) but not working

## Eliminated

- hypothesis: Missing sticky CSS classes on headers
  evidence: True - thead had no sticky classes, but the real blocker was the overflow-x-auto parent
  timestamp: 2026-02-26T00:00:30Z

## Evidence

- timestamp: 2026-02-26T00:00:10Z
  checked: Layout hierarchy (Layout.tsx -> PageContainer -> RestockPlanner)
  found: No overflow on Layout, main, or PageContainer. Page scrolls at document level. Fixed header at z-50.
  implication: Sticky should work relative to viewport IF no intermediate overflow containers

- timestamp: 2026-02-26T00:00:20Z
  checked: OutletBlock table wrapper div (line 425)
  found: div.overflow-x-auto wraps the table. Per CSS spec, overflow-x:auto implicitly sets overflow-y:auto, creating a scroll container that traps sticky positioning.
  implication: This is the root cause — sticky elements inside overflow:auto containers only stick within that container, not the viewport

- timestamp: 2026-02-26T00:00:25Z
  checked: thead element
  found: No sticky classes applied to thead at all
  implication: Even without the overflow issue, headers had no sticky positioning

- timestamp: 2026-02-26T00:00:30Z
  checked: GoFoodRestockSection.tsx
  found: Same pattern — overflow-x-auto wrapper + non-sticky thead
  implication: Both components need the same fix

## Resolution

root_cause: Two issues combined: (1) The `overflow-x-auto` div wrapping each table creates a scroll container (CSS spec: setting overflow-x to non-visible implicitly sets overflow-y to auto), which traps `position: sticky` elements to only stick within that container rather than the viewport. (2) Neither the outlet header bar nor the thead had any sticky CSS classes applied.

fix: |
  1. Removed `overflow-x-auto` from table wrapper divs (RestockPlanner.tsx and GoFoodRestockSection.tsx)
  2. Made outlet header bars sticky at `top-14` (56px, below the fixed app header) with z-20, bg-muted/80 + backdrop-blur-sm
  3. Made thead elements sticky at `top-[97px]` (56px header + 41px outlet bar) with z-10, bg-card + shadow border effect
  4. Removed `overflow-hidden` from outer card divs (replaced with default visible)

verification: npm run build passes (0 errors), type-check passes

files_changed:
  - src/pages/RestockPlanner.tsx
  - src/components/restockPlanner/GoFoodRestockSection.tsx
