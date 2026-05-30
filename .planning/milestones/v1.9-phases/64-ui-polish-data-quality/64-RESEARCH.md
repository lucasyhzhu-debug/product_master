# Phase 64: UI Polish & Data Quality - Research

**Researched:** 2026-03-27
**Domain:** Frontend UX (navbar, touch handling, swipe gestures) + Backend data normalization (BigSeller fee signs)
**Confidence:** HIGH

## Summary

Phase 64 addresses five independent requirements across three domains: navbar restructuring (UI-01, UI-02), mobile order creation safety (UI-03, UI-04), and BigSeller commission sign normalization (DQ-01). All changes are well-scoped with clear canonical references in the existing codebase.

The navbar changes are straightforward data-structure splits (moving items between arrays) in `Header.tsx` and `MobileBottomNav.tsx`, plus wrapping the logo in a `<Link>`. The mobile order safety changes require adding touch-move detection to `ProductButtons.tsx` and modifying `OrderCreate.tsx` line item controls. The BigSeller fee normalization requires changes at three layers: sync-time normalization, a data migration for existing records, and cleanup of downstream `Math.abs()` calls.

**Primary recommendation:** Split into 3 plans by domain (navbar, mobile order, fee normalization) since the file sets are completely independent. The fee normalization plan should include a regression guard (snapshot totals before/after migration).

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Frollie Pro logo becomes clickable, links to `/home`. Remove the separate "Home" nav item from `mainNavItems` entirely.
- **D-02:** Split existing "Financials" dropdown into two dropdowns matching the Hub page grouping:
  - **Financials:** Income Statement, Expenses, Exp. Analytics, Reimburse, Payroll
  - **Accounting:** Journal Entry, Chart of Accounts, Bank Accounts, Historical Import, Asset Register
- **D-03:** Both mobile sheet nav and desktop navbar must reflect the same Financials/Accounting split.
- **D-04:** Fix scroll-touch false positives in `ProductButtons` -- detect touch movement (threshold ~10px). If finger moves beyond threshold between `onTouchStart` and `onTouchEnd`, cancel the add action.
- **D-05:** Increase product button padding/gaps for proper touch targets (44px minimum) with dead zones between buttons.
- **D-06:** Delete button always visible on ALL devices. Remove `opacity-0 group-hover:opacity-100` pattern.
- **D-07:** Minus-to-zero removal -- tapping `-` at quantity 1 removes the item from the order entirely. No confirmation needed. Works on both mobile and desktop.
- **D-08:** Add swipe-to-delete as an additional mobile gesture for line item removal.
- **D-09:** Normalize all fee fields to positive values at sync time in `convex/integrations/bigseller/helpers.ts`. Apply `Math.abs()` to `commissionFee`, `serviceFee`, `otherFee`, and `sellerShippingFee` during normalization.
- **D-10:** One-time data migration to flip existing negative fee values to positive in `bigsellerOrders` table.
- **D-11:** Remove redundant `Math.abs()` calls in display/query layer.
- **D-12:** Regression guard is critical. Income Statement, Expense Analytics, and BigSeller order tables must produce identical totals before and after the change.
- **D-13:** No new pages needed. All 5 Accounting pages already exist with routes.

### Claude's Discretion
- Swipe-to-delete implementation approach (library vs custom gesture handler)
- Exact touch movement threshold value for scroll-vs-tap detection
- Visual treatment of delete button (icon style, color, size)
- Migration batch size and approach for fee sign normalization

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| UI-01 | Navbar "Home" merged into Frollie logo (single clickable element) | D-01: Logo wrap + mainNavItems filter. See Header.tsx line 90 and lines 371-376 |
| UI-02 | "Accounting" section added to navbar navigation | D-02/D-03: Split financialItems array, add accountingItems array + dropdown. See HubPage.tsx lines 121-135 for authoritative grouping |
| UI-03 | Mobile order modal prevents accidental product additions from stray taps | D-04/D-05: Touch-move detection + increased touch targets in ProductButtons.tsx |
| UI-04 | Mobile order modal delete button is clearly visible and accessible | D-06/D-07/D-08: Always-visible delete, minus-to-zero, swipe-to-delete in OrderCreate.tsx |
| DQ-01 | Commission/fee sign convention normalized to positive values | D-09/D-10/D-11/D-12: Normalize at sync, migrate existing, remove display-layer abs(), regression guard |

