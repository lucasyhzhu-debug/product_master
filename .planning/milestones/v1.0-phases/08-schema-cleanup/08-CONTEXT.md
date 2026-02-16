# Phase 8: Schema Cleanup - Context

**Gathered:** 2026-02-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Audit all 167 `v.optional()` fields in `schema.ts`, tighten fields that should be required, remove unused tables/fields (including deprecated BOM fields), and document all denormalization patterns with inline comments and a central reference. No new features or schema additions.

</domain>

<decisions>
## Implementation Decisions

### Tightening aggressiveness
- Claude decides per field whether 100%-populated optional fields should become required, based on business context
- Fields where any documents lack the value stay optional — no backfill-to-require for partially populated fields
- All schema tightening changes deployed in one deploy (not batched by table)
- Audit document lives in `docs/SCHEMA_AUDIT.md` as a permanent onboarding reference

### Backfill defaults
- Claude decides appropriate default values per field based on business meaning (best-guess, placeholder, or zero as appropriate)
- Backfills are non-reversible — fill forward, new value is canonical
- Backfill migrations run as one-shot mutations from dashboard (not scheduled functions)
- Two-step deploy: backfill first, verify data, then deploy schema tightening separately

### Removal scope
- Remove ALL dead fields/tables discovered during audit, not just the named ones (isFixed, kitchenInventory)
- Deprecated BOM fields (productionType, productionUnits on menuProducts and orderItems) should be removed entirely from schema — Phase 6 migration is complete
- Clean removal: run migration to set removed fields to undefined on all documents before dropping from schema
- Maintain a removal log in the audit document (docs/SCHEMA_AUDIT.md) documenting what was removed and why

### Denormalization documentation
- Inline comments in schema.ts explain WHY the denormalization exists AND point to source of truth
- Include timing: when the snapshot/cache is captured and whether it's ever updated
- Use formal categories: SNAPSHOT (frozen at creation, never updated), CACHE (refreshable/invalidatable), DERIVED (computed from other fields)
- Document denormalization patterns both inline in schema.ts AND in a summary section in docs/SCHEMA.md

### Claude's Discretion
- Per-field categorization decisions (optional vs. required vs. needs-backfill)
- Specific default values for backfill migrations
- Discovery of additional dead fields/tables beyond the named ones
- Exact comment format and wording for denormalization annotations

</decisions>

<specifics>
## Specific Ideas

- Comment format should include denorm type, source, and timing: e.g., `// SNAPSHOT: from menuProducts.name at order creation. Never updated after.`
- Audit document should be useful for developer onboarding — permanent reference in docs/
- Two-step backfill-then-tighten gives a safety checkpoint between data changes and schema enforcement

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 08-schema-cleanup*
*Context gathered: 2026-02-14*
