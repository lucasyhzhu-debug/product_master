# Malo Recipe Master - Order System V2 Mini-PRDs

## Overview

Order System V2 split into **4 independent mini-PRDs**, each deliverable in 1 session.

| PRD | Name | Session | Delivers |
|-----|------|---------|----------|
| **PRD-0** | Schema Foundation | 1 | Status unions, fixed products, message tracking |
| **PRD-1** | Kitchen Core | 2 | Dashboard, order cards, basic completion |
| **PRD-2** | Kitchen Gamification | 3 | Ball buttons, flying animations, sounds, confetti |
| **PRD-3** | Order Form POS | 4 | ProductButtons, template parser, discount input |

**Visual Feedback Overlay** - Separate planning session after Order System V2 complete.

---

# Agent Build Requirements

> **STATUS: ✅ COMPLETE** - All 3 agents have been built and are ready for use.

## Created Agents

| Agent | Model | Location | Status |
|-------|-------|----------|--------|
| `convex-backend` | sonnet | `.claude/agents/convex-backend.md` | ✅ Ready |
| `react-ui-builder` | sonnet | `.claude/agents/react-ui-builder.md` | ✅ Ready |
| `code-auditor` | haiku | `.claude/agents/code-auditor.md` | ✅ Ready |

**Note:** The built-in `convex-expert` agent is now deprecated for this project. Use `convex-backend` instead - it has project-specific knowledge of our 19-table schema, business rules, and coding patterns.

## Agent Capabilities

### `convex-backend` (HIGH VALUE)
- Schema modifications (`convex/schema.ts`)
- Query creation/modification (`convex/{entity}/queries.ts`)
- Mutation creation/modification (`convex/{entity}/mutations.ts`)
- Cost calculator updates (`convex/lib/costCalculator.ts`)
- WhatsApp templates (`convex/orders/whatsapp.ts`)
- Knows all 19 tables, indexes, status unions, and business rules

### `react-ui-builder` (HIGH VALUE)
- Page components (`src/pages/*.tsx`)
- Shared components (`src/components/shared/`)
- Entity components (`src/components/{entity}/`)
- Convex hooks (`src/hooks/convex/`)
- Framer Motion animations
- shadcn/ui + Tailwind CSS 4 patterns
- Loading states and toast notifications

### `code-auditor` (QUALITY GATE)
- `npm run type-check` - TypeScript verification
- `npm run build` - Build verification
- `npm run lint` - Code quality
- Pattern compliance checks
- READ-ONLY - cannot modify code

---

## Agent Decision Matrix

| Task Type | Recommended Agent | Fallback |
|-----------|-------------------|----------|
| Schema changes | `convex-backend` | `general-purpose` |
| Convex queries/mutations | `convex-backend` | `general-purpose` |
| React components | `react-ui-builder` | `general-purpose` |
| Convex hooks | `react-ui-builder` | `general-purpose` |
| TypeScript utility files | `general-purpose` | - |
| Build verification | `Explore` + manual | `code-auditor` |
| Codebase exploration | `Explore` | - |
| Agent creation | `agent-builder` | - |

---

# PRD-0: Schema Foundation

## Session 1 | Branch: `feature/schema-foundation`

### Scope
Harden the database schema with proper type enforcement, add fields for upcoming features, seed fixed products with COGS values.

### Deliverables

#### 1. Schema Changes (`convex/schema.ts`)

**Order status union** (replace line 228):
```typescript
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
```

**Payment status union** (replace line 232):
```typescript
paymentStatus: v.union(
  v.literal("Unpaid"),
  v.literal("Partial"),
  v.literal("Paid")
),
```

**Order-level discount fields** (after line 267):
```typescript
orderLevelDiscount: v.optional(v.number()),
orderLevelDiscountType: v.optional(v.union(
  v.literal("amount"),
  v.literal("percentage")
)),
```

**MenuProducts fields** (after line 57):
```typescript
isFixed: v.optional(v.boolean()),
unitCost: v.optional(v.number()),  // COGS in IDR
```

**OrderItems ball tracking** (after line 290):
```typescript
productionType: v.optional(v.string()),
productionUnits: v.optional(v.number()),
ballsRemaining: v.optional(v.number()),
```

**New orderMessages table** (after line 293):
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
  .index("by_order_template", ["orderId", "template"]),
```

#### 2. Fixed Products Seed (`convex/menuProducts/mutations.ts`)

Add `seedFixedProducts` mutation:

| Code | Name | Grams | Price (IDR) | Units | COGS (IDR) |
|------|------|-------|-------------|-------|------------|
| ORIGINAL | Original | 80 | 50,000 | 1 | 19,231 |
| BITE_SINGLE | Bite Sized Single | 45 | 35,000 | 1 | 12,422 |
| BITE_DOUBLE | Bite Sized Double | 90 | 70,000 | 2 | 24,843 |
| BITE_TRIPLE | Bite Sized Triple | 135 | 99,000 | 3 | 36,765 |

Block deletion of fixed products in `remove` mutation.

#### 3. WhatsApp Message Tracking (`convex/orders/whatsapp.ts`)

- `markMessageSent(orderId, template, sentBy)` - Deduplication by hash (5-min window)
- `getMessageHistory(orderId)` - List sent messages
- `getOrderTemplate()` - Clean template with products + BCA bank info

**Template format:**
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

---
Transfer ke: BCA 1234567890 a.n. Malo
```

### Files Modified
- `convex/schema.ts`
- `convex/menuProducts/mutations.ts`
- `convex/orders/whatsapp.ts`

