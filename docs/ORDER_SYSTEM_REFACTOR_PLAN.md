# Order System Refactoring Plan

## Summary
Major refactor of order management: POS-style product buttons, WhatsApp template paste-to-populate, order-level discounts, and production-focused Kitchen View with ball counting dashboard. Includes foundational improvements for financial accuracy, schema enforcement, and message tracking.

---

## Business Rules

### Parsing Rules
- **Zero quantities:** Omit products with qty 0 or empty `[ ]` entirely from order
- **Parse failures:** Extract whatever is possible, show warnings for what failed, let user fix manually
- **Flexible parsing:** Try strict `[N]` format first, fall back to keyword matching

### Customer Rules
- **Repeat customer detection:** Match by WhatsApp number
- **Address suggestion:** For repeat customers, show last delivery address as clickable suggestion (not auto-fill)
- **Duplicate orders:** No prevention - allow unlimited orders per customer per day

### Discount Rules
- **Two linked inputs:** Rp amount and % - editing one auto-calculates the other
- **Warning threshold:** Show warning for discounts > 30% ("High discount - please confirm")
- **No hard cap:** Allow any discount amount

### Margin/COGS Rules
- **Visibility:** COGS and margin are HIDDEN everywhere except Dashboard metrics
- **Storage:** COGS stored in menuProducts.unitCost for calculations
- **Dashboard only:** Show margin metrics only in Dashboard aggregations

### Kitchen View Rules
- **Ball types:** Original (80g) = Big ball, Bite Sized (45g units) = Mid ball
- **Card design:** BIG numbers only (no product breakdown), optimized for quick scanning
- **Completion tracking:** Both metrics - orders completed AND balls produced
- **Dashboard resets:** Midnight (00:00)
- **Order sorting:** Due date ASC → Total units DESC → Order date ASC
- **New orders:** Appear at top with highlight + chime, then animate to sorted position
- **Overdue:** Pulsing red border animation
- **Urgent (due within 2 hours):** Pulsing amber border + "URGENT" badge
- **Ball completion buttons:** +1/+5 for each ball type, hold 1 sec to activate
- **Ball animation:** Balls fly from button to top order, 0.8s satisfying arc, "ding ding" sound
- **Overflow:** Extra balls auto-flow to next order in priority
- **Auto-complete:** When ball count hits 0, order auto-completes with confetti
- **Complete action:** Press-and-hold 1 second (button shows "Hold 1 sec to complete")
- **Celebration:** Confetti animation + fanfare sound on order completion
- **Completed orders:** Collapsible section at bottom, collapsed by default
- **Undo:** Tap green tick to revert to incomplete

---

## Wave-Based Agentic Architecture

### Overview
Implementation is organized into **Waves** (parallel work streams) containing **Tasks** (atomic units of work). Each wave can have multiple agents working in parallel on independent tasks.

```
Wave 1: Foundation (Schema + Backend Core)
   ├── Agent A: Schema changes + migrations
   ├── Agent B: Fixed products seed + COGS
   └── Agent C: WhatsApp message tracking table

Wave 2: Kitchen Backend + Order Mutations
   ├── Agent A: Kitchen queries (getKitchenStats, getKitchenOrders)
   ├── Agent B: Order mutations (order-level discount, ball completion)
   └── Agent C: WhatsApp order template generation

Wave 3: Kitchen UI Components
   ├── Agent A: KitchenDashboard + KitchenOrderCard
   ├── Agent B: BallCompletionButtons + animations
   └── Agent C: Sound effects (kitchenSounds.ts)

Wave 4: Order Form UI Components
   ├── Agent A: ProductButtons + PasteTemplateBox
   ├── Agent B: DiscountInput + DeliveryToggle
   └── Agent C: Template parser (orderTemplateParser.ts)

Wave 5: Integration + Page Refactors
   ├── Agent A: KitchenView.tsx refactor
   ├── Agent B: OrderForm.tsx refactor
   └── Agent C: Hooks + types updates

Wave 6: Testing + Polish
   ├── Agent A: Backend testing + verification
   ├── Agent B: Frontend testing + UX polish
   └── Agent C: Build verification + documentation
```

