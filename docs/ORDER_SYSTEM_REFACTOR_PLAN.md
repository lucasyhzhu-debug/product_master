# Order System Refactoring Plan

## Summary
Major refactor of order management: POS-style product buttons, WhatsApp template paste-to-populate, order-level discounts, and production-focused Kitchen View with ball counting dashboard.

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

## Multi-Agent Architecture

### Agent 1: Backend (Convex) Agent
**Scope:** All `convex/` directory changes
- Schema modifications
- Mutations and queries
- WhatsApp templates
- Data seeding

### Agent 2: UI Components Agent
**Scope:** New UI components in `src/components/orders/`
- ProductButtons, PasteTemplateBox, DeliveryToggle, DiscountInput
- KitchenDashboard, KitchenOrderCard
- Template parser utility

### Agent 3: Integration Agent
**Scope:** Refactoring existing files
- OrderForm.tsx complete refactor
- KitchenView.tsx refactor
- Hooks and types updates

### Agent 4: Testing/Audit Agent
**Scope:** Verification and quality
- Run build and type checks
- Test each feature manually
- Verify git commits are clean
- Document any issues

---

## Context Management Strategy

### Session Boundaries
This is a large update. Plan for **3-4 sessions**:

**Session 1:** Backend + Schema
- Complete all Convex changes
- Seed fixed products with COGS
- Commit: `feat(backend): order system schema and mutations`

**Session 2:** Kitchen View
- KitchenView refactor with dashboard
- Ball counting logic
- Sound/visual alerts
- Commit: `feat(kitchen): production dashboard with ball tracking`

**Session 3:** Order Form
- All new components
- OrderForm refactor
- Template parser
- Commit: `feat(orders): POS-style form with template parsing`

**Session 4:** Integration & Testing
- End-to-end testing
- Bug fixes
- Final polish
- Commit: `fix: order system polish and bug fixes`

### Context Handoff Between Sessions
At end of each session, create a `SESSION_HANDOFF.md` with:
- What was completed
- What's next
- Any blockers or decisions needed
- Files modified (for quick re-read)

---

## Git Branch Strategy

```
main
  └── feature/order-system-refactor (long-lived feature branch)
        ├── Session 1 commits (backend)
        ├── Session 2 commits (kitchen)
        ├── Session 3 commits (order form)
        └── Session 4 commits (testing/fixes)
```

**Commit points:**
1. After backend schema + seed complete → commit
2. After each major component complete → commit
3. After KitchenView complete → commit
4. After OrderForm complete → commit
5. After testing/fixes → commit
6. Merge to main after full review

---

## Implementation Details

### Phase 1: Backend Schema & Data

#### 1.1 Schema Changes (`convex/schema.ts`)

```typescript
menuProducts: defineTable({
  // ...existing fields
  isFixed: v.optional(v.boolean()),
  unitCost: v.optional(v.number()), // COGS in IDR
})

orders: defineTable({
  // ...existing fields
  orderLevelDiscount: v.optional(v.number()),
  orderLevelDiscountType: v.optional(v.string()), // "amount" | "percentage"
})
```

#### 1.2 Fixed Products Seed (`convex/menuProducts/mutations.ts`)

Add `seedFixedProducts` mutation with COGS:

| Code | Name | Grams | Price | Units | COGS (IDR) | isFixed |
|------|------|-------|-------|-------|------------|---------|
| ORIGINAL | Original | 80 | 50000 | 1 | 19231 | true |
| BITE_SINGLE | Bite Sized Single | 45 | 35000 | 1 | 12422 | true |
| BITE_DOUBLE | Bite Sized Double | 90 | 70000 | 2 | 24843 | true |
| BITE_TRIPLE | Bite Sized Triple | 135 | 99000 | 3 | 36765 | true |

- `productionType`: Original = "original", others = "bite_sized"
- `productionUnits`: number of 45g balls per package
- Prevent deletion when `isFixed === true`

