# Phase 57: Invoice Backend & Business Settings - Context

**Gathered:** 2026-03-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the invoice data model (3 new tables + customer extension), backend API (6 mutations/queries), and Business Settings page so admins can configure seller identity before generating invoices. Phase 58 handles all invoice UI (form, print view, Order Detail sidebar card).

Comprehensive design spec: `docs/superpowers/specs/2026-03-16-invoice-generation-design.md`

</domain>

<decisions>
## Implementation Decisions

### Business Settings page layout
- Single scroll page with 5 stacked sections (Brand Identity, Contact Info, Tax Info, Default Bank Account, Invoice Header Preview)
- Click-to-upload button for logo (not drag-and-drop) — matches existing `generateUploadUrl` pattern from expenses/payroll
- Logo constraints: max 1MB, PNG/JPG/SVG only, display at fixed height in preview
- Bank account selector shows only active accounts (`isActive=true`)
- Invoice header preview updates live as user types (mirrors local form state, no API call)
- Page is admin-only (managers don't see it — they consume settings indirectly via invoices in Phase 58)
- Add nav link + route in this phase (page is fully functional)

### Invoice number format
- YYMM prefix uses WIB timezone (Asia/Jakarta) — consistent with `convex/lib/periodRange.ts`
- 3-digit minimum zero-pad: INV-2603-001 through INV-2603-999
- On overflow (>999), extend to 4+ digits: INV-2603-1000 — no hard cap
- Finalized invoices are immutable — Business Settings changes only affect new invoices
- Race-safe numbering via `invoiceCounters` table with Convex OCC

### Draft lifecycle
- Auto-save feedback: subtle inline status text near page top ("Saving..." → "Saved just now" → "Saved 2 min ago") — no toasts
- Concurrent tab editing: last write wins (Convex OCC handles) — not worth optimizing for rare single-user edge case
- No stale draft auto-cleanup — drafts persist until manually discarded or finalized
- Discard draft requires ConfirmDialog ("Discard this draft? This cannot be undone.")

### Phase 57 vs 58 scope boundary
- Phase 57 delivers: schema (3 new tables + customer extension), all 6 backend mutations/queries, Business Settings page, nav link, both hooks (useBusinessSettings + useInvoice)
- Phase 58 delivers: invoice form page, print view, Order Detail sidebar card, invoice routes
- No invoice UI scaffolding in Phase 57 — clean separation

### Claude's Discretion
- Exact section card styling on Business Settings page
- Bank account radio card visual design
- Save button placement and loading state
- Error handling patterns for logo upload failures
- Hook implementation details (return shape, loading states)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `protectedMutation`/`protectedQuery`: Established in expenses, payroll, bank accounts — use for all invoice backend functions
- `generateUploadUrl` via `ctx.storage`: Pattern in `convex/expenses/mutations.ts` and `convex/payroll/mutations.ts` — reuse for logo upload
- `ConfirmDialog`: Existing shared component for discard confirmation
- `bankAccounts` table: Already exists with `name`, `bankName`, `accountNumber`, `isActive` + `by_active` index
- `convex/lib/periodRange.ts`: WIB timezone handling — use for YYMM prefix calculation
- `ROLE_PERMISSIONS` in `src/lib/types.ts`: Add `canAccessInvoices` and `canAccessBusinessSettings`

### Established Patterns
- Singleton tables: No existing singleton pattern in schema — `businessSettings` will be the first. Use "query first row, upsert" approach
- File storage: Upload URL → client upload → store `storageId` → resolve URL via `ctx.storage.getUrl()`
- Snapshot pattern: Orders already snapshot customer name/phone at creation — invoices extend this to full seller/buyer/order data
- Auth: All backend functions use `protectedMutation`/`protectedQuery` with explicit `roles` arrays

### Integration Points
- `src/App.tsx`: Add `/settings/business` route with ProtectedRoute (admin)
- `src/components/layout/Header.tsx`: Add "Business Settings" nav link in admin section
- `convex/schema.ts`: Add 3 new tables (`businessSettings`, `invoiceCounters`, `invoices`), extend `customers`
- `src/hooks/convex/index.ts`: Export new hooks

</code_context>

<specifics>
## Specific Ideas

- Design spec provides exact field lists, validators, indexes, and API signatures — follow `docs/superpowers/specs/2026-03-16-invoice-generation-design.md` as the authoritative source
- Interactive mockups at `docs/mockups/invoice-settings-mockup.html` and `docs/mockups/invoice-workflow-mockup.html` show visual intent
- Frollie is a non-PKP UMKM — no VAT/PPN, issues "invoice biasa" only (add non-PKP note near NPWP field)
- Business name is "PT Malo Group Bahagia" — this is the default/expected value

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 57-invoice-backend-business-settings*
*Context gathered: 2026-03-16*
