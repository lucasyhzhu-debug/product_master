# Staff Review: Phase 57 — Invoice Backend & Business Settings

**Date:** 2026-03-17
**Plans:** `.planning/phases/57-invoice-backend-business-settings/57-01-PLAN.md` (Backend), `.planning/phases/57-invoice-backend-business-settings/57-02-PLAN.md` (Frontend)
**Reviewers:** Staff Developer (Implementation) + Principal Developer (Architecture)

---

## 0. Plan Validation Checklist

```
PLAN VALIDATION CHECKLIST (57-01-PLAN.md — Backend)
═══════════════════════════════════════════════════

✅ Git Workflow section exists?
  → Branch: feature/57-invoice-backend-business-settings
  → Checkpoints: "None (autonomous backend)"

✅ Implementation Waves section exists?
  → Tasks assigned (sequential within plan)
  → File paths specified
  → SEQUENTIAL marked

✅ Documentation Updates section exists?
  → CHANGELOG.md checkbox present

✅ Success Criteria section exists?
  → Type check requirement ✅
  → Build requirement ✅
```

```
PLAN VALIDATION CHECKLIST (57-02-PLAN.md — Frontend)
═══════════════════════════════════════════════════

✅ Git Workflow section exists?
  → Branch: feature/57-invoice-backend-business-settings
  → Checkpoints: Visual verification after Task 2

✅ Implementation Waves section exists?
  → Tasks assigned (sequential)
  → File paths specified
  → SEQUENTIAL marked

✅ Documentation Updates section exists?
  → CHANGELOG.md checkbox present

✅ Success Criteria section exists?
  → Type check requirement ✅
  → Build requirement ✅
```

**Plan structure: COMPLETE** — all 4 mandatory sections present in both plans.

---

## 1. Summary

**Overall Assessment: Revise**

Both plans are well-structured with clear task decomposition, good use of existing project patterns (`protectedMutation`/`protectedQuery`, `createMutationHook`, `useSessionQuery`), and accurate alignment with the design spec. The schema design is sound and the invoice numbering approach is correct for Convex's OCC model. However, there are 3 critical issues: (1) the `createDraft` mutation references an order status ("PaymentReceived or later") using stale terminology from CLAUDE.md without accounting for all valid statuses in the actual schema union, (2) the invoice counter uses `.unique()` which will throw on duplicates instead of gracefully handling the lookup, and (3) there is zero test coverage planned across both plans — no unit tests, no integration tests, no convex-test tests for any of the 9 new backend functions or 3 new frontend components. Additionally, the `getWibComponents` return type in the plan omits the `hours`, `minutes`, `seconds` fields it claims exist — the actual function only returns `year`, `month`, `day`, `dayOfWeek`.

---

## 2. Critical Issues (Must Fix)

| # | Issue | Category | Location in Plan |
|---|-------|----------|------------------|
| 1 | `getWibComponents` interface mismatch | Logic | 57-01 Interfaces section |
| 2 | Invoice counter `.unique()` will throw on race conditions | Logic | 57-01 Task 3, finalize mutation |
| 3 | No test coverage planned | Testing | Both plans |

**Details:**

### Issue 1: `getWibComponents` Interface Mismatch

The plan's `<interfaces>` section declares:
```typescript
export function getWibComponents(utcMs: number): {
  year: number; month: number; day: number;
  hours: number; minutes: number; seconds: number; dayOfWeek: number
}
```

The actual implementation in `convex/lib/periodRange.ts` (line 31-39) returns only:
```typescript
{ year: number; month: number; day: number; dayOfWeek: number }
```

There are no `hours`, `minutes`, or `seconds` fields. The plan doesn't use these extra fields, so the logic still works, but the documented interface is wrong and could mislead the implementer into expecting fields that don't exist.

**Recommendation:** Fix the interface declaration to match reality. This is low risk since the plan only uses `year` and `month`, but an implementer copy-pasting the interface would get confused.

### Issue 2: Invoice Counter `.unique()` Will Throw on Duplicate Prefixes

