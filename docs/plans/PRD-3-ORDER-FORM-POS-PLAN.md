# PRD-3: Order Form POS - Implementation Plan

**Date:** 2026-02-01
**Status:** READY TO IMPLEMENT
**Branch:** `feature/order-form-pos`
**Reference:** `docs/plans/order-system-v2-mini-prds.md`

---

## Executive Summary

PRD-3 is the final phase of Order System V2. It delivers a POS-style order creation interface with:
- **ProductButtons** - 2x2 grid for fixed Frollie products (tap to add, long-press for quantity)
- **Template Parser** - WhatsApp template copy/paste workflow for customer orders
- **DiscountInput** - Linked Rp/% inputs with >30% warning
- **DeliveryToggle** - Pickup vs Delivery selection
- **OrderFormPOS** - New composite form replacing old OrderForm

This is a HIGH complexity implementation with 6 new files and 7 implementation waves.

---

## Progress Summary

| PRD | Name | Status |
|-----|------|--------|
| **PRD-0** | Schema Foundation | ✅ COMPLETE |
| **PRD-1** | Kitchen Core | ✅ COMPLETE |
| **PRD-2** | Kitchen Gamification | ✅ COMPLETE |
| **PRD-3** | Order Form POS | 🔴 NOT STARTED |

---

## Dependencies

- PRD-0 schema fields exist (status unions, fixed products, discount fields)
- Fixed products seeded via `menuProducts:seedFixedProducts`
- `getOrderTemplate` function in `convex/orders/whatsapp.ts`

---

## Deliverables Summary

### New Files (6)
| File | Type | Description |
|------|------|-------------|
| `src/lib/orderTemplateParser.ts` | Utility | WhatsApp template parsing logic |
| `src/components/orders/ProductButtons.tsx` | Component | 2x2 fixed product grid |
| `src/components/orders/PasteTemplateBox.tsx` | Component | Template paste + parse UI |
| `src/components/orders/DiscountInput.tsx` | Component | Linked Rp/% discount inputs |
| `src/components/orders/DeliveryToggle.tsx` | Component | Pickup/Delivery toggle |
| `src/components/orders/OrderFormPOS.tsx` | Component | Main POS form (new component) |

### Modified Files (5)
| File | Changes |
|------|---------|
| `convex/orders/mutations.ts` | Add discount fields to `create`, add `updateOrderDiscount` |
| `src/hooks/convex/useOrders.ts` | Add discount mutation hooks |
| `src/hooks/convex/useMenuProducts.ts` | Add fixed products filter |
| `src/pages/OrderManager.tsx` | Replace OrderForm with OrderFormPOS |
| `src/lib/types.ts` | Add POS-related interfaces |

---

## Multi-Agent Implementation Architecture

### Agent Assignments

| Agent | Tasks | Model |
|-------|-------|-------|
| `convex-backend` | Wave 1 (backend mutations) | sonnet |
| `general-purpose` | Wave 2 (template parser utility) | sonnet |
| `react-ui-builder` | Waves 3-5 (all UI components) | sonnet |
| `code-auditor` | Wave 7 (verification) | haiku |
| `cto-orchestrator` | Coordination | opus |

---

## Wave Structure

### Pre-Implementation Checklist
- [ ] Verify fixed products exist: Run `menuProducts:seedFixedProducts` if needed
- [ ] Verify `getOrderTemplate` works in Convex dashboard
- [ ] Create branch: `git switch -c feature/order-form-pos`

---

### Wave 1: Backend Mutations [PARALLEL - 2 tasks]

**Agent:** `convex-backend`

#### Task 1.1: Update `create` mutation for discounts
**File:** `convex/orders/mutations.ts`

**Instructions:**
1. Add optional args:
   ```typescript
   orderLevelDiscount: v.optional(v.number()),
   orderLevelDiscountType: v.optional(v.union(
     v.literal("amount"),
     v.literal("percentage")
   )),
   ```
2. Calculate discount amount:
   - If type === "percentage": `discountAmount = totalAmount * (discount / 100)`
   - If type === "amount": `discountAmount = discount`
3. Calculate `finalTotal = totalAmount - discountAmount`
4. Store `orderLevelDiscount`, `orderLevelDiscountType` on order record
5. Ensure backward compatibility (discount fields are optional)

#### Task 1.2: Add `updateOrderDiscount` mutation
**File:** `convex/orders/mutations.ts`