### Verification
```bash
npx convex dev                    # Types regenerate without errors
npm run type-check                # No TypeScript errors
# Run menuProducts:seedFixedProducts from Convex dashboard
# Verify 4 products exist with unitCost values
# Attempt delete fixed product - should fail with error
# Test getOrderTemplate returns formatted template
```

### Commit
```bash
git commit -m "feat(schema): foundation with status unions, fixed products, message tracking"
```

---

## Multi-Agent Implementation Architecture

### Status: MOSTLY COMPLETE (schema already implemented)

**Analysis:** Based on code review, PRD-0 is already 95% complete:
- Schema changes: DONE (status unions, payment unions, discount fields, ball tracking, orderMessages table)
- Fixed products seed: DONE (`seedFixedProducts` mutation exists with correct data)
- WhatsApp message tracking: DONE (`markMessageSent`, `getMessageHistory`, `getOrderTemplate` all exist)

### Remaining Work

Only verification tasks remain:

| Task | Agent | Action |
|------|-------|--------|
| Verify schema types | `Explore` | Run `npx convex dev --once`, check for errors |
| Verify seed mutation | Manual | Run `menuProducts:seedFixedProducts` from dashboard |
| Verify template format | Manual | Test `getOrderTemplate` output matches spec |

### Wave Structure: N/A - Already Complete

**Recommendation:** Mark PRD-0 as complete, verify in dashboard, proceed to PRD-1.

---

# PRD-1: Kitchen Core

## Session 2 | Branch: `feature/kitchen-core`

### Scope
Production-focused Kitchen View with dashboard showing ball counts and order stats. Compact order cards with big numbers. Basic hold-to-complete functionality.

### Dependencies
- PRD-0 complete (schema fields exist)

### Deliverables

#### 1. Kitchen Queries (`convex/orders/queries.ts`)

**Refactor `getKitchenOrders`:**
- Return Confirmed orders only
- Calculate `bigBallsNeeded` (Original products)
- Calculate `midBallsNeeded` (Bite Sized units)
- Sort: due date ASC → total units DESC → order date ASC

**Add `getKitchenStats`:**
```typescript
{
  bigBallsNeeded: number,      // Pending orders
  bigBallsCompleted: number,   // Since midnight
  midBallsNeeded: number,
  midBallsCompleted: number,
  ordersPending: number,
  ordersCompletedToday: number,
}
```

**Add `getCompletedToday`:**
- Orders completed since midnight
- For collapsible completed section

#### 2. Order Mutations (`convex/orders/mutations.ts`)

**Add `completeOrder`:**
- Mark order as ProductionComplete
- Set all item `ballsRemaining` to 0

**Add `revertToConfirmed`:**
- Move back to Confirmed status
- Reset `ballsRemaining` to original values

#### 3. Kitchen Dashboard Component

**New file:** `src/components/orders/KitchenDashboard.tsx`

```
┌────────────────────────────────────────────────────┐
│  🔴 Big Balls    │  🟡 Mid Balls   │  📦 Orders   │
│  Needed: 12      │  Needed: 45     │  Pending: 8  │
│  Done: 8         │  Done: 32       │  Done: 5     │
└────────────────────────────────────────────────────┘
```

#### 4. Kitchen Order Card Component

**New file:** `src/components/orders/KitchenOrderCard.tsx`

```
┌────────────────────────────────────────┐
│ #0131-001 • John Doe        DUE: 2pm  │
│ ────────────────────────────────────── │
│                                        │
│     🔴  2          🟡  6              │  ← 48px font
│     big            mid                 │
│                                        │
│ ────────────────────────────────────── │
│  [ Hold 1 sec to complete this order ] │
└────────────────────────────────────────┘
```

- Overdue: pulsing red border
- Urgent (due within 2hr): amber pulse + "URGENT" badge
- Hold-to-complete button with progress indicator

#### 5. Kitchen Stats Hook

**New file:** `src/hooks/convex/useKitchenStats.ts`

- `useConvexKitchenStats()` - Dashboard data
- `useConvexCompletedToday()` - Completed orders
- `useConvexCompleteOrder()` - Mark complete
- `useConvexRevertToConfirmed()` - Undo

#### 6. KitchenView Page Refactor

**File:** `src/pages/KitchenView.tsx`

New layout:
1. KitchenDashboard at top
2. Pending orders list (KitchenOrderCard)
3. Collapsible "Completed Today (X)" section at bottom
4. Tap green tick on completed order to undo

### Files Created
- `src/components/orders/KitchenDashboard.tsx`
- `src/components/orders/KitchenOrderCard.tsx`
- `src/hooks/convex/useKitchenStats.ts`

### Files Modified
- `convex/orders/queries.ts`
- `convex/orders/mutations.ts`
- `src/pages/KitchenView.tsx`
- `src/lib/types.ts` (add KitchenOrder interface)

### Verification
```bash
npm run build && npm run type-check
# Kitchen View shows dashboard with ball counts
# Orders sorted by priority (due date → units → order date)
# Overdue orders have red pulsing border
# Urgent orders have amber pulse + badge
# Hold-to-complete works (1 sec hold)
# Completed section shows at bottom, collapsible
# Tap tick to undo works
```

### Commit
```bash
git commit -m "feat(kitchen): core dashboard and order cards with completion"
```

---

## Multi-Agent Implementation Architecture

### Complexity: MEDIUM-HIGH (Backend refactor + 3 new components + page rewrite)

### Wave 1: Backend Queries [PARALLEL]

**Agent:** `convex-backend` (or `general-purpose`)

| Task | Files | Dependencies |
|------|-------|--------------|
| Refactor `getKitchenOrders` | `convex/orders/queries.ts` | None |
| Add `getKitchenStats` query | `convex/orders/queries.ts` | None |
| Add `getCompletedToday` query | `convex/orders/queries.ts` | None |