The plan specifies:
> Query `invoiceCounters.by_prefix` with `.unique()` (not `.first()`).

In Convex, `.unique()` throws a runtime error if more than one document matches. Since `by_prefix` is a non-unique index (Convex indexes are not unique constraints), there is no schema-level guarantee that only one counter per prefix exists. If a bug or migration ever creates two rows with the same prefix, `.unique()` will crash every finalize attempt for that month.

Using `.first()` is actually the safer choice here. The parenthetical "(not `.first()`)" in the plan actively directs away from the correct approach.

**Recommendation:** Use `.first()` instead of `.unique()`. The "one row per prefix" invariant is enforced by the application logic (check-then-insert), which is sufficient. If the implementer wants extra safety, add a guard: if the query returns more than expected, throw a descriptive error rather than relying on `.unique()`'s generic error.

### Issue 3: No Test Coverage Planned

Neither plan includes any testing beyond `npm run type-check` and `npm run build`. This is a significant gap for a feature involving:

- **Financial document numbering** (sequential, gap-free, race-safe) — requires known-value tests
- **Data snapshotting** (invoice finalize copies order/customer/settings data) — requires verification that all fields are captured
- **Customer write-back** (finalize patches customer record) — requires verification of conditional patching logic
- **Authorization** (multiple role combinations) — requires rejection tests
- **File storage lifecycle** (logo upload, old logo cleanup) — requires mock storage tests

The project has 690 passing tests and uses `convex-test` for backend testing. Not testing these 9 new backend functions and 3 new frontend components is a regression in project quality.

**Recommendation:** Add a Wave 3 (Testing) to Plan 01 with at minimum:

| Test | What to Verify | Approach |
|------|----------------|----------|
| `businessSettings.upsert` | Creates singleton, updates singleton, cleans up old logo | convex-test |
| `invoices.createDraft` | Auto-fills from order+customer+settings, rejects invalid status, rejects duplicate draft | convex-test |
| `invoices.finalize` | Assigns sequential number, handles month rollover, patches customer, OCC safety | convex-test with known inputs |
| `invoices.updateDraft` | Rejects updates to finalized invoices | convex-test |
| `invoices.discardDraft` | Deletes draft, rejects non-draft | convex-test |
| Invoice number generation | Sequential within month, resets on new month, format validation | Pure function test |

---

## 3. Improvements (Recommended)

| # | Improvement | Impact | Effort |
|---|-------------|--------|--------|
| 1 | Order status validation should use allowlist, not blocklist | High | Low |
| 2 | `createDraft` should guard against cancelled orders creating new invoices | Medium | Low |
| 3 | `updateDraft` args validator is too permissive | Medium | Medium |
| 4 | Missing `ConvexError` import/usage for user-facing errors | Medium | Low |
| 5 | Bank account resolution in `createDraft` has no fallback | Medium | Low |
| 6 | `businessSettings.get` query should be accessible to `order_staff` too if they can view Order Detail | Low | Low |

**Details:**

### Improvement 1: Order Status Validation — Allowlist vs. Blocklist

The plan says:
> Check order status is PaymentReceived or later (not Draft, AwaitingPayment, Cancelled).

This is a blocklist approach that silently allows any future status additions. The schema has 15 status literals (7 current + 8 legacy). The plan should use an explicit allowlist of statuses that permit invoice creation:

```typescript
const INVOICEABLE_STATUSES = new Set([
  "PaymentReceived", "BeingPrepared", "AwaitingDelivery", "Complete",
  // Legacy statuses that also had payment confirmed:
  "Confirmed", "InProduction", "Boxed", "Labeled", "Packaging",
  "WaitingShipment", "WaitingPickup", "CompleteShipped", "PickedUp",
]);
```

This is more explicit and safer.

**Recommendation:** Replace the blocklist with an allowlist of invoiceable statuses.

### Improvement 2: Cancelled Order Guard for New Invoices