### Agent Specializations

| Agent Type | Scope | Tools Focus |
|------------|-------|-------------|
| **Backend Agent** | `convex/` directory | Schema, mutations, queries |
| **UI Component Agent** | `src/components/` | New component creation |
| **Integration Agent** | `src/pages/`, `src/hooks/` | Refactoring existing files |
| **Testing Agent** | Verification | Build, type-check, manual testing |

### Parallelization Rules
1. **Within a wave:** All tasks can run in parallel (no dependencies)
2. **Between waves:** Must complete Wave N before starting Wave N+1
3. **Agent isolation:** Each agent works on distinct files (no conflicts)
4. **Commit points:** One commit per wave completion

---

## Context Management Strategy

### Session Boundaries
This is a large update. Plan for **4-5 sessions**:

| Session | Waves | Focus | Commit Message |
|---------|-------|-------|----------------|
| **1** | Wave 1 | Schema + Backend Foundation | `feat(backend): schema updates and foundation` |
| **2** | Wave 2 | Kitchen Backend + Order Mutations | `feat(backend): kitchen queries and order mutations` |
| **3** | Wave 3-4 | All UI Components | `feat(ui): kitchen and order form components` |
| **4** | Wave 5 | Page Refactors + Integration | `feat(pages): kitchen and order form refactors` |
| **5** | Wave 6 | Testing + Polish | `fix: testing and polish` |

### Context Handoff Between Sessions
At end of each session, create/update `SESSION_HANDOFF.md` with:
- Waves completed
- Tasks remaining
- Any blockers or decisions needed
- Files modified (for quick re-read)
- Test results

---

## Git Branch Strategy

```
main
  └── feature/order-system-refactor (long-lived feature branch)
        ├── Wave 1 commit: schema + foundation
        ├── Wave 2 commit: backend queries/mutations
        ├── Wave 3-4 commit: UI components
        ├── Wave 5 commit: page refactors
        └── Wave 6 commit: testing/fixes
```

**Commit points:** After each wave or group of waves completes.

---

## Wave 1: Foundation (Schema + Backend Core)

### 1.1 Schema Changes (`convex/schema.ts`)

**Order status enforcement (from v.string() to union):**
```typescript
orders: defineTable({
  status: v.union(
    v.literal("Draft"),
    v.literal("AwaitingPayment"),
    v.literal("Confirmed"),
    v.literal("ProductionComplete"),
    v.literal("Packaging"),
    v.literal("WaitingShipment"),
    v.literal("CompleteShipped"),
    v.literal("WaitingPickup"),
    v.literal("PickedUp"),
    v.literal("Cancelled")
  ),
  paymentStatus: v.union(
    v.literal("Unpaid"),
    v.literal("Partial"),
    v.literal("Paid")
  ),
  orderLevelDiscount: v.optional(v.number()),
  orderLevelDiscountType: v.optional(v.string()), // "amount" | "percentage"
})
```

**Menu products with fixed flag and COGS:**
```typescript
menuProducts: defineTable({
  // ...existing fields
  isFixed: v.optional(v.boolean()),
  unitCost: v.optional(v.number()), // COGS in IDR
  productionType: v.optional(v.string()), // "original" | "bite_sized"
  productionUnits: v.optional(v.number()), // balls per package
})
```

**WhatsApp message tracking table:**
```typescript
orderMessages: defineTable({
  orderId: v.id("orders"),
  template: v.string(),
  messageHash: v.string(),
  sentAt: v.number(),
  sentBy: v.string(),
  messagePreview: v.optional(v.string()),
})
  .index("by_order", ["orderId"])
  .index("by_order_template", ["orderId", "template"])
```

### 1.2 Fixed Products Seed (`convex/menuProducts/mutations.ts`)

Add `seedFixedProducts` mutation:

| Code | Name | Grams | Price | Units | COGS (IDR) | isFixed |
|------|------|-------|-------|-------|------------|---------|
| ORIGINAL | Original | 80 | 50000 | 1 | 19231 | true |
| BITE_SINGLE | Bite Sized Single | 45 | 35000 | 1 | 12422 | true |
| BITE_DOUBLE | Bite Sized Double | 90 | 70000 | 2 | 24843 | true |
| BITE_TRIPLE | Bite Sized Triple | 135 | 99000 | 3 | 36765 | true |

