# Phase 6: BOM Migration - Context

**Gathered:** 2026-02-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Migrate all ball composition data flows to use BOM (`menuProductComponents` + `componentTypes`) as the single source of truth. Deprecated `productionType`/`productionUnits` fields on `menuProducts` and `orderItems` are retained as `v.optional()` for historical data during this phase, then fully removed in Phase 8. The 6-step strangler fig migration sequence from the roadmap is the implementation framework.

</domain>

<decisions>
## Implementation Decisions

### Legacy order display
- **Seamless fallback** -- old orders (pre-BOM) must look identical to new orders. No visual indicators, no "(legacy)" badges. The dual-read fallback is invisible to all users.
- **All history supported** -- every order ever created must display correctly. Fallback covers the entire order history, not just recent orders.
- **Kitchen view unchanged** -- kitchen staff see no difference during or after migration. No toasts, banners, or transition notices.

### Backfill behavior
- **Skip products with no productionType** -- if a menuProduct has null/undefined productionType, the backfill leaves it without BOM entries. It won't show ball composition until manually configured.
- **Overwrite existing BOM entries** -- if a menuProduct already has BOM entries (manually created earlier), the backfill deletes and recreates them from deprecated field values. Clean, consistent source.
- **Direct quantity mapping** -- `productionUnits` value maps directly to BOM component quantity. No transformation or scaling.
- **Idempotent migration** -- the backfill can be re-run safely. It deletes existing BOM entries and recreates them each time. Supports fixing mapping logic and re-running.

### Deprecated field cleanup
- **Strip from API responses** -- after migration, query functions explicitly omit `productionType` and `productionUnits` from returned data. Cleaner API surface.
- **Remove from edit forms** -- MenuProductsManager edit form removes productionType/productionUnits fields entirely. BOM is the only way to configure ball composition going forward.
- **Stop snapshotting on orders** -- new orders only store BOM-derived composition. The deprecated fields on new orderItems will be null/empty.
- **BOM-only writes** -- once backfill is deployed, new orders write only BOM data. No dual-write transition period.
- **Full deletion in Phase 8** -- deprecated fields will be removed from the schema entirely in Phase 8 (Schema Cleanup). Not kept indefinitely.

### Verification & rollback
- **Automated comparison query** -- write a verification query that compares BOM-derived ball composition vs deprecated fields for every menuProduct. Report mismatches as a list.
- **Log mismatches, don't halt** -- if the comparison finds mismatches, log them to a report but continue the migration. User reviews the report and fixes manually after.
- **Same-session deploys** -- all 6 sequential deploy steps execute back-to-back in one session. Verify each step with automated checks, then immediately proceed to the next.
- **Fix forward only** -- no rollbacks. If something breaks mid-migration, debug and deploy a fix. The strangler fig design means each step is safe independently.

### Claude's Discretion
- Technical implementation of the dual-read fallback logic
- Exact migration query structure and batch sizing
- How the automated comparison query reports results (console output, file, or dashboard)
- Order of frontend file updates within the 19-file migration

</decisions>

<specifics>
## Specific Ideas

- The mapping from deprecated fields: `productionType: "original"` maps to `BIG_BALL` (80g/Jumbo), not what the name suggests. This is a known pitfall (CLAUDE.md Pitfall 11) -- the backfill must use the correct mapping.
- BOM codes are `BIG_BALL` = 80g/Jumbo, `MID_BALL` = 45g/Original (counterintuitive naming).
- The `by_production_type` index on `orderItems` must be removed as part of this phase (BOM-05).

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope.

</deferred>

---

*Phase: 06-bom-migration*
*Context gathered: 2026-02-14*