</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Branch rule:** Feature branch required (`feature/ui-polish-data-quality`). Never commit to main.
- **Build gate:** `npm run build` must pass before merge.
- **Plan template:** Every plan must have Git Workflow, Implementation Waves, Documentation Updates, Success Criteria sections.
- **Auth pattern:** Protected mutations require `token: v.string()` arg + `requireRole()`.
- **Convex mutations are async:** Always `await` mutation calls.
- **React hooks order:** All hooks before conditional returns.
- **CHANGELOG required:** After merge to main, update `docs/CHANGELOG.md`.

## Standard Stack

### Core (already in project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | ^19.2.0 | UI framework | Project standard |
| TypeScript | ~5.9 | Type safety | Project standard |
| Convex | ^1.31.7 | Backend + real-time DB | Project standard |
| Tailwind CSS | ^4.1.18 | Styling | Project standard |
| shadcn/ui | latest | UI primitives (DropdownMenu, Sheet, Button) | Project standard |
| Framer Motion | latest | Animations (swipe gestures) | Already installed, use for swipe-to-delete |
| Lucide React | latest | Icons | Project standard |
| Vitest | ^4.0.18 | Unit testing | Project standard |

### Supporting (no new packages needed)
This phase requires NO new npm packages. Framer Motion (already installed) provides `useMotionValue`, `useTransform`, and `animate` for swipe gesture handling.

## Architecture Patterns

### Navbar Item Arrays (Existing Pattern)
The navbar uses static arrays of `NavItem` objects filtered by permission at render time. The pattern is:
1. Define a `const xxxItems: NavItem[]` array at module scope
2. Filter with `user ? xxxItems.filter(item => !item.permission || hasPermission(item.permission)) : []`
3. Render with a `DropdownMenu` wrapper for grouped items
4. Mobile `Sheet` nav uses the same arrays with section headers

**Key files:**
- `src/components/layout/Header.tsx` -- Desktop navbar + mobile sheet (hamburger menu)
- `src/components/layout/MobileBottomNav.tsx` -- Bottom tab bar (separate component)

### Touch Event Handling (Pattern to Implement)
The existing `ProductButtons.tsx` uses `onTouchStart`/`onTouchEnd` with a long-press timer. The fix adds touch-move detection:
```typescript
// Existing pattern (lines 43-66):
const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
const isLongPress = useRef(false);

// New refs needed for scroll detection:
const touchStartY = useRef<number>(0);
const isScrolling = useRef(false);
const SCROLL_THRESHOLD = 10; // pixels
```

### Convex Migration Pattern (Existing)
Migrations use `internalMutation` with batch processing. See `convex/migrations/bigsellerRevenueBackfill.ts` for the established pattern:
```typescript
import { internalMutation } from "../_generated/server";

export const migrateFeeSign = internalMutation({
  args: {},
  handler: async (ctx) => {
    const orders = await ctx.db.query("bigsellerOrders").collect();
    let patched = 0;
    for (const order of orders) {
      // patch logic
      await ctx.db.patch(order._id, { ... });
      patched++;
    }
    return { total: orders.length, patched };
  },
});
```