**Detailed Instructions for getKitchenOrders refactor:**
- Filter to `status === "Confirmed"` only (not the old hardcoded array)
- For each order, calculate:
  - `bigBallsNeeded`: Sum of (quantity) for items where `productionType === "original"`
  - `midBallsNeeded`: Sum of (quantity * productionUnits) for items where `productionType === "bite_sized"`
- Sort: `dueDate ASC` → `totalUnits DESC` → `orderDate ASC`
- Return orders with calculated ball counts

**Detailed Instructions for getKitchenStats:**
```typescript
{
  bigBallsNeeded: number,      // Sum across all Confirmed orders
  bigBallsCompleted: number,   // Sum from ProductionComplete orders since midnight
  midBallsNeeded: number,
  midBallsCompleted: number,
  ordersPending: number,       // Count of Confirmed orders
  ordersCompletedToday: number,// Count of ProductionComplete since midnight
}
```

### Wave 2: Backend Mutations [SEQUENTIAL after Wave 1]

**Agent:** `convex-backend` (or `general-purpose`)

| Task | Files | Dependencies |
|------|-------|--------------|
| Add `completeOrder` mutation | `convex/orders/mutations.ts` | Schema (already done) |
| Add `revertToConfirmed` mutation | `convex/orders/mutations.ts` | Schema (already done) |

**Detailed Instructions:**
- `completeOrder`: Set status to "ProductionComplete", set all item `ballsRemaining` to 0
- `revertToConfirmed`: Set status back to "Confirmed", reset `ballsRemaining` to original values (calculate from productionUnits)

### Wave 3: Frontend Hook [SEQUENTIAL after Wave 2]

**Agent:** `react-ui-builder` (or `general-purpose`)

| Task | Files | Dependencies |
|------|-------|--------------|
| Create `useKitchenStats.ts` | `src/hooks/convex/useKitchenStats.ts` | Backend queries exist |

**Hook exports:**
- `useConvexKitchenStats()` - Returns dashboard stats
- `useConvexCompletedToday()` - Returns completed orders list
- `useConvexCompleteOrder()` - Mutation wrapper
- `useConvexRevertToConfirmed()` - Mutation wrapper

### Wave 4: Frontend Components [PARALLEL after Wave 3]

**Agent:** `react-ui-builder` (or `general-purpose`) - spawn 2-3 parallel tasks

| Task | Files | Parallel |
|------|-------|----------|
| Create KitchenDashboard | `src/components/orders/KitchenDashboard.tsx` | Yes |
| Create KitchenOrderCard | `src/components/orders/KitchenOrderCard.tsx` | Yes |
| Update types | `src/lib/types.ts` | Yes |

**KitchenDashboard Component:**
- 3-column layout: Big Balls | Mid Balls | Orders
- Each column shows "Needed: X" and "Done: Y"
- Use shadcn Card component
- Consider using colored circles (red for big, yellow for mid)

**KitchenOrderCard Component:**
- Compact card showing: `#orderNumber | CustomerName | DUE: time`
- Big numbers (48px font) showing ball counts
- Pulsing red border for overdue orders
- Amber pulse + "URGENT" badge for orders due within 2 hours
- Hold-to-complete button with 1-second progress indicator

### Wave 5: Page Integration [SEQUENTIAL after Wave 4]

**Agent:** `react-ui-builder` (or `general-purpose`)

| Task | Files | Dependencies |
|------|-------|--------------|
| Refactor KitchenView page | `src/pages/KitchenView.tsx` | All components exist |

**Page Structure:**
1. KitchenDashboard at top
2. Pending orders list using KitchenOrderCard
3. Collapsible "Completed Today (X)" section at bottom
4. Tap green tick on completed card to undo (revert to Confirmed)

### Wave 6: Verification [SEQUENTIAL]

**Agent:** `Explore` + Manual

| Task | Command |
|------|---------|
| Type check | `npm run type-check` |
| Build | `npm run build` |
| Manual test | Open Kitchen View, verify dashboard displays |

### Git Checkpoints

- [ ] Checkpoint 1: After Wave 2 - `feat(kitchen): add kitchen queries and mutations`
- [ ] Checkpoint 2: After Wave 5 - `feat(kitchen): core dashboard and order cards with completion`

### Estimated Effort

| Wave | Agent Tasks | Estimated Time |
|------|-------------|----------------|
| Wave 1-2 | 5 backend tasks | 20-30 min |
| Wave 3-5 | 5 frontend tasks | 30-45 min |
| Wave 6 | Verification | 10 min |
| **Total** | | **60-85 min** |

---

# PRD-2: Kitchen Gamification

## Session 3 | Branch: `feature/kitchen-gamification`

### Scope
Add the fun! Ball completion buttons, flying animations, sound effects, confetti celebration on every order completion.

### Dependencies
- PRD-1 complete (Kitchen Core working)

### Deliverables

#### 1. Ball Completion Mutations (`convex/orders/mutations.ts`)

**Add `completeBalls`:**
```typescript
args: {
  ballType: v.union(v.literal("big"), v.literal("mid")),
  count: v.number(),  // 1 or 5
}
```

Logic:
- Apply balls to top priority order first
- If order needs fewer than `count`, overflow to next order
- Auto-complete orders when all balls reach 0
- Return `{ completedOrders: string[], ballsUsed: number, overflow: number }`

#### 2. Ball Completion Buttons Component

**New file:** `src/components/orders/BallCompletionButtons.tsx`