The design spec says: "Cancelled orders: can view existing invoices, cannot create new ones." The plan's `createDraft` checks for "not Draft, AwaitingPayment, Cancelled" — but this is only clear if the implementer reads the blocklist carefully. With the allowlist approach from Improvement 1, this is automatically handled since "Cancelled" is not in the set.

**Recommendation:** Add an explicit comment in the code noting the Cancelled order policy for clarity.

### Improvement 3: `updateDraft` Args Too Permissive

The plan specifies `updateDraft` accepts partial fields including `sellerName`, `bankName`, `bankAccountNumber`, `bankAccountName`, `paymentStatus`, `paymentMethod`. In the design spec, the invoice form is WYSIWYG — the user edits buyer fields and can override auto-filled seller fields. However, accepting `paymentStatus` and `paymentMethod` as direct update args means the frontend could modify payment info on the invoice independent of the order.

This may be intentional (allowing the invoice to reflect different payment info than the order), but it should be explicitly called out. If it's not intentional, these fields should be removed from `updateDraft` and only set during `createDraft` auto-fill.

**Recommendation:** Clarify whether payment fields should be editable on the invoice form. If yes, document why. If no, remove from `updateDraft` args.

### Improvement 4: Use `ConvexError` for User-Facing Errors

The plan uses `throw new Error("Draft already exists")` pattern. The project standard (per `convex/lib/functions.ts`) is to use `ConvexError` from `convex/values` for errors that should surface to users. Regular `Error` is caught differently by the Convex client.

**Recommendation:** All validation errors in the new mutations should use `throw new ConvexError(...)` instead of `throw new Error(...)`.

### Improvement 5: Bank Account Fallback in createDraft

The plan says: "Read bank account if settings?.defaultBankAccountId is set." If no business settings exist or no default bank account is set, the `createDraft` would need to construct the invoice without bank info. But the schema requires `bankName`, `bankAccountNumber`, and `bankAccountName` as required strings (`v.string()`, not `v.optional(v.string())`).

This means `createDraft` will fail with a schema validation error if no bank account is configured.

**Recommendation:** Either: (a) make the bank fields optional in the invoice schema, or (b) add a clear error message in `createDraft` when bank account info is missing: `throw new ConvexError("Configure a default bank account in Business Settings before generating invoices")`.

### Improvement 6: Business Settings Read Access for Invoice Viewing

The `businessSettings.get` query is restricted to `["admin", "manager"]`. If `order_staff` ever needs to view invoice details (even read-only), they'd need access. Currently the design spec limits this to manager+admin, so this is fine for v1 but worth noting.

---

## 4. Refinements (Minor Suggestions)