### Anti-Patterns to Avoid
- **Do NOT use `onClick` for touch-sensitive mobile buttons** -- use `onTouchStart`/`onTouchMove`/`onTouchEnd` for mobile, `onMouseDown`/`onMouseUp` for desktop. The current code correctly separates these.
- **Do NOT use `onTouchCancel` as primary cancellation** -- it fires inconsistently. Use `onTouchMove` with threshold instead.
- **Do NOT add `e.preventDefault()` to touch handlers blindly** -- it breaks native scroll. Only prevent default after confirming the gesture is a tap (not a scroll).
- **Do NOT mix sign conventions** -- once fees are stored positive, ALL downstream code must treat them as positive. No more `Math.abs()` anywhere.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Swipe-to-delete gesture | Custom touch event math | Framer Motion `useDragControls` or `drag` prop | Handles velocity, spring physics, touch/mouse unification. Already in bundle. |
| Dropdown menus | Custom dropdown | shadcn `DropdownMenu` | Already used throughout navbar. Accessible, keyboard-navigable. |
| Touch target sizing | Manual pixel math | Tailwind `min-h-[44px] min-w-[44px]` + `gap-3` | WCAG AA minimum touch target is 44x44px. Tailwind handles responsively. |

## Common Pitfalls

### Pitfall 1: Touch-Scroll vs Touch-Tap Ambiguity
**What goes wrong:** On mobile, users scroll by dragging their finger. If a scrollable area contains buttons, the `onTouchEnd` fires on the button even though the user intended to scroll.
**Why it happens:** The current `ProductButtons.tsx` registers `onTouchStart` (sets timer) and `onTouchEnd` (fires add if no long press). There is no `onTouchMove` handler to detect scroll intention.
**How to avoid:** Track `touchStartY` in `onTouchStart` via `e.touches[0].clientY`. In `onTouchMove`, compute `Math.abs(currentY - startY)`. If > threshold (10px), set `isScrolling = true` and clear the long-press timer. In `onTouchEnd`, check `isScrolling` before firing `onAddProduct`.
**Warning signs:** Users report "phantom" products appearing when scrolling the order creation page on mobile.

### Pitfall 2: Framer Motion Drag on Nested Scrollable Containers
**What goes wrong:** Swipe-to-delete on a line item inside a scrollable container can conflict with the container's native scroll.
**Why it happens:** Framer Motion's `drag="x"` constraint locks horizontal movement, but vertical scrolling can still interfere.
**How to avoid:** Use `dragDirectionLock` prop which locks to the first detected direction. Set `dragConstraints={{ left: -80, right: 0 }}` to only allow left-swipe. Use `onDragEnd` with velocity check to decide if the swipe completes.
**Warning signs:** Scrolling the order items list triggers partial swipe animations.

### Pitfall 3: Fee Sign Migration Creates Temporary Inconsistency
**What goes wrong:** Between deploying the normalization code change and running the migration, new orders store positive fees while old orders still have negative fees. Queries that sum these fields produce incorrect totals.
**Why it happens:** The code change and data migration are separate operations.
**How to avoid:** Deploy in a specific order: (1) Add migration function, (2) Deploy the normalization code change that stores positive values, (3) Run migration immediately, (4) Clean up display-layer `Math.abs()` calls. Step 4 only works correctly after step 3 completes. Alternatively, since the display layer already uses `Math.abs()`, the visual output is correct throughout -- only raw queries would be affected temporarily.
**Warning signs:** Income Statement totals change between pre-deploy and post-deploy checks.

### Pitfall 4: MobileBottomNav Has Separate Item Arrays
**What goes wrong:** The `MobileBottomNav.tsx` has its own `moreItems` array that includes financial pages. If only `Header.tsx` is updated, the mobile bottom nav becomes inconsistent.
**Why it happens:** The bottom nav and header are separate components with duplicated item definitions.
**How to avoid:** Update `MobileBottomNav.tsx` `moreItems` array to add accounting pages (journal, accounts, import, assets). Currently it lists: Expenses, Exp. Analytics, Income Stmt, Reimburse, Bank Accts, Payroll. Asset Register and Journal Entry are missing from the bottom nav "More" sheet.
**Warning signs:** Mobile users cannot find Accounting pages from the bottom nav.

### Pitfall 5: Delete Button Visibility Breaks Desktop Hover UX
**What goes wrong:** Making the delete button always visible on desktop adds visual clutter to every line item.
**Why it happens:** The current `opacity-0 group-hover:opacity-100` pattern hides the button until hover. Removing it shows an "x" button on every row permanently.
**How to avoid:** Use the Lucide `Trash2` icon (small, muted color like `text-muted-foreground`) instead of raw "x" text. Keep it small (`h-6 w-6`) and muted by default, with `hover:text-destructive` for emphasis. This keeps it visible but not visually dominant, per D-06.
**Warning signs:** Desktop users complain the order creation form looks cluttered.