```
┌─────────────────────────────────────────────────────────┐
│  [ +1 Big 🔴 ]  [ +5 Big 🔴 ]  [ +1 Mid 🟡 ]  [ +5 Mid 🟡 ] │
│     hold 1s        hold 1s        hold 1s        hold 1s    │
└─────────────────────────────────────────────────────────┘
```

- Hold 1 second to activate
- Progress indicator during hold
- Release early = cancel

#### 3. Sound Effects Utility

**New file:** `src/lib/kitchenSounds.ts`

Using Web Audio API (no external files):
- `playDing()` - Ball landing sound
- `playNewOrderChime()` - New order notification
- `playCompletionFanfare()` - Order completion celebration
- `getSoundsEnabled()` / `setSoundsEnabled()` - Mute state (localStorage)

#### 4. Sound Toggle Component

**New file:** `src/components/orders/SoundToggle.tsx`

- Small speaker icon in Kitchen View header
- Click to toggle mute
- Visual indicator for current state

#### 5. Flying Ball Animation

In `BallCompletionButtons.tsx`:
- On button activation, spawn ball element(s)
- Animate from button to top order card (0.8s arc)
- "Ding" sound on each landing
- Decrement counter on card as balls land

CSS animation approach:
```css
@keyframes flyBall {
  0% { transform: translate(0, 0) scale(1); }
  50% { transform: translate(var(--mid-x), var(--mid-y)) scale(1.2); }
  100% { transform: translate(var(--end-x), var(--end-y)) scale(0.8); }
}
```

#### 6. Confetti Celebration

On order auto-complete (all balls = 0):
- Confetti animation (canvas or CSS particles)
- Fanfare sound
- Brief highlight on completed card before it moves to completed section

Consider using `canvas-confetti` library or simple CSS-based confetti.

#### 7. Update KitchenView

**File:** `src/pages/KitchenView.tsx`

- Add SoundToggle in header
- Add BallCompletionButtons below dashboard
- Wire up flying ball animations
- Wire up confetti on completion

### Files Created
- `src/components/orders/BallCompletionButtons.tsx`
- `src/components/orders/SoundToggle.tsx`
- `src/lib/kitchenSounds.ts`

### Files Modified
- `convex/orders/mutations.ts` (add completeBalls)
- `src/pages/KitchenView.tsx`
- `src/hooks/convex/useKitchenStats.ts` (add useConvexCompleteBalls)

### Dependencies to Install
```bash
npm install canvas-confetti
npm install -D @types/canvas-confetti
```

### Verification
```bash
npm run build && npm run type-check
# Ball buttons require 1-sec hold to activate
# Balls fly from button to top order card
# "Ding" plays on each ball landing (if unmuted)
# Counter on card decrements as balls land
# Overflow correctly goes to next order
# Order auto-completes when all balls = 0
# Confetti + fanfare plays on completion
# Sound toggle mutes/unmutes all sounds
```

### Commit
```bash
git commit -m "feat(kitchen): gamification with ball buttons, animations, sounds, confetti"
```

---

## Multi-Agent Implementation Architecture

### Complexity: HIGH (Animation-heavy, Web Audio API, external library)

### Pre-Implementation: Install Dependencies

```bash
npm install canvas-confetti
npm install -D @types/canvas-confetti
```

### Wave 1: Backend Mutation [SINGLE TASK]

**Agent:** `convex-backend` (or `general-purpose`)

| Task | Files | Dependencies |
|------|-------|--------------|
| Add `completeBalls` mutation | `convex/orders/mutations.ts` | PRD-1 complete |

**Detailed Instructions for completeBalls:**
```typescript
args: {
  ballType: v.union(v.literal("big"), v.literal("mid")),
  count: v.number(),  // 1 or 5
}
handler:
1. Get all Confirmed orders sorted by priority (same as getKitchenOrders)
2. For each order, find items matching ballType (original = big, bite_sized = mid)
3. Decrement ballsRemaining by count, respecting 0 minimum
4. If overflow (needed fewer than count), continue to next order
5. Auto-complete orders when ALL items have ballsRemaining === 0
6. Return: { completedOrders: Id<"orders">[], ballsUsed: number, overflow: number }
```

### Wave 2: Sound Utility [SINGLE TASK]

**Agent:** `general-purpose` (Web Audio is generic JS)

| Task | Files | Dependencies |
|------|-------|--------------|
| Create kitchenSounds utility | `src/lib/kitchenSounds.ts` | None |

**Detailed Instructions:**
- Use Web Audio API (no external audio files needed)
- Create oscillator-based sounds:
  - `playDing()`: Short high-pitched tone (ball landing)
  - `playNewOrderChime()`: Two-tone ascending chime
  - `playCompletionFanfare()`: Three-tone celebration
- LocalStorage for mute state: `kitchen_sounds_enabled`
- Export: `getSoundsEnabled()`, `setSoundsEnabled(enabled: boolean)`

### Wave 3: Frontend Components [PARALLEL]

**Agent:** `react-ui-builder` (or `general-purpose`) - spawn 3 parallel tasks

| Task | Files | Complexity |
|------|-------|------------|
| Create BallCompletionButtons | `src/components/orders/BallCompletionButtons.tsx` | HIGH |
| Create SoundToggle | `src/components/orders/SoundToggle.tsx` | LOW |
| Update useKitchenStats hook | `src/hooks/convex/useKitchenStats.ts` | LOW |

**BallCompletionButtons - CRITICAL COMPONENT:**
- 4 buttons: `+1 Big`, `+5 Big`, `+1 Mid`, `+5 Mid`
- Each button requires 1-second hold to activate
- Progress indicator (circular or linear) during hold
- Early release = cancel
- On activation:
  1. Call `completeBalls` mutation
  2. Spawn flying ball animation(s)
  3. Play ding sound on each ball landing (staggered)
