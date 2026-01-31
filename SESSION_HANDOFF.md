# Session 1 Handoff - PRD-0: Schema Foundation

## Status
- [x] PRD-0: Schema Foundation
- [ ] PRD-1: Kitchen Core
- [ ] PRD-2: Kitchen Gamification
- [ ] PRD-3: Order Form POS

## This Session Completed

### Schema Changes (`convex/schema.ts`)
- Order status enforced as union (10 states)
- Payment status enforced as union (3 states)
- Order-level discount fields added
- menuProducts: `isFixed`, `unitCost` fields added
- orderItems: ball tracking fields added (`productionType`, `productionUnits`, `ballsRemaining`)
- New `orderMessages` table for WhatsApp tracking

### Backend Mutations/Queries
- `menuProducts:seedFixedProducts` - Seeds 4 Frollie products with COGS:
  - ORIGINAL: 80g, Rp 50,000, COGS Rp 19,231
  - BITE_SINGLE: 45g, Rp 35,000, COGS Rp 12,422
  - BITE_DOUBLE: 90g, Rp 70,000, COGS Rp 24,843
  - BITE_TRIPLE: 135g, Rp 99,000, COGS Rp 36,765
- Fixed products cannot be deleted (blocked in remove mutation)
- `whatsapp:getOrderTemplate` - Clean template with BCA bank info
- `whatsapp:markMessageSent` - Deduplication (5-min window)
- `whatsapp:getMessageHistory` - List sent messages

### Frontend Updates
- `OrderStatusType` and `PaymentStatusType` exported from useOrders.ts
- OrderManager uses type-safe status filter
- OrderDetail uses type-safe payment mutations

## Files Modified
- `convex/schema.ts`
- `convex/menuProducts/mutations.ts`
- `convex/orders/mutations.ts`
- `convex/orders/queries.ts`
- `convex/orders/whatsapp.ts`
- `src/hooks/convex/useOrders.ts`
- `src/pages/OrderDetail.tsx`
- `src/pages/OrderManager.tsx`

## Verification Results
- [x] `npx convex dev` - Schema deployed successfully
- [x] `npm run type-check` - No TypeScript errors
- [x] `npm run build` - Production build successful

## Issues/Blockers
- Test files have vitest import errors (pre-existing, unrelated to PRD-0)

## Next Session: PRD-1 Kitchen Core
Focus areas:
- Kitchen queries: `getKitchenOrders` (with ball counts), `getKitchenStats`, `getCompletedToday`
- Order mutations: `completeOrder`, `revertToConfirmed`
- Components: `KitchenDashboard.tsx`, `KitchenOrderCard.tsx`
- Hook: `useKitchenStats.ts`
- Refactor: `KitchenView.tsx`

## Resume Commands
```bash
git switch feature/schema-foundation
npx convex dev
npm run dev
```

## To Seed Fixed Products
Run from Convex Dashboard > Functions tab:
```
menuProducts:seedFixedProducts
```