## Code Examples

### Example 1: Logo as Link (D-01)
```typescript
// Source: Header.tsx lines 371-376 — current logo (not clickable)
// BEFORE:
<div className="flex items-center space-x-2">
  <UtensilsCrossed className="h-6 w-6 text-primary" />
  <span className="hidden font-bold sm:inline-block">Frollie Pro</span>
</div>

// AFTER:
<Link to="/home" className="flex items-center space-x-2">
  <UtensilsCrossed className="h-6 w-6 text-primary" />
  <span className="hidden font-bold sm:inline-block">Frollie Pro</span>
</Link>
```

### Example 2: Financials/Accounting Split (D-02)
```typescript
// Source: HubPage.tsx lines 104-135 — authoritative grouping
// New financialItems (remove Bank Accts and Asset Register):
const financialItems: NavItem[] = [
  { path: '/financials', label: 'Income Statement', icon: FileText, permission: 'canAccessDashboard' },
  { path: '/expenses', label: 'Expenses', icon: Receipt, permission: 'canSubmitExpenses' },
  { path: '/expense-analytics', label: 'Exp. Analytics', icon: BarChart3, permission: 'canAccessExpenseAnalytics' },
  { path: '/reimbursements', label: 'Reimburse', icon: HandCoins, permission: 'canManageReimbursements' },
  { path: '/payroll', label: 'Payroll', icon: DollarSign, permission: 'canManageReimbursements' },
];

// New accountingItems:
const accountingItems: NavItem[] = [
  { path: '/journal', label: 'Journal Entry', icon: FileText, permission: 'canManageReimbursements' },
  { path: '/accounts', label: 'Chart of Accounts', icon: Landmark, permission: 'canManageReimbursements' },
  { path: '/bank-accounts', label: 'Bank Accounts', icon: Landmark, permission: 'canManageReimbursements' },
  { path: '/import', label: 'Historical Import', icon: FileText, permission: 'canManageReimbursements' },
  { path: '/assets', label: 'Asset Register', icon: Building2, permission: 'canAccessAssets' },
];
```

### Example 3: Touch-Move Scroll Detection (D-04)
```typescript
// Source: ProductButtons.tsx — new touch-move handling
const touchStartY = useRef<number>(0);
const isScrolling = useRef(false);
const SCROLL_THRESHOLD = 10;

const handleTouchStart = (product: ProductButtonProduct, e: React.TouchEvent) => {
  touchStartY.current = e.touches[0].clientY;
  isScrolling.current = false;
  handlePressStart(product);
};

const handleTouchMove = (e: React.TouchEvent) => {
  const deltaY = Math.abs(e.touches[0].clientY - touchStartY.current);
  if (deltaY > SCROLL_THRESHOLD) {
    isScrolling.current = true;
    handlePressCancel();
  }
};

const handleTouchEnd = (product: ProductButtonProduct) => {
  if (isScrolling.current) {
    isScrolling.current = false;
    handlePressCancel();
    return; // Do NOT fire onAddProduct
  }
  handlePressEnd(product);
};
```

### Example 4: Minus-to-Zero Removal (D-07)
```typescript
// Source: OrderCreate.tsx lines 323-335 — current updateItemQuantity
// BEFORE: Math.max(1, ...) prevents going below 1
// AFTER: Allow going to 0, which removes the item
const updateItemQuantity = useCallback((productId: string, delta: number) => {
  setAppliedVoucher(null);
  setLowPriceConfirmed(false);
  setItems((prev) => {
    const updated = prev.map((item) => {
      if (item.productId === productId) {
        const newQty = item.quantity + delta;
        if (newQty <= 0) return null; // Mark for removal
        return { ...item, quantity: newQty, lineTotal: newQty * item.unitPrice };
      }
      return item;
    });
    return updated.filter(Boolean) as typeof prev;
  });
}, []);
```

