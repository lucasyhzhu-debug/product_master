# Quick Task 260409-paq: Align Production Targets with Production Components - Context

**Gathered:** 2026-04-09
**Status:** Ready for planning

<domain>
## Task Boundary

Make production targets toggles consistent with production components. Tier-1 components (used inside product BOM via menuProductComponents) tracked as pieces. Leaf components (contributing to tier-1 components) tracked as grams. Unify kitchen components source from componentTypes instead of separate kitchenComponents table.

</domain>

<decisions>
## Implementation Decisions

### Data Source Unification
- **Decision:** Derive kitchen components from `componentTypes` table where `tier=0` (leaf, no children in productionComponentLinks). Retire the separate `kitchenComponents` table.
- **Rationale:** componentTypes already contains ALL production components with tier computation via `getComponentsWithTiers`. The kitchenComponents table duplicates leaf data (Outer-Marshmallow, Filling-Pistachio, etc.).

### Toggle Filtering Logic
- **Decision:** Split Manager Settings toggles:
  - "Production Components" section → only tier-1+ components (Dubai-Regular, Nutella-Regular, Jumbo) — tracked as **pieces**
  - "Kitchen Components" section → only tier-0 / leaf components (Outer-Marshmallow, Filling-Pistachio, Nutella Filling, etc.) — tracked as **grams**
- **Source:** Both sections derived from `componentTypes` (category="production"), split by computed tier.

### Shift Form Display
- **Decision:** No targets for gram-tracked components in the "Components Produced" section of the shift form. Keep input fields only (no target numbers).

</decisions>

<specifics>
## Specific Ideas

- Nutella Filling (NUTELLA_FILLING, tier-0) must appear in Kitchen Components toggles and shift form when enabled
- Nutella-Regular (HAZELNUT_REGULAR, tier-1) must appear in Production Components toggles
- The `enabledKitchenComponents` field in `kitchenConfig` should store codes from componentTypes (same codes as kitchenComponents used)
- Shift record `componentProduced` array format should stay compatible (code + name + grams)

</specifics>

<canonical_refs>
## Canonical References

- `convex/productionRecipes/queries.ts:113-138` — `getComponentsWithTiers` query (tier computation)
- `convex/schema.ts:740-798` — componentTypes schema
- `convex/schema.ts:1360-1371` — kitchenComponents schema (to be retired)
- `src/components/kitchen/ManagerTargetSettings.tsx` — Manager settings toggles UI
- `src/components/kitchen/EndOfShiftForm.tsx` — Shift form with components produced

</canonical_refs>