#### 1.3 WhatsApp Order Template (`convex/orders/whatsapp.ts`)

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

#### 1.4 Kitchen Queries (`convex/orders/queries.ts`)

Update `getKitchenOrders`:
- Return ALL orders with status: `Confirmed` (pending production)
- Include `menuProductId` for ball type calculation
- Sort: due date ASC → total units DESC → order date ASC
- Return completed today count (orders marked complete since midnight)

New `getKitchenStats` query:
```typescript
{
  bigBallsNeeded: number,      // Sum of Original quantities (pending)
  bigBallsCompleted: number,   // Completed today
  midBallsNeeded: number,      // Sum of bite-sized units (qty × productionUnits) (pending)
  midBallsCompleted: number,   // Completed today
  ordersPending: number,       // Orders in Confirmed status
  ordersCompletedToday: number // Orders marked complete since midnight
}
```

**Commit after Phase 1:** `feat(backend): order system schema with fixed products and COGS`

---

### Phase 2: Kitchen View Refactor

#### 2.1 Kitchen Dashboard Component (`src/components/orders/KitchenDashboard.tsx`)

Top-of-page metrics showing BOTH balls and orders:
```
┌──────────────────────────────────────────────────────────┐
│  🔴 Big Balls         │  🟡 Mid Balls     │  📦 Orders   │
│  Needed: 12           │  Needed: 45       │  Pending: 8  │
│  Done: 8              │  Done: 32         │  Done: 5     │
└──────────────────────────────────────────────────────────┘
```

- Big balls = Original (80g) count
- Mid balls = sum of (quantity × productionUnits) for all bite-sized
- Orders = count of orders pending vs completed today
- "Done" counters reset at midnight (00:00)

#### 2.2 Kitchen Order Card (`src/components/orders/KitchenOrderCard.tsx`)

Compact card with BIG numbers for quick scanning (no product list):
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

After completion (with confetti animation):
```
│    [ ✓ COMPLETED ]                      │  ← tap to undo
```

**Design notes:**
- Ball counts are HUGE (48px+ font) for quick kitchen scanning
- No product breakdown shown (not critical for kitchen)
- Button text explains hold mechanic
- Confetti/celebration animation on completion
- Urgent orders (due within 2 hours): pulsing amber border + "URGENT" badge

**Completed orders:**
- Move to collapsible "Completed Today (5)" section at bottom
- Section collapsed by default
- Tap tick to undo (reverts status)

#### 2.3 Ball Completion Buttons (`src/components/orders/BallCompletionButtons.tsx`)

Four quick-action buttons below dashboard:
```
┌─────────────────────────────────────────────────────────────┐
│  [ +1 Big 🔴 ]  [ +5 Big 🔴 ]  [ +1 Mid 🟡 ]  [ +5 Mid 🟡 ] │
│     hold 1s         hold 1s        hold 1s        hold 1s   │
└─────────────────────────────────────────────────────────────┘
```

**Interaction flow:**
1. Hold button for 1 second to activate
2. Brown ball(s) fly from button down to TOP order card (by due date priority)
3. Ball count on card counts down as each ball "lands" (3... 2... 1... 0)
4. "Ding ding" sound plays on each ball landing (like restaurant order ready)
5. Animation takes ~0.8 seconds per ball (satisfying arc)
6. If order needs fewer balls than clicked, overflow goes to next order
7. When ball count hits 0, order auto-completes with confetti

**Example:** Click "+5 Big", top order needs 3:
- 3 balls fly to first order (counts down 3→2→1→0, auto-completes with confetti)
- 2 balls fly to second order (reduces its count)

#### 2.4 Kitchen View Page (`src/pages/KitchenView.tsx`)