- Animation approach: CSS keyframes with Framer Motion for orchestration
- Flying balls should arc from button to the top order card

**SoundToggle:**
- Speaker icon (Volume2 / VolumeX from Lucide)
- Click to toggle mute
- Reads/writes localStorage via kitchenSounds utility

### Wave 4: Confetti Integration [SINGLE TASK]

**Agent:** `react-ui-builder` (or `general-purpose`)

| Task | Files | Dependencies |
|------|-------|--------------|
| Add confetti celebration | Integration in KitchenView | canvas-confetti installed |

**Implementation:**
```typescript
import confetti from 'canvas-confetti';

function celebrateCompletion() {
  confetti({
    particleCount: 100,
    spread: 70,
    origin: { y: 0.6 }
  });
  playCompletionFanfare();
}
```
- Trigger when `completeBalls` returns `completedOrders.length > 0`
- Brief highlight on completed card before it moves to completed section

### Wave 5: Page Integration [SEQUENTIAL after Wave 3-4]

**Agent:** `react-ui-builder` (or `general-purpose`)

| Task | Files | Dependencies |
|------|-------|--------------|
| Update KitchenView page | `src/pages/KitchenView.tsx` | All components exist |

**Integration Points:**
1. Add SoundToggle to page header
2. Add BallCompletionButtons below KitchenDashboard
3. Wire up flying ball animations (CSS custom properties for positions)
4. Wire up confetti on order completion
5. Handle overflow feedback (toast showing "X balls applied, Y overflow")

### Wave 6: Verification [SEQUENTIAL]

**Agent:** `Explore` + Manual

| Task | Command/Action |
|------|----------------|
| Type check | `npm run type-check` |
| Build | `npm run build` |
| Test sounds | Toggle mute, verify localStorage persists |
| Test hold buttons | Verify 1-sec hold, early release cancels |
| Test ball flying | Verify animation reaches card |
| Test confetti | Complete an order, verify celebration |

### Git Checkpoints

- [ ] Checkpoint 1: After Wave 1-2 - `feat(kitchen): add completeBalls mutation and sound utility`
- [ ] Checkpoint 2: After Wave 5 - `feat(kitchen): gamification with ball buttons, animations, sounds, confetti`

### Risk Areas

1. **Flying ball animation positioning** - May need runtime coordinate calculation for card positions
2. **Sound timing** - Staggered dings need careful timing with animation
3. **Mobile touch events** - Hold-to-activate may behave differently on touch

### Estimated Effort

| Wave | Agent Tasks | Estimated Time |
|------|-------------|----------------|
| Pre-impl | Dependency install | 2 min |
| Wave 1 | 1 backend task | 15-20 min |
| Wave 2 | 1 utility task | 20-25 min |
| Wave 3-4 | 4 frontend tasks | 45-60 min |
| Wave 5-6 | Integration + verify | 20-30 min |
| **Total** | | **100-135 min** |

---

# PRD-3: Order Form POS

## Session 4 | Branch: `feature/order-form-pos`

### Scope
POS-style order creation with product buttons (replacing autocomplete), WhatsApp template copy/paste flow, order-level discount with linked Rp/% inputs.

### Dependencies
- PRD-0 complete (schema fields, fixed products exist)

### Deliverables

#### 1. Order Mutations Updates (`convex/orders/mutations.ts`)

**Update `create`:**
- Accept `orderLevelDiscount`, `orderLevelDiscountType`
- Calculate final total after discount

**Add `updateOrderDiscount`:**
- Editable anytime before completion
- Recalculate totals when changed

#### 2. Template Parser Utility

**New file:** `src/lib/orderTemplateParser.ts`

```typescript
interface ParseResult {
  items: { productCode: string; productName: string; quantity: number }[];
  customer: { phone: string; name: string; address: string } | null;
  parseWarnings: string[];
  parseSuccess: boolean;
}

function parseOrderTemplate(text: string): ParseResult
```

Parsing rules:
- Try `[N]` format first
- Fall back to keyword matching (e.g., "2x Original")
- Skip products with qty 0 or empty `[ ]`
- Extract customer info from No. WA/Nama/Alamat lines
- Return warnings for unparseable lines

#### 3. ProductButtons Component

**New file:** `src/components/orders/ProductButtons.tsx`

```
┌─────────────────────┬─────────────────────┐
│ Original            │ Bite Sized Single   │
│ 80g                 │ 45g                 │
│ Rp 50k              │ Rp 35k              │
├─────────────────────┼─────────────────────┤
│ Bite Sized Double   │ Bite Sized Triple   │
│ 90g                 │ 135g                │
│ Rp 70k              │ Rp 99k              │
└─────────────────────┴─────────────────────┘
```

- 2x2 grid layout
- Tap: Add 1 (or increment if exists)
- Long-press (500ms): Open quantity input dialog
- Fixed products only for now (4 Frollie products)

Props:
```typescript
interface ProductButtonsProps {
  products: MenuProduct[];
  onAddProduct: (product: MenuProduct, quantity: number) => void;
}
```

#### 4. PasteTemplateBox Component

**New file:** `src/components/orders/PasteTemplateBox.tsx`

- Textarea for pasting filled template
- "Paste" button (clipboard API)
- "Parse & Fill" button
- Shows success/warning alerts after parsing

#### 5. DiscountInput Component

**New file:** `src/components/orders/DiscountInput.tsx`

```
Order Discount: Rp [______] or [____] %
```

- Edit Rp → auto-calculate %
- Edit % → auto-calculate Rp
- Warning alert at >30%: "High discount (X%) - please confirm"
- No hard cap