**Instructions:**
```typescript
export const updateOrderDiscount = mutation({
  args: {
    orderId: v.id("orders"),
    discount: v.number(),
    discountType: v.union(v.literal("amount"), v.literal("percentage")),
  },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Order not found");

    // Check order isn't in terminal state
    const terminalStatuses = ["CompleteShipped", "PickedUp", "Cancelled"];
    if (terminalStatuses.includes(order.status)) {
      throw new Error("Cannot modify discount on completed/cancelled order");
    }

    // Recalculate total
    const discountAmount = args.discountType === "percentage"
      ? order.totalAmount * (args.discount / 100)
      : args.discount;

    await ctx.db.patch(args.orderId, {
      orderLevelDiscount: args.discount,
      orderLevelDiscountType: args.discountType,
      finalTotal: order.totalAmount - discountAmount,
    });

    return args.orderId;
  },
});
```

**Git Checkpoint 1:** After Wave 1
```bash
git add convex/orders/mutations.ts
git commit -m "feat(orders): add discount support to create and updateOrderDiscount mutation"
```

---

### Wave 2: Template Parser Utility [SINGLE TASK]

**Agent:** `general-purpose`

#### Task 2.1: Create `orderTemplateParser.ts`
**File:** `src/lib/orderTemplateParser.ts`

**Instructions:**

Create a utility that parses filled WhatsApp order templates.

```typescript
// Interface definitions
export interface ParsedItem {
  productCode: string;      // ORIGINAL, BITE_SINGLE, etc.
  productName: string;      // Full product name
  quantity: number;
}

export interface ParsedCustomer {
  phone: string;
  name: string;
  address: string;
}

export interface ParseResult {
  items: ParsedItem[];
  customer: ParsedCustomer | null;
  parseWarnings: string[];
  parseSuccess: boolean;
}

export function parseOrderTemplate(text: string): ParseResult
```

**Parsing Rules:**

1. **Product parsing - Primary method (bracket format):**
   - Regex: `/(\d+)\.\s*(.+?)\s*\(.+?\)\s*-\s*Rp\s*[\d.,]+\s*\[\s*(\d+)\s*\]/g`
   - Example: `1. Original (80g) - Rp 50.000 [2]` → `{ productName: "Original", quantity: 2 }`
   - Skip if quantity is 0 or bracket is empty `[ ]` or `[  ]`

2. **Product parsing - Fallback method (keyword):**
   - Pattern: `2x Original` or `Original x 2` or `Original: 2`
   - Use regex: `/(\d+)\s*x\s*(.+)|(.+)\s*x\s*(\d+)|(.+):\s*(\d+)/gi`

3. **Product code mapping:**
   ```typescript
   const productCodeMap: Record<string, string> = {
     'original': 'ORIGINAL',
     'bite sized single': 'BITE_SINGLE',
     'bite single': 'BITE_SINGLE',
     'bite sized double': 'BITE_DOUBLE',
     'bite double': 'BITE_DOUBLE',
     'bite sized triple': 'BITE_TRIPLE',
     'bite triple': 'BITE_TRIPLE',
   };
   ```

4. **Customer info extraction:**
   - Phone: Look for `No. WA:` or `WA:` or `Phone:` followed by digits
   - Name: Look for `Nama:` or `Name:` followed by text
   - Address: Look for `Alamat:` or `Address:` followed by text
   - Regex examples:
     - Phone: `/(?:No\.?\s*WA|WA|Phone|HP):\s*([+\d\s-]+)/i`
     - Name: `/(?:Nama|Name):\s*(.+?)(?:\n|$)/i`
     - Address: `/(?:Alamat|Address):\s*(.+?)(?:\n|$)/i`

5. **Warning generation:**
   - Add warning for unparseable non-empty lines (excluding separators like `---`)
   - Add warning if no products found
   - Add warning if customer info partially missing

6. **Success criteria:**
   - `parseSuccess = true` if at least 1 product with qty > 0 found

**Test cases to handle:**
```
// Standard template
1. Original (80g) - Rp 50.000 [2]
2. Bite Sized Single (45g) - Rp 35.000 [0]
3. Bite Sized Double (90g = 2x45g) - Rp 70.000 [1]
---
No. WA: 081234567890
Nama: John Doe
Alamat: Jl. Sudirman 123

// Informal format
Original x 2
Bite Double: 1
Name: Jane
```