Full refactor:
- Remove date filter entirely
- Add KitchenDashboard at top
- Add BallCompletionButtons below dashboard
- Order list sorted: due date → units → order date
- New orders appear at top with highlight animation, then sort to position
- Overdue orders: pulsing red border
- Urgent orders (due within 2 hours): pulsing amber border + "URGENT" badge
- New order alert: chime sound + pulse animation
- Collapsible "Completed Today (X)" section at bottom (collapsed by default)
- Keep as `/kitchen` route in main nav

#### 2.5 Sound Effects

Add notification sounds:
- **New order chime:** Play when new Confirmed order appears
- **Ball landing ding:** "Ding ding" when ball lands on order card
- **Completion fanfare:** Short celebration sound with confetti animation
- Use Web Audio API or simple audio files

**Commit after Phase 2:** `feat(kitchen): production dashboard with ball tracking and alerts`

---

### Phase 3: Order Form Refactor

#### 3.1 New Layout Order

```
1. [Copy Clean Template] button
2. Paste Template textarea → "Parse & Fill" button
3. Product Buttons (2x2 POS grid)
4. Line Items (product, price, qty with +/-, subtotal, balls breakdown)
5. Customer Section (search or auto-filled from parse)
6. Delivery Toggle boxes [Pickup] [Delivery]
7. Address field (if Delivery selected)
8. Dates: Order Date (readonly) | Due Date picker (+24h default)
9. Notes (1-line input, not textarea)
10. Discount row: [Rp ____] [% ____] (auto-calculate each other)
11. Totals: Subtotal → Discount → Order Total
12. [Create Order] button → auto-copies WhatsApp confirmation
```

#### 3.2 Template Parser (`src/lib/orderTemplateParser.ts`)

```typescript
interface ParsedOrderTemplate {
  items: { productCode: string; quantity: number }[];
  customer?: { phone: string; name: string; address: string };
  parseWarnings: string[];
  parseSuccess: boolean;
}
```

Parsing logic:
1. **Strict:** Look for `[N]` where N is number after each product line
2. **Flexible fallback:** Look for numbers near "Original", "Single", "Double", "Triple"
3. **Customer section:** Match "No. WA:", "Nama:", "Alamat:" patterns
4. **Zero handling:** Omit products with qty 0 or empty `[ ]` entirely
5. **Partial success:** Extract whatever is possible, populate form, show warnings
6. **Warnings examples:** "Could not parse quantity for Original", "Customer phone missing"

#### 3.3 POS Product Buttons (`src/components/orders/ProductButtons.tsx`)

- 2x2 grid of rounded boxes
- Each shows: name, grams, price
- **Tap:** Add 1 (or increment existing line)
- **Long-press (500ms):** Open quantity input modal

#### 3.4 Line Items Display

Each row shows:
```
Original (80g)     Rp [50.000]   [-] 2 [+]   Rp 100.000
                                 (2 balls)
```

- Editable price field
- +/- buttons for quantity (- at qty 1 removes item)
- Balls breakdown: `(quantity × productionUnits) balls`

#### 3.5 Discount Input (`src/components/orders/DiscountInput.tsx`)

Two linked inputs:
```
Discount: Rp [5.000]  or  [50] %
```

- Edit Rp → auto-calculate %
- Edit % → auto-calculate Rp
- Based on current subtotal
- **Warning at 30%+:** Show amber warning "High discount - please confirm"
- No hard cap - allow any discount amount

#### 3.6 Delivery Toggle (`src/components/orders/DeliveryToggle.tsx`)

Rounded toggle boxes (not dropdown):
```
[  Pickup  ]  [  Delivery  ]
              └── shows address textarea when selected
```

Default pickup location: "Goldfinch Legato"

#### 3.7 Repeat Customer Address Suggestion

For repeat customers (detected by WA number):
- Show last delivery address as clickable chip/suggestion
- Click to populate address field
- Do NOT auto-fill - user must click to confirm

#### 3.8 Auto-Copy WhatsApp on Create