#### 6. DeliveryToggle Component

**New file:** `src/components/orders/DeliveryToggle.tsx`

```
[  📍 Pickup  ]  [  🚚 Delivery  ]
```

- Rounded toggle boxes (not dropdown)
- Visual highlight on selected

#### 7. New OrderFormPOS Component

**New file:** `src/components/orders/OrderFormPOS.tsx`

Build as NEW component (safer rollback). Layout:

1. **Template Section**
   - "Copy Clean Template" button
   - PasteTemplateBox

2. **Products Section**
   - ProductButtons (2x2 grid)
   - Line items list (product, qty +/-, subtotal)

3. **Customer Section**
   - Search existing or create new
   - Auto-fill from parsed template

4. **Delivery Section**
   - DeliveryToggle
   - Address field (if Delivery selected)

5. **Dates Section**
   - Order Date (readonly, today)
   - Due Date picker (default +24h)

6. **Notes**
   - Single-line input

7. **Discount Section**
   - DiscountInput

8. **Totals**
   - Subtotal
   - Discount applied
   - **Order Total**

9. **Submit**
   - "Create Order" button
   - Auto-copy WhatsApp confirmation to clipboard

#### 8. Integration

**File:** `src/pages/OrderManager.tsx`

- Replace `<OrderForm>` with `<OrderFormPOS>`
- Or feature-flag toggle between old/new

### Files Created
- `src/lib/orderTemplateParser.ts`
- `src/components/orders/ProductButtons.tsx`
- `src/components/orders/PasteTemplateBox.tsx`
- `src/components/orders/DiscountInput.tsx`
- `src/components/orders/DeliveryToggle.tsx`
- `src/components/orders/OrderFormPOS.tsx`

### Files Modified
- `convex/orders/mutations.ts`
- `src/hooks/convex/useOrders.ts` (discount mutations)
- `src/hooks/convex/useMenuProducts.ts` (add is_fixed, unit_cost)
- `src/pages/OrderManager.tsx` (swap form component)
- `src/lib/types.ts` (update interfaces)

### Verification
```bash
npm run build && npm run type-check
# "Copy Clean Template" copies to clipboard
# Paste filled template → Parse extracts items + customer
# ProductButtons tap adds 1, long-press opens qty dialog
# Items list shows with +/- quantity controls
# Discount Rp/% linked correctly
# >30% shows warning
# DeliveryToggle switches modes
# Create order includes all fields
# WhatsApp confirmation auto-copied
# Order shows in Kitchen View
```

### Commit
```bash
git commit -m "feat(orders): POS form with product buttons, template parser, discount input"
```

---

## Multi-Agent Implementation Architecture

### Complexity: HIGH (Multiple components, parser logic, linked inputs)

### Wave 1: Backend Mutations [PARALLEL]

**Agent:** `convex-backend` (or `general-purpose`)

| Task | Files | Dependencies |
|------|-------|--------------|
| Update `create` mutation for discounts | `convex/orders/mutations.ts` | PRD-0 schema |
| Add `updateOrderDiscount` mutation | `convex/orders/mutations.ts` | PRD-0 schema |

**Detailed Instructions for create update:**
- Accept optional `orderLevelDiscount` and `orderLevelDiscountType` args
- Calculate: if type === "percentage", discountAmount = totalAmount * (discount / 100)
- Final total = totalAmount - discountAmount
- Store discount info on order record

**Detailed Instructions for updateOrderDiscount:**
- Allow updating discount anytime before terminal status
- Recalculate totals when discount changes
- Return updated order ID

### Wave 2: Template Parser Utility [SINGLE TASK]

**Agent:** `general-purpose` (parsing logic is generic)

| Task | Files | Dependencies |
|------|-------|--------------|
| Create orderTemplateParser | `src/lib/orderTemplateParser.ts` | None |

**Detailed Implementation:**
```typescript
interface ParseResult {
  items: { productCode: string; productName: string; quantity: number }[];
  customer: { phone: string; name: string; address: string } | null;
  parseWarnings: string[];
  parseSuccess: boolean;
}

function parseOrderTemplate(text: string): ParseResult
```

**Parsing Rules:**
1. Try `[N]` format first (e.g., `Original (80g) - Rp 50.000 [2]`)
   - Regex: `/\d+\.\s*(.+?)\s*\(.+?\)\s*-\s*Rp\s*[\d.,]+\s*\[\s*(\d+)\s*\]/`
2. Fall back to keyword matching (e.g., `2x Original`, `Original x 2`)
3. Skip products with qty 0 or empty `[ ]` or `[  ]`
4. Extract customer info:
   - `No. WA: 081234567890` → phone
   - `Nama: John Doe` → name
   - `Alamat: Jl. Example` → address
5. Return warnings for unparseable lines (non-empty, non-separator)

### Wave 3: Frontend Components Part 1 [PARALLEL]

**Agent:** `react-ui-builder` (or `general-purpose`) - spawn 3 parallel tasks

| Task | Files | Complexity |
|------|-------|------------|
| Create ProductButtons | `src/components/orders/ProductButtons.tsx` | MEDIUM |
| Create PasteTemplateBox | `src/components/orders/PasteTemplateBox.tsx` | MEDIUM |
| Create DiscountInput | `src/components/orders/DiscountInput.tsx` | HIGH |

**ProductButtons:**
- 2x2 grid layout
- Props: `products: MenuProduct[]`, `onAddProduct: (product, qty) => void`
- Tap: Add 1 (or increment)
- Long-press (500ms): Open quantity input Dialog
- Each button shows: Product name, grams, price
- Visual feedback on tap (scale animation)