- Prevent deletion when `isFixed === true`

### 1.3 WhatsApp Message Tracking (`convex/orders/whatsapp.ts`)

Add `markMessageSent` mutation with deduplication:
```typescript
export const markMessageSent = mutation({
  args: { orderId: v.id("orders"), template: v.string(), sentBy: v.string() },
  handler: async (ctx, args) => {
    // Check for duplicate by hash
    // If exists, return { alreadySent: true }
    // Else insert and return { alreadySent: false }
  },
});
```

**Commit after Wave 1:** `feat(backend): schema updates with fixed products and message tracking`

---

## Wave 2: Kitchen Backend + Order Mutations

### 2.1 Kitchen Queries (`convex/orders/queries.ts`)

**Update `getKitchenOrders`:**
- Return ALL orders with status: `Confirmed` (pending production)
- Include `menuProductId` for ball type calculation
- Sort: due date ASC → total units DESC → order date ASC

**New `getKitchenStats` query:**
```typescript
{
  bigBallsNeeded: number,      // Sum of Original quantities (pending)
  bigBallsCompleted: number,   // Completed today (since midnight)
  midBallsNeeded: number,      // Sum of bite-sized units (qty × productionUnits)
  midBallsCompleted: number,   // Completed today
  ordersPending: number,       // Orders in Confirmed status
  ordersCompletedToday: number // Orders marked complete since midnight
}
```

### 2.2 Order Mutations (`convex/orders/mutations.ts`)

- Order-level discount support in create/update
- `completeBalls` mutation for ball completion buttons
- Ball overflow logic (auto-complete orders, flow to next)

### 2.3 WhatsApp Order Template (`convex/orders/whatsapp.ts`)

New `getOrderTemplate` query:
```
Halo! Mau makan Frollie snacks?

1. Original (80g) - Rp 50.000 [  ]
2. Bite Sized Single (45g) - Rp 35.000 [  ]
3. Bite Sized Double (90g = 2x45g) - Rp 70.000 [  ]
4. Bite Sized Triple (135g = 3x45g) - Rp 99.000 [  ]

---
Untuk customer baru:
No. WA:
Nama:
Alamat:

Isi jumlah yang diinginkan di dalam [ ]
```

**Commit after Wave 2:** `feat(backend): kitchen queries and order mutations`

---

## Wave 3: Kitchen UI Components

### 3.1 Kitchen Dashboard (`src/components/orders/KitchenDashboard.tsx`)

```
┌──────────────────────────────────────────────────────────┐
│  🔴 Big Balls         │  🟡 Mid Balls     │  📦 Orders   │
│  Needed: 12           │  Needed: 45       │  Pending: 8  │
│  Done: 8              │  Done: 32         │  Done: 5     │
└──────────────────────────────────────────────────────────┘
```

### 3.2 Kitchen Order Card (`src/components/orders/KitchenOrderCard.tsx`)

```
┌──────────────────────────────────────────┐
│ #0131-001 • John Doe          DUE: 2pm  │
│ ─────────────────────────────────────── │
│                                          │
│     🔴  2          🟡  6                │  ← LARGE font (48px+)
│     big            mid                   │  ← small label
│                                          │
│ ─────────────────────────────────────── │
│  [ Hold 1 sec to complete this order ]  │
└──────────────────────────────────────────┘
```

### 3.3 Ball Completion Buttons (`src/components/orders/BallCompletionButtons.tsx`)

```
┌─────────────────────────────────────────────────────────────┐
│  [ +1 Big 🔴 ]  [ +5 Big 🔴 ]  [ +1 Mid 🟡 ]  [ +5 Mid 🟡 ] │
│     hold 1s         hold 1s        hold 1s        hold 1s   │
└─────────────────────────────────────────────────────────────┘
```