**Git Checkpoint 2:** After Wave 2
```bash
git add src/lib/orderTemplateParser.ts
git commit -m "feat(orders): add WhatsApp template parser utility"
```

---

### Wave 3: Frontend Components Part 1 [PARALLEL - 3 tasks]

**Agent:** `react-ui-builder` (spawn 3 parallel tasks)

#### Task 3.1: Create `ProductButtons.tsx`
**File:** `src/components/orders/ProductButtons.tsx`

**Instructions:**

```typescript
interface ProductButtonsProps {
  products: Array<{
    _id: string;
    code: string;
    name: string;
    grams: number;
    defaultPrice: number;
    unitCost?: number;
  }>;
  onAddProduct: (product: ProductButtonsProps['products'][0], quantity: number) => void;
}
```

**Implementation:**
- 2x2 CSS Grid layout (`grid grid-cols-2 gap-3`)
- Each button shows: Product name (bold), grams, price formatted with `formatCurrency`
- **Tap behavior:** Call `onAddProduct(product, 1)`
- **Long-press behavior (500ms):** Open Dialog with quantity Input, then call `onAddProduct(product, qty)`
- Visual feedback: Scale animation on tap (`scale-95` → `scale-100`)
- Use shadcn Button with `variant="outline"` and custom padding
- Long-press detection: Use `onMouseDown`/`onMouseUp`/`onTouchStart`/`onTouchEnd` with timeout

**Styling:**
```tsx
<div className="grid grid-cols-2 gap-3">
  {products.map((product) => (
    <button
      key={product._id}
      className="flex flex-col items-start p-4 rounded-lg border bg-card hover:bg-accent transition-colors text-left"
      onMouseDown={() => handlePressStart(product)}
      onMouseUp={handlePressEnd}
      onMouseLeave={handlePressEnd}
      onTouchStart={() => handlePressStart(product)}
      onTouchEnd={handlePressEnd}
    >
      <span className="font-semibold">{product.name}</span>
      <span className="text-sm text-muted-foreground">{product.grams}g</span>
      <span className="text-sm font-medium">{formatCurrency(product.defaultPrice)}</span>
    </button>
  ))}
</div>
```

---

#### Task 3.2: Create `PasteTemplateBox.tsx`
**File:** `src/components/orders/PasteTemplateBox.tsx`

**Instructions:**

```typescript
interface PasteTemplateBoxProps {
  onParsed: (result: ParseResult) => void;
}
```

**Implementation:**
1. Textarea for pasted text (controlled, min-height 120px)
2. Two buttons below textarea:
   - "Paste from Clipboard" - Uses `navigator.clipboard.readText()`
   - "Parse & Fill" - Calls `parseOrderTemplate()` and emits result
3. After parsing:
   - If success: Show green Alert with item count + customer found status
   - If warnings: Show amber Alert listing warnings
   - If failure: Show red Alert "No products found"

**Use shadcn components:**
- `Textarea` for input
- `Button` for actions
- `Alert`, `AlertTitle`, `AlertDescription` for feedback

**Clipboard handling:**
```typescript
const handlePaste = async () => {
  try {
    const text = await navigator.clipboard.readText();
    setTemplateText(text);
    toast.success('Pasted from clipboard');
  } catch {
    toast.error('Could not access clipboard');
  }
};
```

---

#### Task 3.3: Create `DiscountInput.tsx`
**File:** `src/components/orders/DiscountInput.tsx`

**Instructions:**

```typescript
interface DiscountInputProps {
  subtotal: number;
  discountAmount: number;
  discountType: 'amount' | 'percentage';
  onChange: (amount: number, type: 'amount' | 'percentage') => void;
}
```

**Implementation:**
1. Two side-by-side inputs:
   - Left: `Rp` prefix + number input (discount amount)
   - Right: Number input + `%` suffix (discount percentage)
2. **Linked behavior:**
   - Editing Rp amount → calculate % = (amount / subtotal) * 100
   - Editing % → calculate amount = subtotal * (percentage / 100)
3. **Debounce:** Use 300ms debounce to prevent infinite loop
4. **Warning:** Show amber Alert at >30%: "High discount ({X}%) - please confirm"
5. **Edge cases:**
   - If subtotal is 0, disable % calculation
   - Clamp percentage 0-100
   - Clamp amount 0-subtotal