**PasteTemplateBox:**
- Textarea for pasting filled template
- "Paste" button uses `navigator.clipboard.readText()`
- "Parse & Fill" button calls parser, emits parsed items
- Shows AlertDialog with success/warnings after parsing
- Props: `onParsed: (result: ParseResult) => void`

**DiscountInput - CRITICAL LINKED INPUTS:**
- Two inputs side by side: `Rp [______]` and `[____] %`
- Editing Rp auto-calculates % (based on current subtotal)
- Editing % auto-calculates Rp
- Need debounce to prevent infinite loop
- Warning Alert (amber) at >30%: "High discount (X%) - please confirm"
- Props: `subtotal: number`, `onChange: (amount: number, type: 'amount' | 'percentage') => void`

### Wave 4: Frontend Components Part 2 [PARALLEL after Wave 3]

**Agent:** `react-ui-builder` (or `general-purpose`) - spawn 2 parallel tasks

| Task | Files | Complexity |
|------|-------|------------|
| Create DeliveryToggle | `src/components/orders/DeliveryToggle.tsx` | LOW |
| Update hooks | `src/hooks/convex/useOrders.ts`, `useMenuProducts.ts` | LOW |

**DeliveryToggle:**
- Two rounded toggle boxes: `Pickup` and `Delivery`
- Styled like segmented control
- Visual highlight (primary color background) on selected
- Props: `value: 'Pickup' | 'Delivery'`, `onChange: (value) => void`

### Wave 5: OrderFormPOS Component [SINGLE TASK - LARGE]

**Agent:** `react-ui-builder` (or `general-purpose`)

| Task | Files | Dependencies |
|------|-------|--------------|
| Create OrderFormPOS | `src/components/orders/OrderFormPOS.tsx` | All Wave 3-4 components |

**This is a NEW component (safer rollback), not a refactor of existing OrderForm.**

**Layout Sections:**
1. **Template Section**
   - "Copy Clean Template" button (calls `getOrderTemplate`, copies to clipboard)
   - PasteTemplateBox component
2. **Products Section**
   - ProductButtons (2x2 grid for fixed products)
   - Line items list with qty +/- controls and subtotal
3. **Customer Section**
   - Combobox: Search existing customers or type new name
   - Auto-fill from parsed template if customer info found
4. **Delivery Section**
   - DeliveryToggle component
   - Address input (shown only if Delivery selected)
5. **Dates Section**
   - Order Date (readonly, shows today)
   - Due Date picker (default +24 hours)
6. **Notes**
   - Single-line Input
7. **Discount Section**
   - DiscountInput component
8. **Totals**
   - Subtotal (sum of line items)
   - Discount applied (calculated)
   - **Order Total** (bold)
9. **Submit**
   - "Create Order" Button
   - On success: Auto-copy WhatsApp confirmation to clipboard, show toast

### Wave 6: Page Integration [SEQUENTIAL after Wave 5]

**Agent:** `react-ui-builder` (or `general-purpose`)

| Task | Files | Dependencies |
|------|-------|--------------|
| Update OrderManager | `src/pages/OrderManager.tsx` | OrderFormPOS exists |
| Update types | `src/lib/types.ts` | - |

**Integration Options:**
- Option A: Replace `<OrderForm>` with `<OrderFormPOS>`
- Option B: Feature flag to toggle between old/new
- Recommendation: Option A (cleaner, old form preserved in git history)

### Wave 7: Verification [SEQUENTIAL]

**Agent:** `Explore` + Manual

| Task | Command/Action |
|------|----------------|
| Type check | `npm run type-check` |
| Build | `npm run build` |
| Test template copy | Click "Copy Clean Template", verify clipboard |
| Test template paste | Paste filled template, verify parsing |
| Test ProductButtons | Tap adds 1, long-press opens qty dialog |
| Test discount linking | Edit Rp, verify % updates; edit %, verify Rp updates |
| Test >30% warning | Enter 35%, verify amber alert appears |
| Test order creation | Create full order, verify saved correctly |
| Test WhatsApp copy | Verify confirmation message auto-copied |

### Git Checkpoints

- [ ] Checkpoint 1: After Wave 1-2 - `feat(orders): add discount mutations and template parser`
- [ ] Checkpoint 2: After Wave 4 - `feat(orders): add POS form components`
- [ ] Checkpoint 3: After Wave 6 - `feat(orders): POS form with product buttons, template parser, discount input`

### Risk Areas

1. **Clipboard API permissions** - May need user gesture, test in different browsers
2. **Discount input infinite loop** - Careful debouncing required
3. **Parser edge cases** - Indonesian text, various number formats
4. **Long-press on mobile** - Test touch events carefully

### Estimated Effort

| Wave | Agent Tasks | Estimated Time |
|------|-------------|----------------|
| Wave 1 | 2 backend tasks | 15-20 min |
| Wave 2 | 1 parser task | 25-30 min |
| Wave 3 | 3 component tasks | 40-50 min |
| Wave 4 | 2 component tasks | 15-20 min |
| Wave 5 | 1 large component | 45-60 min |
| Wave 6-7 | Integration + verify | 20-30 min |
| **Total** | | **160-210 min** |

---

# Summary

## Session Sequence

| Session | PRD | Branch | Key Deliverable |
|---------|-----|--------|-----------------|
| 1 | PRD-0 | `feature/schema-foundation` | Schema unions, fixed products, message tracking |
| 2 | PRD-1 | `feature/kitchen-core` | Dashboard, order cards, basic completion |
| 3 | PRD-2 | `feature/kitchen-gamification` | Ball buttons, animations, sounds, confetti |
| 4 | PRD-3 | `feature/order-form-pos` | ProductButtons, template parser, discount |