### Example 5: Fee Sign Normalization at Sync Time (D-09)
```typescript
// Source: helpers.ts lines 255-274 — Shopee normalization
// BEFORE: Stores as negative via -Math.abs()
order.commissionFee = -Math.abs(aggregatedCommission);

// AFTER: Store as positive via Math.abs()
order.commissionFee = Math.abs(aggregatedCommission);
```

### Example 6: Swipe-to-Delete with Framer Motion (D-08)
```typescript
// Using Framer Motion's drag (already in project bundle)
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';

function SwipeableLineItem({ item, onRemove, children }) {
  const x = useMotionValue(0);
  const opacity = useTransform(x, [-100, -60, 0], [1, 0.5, 0]);

  return (
    <div className="relative overflow-hidden rounded-lg">
      {/* Delete background revealed on swipe */}
      <motion.div
        className="absolute inset-y-0 right-0 flex items-center px-4 bg-destructive"
        style={{ opacity }}
      >
        <Trash2 className="h-5 w-5 text-destructive-foreground" />
      </motion.div>

      {/* Draggable content */}
      <motion.div
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: -100, right: 0 }}
        dragElastic={0.1}
        onDragEnd={(_, info) => {
          if (info.offset.x < -60 || info.velocity.x < -500) {
            animate(x, -200, { duration: 0.2 });
            onRemove();
          } else {
            animate(x, 0, { type: 'spring', stiffness: 300, damping: 30 });
          }
        }}
        style={{ x }}
        className="relative bg-background"
      >
        {children}
      </motion.div>
    </div>
  );
}
```

## Data Flow Analysis: Fee Sign Change Impact

### Current Flow (NEGATIVE fees stored)
```
BigSeller API → normalizePlatformFees() → negative fees
  → mapOrderToStorage() → bigsellerOrders (negative commissionFee, sellerShippingFee, otherFee)
  → mapOrderToRevenue() → Math.abs() → externalRevenue (positive commission)
  → incomeStatement.ts → reads externalRevenue.commission (already positive) → correct totals
  → BigSellerOrdersTable.tsx → displays raw negative values → shows "-Rp29.970"
```

### After Fix (POSITIVE fees stored)
```
BigSeller API → normalizePlatformFees() → positive fees (Math.abs at source)
  → mapOrderToStorage() → bigsellerOrders (positive commissionFee, sellerShippingFee, otherFee)
  → mapOrderToRevenue() → no Math.abs needed → externalRevenue (positive commission, unchanged)
  → incomeStatement.ts → reads externalRevenue.commission (still positive) → correct totals (NO CHANGE)
  → BigSellerOrdersTable.tsx → displays raw positive values → shows "Rp29.970"
```

### Critical Insight: Income Statement is NOT Affected
The income statement reads from `externalRevenue.commission` which is already stored as positive (via `Math.abs()` in `mapOrderToRevenue()`). The sign change in `bigsellerOrders` does NOT affect the income statement. The regression guard (D-12) should verify this by comparing totals before and after, but the architecture guarantees no change because:
1. `externalRevenue` records already have positive commission values
2. The migration only touches `bigsellerOrders`, not `externalRevenue`
3. `mapOrderToRevenue()` will produce identical output (positive values) regardless of whether input is negative-then-abs'd or already positive