**Layout:**
```tsx
<div className="space-y-2">
  <Label>Order Discount</Label>
  <div className="flex items-center gap-2">
    <div className="flex items-center">
      <span className="text-sm text-muted-foreground mr-1">Rp</span>
      <Input
        type="number"
        value={amountValue}
        onChange={handleAmountChange}
        className="w-28"
      />
    </div>
    <span className="text-muted-foreground">or</span>
    <div className="flex items-center">
      <Input
        type="number"
        value={percentValue}
        onChange={handlePercentChange}
        className="w-20"
      />
      <span className="text-sm text-muted-foreground ml-1">%</span>
    </div>
  </div>
  {percentValue > 30 && (
    <Alert variant="warning">
      <AlertTriangle className="h-4 w-4" />
      <AlertDescription>
        High discount ({percentValue.toFixed(1)}%) - please confirm
      </AlertDescription>
    </Alert>
  )}
</div>
```

**Git Checkpoint 3:** After Wave 3
```bash
git add src/components/orders/ProductButtons.tsx src/components/orders/PasteTemplateBox.tsx src/components/orders/DiscountInput.tsx
git commit -m "feat(orders): add ProductButtons, PasteTemplateBox, DiscountInput components"
```

---

### Wave 4: Frontend Components Part 2 [PARALLEL - 2 tasks]

**Agent:** `react-ui-builder` (spawn 2 parallel tasks)

#### Task 4.1: Create `DeliveryToggle.tsx`
**File:** `src/components/orders/DeliveryToggle.tsx`

**Instructions:**

```typescript
interface DeliveryToggleProps {
  value: 'Pickup' | 'Delivery';
  onChange: (value: 'Pickup' | 'Delivery') => void;
}
```

**Implementation:**
- Segmented control style (two rounded boxes side by side)
- Icons: MapPin for Pickup, Truck for Delivery
- Selected option has `bg-primary text-primary-foreground`
- Unselected has `bg-muted hover:bg-muted/80`

```tsx
<div className="flex rounded-lg border overflow-hidden">
  <button
    type="button"
    onClick={() => onChange('Pickup')}
    className={cn(
      "flex items-center gap-2 px-4 py-2 flex-1 transition-colors",
      value === 'Pickup'
        ? "bg-primary text-primary-foreground"
        : "bg-muted hover:bg-muted/80"
    )}
  >
    <MapPin className="h-4 w-4" />
    <span>Pickup</span>
  </button>
  <button
    type="button"
    onClick={() => onChange('Delivery')}
    className={cn(
      "flex items-center gap-2 px-4 py-2 flex-1 transition-colors",
      value === 'Delivery'
        ? "bg-primary text-primary-foreground"
        : "bg-muted hover:bg-muted/80"
    )}
  >
    <Truck className="h-4 w-4" />
    <span>Delivery</span>
  </button>
</div>
```

---

#### Task 4.2: Update hooks and types
**Files:**
- `src/hooks/convex/useOrders.ts`
- `src/hooks/convex/useMenuProducts.ts`
- `src/lib/types.ts`

**Instructions:**

**useOrders.ts additions:**
```typescript
export function useConvexUpdateOrderDiscount() {
  const updateDiscount = useMutation(api.orders.updateOrderDiscount);
  return {
    mutateAsync: async (orderId: Id<"orders">, discount: number, discountType: 'amount' | 'percentage') => {
      return await updateDiscount({ orderId, discount, discountType });
    },
  };
}
```

**useMenuProducts.ts additions:**
```typescript
export function useConvexFixedProducts() {
  const products = useQuery(api.menuProducts.listFixed);
  return products;
}
```
(Note: May need to add `listFixed` query to backend if not exists)

**types.ts additions:**
```typescript
export interface OrderLineItem {
  productId: string;
  productCode: string;
  productName: string;
  grams: number;
  quantity: number;
  unitPrice: number;
  unitCost?: number;
  lineTotal: number;
}

export interface OrderFormData {
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  deliveryType: 'Pickup' | 'Delivery';
  deliveryAddress?: string;
  dueDate: Date;
  notes?: string;
  items: OrderLineItem[];
  discount: number;
  discountType: 'amount' | 'percentage';
}
```