## All New Files (14 total)

**Backend (1):**
- `convex/feedback/` - (Visual Feedback - later)

**Frontend Components (9):**
- `src/components/orders/KitchenDashboard.tsx`
- `src/components/orders/KitchenOrderCard.tsx`
- `src/components/orders/BallCompletionButtons.tsx`
- `src/components/orders/SoundToggle.tsx`
- `src/components/orders/ProductButtons.tsx`
- `src/components/orders/PasteTemplateBox.tsx`
- `src/components/orders/DiscountInput.tsx`
- `src/components/orders/DeliveryToggle.tsx`
- `src/components/orders/OrderFormPOS.tsx`

**Frontend Utilities (2):**
- `src/lib/kitchenSounds.ts`
- `src/lib/orderTemplateParser.ts`

**Frontend Hooks (1):**
- `src/hooks/convex/useKitchenStats.ts`

## All Modified Files (8 total)

**Backend (3):**
- `convex/schema.ts`
- `convex/menuProducts/mutations.ts`
- `convex/orders/mutations.ts`
- `convex/orders/queries.ts`
- `convex/orders/whatsapp.ts`

**Frontend (3):**
- `src/pages/KitchenView.tsx`
- `src/pages/OrderManager.tsx`
- `src/hooks/convex/useOrders.ts`
- `src/hooks/convex/useMenuProducts.ts`
- `src/lib/types.ts`

---

# Session Handoff Template

```markdown
# Session X Handoff - PRD-Y

## Status
- [ ] PRD-0: Schema Foundation
- [ ] PRD-1: Kitchen Core
- [ ] PRD-2: Kitchen Gamification
- [ ] PRD-3: Order Form POS

## This Session Completed
- Task 1
- Task 2

## Files Modified
- path/file.ts

## Issues/Blockers
- None / describe issue

## Next Session
- PRD-Y+1 tasks

## Resume Commands
git switch feature/[branch]
npx convex dev
npm run dev
```

---

# Visual Feedback Overlay

**Status:** Separate planning session after Order System V2 complete.

**Scope reminder:**
- Floating button (bottom-right)
- Screenshot capture with html2canvas
- Feedback panel with comments, priority, tags
- Export to PRD markdown
- First use of Convex file storage

---

# Multi-Agent Orchestration Summary

## Total Implementation Effort

| PRD | Waves | Agent Tasks | Estimated Time | Complexity |
|-----|-------|-------------|----------------|------------|
| PRD-0 | N/A | Verification only | 10 min | DONE |
| PRD-1 | 6 | 10+ tasks | 60-85 min | MEDIUM-HIGH |
| PRD-2 | 6 | 8+ tasks | 100-135 min | HIGH |
| PRD-3 | 7 | 12+ tasks | 160-210 min | HIGH |
| **Total** | | **30+ tasks** | **330-440 min** | |

## Recommended Agent Strategy

### Option A: Build Custom Agents First (RECOMMENDED)

1. **Session 0 (15-20 min):** Use `agent-builder` to create:
   - `convex-backend` agent
   - `react-ui-builder` agent

2. **Session 1 (10 min):** PRD-0 verification only

3. **Sessions 2-4:** PRD-1 through PRD-3 with specialized agents

**Benefits:**
- Consistent code patterns across PRDs
- Faster implementation (agents know project structure)
- Fewer errors in Convex patterns

### Option B: Use General-Purpose Only

Skip agent creation, use `general-purpose` for all tasks.

**Benefits:**
- Start immediately
- Less setup overhead

**Drawbacks:**
- May need more detailed prompts
- Higher chance of pattern inconsistencies

## Parallel Execution Strategy

Each PRD has waves marked `[PARALLEL]` where multiple agents can work simultaneously:

| PRD | Parallelizable Waves | Max Parallel Tasks |
|-----|---------------------|-------------------|
| PRD-1 | Wave 1, Wave 4 | 3 |
| PRD-2 | Wave 3 | 3 |
| PRD-3 | Wave 1, Wave 3, Wave 4 | 3 |

**Orchestration Pattern:**
```
Wave 1 [PARALLEL] → Wave 2 [SEQUENTIAL] → Wave 3 [PARALLEL] → ...
     ↓                    ↓                    ↓
  3 agents             1 agent             3 agents
  in parallel          waits for           in parallel
                       Wave 1
```

## Git Branch Strategy

```
main
 └── feature/schema-foundation (PRD-0) ← CURRENT
       └── feature/kitchen-core (PRD-1)
             └── feature/kitchen-gamification (PRD-2)
                   └── feature/order-form-pos (PRD-3)
```

After each PRD: merge back to `main`, then branch from new `main`.

## Session Handoff Protocol

At end of each session, create/update `SESSION_HANDOFF.md`:

```markdown
# Session Handoff - Order System V2

## Completed
- [x] PRD-0: Schema Foundation
- [ ] PRD-1: Kitchen Core
- [ ] PRD-2: Kitchen Gamification
- [ ] PRD-3: Order Form POS

## Last Session (PRD-X)
- Wave Y completed
- Files modified: [list]
- Pending: Wave Z

## Resume Commands
git switch feature/[current-branch]
npx convex dev
npm run dev
```

## CTO Recommendation

1. **Verify PRD-0 now** - Run `npx convex dev --once` to confirm schema is clean
2. **Build agents in Session 0** - 15-20 min investment pays off across 3 PRDs
3. **Start PRD-1** - Highest value, enables kitchen workflow immediately
4. **Commit early, commit often** - Git checkpoints after each wave
5. **Test manually between waves** - Catch issues before building on top
