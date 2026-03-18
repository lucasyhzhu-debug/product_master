# Staff Review: Phase 57 Implementation — Invoice Backend & Business Settings

**Date:** 2026-03-17
**Branch:** `gsd/phase-57-invoice-backend-business-settings`
**Base:** `origin/main` (4ff0b81)
**Head:** 471c23a
**Plans:** `57-01-PLAN.md` (Backend), `57-02-PLAN.md` (Frontend)
**Reviewers:** requirements-reviewer, code-quality-reviewer, staffreview (triple-review)

---

## 1. Summary

Phase 57 adds the invoice data foundation (3 new schema tables + customer extension), complete backend CRUD for business settings and invoices, a Business Settings admin page with logo upload/bank account selection/live preview, permission flags, and frontend hooks. The implementation is well-structured, follows established project patterns (`protectedMutation`/`protectedQuery`, `createMutationHook`, `useSessionQuery`), and the build passes cleanly.

**Overall Assessment: Approve with fixes** — 1 Critical, 3 Important, 5 Minor, 3 Nitpick findings.

The Critical issue is a bug where clearing optional fields in Business Settings does not persist (empty values are omitted from the mutation args). Important issues include missing legacy status coverage in the INVOICEABLE_STATUSES allowlist, tests that simulate logic instead of testing real mutations, and a missing `paymentStatus` type narrowing in the invoice schema.

---

## 2. Critical Issues

| # | Issue | Category | Files |
|---|-------|----------|-------|
| C1 | Clearing optional fields in Business Settings does not persist | Bug | `src/pages/BusinessSettings.tsx`, `convex/businessSettings/mutations.ts` |

### C1: Clearing optional fields does not persist

**Flagged by:** code-quality-reviewer, requirements-reviewer

In `BusinessSettings.tsx` `handleSave()` (line 97-105), optional fields are conditionally spread:

```typescript
...(form.address ? { address: form.address.trim() } : {}),
...(form.phone ? { phone: form.phone.trim() } : {}),
...(form.logoStorageId ? { logoStorageId: form.logoStorageId } : {}),
...(form.defaultBankAccountId ? { defaultBankAccountId: form.defaultBankAccountId } : {}),
```

When a user clears a field (empty string or undefined), it is falsy, so the key is **not included** in the mutation args. The `upsert` mutation uses `ctx.db.patch(existing._id, { ...args, ... })` which only updates keys present in the patch object. Previously saved values persist even when the user intends to clear them.

**Impact:** Selecting "None" in the bank account selector and clicking Save will NOT clear the default bank account. Clearing the address/phone/email/NPWP fields and saving will NOT remove them from the database. The logo removal flow (setting `logoStorageId` to undefined) will also fail to clear the stored ID.

**Fix:** Always include optional fields in the mutation args. For string fields, send `undefined` explicitly when empty. For ID fields, send `undefined` when cleared. The backend `upsert` should handle `undefined` values by clearing the field (Convex `ctx.db.patch` with `undefined` removes the field from the document).

---

## 3. Important Issues

| # | Issue | Category | Files |
|---|-------|----------|-------|
| I1 | INVOICEABLE_STATUSES misses legacy statuses that had payment confirmed | Logic | `convex/invoices/mutations.ts` |
| I2 | Tests simulate logic instead of testing real mutations | Testing | `convex/businessSettings/__tests__/mutations.test.ts` |
| I3 | Invoice `paymentStatus` stored as `v.string()` loses type safety | Schema | `convex/schema.ts` |

### I1: INVOICEABLE_STATUSES misses legacy statuses

**Flagged by:** requirements-reviewer, staffreview

The allowlist contains only 4 modern statuses:
```typescript
const INVOICEABLE_STATUSES = new Set([
  "PaymentReceived", "BeingPrepared", "AwaitingDelivery", "Complete",
]);
```

The orders schema has 9 legacy statuses (`Confirmed`, `InProduction`, `Boxed`, `Labeled`, `Packaging`, `WaitingShipment`, `WaitingPickup`, `CompleteShipped`, `PickedUp`) that are still present on unmigrated production documents. These legacy statuses represent orders that had payment confirmed and should be invoiceable. If a user tries to create an invoice for an order still in a legacy status, it will be rejected.

**Impact:** Medium — depends on how many unmigrated legacy-status orders exist. If few or none, this is low impact. If any exist and need invoices, this blocks functionality.