**Git Checkpoint 4:** After Wave 4
```bash
git add src/components/orders/DeliveryToggle.tsx src/hooks/convex/useOrders.ts src/hooks/convex/useMenuProducts.ts src/lib/types.ts
git commit -m "feat(orders): add DeliveryToggle and update hooks/types for POS form"
```

---

### Wave 5: OrderFormPOS Component [SINGLE TASK - LARGE]

**Agent:** `react-ui-builder`

#### Task 5.1: Create `OrderFormPOS.tsx`
**File:** `src/components/orders/OrderFormPOS.tsx`

**Instructions:**

This is the main composite form component. Build as a NEW component (safer rollback).

**Props:**
```typescript
interface OrderFormPOSProps {
  onSuccess?: (orderId: string) => void;
  onCancel?: () => void;
}
```

**Section Layout (9 sections):**

```
┌──────────────────────────────────────────────────────────────┐
│ 1. TEMPLATE SECTION                                          │
│    [Copy Clean Template] [?]                                 │
│    ┌─────────────────────────────────────────────────────┐  │
│    │ PasteTemplateBox                                     │  │
│    └─────────────────────────────────────────────────────┘  │
├──────────────────────────────────────────────────────────────┤
│ 2. PRODUCTS SECTION                                          │
│    ProductButtons (2x2 grid)                                 │
│    ┌─────────────────────────────────────────────────────┐  │
│    │ Line Items List                                      │  │
│    │ • Original x 2 .................... Rp 100.000   [-] │  │
│    │ • Bite Double x 1 ................. Rp 70.000    [-] │  │
│    └─────────────────────────────────────────────────────┘  │
├──────────────────────────────────────────────────────────────┤
│ 3. CUSTOMER SECTION                                          │
│    [Search/Create Customer ▼]                                │
│    Phone: _______ Name: _______                             │
├──────────────────────────────────────────────────────────────┤
│ 4. DELIVERY SECTION                                          │
│    [Pickup] [Delivery]                                       │
│    Address: _______ (if Delivery)                           │
├──────────────────────────────────────────────────────────────┤
│ 5. DATES SECTION                                             │
│    Order Date: Feb 1, 2026 (readonly)                       │
│    Due Date: [Feb 2, 2026 ▼]                                │
├──────────────────────────────────────────────────────────────┤
│ 6. NOTES                                                     │
│    Notes: _________________________________                  │
├──────────────────────────────────────────────────────────────┤
│ 7. DISCOUNT SECTION                                          │
│    DiscountInput                                             │
├──────────────────────────────────────────────────────────────┤
│ 8. TOTALS                                                    │
│    Subtotal:           Rp 170.000                           │
│    Discount (10%):    -Rp 17.000                            │
│    ─────────────────────────────                            │
│    ORDER TOTAL:        Rp 153.000                           │
├──────────────────────────────────────────────────────────────┤
│ 9. SUBMIT                                                    │
│                              [Cancel] [Create Order]         │
└──────────────────────────────────────────────────────────────┘
```

**State Management:**
```typescript
// Items
const [items, setItems] = useState<OrderLineItem[]>([]);

// Customer
const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
const [customerName, setCustomerName] = useState('');
const [customerPhone, setCustomerPhone] = useState('');

// Delivery
const [deliveryType, setDeliveryType] = useState<'Pickup' | 'Delivery'>('Pickup');
const [deliveryAddress, setDeliveryAddress] = useState('');

// Dates
const [dueDate, setDueDate] = useState(new Date(Date.now() + 24 * 60 * 60 * 1000)); // +24h

// Notes
const [notes, setNotes] = useState('');

// Discount
const [discountAmount, setDiscountAmount] = useState(0);
const [discountType, setDiscountType] = useState<'amount' | 'percentage'>('percentage');

// Calculated
const subtotal = useMemo(() => items.reduce((sum, item) => sum + item.lineTotal, 0), [items]);
const discountValue = discountType === 'percentage'
  ? subtotal * (discountAmount / 100)
  : discountAmount;
const total = subtotal - discountValue;
```

**Key Handlers:**

1. **Copy Clean Template:**
   ```typescript
   const handleCopyTemplate = async () => {
     const template = await getOrderTemplate.mutateAsync({});
     await navigator.clipboard.writeText(template);
     toast.success('Template copied to clipboard');
   };
   ```

