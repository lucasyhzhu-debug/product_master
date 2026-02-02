# Developer Onboarding Guide

> **Welcome to Frollie Recipe Master!** This guide will help you understand the post-refactor architecture and patterns.
> **Last Updated:** 2026-02-03 (Post-Phase 4 Refactor)

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Architecture Overview](#architecture-overview)
3. [Order System Patterns](#order-system-patterns)
4. [Kitchen Production Workflow](#kitchen-production-workflow)
5. [Common Tasks](#common-tasks)
6. [Testing & Debugging](#testing--debugging)

---

## Quick Start

### Prerequisites
- Node.js 18+
- npm or yarn
- Convex account (free tier for development)

### Setup Steps

```bash
# Clone and install
git clone <repo-url>
cd product_master
npm install

# Configure Convex
cp .env.example .env.local
# Edit .env.local with your Convex deployment URL

# Start development servers (in separate terminals)
npx convex dev        # Terminal 1: Backend
npm run dev           # Terminal 2: Frontend
```

### First-Time Database Setup

```bash
# Access Convex dashboard
npx convex dashboard

# Run seed functions in Functions tab:
tags:seedDefaults          # Creates default tags
menuProducts:seedDefaults  # Creates menu products
```

**Development URL:** `http://localhost:5173`

---

## Architecture Overview

### Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Backend** | Convex | Real-time serverless database + queries/mutations |
| **Frontend** | React 19 + TypeScript | UI with type safety |
| **Build** | Vite | Fast HMR development |
| **Styling** | Tailwind CSS | Utility-first CSS |
| **Components** | shadcn/ui (Radix) | Accessible UI primitives |

### Project Structure

```
product_master/
├── convex/                  # Backend (Convex)
│   ├── schema.ts            # Database schema (19 tables)
│   ├── lib/                 # Shared utilities
│   │   └── costCalculator.ts
│   ├── orders/              # Order module
│   │   ├── queries.ts       # Read operations
│   │   ├── mutations.ts     # Write operations (thin wrappers)
│   │   ├── whatsapp.ts      # Message templates
│   │   ├── helpers.ts       # Pure calculation functions
│   │   └── helpers/         # Context-dependent helpers
│   │       ├── ballDistribution.ts
│   │       ├── statusTransitions.ts
│   │       ├── usageTracking.ts
│   │       └── productionRecords.ts
│   ├── recipes/
│   ├── packaging/
│   ├── products/
│   └── ...
├── src/                     # Frontend (React)
│   ├── components/
│   │   ├── ui/              # shadcn primitives
│   │   ├── shared/          # Reusable components
│   │   └── orders/          # Order-specific components
│   ├── pages/               # Route components
│   ├── hooks/convex/        # Convex integration hooks
│   └── lib/                 # Frontend utilities
└── docs/                    # Documentation
```

---

## Order System Patterns

### Two-Tier Helper Architecture (NEW)

**Problem Solved:** Separation of pure logic from database operations for better testability.

**Structure:**

| Tier | File | Has `ctx` | Testable | Purpose |
|------|------|-----------|----------|---------|
| **Pure** | `convex/orders/helpers.ts` | ❌ No | Unit tests | Calculations, formatting |
| **Ctx** | `convex/orders/helpers/*.ts` | ✅ Yes | Integration | DB operations |

**Example: Adding a new helper**

```typescript
// PURE helper (no database access)
// File: convex/orders/helpers.ts
export function calculateLineTotals(
  quantity: number,
  unitPrice: number,
  discountAmount: number
): { lineTotal: number; lineCost: number; lineMargin: number } {
  const lineTotal = quantity * unitPrice - discountAmount;
  // ... calculations
  return { lineTotal, lineCost, lineMargin };
}

// CTX-DEPENDENT helper (requires database)
// File: convex/orders/helpers/statusTransitions.ts
export async function logOrderEvent(
  ctx: MutationCtx,
  orderId: Id<"orders">,
  eventType: string,
  details?: string
) {
  await ctx.db.insert("orderEvents", {
    orderId,
    eventType,
    timestamp: Date.now(),
    // ...
  });
}
```

**Import Pattern in mutations.ts:**

```typescript
// Pure helpers
import { calculateLineTotals, recalculateFinalTotal } from "./helpers";

// Ctx helpers
import {
  distributeBallsToOrders,
  logOrderEvent,
  incrementChannelUsage,
} from "./helpers/index";
```

### Production Tracking System (NEW)

**Migration Complete (Feb 2026):** Removed dual-write system, now uses single source of truth.

**Current System:**

```
orderItemProduction (source of truth)
├── unitsRequired      # Total balls needed
├── unitsCompleted     # Balls produced so far
└── unitsRemaining     # unitsRequired - unitsCompleted

orderItems (visual tracking)
├── ballsFilled        # Current balls in package
├── packageStatus      # empty → filling → filled → packed
└── packedPackageIndices  # Which packages are packed
```

**Key Patterns:**

1. **Creating production records:**
   ```typescript
   // Use helper from helpers/productionRecords.ts
   await createProductionRecordsForItem(
     ctx,
     orderItemId,
     menuProductId,
     quantity
   );
   ```

2. **Distributing balls to orders:**
   ```typescript
   // Use helper from helpers/ballDistribution.ts
   const result = await distributeBallsToOrders(ctx, {
     ballType: "original",
     count: 5,
     trackFilledPackages: true,
   });
   ```

3. **Checking completion:**
   ```typescript
   // Query production records
   const records = await ctx.db
     .query("orderItemProduction")
     .withIndex("by_order_item", (q) => q.eq("orderItemId", itemId))
     .collect();

   const isComplete = records.every(r => r.unitsRemaining <= 0);
   ```

### Status Transitions

**Order Workflow:**

```
Draft → AwaitingPayment → Confirmed → InProduction → Packaging → WaitingShipment/WaitingPickup → CompleteShipped/PickedUp
                                                              ↘ Cancelled (any time)
```

**Auto-Transitions:**

| Trigger | From | To | Logic |
|---------|------|-----|-------|
| First ball filled | Confirmed | InProduction | When `ballsFilled > 0` |
| All balls complete | InProduction | Packaging | When all `unitsRemaining === 0` |

**Manual Transitions:**

Use status transition mutations in `mutations.ts`:

```typescript
await updateOrderStatus({ orderId, status: "WaitingShipment" });
```

**Audit Trail:**

All transitions are logged to `orderEvents` table via `logOrderEvent()` helper.

---

## Kitchen Production Workflow

### Visual Inventory System

**Components:**

1. **InventoryTray** - Ball visualization (max 20 shown, overflow indicator)
2. **ProductPackage** - Individual package with ball slots
3. **OrderBox** - Complete order card with packages
4. **BallCompletionButtons** - Production controls (+1, +5, undo)
5. **KitchenDashboard** - Stats overview

**User Flow:**

```
Kitchen user taps [+5 Original]
    ↓
playClunk() sound
    ↓
addBallsToTray mutation
    ↓
Balls added to kitchenInventory
    ↓
distributeBallsToOrders() auto-drains to pending orders
    ↓
Confirmed → InProduction (auto-transition)
    ↓
packageStatus: empty → filling → filled
    ↓
All items filled → Packaging (auto-transition)
    ↓
playDing() sounds + confetti
```

**Kitchen Mutations:**

```typescript
// Add balls to tray (auto-drains)
const result = await addBallsToTray({
  ballType: "original",
  count: 5
});
// Returns: { ballsUsed, overflow, completedOrderIds, ... }

// Undo last ball
await removeBallFromTray({ ballType: "original" });

// Mark package as packed
await markPackagePacked({ orderItemId });

// Unmark package
await unmarkPackagePacked({ orderItemId });
```

### Ball Distribution Algorithm

**Priority Order:**

1. **Due date** (earliest first)
2. **Total units** (largest orders first)
3. **Order date** (oldest first)

**Implementation:**

See `convex/orders/helpers/ballDistribution.ts` for full algorithm.

---

## Common Tasks

### Adding a New Order Field

```typescript
// 1. Update schema.ts
orders: defineTable({
  // ... existing fields
  myNewField: v.optional(v.string()),
})

// 2. Update mutations.ts (create mutation)
export const create = mutation({
  args: {
    // ... existing args
    myNewField: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const orderId = await ctx.db.insert("orders", {
      // ... existing fields
      myNewField: args.myNewField,
    });
    return orderId;
  },
});

// 3. Update frontend hook (src/hooks/convex/useOrders.ts)
// Types auto-generate from schema

// 4. Update UI component
// Use Convex reactive query to auto-update
const order = useQuery(api.orders.queries.getById, { id: orderId });
```

### Creating a New Mutation

```typescript
// convex/orders/mutations.ts
export const myNewMutation = mutation({
  args: {
    orderId: v.id("orders"),
    value: v.string(),
  },
  handler: async (ctx, args) => {
    // 1. Fetch and validate
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Order not found");

    // 2. Business logic (use pure helpers when possible)
    const calculated = myPureHelper(args.value);

    // 3. Update database
    await ctx.db.patch(args.orderId, {
      myField: calculated,
    });

    // 4. Side effects (logging, notifications)
    await logOrderEvent(ctx, args.orderId, "my_action", "Description");

    return args.orderId;
  },
});
```

### Adding a WhatsApp Template

```typescript
// convex/orders/whatsapp.ts

// 1. Add to TemplateType union
type TemplateType =
  | "payment_request"
  | "production_started"
  // ...
  | "my_new_template";  // ADD HERE

// 2. Create generator function
function generateMyNewTemplate(order: OrderWithItems): string {
  const customerName = order.customer?.name ?? order.customerName;
  return `Halo ${customerName}!\n\nYour custom message here.`;
}

// 3. Add to switch statement in generateTemplate()
function generateTemplate(order: OrderWithItems, template: TemplateType): string {
  switch (template) {
    // ... existing cases
    case "my_new_template":
      return generateMyNewTemplate(order);
    // ...
  }
}

// 4. Update args validator in getMessage query
export const getMessage = query({
  args: {
    orderId: v.id("orders"),
    template: v.union(
      // ... existing templates
      v.literal("my_new_template")  // ADD HERE
    ),
  },
  // ...
});
```

---

## Testing & Debugging

### Type Checking

```bash
npm run type-check
```

**Common Issues:**

- **Convex types not updating:** Run `npx convex dev` to regenerate
- **Missing imports:** Check `convex/_generated/api.ts`

### Database Inspection

```bash
# Open Convex dashboard
npx convex dashboard

# Inspect tables in Data tab
# Run queries in Functions tab
# View logs in Logs tab
```

### Cleaning Test Data

```bash
# In Convex dashboard Functions tab:
orders/deleteAll:deleteAllOrders

# Or export/import for backup:
npx convex export
npx convex import <backup-file>
```

### Debugging Mutations

**Pattern: Add detailed logging**

```typescript
export const debugMutation = mutation({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    console.log("Starting mutation", args);

    const order = await ctx.db.get(args.orderId);
    console.log("Fetched order", order);

    // ... rest of logic

    console.log("Mutation complete");
    return order;
  },
});
```

**View logs:** Convex Dashboard → Logs tab (real-time)

### Testing Kitchen Flow End-to-End

1. Create test order with menu products
2. Confirm order (status → Confirmed)
3. Open Kitchen View
4. Tap +5 Original → Check status becomes InProduction
5. Keep adding balls → Check packages turn yellow (filled)
6. All filled → Check status becomes Packaging
7. Mark packages as packed → Check completion

---

## Key Documentation Files

| File | Purpose | When to Read |
|------|---------|--------------|
| [SCHEMA.md](SCHEMA.md) | Database schema reference | Before DB changes |
| [CODE_STYLE.md](CODE_STYLE.md) | Coding conventions | During implementation |
| [API_REFERENCE.md](API_REFERENCE.md) | Convex queries/mutations | When using backend |
| [WORKFLOW.md](WORKFLOW.md) | Git workflow | Before creating PRs |
| [CHANGELOG.md](CHANGELOG.md) | Version history | After merging |
| [TESTING_GUIDE.md](TESTING_GUIDE.md) | Test environment setup | When testing |

---

## Getting Help

1. **Check documentation first** (see table above)
2. **Search codebase** for similar patterns
3. **Convex docs**: https://docs.convex.dev
4. **shadcn/ui docs**: https://ui.shadcn.com

---

## Post-Refactor Changes (Feb 2026)

**What Changed:**

1. **Removed `ballsRemaining` field** - Use `orderItemProduction.unitsRemaining` instead
2. **Two-tier helper system** - Pure helpers in `helpers.ts`, ctx helpers in `helpers/`
3. **Consolidated WhatsApp templates** - Single parameterized function
4. **Added indexes** - `by_completion`, `by_production_type` for performance
5. **Auto-transitions** - Confirmed → InProduction → Packaging

**Migration Notes:**

- Existing orders with old data will continue to work
- Production records backfill available via `backfillProductionRecords` mutation
- No frontend changes needed (types auto-generate)

---

**Welcome aboard! Happy coding!** 🚀