**Fix:** Add legacy paid statuses to the allowlist (at minimum: `Confirmed`, `InProduction`, `Boxed`, `Labeled`, `Packaging`, `WaitingShipment`, `WaitingPickup`, `CompleteShipped`, `PickedUp`). Add a code comment explaining these are legacy equivalents.

### I2: businessSettings tests simulate logic instead of testing real mutations

**Flagged by:** code-quality-reviewer, staffreview

`convex/businessSettings/__tests__/mutations.test.ts` defines a `simulateUpsert()` function that mirrors the mutation logic rather than testing the actual mutation. This means:
- If the mutation logic drifts from the simulation, tests still pass
- No actual database operations are tested
- Auth (protectedMutation role check) is not tested
- Storage cleanup (`ctx.storage.delete`) is not tested

The invoice tests (`convex/invoices/__tests__/mutations.test.ts`) are better — they test the exported pure helper functions directly. But the ctx-dependent mutation paths (createDraft validation, finalize counter increment, customer write-back) still lack integration-level convex-test coverage.

**Impact:** Lower confidence in mutation correctness. The prior staff review (pre-implementation) specifically called out the need for convex-test runtime tests.

**Fix:** Consider adding convex-test integration tests for at least: (a) createDraft with invalid status, (b) createDraft with no bank account, (c) finalize counter increment, (d) finalize customer write-back. The pure function tests are good and should remain.

### I3: Invoice paymentStatus stored as `v.string()` loses type safety

**Flagged by:** code-quality-reviewer

The `orders` table defines `paymentStatus` as `v.union(v.literal("Unpaid"), v.literal("Partial"), v.literal("Paid"))`, but the `invoices` table stores it as `v.string()`. This loses the type-safe union constraint on the snapshot.

**Impact:** Low — the field is snapshotted at creation time and not user-editable. But future queries filtering by `paymentStatus` on invoices won't benefit from type narrowing.

**Fix:** Change `paymentStatus: v.string()` to `paymentStatus: v.union(v.literal("Unpaid"), v.literal("Partial"), v.literal("Paid"))` in the invoices table definition. This is a non-breaking change since all values come from the typed orders table.

---

## 4. Minor Issues

| # | Issue | Category | Files |
|---|-------|----------|-------|
| M1 | `customers/mutations.ts` update uses `throw new Error` instead of `ConvexError` | Convention | `convex/customers/mutations.ts` |
| M2 | Logo upload preview URL not immediately available after upload | UX | `src/pages/BusinessSettings.tsx` |
| M3 | `computeDiscount` treats `undefined` discountType as flat discount | Edge case | `convex/invoices/mutations.ts` |
| M4 | No `SCHEMA.md` or `CLAUDE.md` updates for new tables/files | Documentation | - |
| M5 | `LogoUploader` destructures but does not use `logoStorageId` prop | Dead code | `src/components/settings/LogoUploader.tsx` |

### M1: Customer update uses `throw new Error` instead of `ConvexError`