**Interaction flow:**
1. Hold button for 1 second to activate
2. Brown ball(s) fly from button to TOP order card (0.8s arc)
3. Ball count counts down as each ball lands (3→2→1→0)
4. "Ding ding" sound on each landing
5. Overflow goes to next order
6. Auto-complete with confetti when count hits 0

### 3.4 Sound Effects (`src/lib/kitchenSounds.ts`)

- New order chime
- Ball landing ding
- Completion fanfare
- Use Web Audio API

**Commit after Wave 3:** `feat(ui): kitchen dashboard and ball completion components`

---

## Wave 4: Order Form UI Components

### 4.1 Product Buttons (`src/components/orders/ProductButtons.tsx`)

- 2x2 grid of rounded boxes
- Each shows: name, grams, price
- **Tap:** Add 1 (or increment existing line)
- **Long-press (500ms):** Open quantity input modal

### 4.2 Paste Template Box (`src/components/orders/PasteTemplateBox.tsx`)

- Textarea for pasting filled template
- "Parse & Fill" button
- Shows warnings for partial parse

### 4.3 Template Parser (`src/lib/orderTemplateParser.ts`)

```typescript
interface ParsedOrderTemplate {
  items: { productCode: string; quantity: number }[];
  customer?: { phone: string; name: string; address: string };
  parseWarnings: string[];
  parseSuccess: boolean;
}
```

### 4.4 Discount Input (`src/components/orders/DiscountInput.tsx`)

```
Discount: Rp [5.000]  or  [50] %
```
- Edit Rp → auto-calculate %
- Edit % → auto-calculate Rp
- Warning at 30%+

### 4.5 Delivery Toggle (`src/components/orders/DeliveryToggle.tsx`)

```
[  Pickup  ]  [  Delivery  ]
```
- Rounded toggle boxes (not dropdown)
- Default pickup: "Goldfinch Legato"

**Commit after Wave 4:** `feat(ui): order form POS components`

---

## Wave 5: Integration + Page Refactors

### 5.1 Kitchen View Page (`src/pages/KitchenView.tsx`)

Full refactor:
- Remove date filter entirely
- Add KitchenDashboard at top
- Add BallCompletionButtons below dashboard
- Order list sorted: due date → units → order date
- New orders: highlight + chime, then animate to position
- Overdue: pulsing red border
- Urgent (due within 2 hours): amber pulse + "URGENT" badge
- Collapsible "Completed Today (X)" section at bottom

### 5.2 Order Form (`src/components/orders/OrderForm.tsx`)

New layout:
```
1. [Copy Clean Template] button
2. Paste Template textarea → "Parse & Fill" button
3. Product Buttons (2x2 POS grid)
4. Line Items (product, price, qty with +/-, subtotal, balls breakdown)
5. Customer Section (search or auto-filled from parse)
6. Delivery Toggle boxes [Pickup] [Delivery]
7. Address field (if Delivery selected)
8. Dates: Order Date (readonly) | Due Date picker (+24h default)
9. Notes (1-line input)
10. Discount row: [Rp ____] [% ____]
11. Totals: Subtotal → Discount → Order Total
12. [Create Order] button → auto-copies WhatsApp confirmation
```

### 5.3 Hooks + Types Updates

- `src/lib/types.ts`: Add MenuProduct.is_fixed, unit_cost, KitchenStats
- `src/hooks/convex/useMenuProducts.ts`: Add is_fixed, unit_cost transform
- `src/hooks/convex/useOrders.ts`: Order-level discount, draft mutations
- `src/hooks/convex/useKitchenStats.ts`: New hook for kitchen dashboard

**Commit after Wave 5:** `feat(pages): kitchen and order form refactors`

---

## Wave 6: Testing + Polish

### Backend Testing
1. Run `npx convex dev`
2. Execute `menuProducts:seedFixedProducts` from dashboard
3. Verify 4 products with correct COGS values
4. Attempt delete fixed product → should fail
5. Create order with order-level discount → verify totals
6. Test WhatsApp message deduplication