### What DOES Change
- `BigSellerOrdersTable.tsx`: Currently shows `-Rp29.970` in red. After fix, shows `Rp29.970` in red. The CSS color already applies `text-[var(--color-status-error)]` unconditionally.
- `bigsellerOrders.queries.ts`: The `calculatedProfit` field uses `order.profit` directly (BigSeller's value), not computed from fees. No change needed.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^4.0.18 |
| Config file | `vitest.config.ts` |
| Quick run command | `npm run test` |
| Full suite command | `npm run test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| UI-01 | Logo links to /home, Home nav item removed | manual | Visual verification | N/A |
| UI-02 | Accounting dropdown with 5 items | manual | Visual verification | N/A |
| UI-03 | Touch-move cancels product add | unit | `npm run test -- convex/integrations/bigseller/__tests__/normalization.test.ts` | N/A (new test needed) |
| UI-04 | Delete visible, minus-to-zero works | manual | Visual verification | N/A |
| DQ-01 | Fees stored positive, Math.abs removed | unit | `npm run test -- convex/integrations/bigseller/__tests__/normalization.test.ts` | Already exists, needs update |

### Sampling Rate
- **Per task commit:** `npm run test`
- **Per wave merge:** `npm run build`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] Update `convex/integrations/bigseller/__tests__/normalization.test.ts` -- change expected sign from negative to positive for Shopee fees
- [ ] Add migration test or snapshot comparison for fee sign migration (optional, migration is run-once)

## Open Questions

1. **Accounting dropdown permission granularity**
   - What we know: HubPage uses `canManageReimbursements || canAccessAssets` for the Accounting section visibility. The navbar currently uses individual permissions per item.
   - What's unclear: Should Journal Entry and Chart of Accounts use `canManageReimbursements` permission? The HubPage implies yes.
   - Recommendation: Follow HubPage pattern exactly. Journal Entry, CoA, Bank Accounts, Historical Import use `canManageReimbursements`. Asset Register uses `canAccessAssets`.

2. **MobileBottomNav missing accounting pages**
   - What we know: `MobileBottomNav.tsx` has its own `moreItems` array. It currently lists financial pages but NOT journal/accounts/import/assets.
   - What's unclear: Should accounting items be added to the bottom nav "More" sheet as well?
   - Recommendation: Yes, add them. D-03 says "Both mobile sheet nav and desktop navbar must reflect the same split." The bottom nav's "More" sheet is the mobile equivalent of the hamburger menu's sheet.

3. **Tokopedia fee handling**
   - What we know: D-09 says normalize across "all platforms (Shopee, TikTok, Tokopedia)". The current `normalizePlatformFees()` only handles "shopee", "tiktok", and "common". There is no "tokopedia" branch.
   - What's unclear: Does Tokopedia data flow through the "common" path? Are fees already correct?
   - Recommendation: Tokopedia likely uses the "common" endpoint which does not modify fees. The migration (D-10) will handle any negative Tokopedia records by applying `Math.abs()` to all `bigsellerOrders` regardless of platform.

## Sources

### Primary (HIGH confidence)
- `src/components/layout/Header.tsx` -- Full navbar implementation with dropdown patterns (595 lines)
- `src/components/layout/MobileBottomNav.tsx` -- Mobile bottom nav with moreItems (153 lines)
- `src/pages/HubPage.tsx` lines 103-135 -- Authoritative Financials/Accounting grouping
- `src/components/orders/ProductButtons.tsx` -- Touch handler implementation (179 lines)
- `src/pages/OrderCreate.tsx` lines 323-341, 755-798 -- Item quantity/delete logic
- `convex/integrations/bigseller/helpers.ts` -- normalizePlatformFees, mapOrderToRevenue, mapOrderToStorage
- `convex/integrations/bigseller/__tests__/normalization.test.ts` -- Existing fee sign tests (357 lines)
- `convex/bigsellerOrders/queries.ts` -- Display query (no fee computation needed)
- `convex/reports/incomeStatement.ts` -- Reads externalRevenue.commission (already positive)
- `convex/migrations/bigsellerRevenueBackfill.ts` -- Existing migration pattern

### Secondary (MEDIUM confidence)
- `src/components/salesAnalytics/BigSellerOrdersTable.tsx` lines 254-265 -- Fee display in orders table
- `convex/externalData/helpers/dashboardHelpers.ts` -- Dashboard commission aggregation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- No new packages. All existing libraries verified in package.json and codebase.
- Architecture: HIGH -- All patterns directly observed in canonical source files. No speculation.
- Pitfalls: HIGH -- Touch event behavior and fee sign propagation traced through full data flow.

**Research date:** 2026-03-27
**Valid until:** 2026-04-27 (stable codebase, no external dependency changes expected)