2. **Handle Parsed Template:**
   ```typescript
   const handleParsed = (result: ParseResult) => {
     if (result.items.length > 0) {
       // Map parsed items to line items
       const newItems = result.items.map(item => {
         const product = fixedProducts?.find(p => p.code === item.productCode);
         if (!product) return null;
         return {
           productId: product._id,
           productCode: item.productCode,
           productName: item.productName,
           grams: product.grams,
           quantity: item.quantity,
           unitPrice: product.defaultPrice,
           unitCost: product.unitCost,
           lineTotal: product.defaultPrice * item.quantity,
         };
       }).filter(Boolean);
       setItems(newItems);
     }

     if (result.customer) {
       setCustomerName(result.customer.name || '');
       setCustomerPhone(result.customer.phone || '');
       setDeliveryAddress(result.customer.address || '');
       if (result.customer.address) {
         setDeliveryType('Delivery');
       }
     }
   };
   ```

3. **Add Product from Button:**
   ```typescript
   const handleAddProduct = (product: FixedProduct, quantity: number) => {
     const existing = items.find(i => i.productId === product._id);
     if (existing) {
       setItems(items.map(i =>
         i.productId === product._id
           ? { ...i, quantity: i.quantity + quantity, lineTotal: (i.quantity + quantity) * i.unitPrice }
           : i
       ));
     } else {
       setItems([...items, {
         productId: product._id,
         productCode: product.code,
         productName: product.name,
         grams: product.grams,
         quantity,
         unitPrice: product.defaultPrice,
         unitCost: product.unitCost,
         lineTotal: product.defaultPrice * quantity,
       }]);
     }
   };
   ```

4. **Submit Order:**
   ```typescript
   const handleSubmit = async () => {
     if (items.length === 0) {
       toast.error('Add at least one product');
       return;
     }
     if (!customerName.trim()) {
       toast.error('Customer name is required');
       return;
     }

     setIsSubmitting(true);
     try {
       const orderId = await createOrder.mutateAsync({
         // ... all order data
         orderLevelDiscount: discountAmount,
         orderLevelDiscountType: discountType,
       });

       // Auto-copy WhatsApp confirmation
       const confirmation = await generateConfirmation.mutateAsync({ orderId });
       await navigator.clipboard.writeText(confirmation);
       toast.success('Order created! Confirmation copied to clipboard');

       onSuccess?.(orderId);
     } catch (error) {
       console.error('Failed to create order:', error);
       toast.error('Failed to create order');
     } finally {
       setIsSubmitting(false);
     }
   };
   ```

**Component Imports:**
```typescript
import { useState, useMemo } from 'react';
import { Clipboard, Send, X, Plus, Minus, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ProductButtons } from './ProductButtons';
import { PasteTemplateBox } from './PasteTemplateBox';
import { DiscountInput } from './DiscountInput';
import { DeliveryToggle } from './DeliveryToggle';
import { useConvexFixedProducts, useConvexCreateOrder, useConvexCustomers } from '@/hooks/convex';
import { parseOrderTemplate } from '@/lib/orderTemplateParser';
import { formatCurrency } from '@/lib/utils';
import { toast } from 'sonner';
```

**Export from barrel:**
Add to `src/components/orders/index.ts`:
```typescript
export { OrderFormPOS } from './OrderFormPOS';
export { ProductButtons } from './ProductButtons';
export { PasteTemplateBox } from './PasteTemplateBox';
export { DiscountInput } from './DiscountInput';
export { DeliveryToggle } from './DeliveryToggle';
```

**Git Checkpoint 5:** After Wave 5
```bash
git add src/components/orders/OrderFormPOS.tsx src/components/orders/index.ts
git commit -m "feat(orders): add OrderFormPOS composite component"
```

---

### Wave 6: Page Integration [SEQUENTIAL]

**Agent:** `react-ui-builder`

#### Task 6.1: Update `OrderManager.tsx`
**File:** `src/pages/OrderManager.tsx`

**Instructions:**

1. Import `OrderFormPOS` instead of old `OrderForm`
2. Replace the form section with `<OrderFormPOS />`
3. Handle success callback to refresh order list
4. Optionally: Keep old form commented for rollback safety

```tsx
import { OrderFormPOS } from '@/components/orders';

// In render:
<Card>
  <CardHeader>
    <CardTitle>New Order</CardTitle>
  </CardHeader>
  <CardContent>
    <OrderFormPOS
      onSuccess={(orderId) => {
        // Navigate to order detail or stay on page
        toast.success(`Order created: ${orderId}`);
      }}
      onCancel={() => setShowForm(false)}
    />
  </CardContent>
</Card>
```