### Kitchen View Testing
1. Create multiple orders with different due dates
2. Verify dashboard shows correct ball counts AND order counts
3. Test sorting: due date → units → order date
4. Test ball completion buttons (+1/+5 for each type)
5. Verify flying ball animation with countdown on cards
6. Test overflow: click +5 when top order needs 3 → verify 2 go to next order
7. Verify auto-complete when ball count hits 0
8. Test confetti + fanfare on order completion
9. Test "ding ding" sound on ball landing
10. Mark order complete with press-and-hold button
11. Verify completed orders go to collapsible section
12. Tap tick to undo → verify reverts
13. Test new order chime + highlight animation
14. Test overdue (red pulse) and urgent (amber pulse + badge)

### Order Form Testing
1. Click "Copy Clean Template" → verify clipboard
2. Paste filled template → verify parsing
3. Test POS buttons: tap +1, long-press qty input
4. Verify balls breakdown shows correctly
5. Test discount: enter Rp → verify % calculates
6. Test delivery toggle
7. Submit order → verify WhatsApp copied to clipboard

### End-to-End Flow
1. Copy template → send to customer (simulate)
2. Paste filled template back
3. Adjust with POS buttons
4. Add discount
5. Create order
6. See order in Kitchen View
7. Mark production complete via ball buttons
8. Verify dashboard updates

**Commit after Wave 6:** `fix: testing verification and polish`

---

## Files Summary

### Backend (Convex)
| File | Changes |
|------|---------|
| `convex/schema.ts` | Status unions, isFixed, unitCost, orderMessages table |
| `convex/menuProducts/mutations.ts` | seedFixedProducts, block fixed deletion |
| `convex/orders/mutations.ts` | Order-level discount, completeBalls |
| `convex/orders/queries.ts` | getKitchenOrders refactor, getKitchenStats |
| `convex/orders/whatsapp.ts` | getOrderTemplate, markMessageSent |

### Frontend - New Files
| File | Purpose |
|------|---------|
| `src/components/orders/ProductButtons.tsx` | POS-style 2x2 product grid |
| `src/components/orders/PasteTemplateBox.tsx` | Paste + parse template |
| `src/components/orders/DeliveryToggle.tsx` | Rounded Pickup/Delivery toggle |
| `src/components/orders/DiscountInput.tsx` | Linked Rp/% discount inputs |
| `src/components/orders/KitchenDashboard.tsx` | Ball counts + order stats |
| `src/components/orders/KitchenOrderCard.tsx` | Compact card with BIG numbers |
| `src/components/orders/BallCompletionButtons.tsx` | +1/+5 ball completion |
| `src/lib/orderTemplateParser.ts` | Template parsing logic |
| `src/lib/kitchenSounds.ts` | Audio for chimes, dings, fanfare |
| `src/hooks/convex/useKitchenStats.ts` | Kitchen stats hook |

### Frontend - Modified Files
| File | Changes |
|------|---------|
| `src/components/orders/OrderForm.tsx` | Complete refactor with POS layout |
| `src/pages/KitchenView.tsx` | Dashboard + alerts + ball completion |
| `src/hooks/convex/useMenuProducts.ts` | Add is_fixed, unit_cost |
| `src/hooks/convex/useOrders.ts` | Order-level discount |
| `src/lib/types.ts` | New interfaces |

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Schema changes break existing data | All changes are additive (no field removals) |
| Ball animation performance | Use CSS transforms, limit to 5 balls max |
| Sound annoys users | Add mute toggle in kitchen settings |
| Parse failures frustrate users | Always show what WAS parsed + clear warnings |
| Long press conflicts with scroll | Use touch-action CSS, test on mobile |

---

## Session Handoff Template

```markdown
# Session X Handoff

## Waves Completed
- [ ] Wave 1: Foundation
- [ ] Wave 2: Kitchen Backend
- [ ] Wave 3: Kitchen UI
- [ ] Wave 4: Order Form UI
- [ ] Wave 5: Integration
- [ ] Wave 6: Testing

## Files Modified This Session
- file1.ts
- file2.tsx

## Blockers
- Any issues encountered

## Next Session Focus
- Wave X tasks remaining

## Commands to Resume
```bash
git switch feature/order-system-refactor
git pull
npx convex dev
npm run dev
```
```
