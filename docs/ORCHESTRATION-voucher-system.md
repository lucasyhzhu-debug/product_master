# Implementation Strategy: Voucher Code Feature

## Executive Summary

Implementing a voucher/coupon code system for Frollie Recipe Master that enables promotional discounts (percentage or fixed amount), usage tracking, and manager override capabilities during checkout.

## Context Analysis

- **Project:** Frollie Recipe Master (Convex + React 19)
- **Existing Plans Referenced:**
  - Plan V1: `twinkling-kindling-token.md`
  - Review V2: `atomic-bubbling-conway.md`
  - Design V3: `atomic-bubbling-conway-v3.md`
- **Affected Tables:** orders, vouchers (new), voucherUsage (new)
- **Affected Components:** OrderFormPOS.tsx, VouchersManager.tsx (new), VoucherInput.tsx (new)

## Implementation Approach

**Backend (Convex):**
1. Add `vouchers` and `voucherUsage` tables to schema
2. Add voucher reference fields to `orders` table
3. Create CRUD queries/mutations for vouchers
4. Integrate voucher validation into order mutations
5. Implement voucher auto-release on order edit

**Frontend (React):**
1. Add `canAccessVouchers` permission (admin only)
2. Create VouchersManager page for admin
3. Create VoucherInput component for POS
4. Create ManagerOverrideDialog component
5. Implement low-price warning dialog

## Git Branching Architecture

```
main
|
+-- feature/voucher-system (integration branch)
    |
    +-- feature/voucher-schema          # Phase 1 (CURRENT)
    +-- feature/voucher-backend-crud    # Phase 2
    +-- feature/voucher-order-integration # Phase 3
    +-- feature/voucher-access-control  # Phase 4 (parallel)
    +-- feature/voucher-manager-page    # Phase 5 (parallel)
    +-- feature/voucher-pos-integration # Phase 6 (parallel)
```

## Sub-Agent Strategy

### Wave 1: Schema Changes [SEQUENTIAL]
| Agent | Task | Files |
|-------|------|-------|
| convex-backend | Add vouchers table | convex/schema.ts |
| convex-backend | Add voucherUsage table | convex/schema.ts |
| convex-backend | Add voucher fields to orders | convex/schema.ts |

### Wave 2: Backend CRUD [SEQUENTIAL after Wave 1]
| Agent | Task | Files |
|-------|------|-------|
| convex-backend | Create voucher queries | convex/vouchers/queries.ts |
| convex-backend | Create voucher mutations | convex/vouchers/mutations.ts |

### Wave 3: Order Integration [SEQUENTIAL after Wave 2]
| Agent | Task | Files |
|-------|------|-------|
| convex-backend | Modify order creation | convex/orders/mutations.ts |
| convex-backend | Add voucher release logic | convex/orders/mutations.ts |
| convex-backend | Update WhatsApp template | convex/orders/whatsapp.ts |

### Wave 4: Frontend [PARALLEL after Wave 3]
| Agent | Task | Files |
|-------|------|-------|
| react-ui-builder | Access control | src/lib/types.ts, src/App.tsx |
| react-ui-builder | VouchersManager page | src/pages/VouchersManager.tsx |
| react-ui-builder | POS integration | src/components/orders/*.tsx |

## Git Checkpoint Strategy

- [x] CP-0: Integration branch created - `feature/voucher-system`
- [ ] CP-1: Phase 1 complete - Schema deployed, tables visible
- [ ] CP-2: Phase 2 complete - CRUD queries/mutations work
- [ ] CP-3: Phase 3 complete - Order integration works
- [ ] CP-4: Phases 4,5,6 complete - Full E2E flow works
- [ ] CP-FINAL: Integration to main - All verification passes

## Success Criteria

- [ ] `npm run type-check` passes
- [ ] `npm run build` succeeds
- [ ] Convex dev server runs without errors
- [ ] Voucher CRUD works in dashboard
- [ ] Voucher application works in POS
- [ ] Manager override creates single-use voucher
- [ ] Order edit auto-releases voucher
- [ ] Final price validation prevents <= 0

## Key Business Rules

1. **One voucher per order** - No stacking allowed
2. **Voucher codes are uppercase** - Auto-normalized
3. **Order edits release voucher** - User must re-apply
4. **Final price validation:**
   - < Rp 20,000: Show confirmation dialog
   - <= 0: Hard block in backend
5. **Manager override:**
   - Requires reason
   - Single-use, 24hr expiry
   - Manager can only create during checkout

## Phase Status Tracking

| Phase | Branch | Status | Completed |
|-------|--------|--------|-----------|
| 1 | feature/voucher-schema | In Progress | - |
| 2 | feature/voucher-backend-crud | Pending | - |
| 3 | feature/voucher-order-integration | Pending | - |
| 4 | feature/voucher-access-control | Pending | - |
| 5 | feature/voucher-manager-page | Pending | - |
| 6 | feature/voucher-pos-integration | Pending | - |

---

*Document created: 2026-02-04*
*Last updated: 2026-02-04*