- **57-01 Task 1:** The plan places tables "alphabetically among existing tables" but the exact insertion points aren't critical for correctness — the implementer should just find reasonable spots. Good guidance, not blocking.
- **57-01 Task 2:** The `businessSettings.get` query resolves `defaultBankAccount` by reading the full document — consider selecting only `bankName`, `accountNumber`, `name` to avoid leaking internal fields to the frontend. (Minor: Convex doesn't have field-level projection, so this is a documentation note rather than actionable.)
- **57-02 Task 2:** The plan says to import `Settings` from `lucide-react` for the nav icon. Verify the icon isn't already imported in `Header.tsx` to avoid duplicate imports.
- **57-02 Task 2:** The `LogoUploader` component extracts `storageId` from the upload response. The Convex upload response format should be documented: `{ storageId: string }`. Consider adding a type assertion or validation.
- **57-02 Task 2:** The plan says `"Remove Logo" button calls onUpload(undefined)` — but the prop type is `onUpload: (storageId: Id<"_storage">) => void`. This type doesn't accept `undefined`. Should be `(storageId: Id<"_storage"> | undefined) => void` or use a separate `onRemove` callback.
- **57-02 Task 1:** The `BusinessSettings` type is defined as `NonNullable<ReturnType<typeof useBusinessSettings>>`. Since `useBusinessSettings` returns the Convex query result (which includes `logoUrl` and `defaultBankAccount` fields added by the backend), this type derivation is correct and elegant.
- **Both plans:** Consider adding `SCHEMA.md` to the Documentation Updates checklist since 3 new tables are being added.

---

## 5. Duplication Analysis

### Existing Code to Leverage

| Existing Code | Location | How to Use |
|---------------|----------|------------|
| `protectedMutation` / `protectedQuery` | `convex/lib/functions.ts` | Plan correctly uses these |
| `createMutationHook` | `src/hooks/convex/createMutationHook.ts` | Plan correctly uses this factory |
| `useSessionQuery` / `useSessionMutation` | `convex-helpers/react/sessions` | Plan correctly imports these |
| `getWibComponents` | `convex/lib/periodRange.ts` | Plan correctly reuses for YYMM prefix |
| `generateUploadUrl` pattern | `convex/expenses/mutations.ts` (line 312) | Same pattern — plan follows it |
| `useBankAccounts` hook | `src/hooks/convex/useBankAccounts.ts` | Plan reuses in BankAccountSelector |
| `lazyWithPreload` | `src/lib/lazyWithPreload.ts` | Plan correctly uses for route lazy loading |
| `ProtectedRoute` | `src/components/auth/ProtectedRoute.tsx` | Plan correctly uses with `requiredPermission` |

### Potential Duplication Risks

- **None identified.** The plans correctly leverage all existing patterns and don't reinvent any wheels. The hook structure mirrors `useBankAccounts.ts` exactly.

---

## 6. Phase/Wave Accuracy

| Phase/Wave | Assessment | Notes |
|------------|------------|-------|
| 57-01 Wave 1 (Schema) | Good | Correct ordering: schema first, then queries/mutations |
| 57-01 Wave 1 (Business Settings) | Good | Independent from invoices, correct |
| 57-01 Wave 1 (Invoices) | Good | Depends on schema being deployed first |
| 57-01 Wave 2 (Verification) | Needs Addition | Missing: test wave |
| 57-02 Wave 1 (Permissions + Hooks) | Good | Foundation for page |
| 57-02 Wave 1 (Page + Components) | Good | Depends on hooks being available |
| 57-02 Wave 2 (Verification) | Good | Human verification checkpoint |

**Ordering Issues:**
- 57-01 Task 1 (schema) must deploy before Task 2 and 3 can type-check. The plan marks these as SEQUENTIAL, which is correct.

**Missing Phases:**
- A testing wave should be added to 57-01 between the implementation and verification waves.

---

## 7. Specialist Agent Recommendations

| Phase | Recommended Agent | Rationale |
|-------|-------------------|-----------|
| 57-01 Task 1 (Schema) | `convex-backend` | Schema changes are core backend |
| 57-01 Task 2 (Business Settings backend) | `convex-backend` | Queries + mutations |
| 57-01 Task 3 (Invoices backend) | `convex-backend` | Complex mutation logic |
| 57-01 Testing (if added) | `convex-backend` | Backend test authoring |
| 57-02 Task 1 (Permissions + Hooks) | `react-ui-builder` | Frontend types + hooks |
| 57-02 Task 2 (Page + Components) | `react-ui-builder` | Full page implementation |
| Post-implementation | `code-auditor` | Type check + pattern compliance review |

---

## 8. Git Workflow Assessment

### Branch Strategy

| Assessment | Status |
|------------|--------|
| Feature branch specified | ✅ Yes: `feature/57-invoice-backend-business-settings` |
| Branch naming convention | ✅ Correct |
| Merge strategy documented | ⚠️ Implicit (no explicit merge instructions) |

### Commit Strategy

| Phase | Expected Commits | Commit Type | Notes |
|-------|------------------|-------------|-------|
| 57-01 Task 1 | 1 | feat | Schema deployment — atomic |
| 57-01 Task 2 | 1 | feat | Business settings backend — atomic |
| 57-01 Task 3 | 1 | feat | Invoice backend — atomic |
| 57-02 Task 1 | 1 | feat | Permissions + hooks |
| 57-02 Task 2 | 1 | feat | Page + components + route |

### Recommended Commit Checkpoints

1. After schema deploys: `feat(57): add businessSettings, invoiceCounters, invoices tables and extend customers`
2. After business settings backend: `feat(57): add businessSettings queries and mutations`
3. After invoice backend: `feat(57): add invoice CRUD mutations with sequential numbering`
4. After permissions + hooks: `feat(57): add permission flags and frontend hooks for business settings and invoices`
5. After page + components: `feat(57): add Business Settings page with logo upload, bank selector, and live preview`
6. After tests (if added): `test(57): add backend tests for invoice numbering and business settings`

### Pre-Push Verification

- [x] Plan includes `npm run type-check` check
- [x] Plan includes `npm run build` verification
- [x] Plan includes human verification (57-02 Task 3)

### CI/CD Considerations

| Concern | Assessment |
|---------|------------|
| Rollback strategy | ❌ Missing — new tables are additive so rollback is safe, but not documented |
| Deployment order | ✅ Correct — backend (schema + functions) before frontend |
| Data backup needed | No — additive changes only, no data migration |
| Migration safety | ✅ Safe — all new fields are optional, all new tables are empty |

### Git Workflow Issues Found

- No explicit commit checkpoints documented — plan says "Checkpoints: None (autonomous backend)" for 57-01. Given 3 sequential tasks, at least commit after each task.

---

## 9. Documentation Checkpoints

| Phase | Documentation Update Required |
|-------|-------------------------------|
| After 57-01 | `docs/SCHEMA.md` — add businessSettings, invoiceCounters, invoices tables + customer extension |
| After 57-02 | `docs/API_REFERENCE.md` — add business settings and invoice API endpoints |
| After merge | `docs/CHANGELOG.md` — required |
| After merge | `CLAUDE.md` Quick File Finder — add invoice and businessSettings entries |

### CHANGELOG.md Entry (Draft)

```markdown
## 2026-03-17 — Phase 57: Invoice Backend & Business Settings

**Invoice generation foundation and admin Business Settings page**

- Added 3 new tables: `businessSettings` (singleton), `invoiceCounters`, `invoices`
- Extended `customers` table with optional `companyName`, `npwp`, `billingAddress`
- Business Settings page at `/settings/business` (admin-only) with logo upload, bank account selector, and live invoice header preview
- Invoice backend: createDraft (auto-fills from order/customer/settings), updateDraft, discardDraft, finalize (assigns INV-YYMM-NNN with race-safe sequential numbering)
- Customer write-back on invoice finalize (saves company/NPWP/billing address for future auto-fill)
- New permission flags: `canAccessBusinessSettings` (admin), `canAccessInvoices` (manager+admin)
- Invoice hooks created for Phase 58 consumption

**Files Modified:**
- convex/schema.ts, convex/businessSettings/*, convex/invoices/*, convex/customers/mutations.ts
- src/lib/types.ts, src/hooks/convex/useBusinessSettings.ts, src/hooks/convex/useInvoice.ts
- src/pages/BusinessSettings.tsx, src/components/settings/*
- src/App.tsx, src/components/layout/Header.tsx
```

---

## 10. Testing Plan Assessment

**Overall Testing Verdict: Missing**

### Planned Tests

| Layer | What's Tested | Test Type | Status |
|-------|---------------|-----------|--------|
| Backend | businessSettings mutations | convex-test | **Missing** |
| Backend | invoice mutations (createDraft, finalize, etc.) | convex-test | **Missing** |
| Backend | invoice number generation | Unit test | **Missing** |
| Backend | customer write-back on finalize | convex-test | **Missing** |
| Frontend | BusinessSettings page | Component test | **Missing** |
| Frontend | LogoUploader component | Component test | **Missing** |
| Integration | Full invoice lifecycle | Manual/E2E | Partially planned (57-02 Task 3 human verification) |

### Missing Test Coverage (Must Add)

| # | Missing Test | Why It Matters | Suggested Approach |
|---|--------------|----------------|-------------------|
| 1 | Invoice number sequential generation | Financial documents must have gap-free numbering — regression would be critical | convex-test: create 3 invoices in same month, verify 001/002/003; create in new month, verify reset to 001 |
| 2 | `createDraft` auto-fill correctness | Verifies all order/customer/settings fields are properly snapshotted | convex-test with known order data, assert all fields match |
| 3 | `createDraft` status validation | Prevents invoices for unpaid/cancelled orders | convex-test: try creating draft for Draft, AwaitingPayment, Cancelled orders — expect errors |
| 4 | `createDraft` duplicate draft rejection | "One draft per order" business rule | convex-test: create draft, try creating another — expect error |
| 5 | `finalize` customer write-back | Customer record gets updated company/NPWP/address | convex-test: finalize invoice with new buyer data, verify customer doc patched |
| 6 | `finalize` rejects non-draft | Prevents double-finalization | convex-test: finalize, try to finalize again — expect error |
| 7 | `businessSettings.upsert` logo cleanup | Old logo file deleted when replaced | convex-test with mock storage |
| 8 | Auth rejection for all endpoints | Role-based access enforced | convex-test: call each endpoint with kitchen/order_staff role — expect unauthorized |

### Test Execution Checkpoints

1. After 57-01 backend: `npm run test` — all existing + new backend tests pass
2. After 57-02 frontend: `npm run test` — all tests pass
3. Before merge: `npm run test && npm run build`

### Regression Risk

- `convex/customers/mutations.ts` is being modified — existing customer tests (if any) should still pass
- New schema tables should not affect existing queries
- New permission flags added to `ROLE_PERMISSIONS` — verify ProtectedRoute still works for all existing pages

---

## 11. Edge Cases to Address

The plans should explicitly handle:

- [ ] **No business settings configured:** `createDraft` should throw a descriptive error (not a schema validation error for missing required bank fields)
- [ ] **No default bank account set:** Same as above — bank fields are required in invoice schema
- [ ] **Order with no items:** `createDraft` should handle empty `orderItems` gracefully (create invoice with empty items array? or reject?)
- [ ] **Order with deleted customer:** `createDraft` reads customer by `order.customerId` — what if customer was deleted? (Unlikely given deletion guards, but defensive coding)
- [ ] **Concurrent finalize attempts:** Two users finalize the same draft simultaneously — the OCC model handles the counter correctly, but both mutations would try to patch the same invoice doc. One will get an OCC conflict and retry, which is fine.
- [ ] **Month boundary race:** Invoice finalized at 23:59:59 WIB Dec 31 — getWibComponents correctly handles this, but worth a test case
- [ ] **Logo file upload failure:** The `LogoUploader` component should handle network errors during the fetch POST to the upload URL
- [ ] **Logo file type validation:** The component accepts PNG/JPEG/SVG but doesn't validate the actual file content (MIME sniffing) — acceptable for v1 but worth noting
- [ ] **Invoice with zero items:** User deletes all items in draft via `updateDraft` — should `finalize` reject an invoice with empty items?
- [ ] **Discount calculation edge cases:** Percentage discount of 100% (discountAmount = subtotal, finalTotal = deliveryFee only) — is this valid?

---

## 12. Approval Conditions

**For Approval, address:**
1. **Critical:** Fix `getWibComponents` interface declaration (Issue 1)
2. **Critical:** Change `.unique()` to `.first()` in invoice counter lookup (Issue 2)
3. **Critical:** Add testing wave with at minimum the 8 test cases from Section 10 (Issue 3)

**Recommended before implementation:**
1. Switch order status check from blocklist to allowlist (Improvement 1)
2. Add guard for missing bank account in `createDraft` (Improvement 5)
3. Use `ConvexError` instead of `Error` for all validation throws (Improvement 4)
4. Fix `LogoUploader.onUpload` prop type to accept `undefined` (Refinement)
5. Add `SCHEMA.md` to documentation update checklist (Refinement)

---

*Generated by /staffreview skill*
*Staff Developer Review + Principal Developer Review*
