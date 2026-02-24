---
phase: quick-26
plan: "01"
subsystem: vouchers
tags: [vouchers, admin, free-voucher, schema]
dependency_graph:
  requires: []
  provides: [free-voucher-creation]
  affects: [VouchersManager, vouchers-table]
tech_stack:
  added: []
  patterns: [requireRole-admin-only, useProtectedMutation, optional-schema-fields]
key_files:
  created: []
  modified:
    - convex/schema.ts
    - convex/vouchers/mutations.ts
    - src/hooks/convex/useVouchers.ts
    - src/pages/VouchersManager.tsx
decisions:
  - "Free vouchers use admin-only requireRole(['admin']) — managers explicitly excluded"
  - "100% discount enforced in backend (createFreeVoucher always sets discountValue: 100) — not configurable from UI"
  - "isFreeVoucher and freeReason added as optional fields on vouchers table — backward compatible, no migration needed"
  - "FREE- prefix for auto-generated codes distinguishes free vouchers from PROMO- regular vouchers"
metrics:
  duration: "~8 min"
  completed: "2026-02-24"
  tasks: 2
  files: 4
---

# Quick Task 26: Create a Way to Make Free Vouchers — Summary

**One-liner:** Admin-only free voucher creation with structured reason (QA Testing/Gift/Other), 100% discount enforced backend-side, green "Free" badge in UI.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Schema + Backend — isFreeVoucher fields and createFreeVoucher mutation | 2ffc5f2 | convex/schema.ts, convex/vouchers/mutations.ts |
| 2 | Hook + UI — useCreateFreeVoucher hook and CreateFreeVoucherDialog | 1f13ead | src/hooks/convex/useVouchers.ts, src/pages/VouchersManager.tsx |

## What Was Built

### Schema Changes (`convex/schema.ts`)
Two new optional fields added to the `vouchers` table:
- `isFreeVoucher: v.optional(v.boolean())` — true if created via `createFreeVoucher`
- `freeReason: v.optional(v.string())` — stores the structured reason

### Backend Mutation (`convex/vouchers/mutations.ts`)
New `createFreeVoucher` mutation:
- Admin-only: `requireRole(ctx, args.token, ["admin"])` — managers get rejected
- Always inserts with `discountType: "percentage"`, `discountValue: 100`
- Requires non-empty `freeReason` and `name`
- Auto-generates code with `FREE-` prefix if no custom code provided
- Validates unique code (same pattern as regular `create`)
- Optional `usageLimit` and `validUntil` args — both default to unlimited/no-expiry

### Hook (`src/hooks/convex/useVouchers.ts`)
- Added `createFreeVoucher: unknown` to `vouchersApi.mutations` type block
- Added `FreeVoucherInput` interface exported from the hook file
- Added `useCreateFreeVoucher()` hook following existing `useProtectedMutation` pattern
- Toast success shows the generated code on creation

### UI (`src/pages/VouchersManager.tsx`)
- "Free Voucher" outline button added to PageHeader (before "Create Voucher")
- `CreateFreeVoucherDialog` component inline in VouchersManager with:
  - Voucher name input (required)
  - Reason dropdown: QA Testing / Gift / Other
  - Conditional text input when "Other" is selected (required)
  - Optional custom code input (auto-uppercased, spaces → dashes)
  - Optional usage limit input
  - Optional valid-until date input
- Green "Free" badge (`text-green-600 border-green-600`) shown in `VoucherCard` when `voucher.isFreeVoucher` is truthy

## Verification

- `npm run type-check` — passes clean
- `npm run build` — passes clean (2 pre-existing CSS warnings only)
- `npm run test` — 530/583 pass; 53 failures are pre-existing baseline (confirmed identical to Phase 25 baseline)

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

Files confirmed:
- convex/schema.ts — isFreeVoucher and freeReason fields present
- convex/vouchers/mutations.ts — createFreeVoucher exported
- src/hooks/convex/useVouchers.ts — FreeVoucherInput and useCreateFreeVoucher exported
- src/pages/VouchersManager.tsx — Free Voucher button, dialog, and badge present

Commits confirmed:
- 2ffc5f2 — feat(26-01): add isFreeVoucher schema fields and createFreeVoucher mutation
- 1f13ead — feat(26-01): add useCreateFreeVoucher hook and CreateFreeVoucherDialog UI