After successful order creation:
1. Generate WhatsApp confirmation message
2. Auto-copy to clipboard
3. Show toast: "Order created! WhatsApp message copied to clipboard"

**Commit after Phase 3:** `feat(orders): POS-style form with template parsing`

---

### Phase 4: Hooks and Types Updates

#### 4.1 Types (`src/lib/types.ts`)

```typescript
interface MenuProduct {
  // ...existing
  is_fixed: boolean;
  unit_cost: number; // COGS - HIDDEN from UI except Dashboard
}

interface KitchenStats {
  big_balls_needed: number;
  big_balls_completed: number;
  mid_balls_needed: number;
  mid_balls_completed: number;
}

interface ParsedOrderTemplate {
  items: { product_code: string; quantity: number }[];
  customer?: { phone: string; name: string; address: string };
  parse_warnings: string[];
}
```

#### 4.2 Hooks Updates

- `useMenuProducts.ts`: Add `is_fixed`, `unit_cost` transform
- `useOrders.ts`: Add order-level discount fields, draft mutations
- New `useKitchenStats.ts`: Kitchen dashboard data

**Commit after Phase 4:** `feat(types): updated types and hooks for order system`

---

## Files to Modify

### Backend (Convex)
| File | Changes |
|------|---------|
| `convex/schema.ts` | Add `isFixed`, `unitCost` to menuProducts; add discount fields to orders |
| `convex/menuProducts/mutations.ts` | Add `seedFixedProducts`, block fixed deletion |
| `convex/orders/mutations.ts` | Order-level discount support, draft mutations |
| `convex/orders/queries.ts` | Refactor `getKitchenOrders`, add `getKitchenStats` |
| `convex/orders/whatsapp.ts` | Add `getOrderTemplate` for customer form |

### Frontend - New Files
| File | Purpose |
|------|---------|
| `src/components/orders/ProductButtons.tsx` | POS-style 2x2 product grid |
| `src/components/orders/PasteTemplateBox.tsx` | Paste + parse template |
| `src/components/orders/DeliveryToggle.tsx` | Rounded Pickup/Delivery toggle |
| `src/components/orders/DiscountInput.tsx` | Linked Rp/% discount inputs |
| `src/components/orders/KitchenDashboard.tsx` | Ball counts + order stats dashboard |
| `src/components/orders/KitchenOrderCard.tsx` | Compact order card with BIG numbers |
| `src/components/orders/BallCompletionButtons.tsx` | +1/+5 ball completion with flying animation |
| `src/lib/orderTemplateParser.ts` | Template parsing logic |
| `src/lib/kitchenSounds.ts` | Audio for chimes, dings, fanfare |
| `src/hooks/convex/useKitchenStats.ts` | Kitchen stats hook |

### Frontend - Modified Files
| File | Changes |
|------|---------|
| `src/components/orders/OrderForm.tsx` | Complete refactor with new layout |
| `src/pages/KitchenView.tsx` | Dashboard + alerts + new card design |
| `src/hooks/convex/useMenuProducts.ts` | Add `is_fixed`, `unit_cost` |
| `src/hooks/convex/useOrders.ts` | Order-level discount, draft mutations |
| `src/lib/types.ts` | New interfaces |

---

## Verification Plan

### Backend Testing
1. Run `npx convex dev`
2. Execute `menuProducts:seedFixedProducts` from dashboard
3. Verify 4 products with correct COGS values
4. Attempt delete fixed product → should fail
5. Create order with order-level discount → verify totals

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
7. Mark production complete
8. Verify dashboard updates

---

## Session Handoff Template

```markdown
# Session X Handoff

## Completed
- [ ] List of completed items

## Next Session
- [ ] List of next items

## Blockers
- Any issues encountered

## Files Modified
- file1.ts
- file2.tsx

## Commands to Resume
\`\`\`bash
git status
npx convex dev
npm run dev
\`\`\`
```