**Git Checkpoint 6:** After Wave 6
```bash
git add src/pages/OrderManager.tsx
git commit -m "feat(orders): integrate OrderFormPOS in OrderManager page"
```

---

### Wave 7: Verification [SEQUENTIAL]

**Agent:** `code-auditor` or manual

#### Verification Checklist

| Test | Command/Action | Expected |
|------|----------------|----------|
| Type check | `npm run type-check` | No errors |
| Build | `npm run build` | Success |
| Lint | `npm run lint` | No new errors |
| Template copy | Click "Copy Clean Template" | Clipboard has template |
| Template paste | Paste filled template, click Parse | Items + customer extracted |
| ProductButtons tap | Tap product | Adds 1 to list |
| ProductButtons long-press | Hold 500ms | Opens qty dialog |
| Line items | Adjust qty with +/- | Totals update |
| Discount Rp→% | Edit Rp field | % auto-calculates |
| Discount %→Rp | Edit % field | Rp auto-calculates |
| Discount >30% | Enter 35% | Warning alert shows |
| Delivery toggle | Click Delivery | Address field appears |
| Create order | Submit with valid data | Order created, confirmation copied |
| Kitchen View | Check new order | Appears in pending |

---

## Final Git Commands

```bash
# Final commit (if any remaining changes)
git add .
git commit -m "$(cat <<'EOF'
feat(orders): POS form with product buttons, template parser, discount input

- Add discount support to create mutation
- Add updateOrderDiscount mutation
- Create orderTemplateParser utility for WhatsApp template parsing
- Create ProductButtons component (2x2 grid, tap/long-press)
- Create PasteTemplateBox component (clipboard + parse)
- Create DiscountInput component (linked Rp/% inputs)
- Create DeliveryToggle component (Pickup/Delivery)
- Create OrderFormPOS composite component
- Integrate OrderFormPOS in OrderManager page

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"

# Merge to main
git switch main
git pull
git merge feature/order-form-pos
git push origin main
```

---

## Risk Areas

| Risk | Mitigation |
|------|------------|
| Clipboard API permissions | Test across browsers, graceful fallback with manual copy |
| Discount input infinite loop | 300ms debounce, track "last edited" field |
| Template parser edge cases | Comprehensive test cases, fallback regex patterns |
| Long-press on mobile | Test touch events, may need `touchstart`/`touchend` handling |
| Customer search UX | Use existing CustomerSelect pattern from project |

---

## Estimated Effort by Wave

| Wave | Agent Tasks | Estimated Time |
|------|-------------|----------------|
| Wave 1 | 2 backend tasks (parallel) | 15-20 min |
| Wave 2 | 1 parser utility | 25-30 min |
| Wave 3 | 3 component tasks (parallel) | 40-50 min |
| Wave 4 | 2 tasks (parallel) | 15-20 min |
| Wave 5 | 1 large component | 45-60 min |
| Wave 6 | 1 integration task | 15-20 min |
| Wave 7 | Verification | 15-20 min |
| **Total** | **10+ tasks** | **170-220 min** |

---

## Session Resume Commands

```bash
git switch feature/order-form-pos
npx convex dev    # Terminal 1
npm run dev       # Terminal 2
```

---

## Post-Implementation: Update CHANGELOG

Add to `docs/CHANGELOG.md`:

```markdown
## [Unreleased]

### Added - Order System V2: PRD-3 Order Form POS
- POS-style order creation with ProductButtons (2x2 grid)
- WhatsApp template copy/paste workflow with parser
- Linked discount inputs (Rp and % synchronized)
- Delivery type toggle (Pickup/Delivery)
- OrderFormPOS component replacing old OrderForm
- Auto-copy WhatsApp confirmation to clipboard on order creation
```

---

## Success Criteria

- [ ] All 6 new files created and working
- [ ] `npm run type-check` passes
- [ ] `npm run build` succeeds
- [ ] Template copy/paste workflow functional
- [ ] Product buttons work (tap and long-press)
- [ ] Discount inputs properly linked
- [ ] Orders create successfully with new form
- [ ] WhatsApp confirmation auto-copied
- [ ] Order appears in Kitchen View
