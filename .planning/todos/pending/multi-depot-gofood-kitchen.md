---
title: "Multi-depot GoFood kitchen flow redesign"
area: kitchen
priority: high
milestone: v1.1
created: 2026-02-14
---

## Context

GoFood will soon have 2 depots instead of 1 (Goldfinch). The current kitchen packing flow hardcodes "Ship to Goldfinch" as the only depot destination. This needs a rethink for how orders are routed and packed across multiple depots.

## Affected Areas

- `src/components/kitchen/PackingPanel.tsx` - Currently assumes single depot
- `src/pages/KitchenViewV2.tsx` - GoFood packing data built around single depot
- `convex/k3martKitchen/queries.ts` - Depot stock tracking
- Kitchen flow UX - How staff select/see which depot to pack for

## Requirements (Draft)

- Support N depots for GoFood (not just Goldfinch)
- Kitchen packing UI shows which depot each order/batch ships to
- Depot stock tracking per-depot (not aggregated)
- May need to rethink kitchen flow more elegantly overall

## Notes

User flagged this during Phase 9 UAT. Deferred to milestone v1.1 to avoid scope creep in current cleanup milestone.