Line 52 of `convex/customers/mutations.ts`: `throw new Error("Customer not found")`. The project convention (and the plan's explicit requirement) is to use `ConvexError` for user-facing validation errors. The existing `remove` mutation (line 84) has the same issue, but that predates this phase.

### M2: Logo URL not immediately available after upload

After uploading a logo, the `onUpload` callback sets `logoStorageId` in the form state, but the `logoUrl` is not updated (it comes from the server query). The preview will show the old logo (or placeholder) until the settings are saved and the query re-fetches. The user sees a disconnect between uploading and preview.

### M3: computeDiscount fallthrough for undefined discountType

When `discountType` is `undefined` but `discountValue > 0`, the function falls through to `return { discountAmount: discountValue }` (flat discount). This is technically correct since the only other type is "percentage", but the implicit fallthrough could mask a future third discount type.

### M4: Missing documentation updates

The plan includes checkboxes for `SCHEMA.md` and `CLAUDE.md` Quick File Finder updates, but these were not done on the branch. These are post-merge tasks per the plan.

### M5: Unused `logoStorageId` prop in LogoUploader

The `LogoUploader` component accepts `logoStorageId` in props (line 15) but the destructured function signature (line 23-27) does not include it: `{ logoUrl, onUpload, generateUploadUrl }`. The prop is defined in the interface but unused.

---

## 5. Nitpick Issues

| # | Issue | Category | Files |
|---|-------|----------|-------|
| N1 | Bank account type assertion in BusinessSettings page | Type safety | `src/pages/BusinessSettings.tsx` |
| N2 | `isInvoiceableStatus` uses `as any` cast | Type safety | `convex/invoices/mutations.ts` |
| N3 | Invoice query `getByOrder` sorts in memory instead of using index | Performance | `convex/invoices/queries.ts` |

### N1: Type assertion for bankAccounts

Line 237: `bankAccounts as Array<{ _id: Id<"bankAccounts">; bankName: string; accountNumber: string; name: string }>` — an explicit type assertion to narrow the Convex query return type. This works but is fragile if the bank account schema changes.

### N2: `as any` cast in status check

Line 31: `INVOICEABLE_STATUSES.has(status as any)` and line 141: `INVOICEABLE_STATUSES.has(order.status as any)`. The `as any` is needed because the Set was constructed from a readonly tuple and `status` is a wider string type. This is acceptable but could be cleaner with a type guard.

### N3: In-memory sort in getByOrder

`convex/invoices/queries.ts` line 36: `.sort((a, b) => b._creationTime - a._creationTime)`. Since the index `by_order` returns in `_creationTime` order by default, this sort is redundant for small result sets. For orders with many invoices (unlikely), it would be better to use `.order("desc")` on the query.

---

## 6. Consensus Issues (2+ reviewers)

| Finding | Reviewers |
|---------|-----------|
| C1: Clearing optional fields does not persist | code-quality, requirements |
| I1: Missing legacy statuses in allowlist | requirements, staffreview |
| I2: Tests simulate instead of testing real mutations | code-quality, staffreview |

---

## 7. Plan Fidelity Assessment

| Plan Requirement | Status | Notes |
|-----------------|--------|-------|
| 3 new tables (businessSettings, invoiceCounters, invoices) | DONE | Schema matches plan exactly |
| Customer extension (3 optional fields) | DONE | companyName, npwp, billingAddress added |
| businessSettings.get with logo URL + bank account resolution | DONE | Returns null gracefully |
| businessSettings.upsert with old logo cleanup | DONE | Storage.delete on change |
| businessSettings.generateUploadUrl | DONE | |
| Invoice createDraft with INVOICEABLE_STATUSES allowlist | DONE | Missing legacy statuses (I1) |
| Invoice createDraft bank account guard | DONE | ConvexError thrown |
| Invoice createDraft zero items guard | DONE | ConvexError thrown |
| Invoice createDraft duplicate draft check | DONE | Filter on by_order index |
| Invoice updateDraft excludes paymentStatus/paymentMethod | DONE | Correctly omitted from args |
| Invoice discardDraft with status guard | DONE | |
| Invoice finalize with .first() (not .unique()) | DONE | Per plan correction |
| Invoice finalize customer write-back | DONE | computeCustomerWriteBack helper |
| All errors use ConvexError | MOSTLY | customers/mutations.ts line 52 uses Error (M1) |
| Permission flags: canAccessBusinessSettings, canAccessInvoices | DONE | Correct role assignments |
| Business Settings page with 5 sections | DONE | All sections present |
| Logo upload with 1MB limit | DONE | |
| Bank account radio selector with "None" | DONE | But clearing doesn't persist (C1) |
| Live invoice header preview | DONE | Pure component |
| Route + nav link + ProtectedRoute | DONE | |
| Unit tests for critical paths | DONE | Pure function tests good; integration tests missing (I2) |

**Scope creep:** None detected. Implementation stays within plan boundaries.
**Missing pieces:** No functional gaps beyond the issues noted above.

---

## 8. Architecture Assessment

- **Singleton pattern** (businessSettings): First use in codebase. Clean implementation with `.first()` query. No index needed.
- **Invoice counter**: Race-safe via Convex OCC. `.first()` correctly chosen over `.unique()` per plan revision.
- **Snapshot immutability**: Finalized invoices cannot be updated or deleted. Draft-to-final transition is one-way.
- **Customer write-back**: Only patches fields that differ. Defensive against missing order/customer.
- **Pure function extraction**: `buildInvoicePrefix`, `formatInvoiceNumber`, `computeDiscount`, `computeCustomerWriteBack`, `isInvoiceableStatus` are all extracted as pure functions and well-tested. This is excellent for testability.
- **Hook patterns**: Follow established `createMutationHook` and `useSessionQuery` patterns exactly.

---

*Generated by triple-review (requirements-reviewer + code-quality-reviewer + staffreview)*
