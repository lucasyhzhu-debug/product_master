# OrderFormPOS Component Implementation

**File:** `src/components/orders/OrderFormPOS.tsx`

## Overview

A POS-style order creation form that combines all new POS components for streamlined order entry. Features template parsing, quick product buttons, and comprehensive order management.

---

## Component Structure

### 1. Template Section
- **Copy Clean Template** button - copies WhatsApp template to clipboard
- Help tooltip explaining the 4-step workflow
- `PasteTemplateBox` component for parsing filled templates
- Auto-populates products and customer info from parsed data

### 2. Products Section
- **ProductButtons** in 2x2 grid for fixed menu products
- Tap to add 1 unit, long-press for custom quantity dialog
- Line items list with quantity controls and remove buttons
- Each line shows: `Product Name (grams) [qty controls] Rp lineTotal [trash]`

### 3. Customer Section
- Search existing customers with autocomplete dropdown
- "Create new" option appears in dropdown
- Auto-fills from parsed template if customer data found
- New customer mode: name input + optional phone

### 4. Delivery Section
- `DeliveryToggle` component (Pickup/Delivery toggle buttons)
- Delivery address textarea (shown only for Delivery)

### 5. Dates Section
- Order Date (readonly, shows today's date formatted)
- Due Date picker (default: +24 hours from now)

### 6. Notes Section
- Multi-line textarea for special instructions

### 7. Discount Section
- `DiscountInput` component (amount or percentage)
- Real-time calculation and sync between amount/percent
- Warning if discount > 30%

### 8. Totals Section
- Subtotal (sum of all line items)
- Discount applied (if > 0)
- **Order Total** (bold, subtotal - discount)

### 9. Submit Section
- Cancel button (if `onCancel` prop provided)
- Create Order button with loading state
- Auto-copies WhatsApp confirmation to clipboard on success

---

## Props Interface

```typescript
interface OrderFormPOSProps {
  onSuccess?: (orderId: string) => void;
  onCancel?: () => void;
}
```

---

## Key Features

### Template Workflow
1. **Copy Template** → Sends to customer via WhatsApp
2. **Customer fills in quantities** in brackets `[2]`
3. **Paste filled template** → Parses and auto-populates
4. **Review and submit** → Order created

### Product Management
- Fixed products from `useConvexFixedProducts()` hook
- Quick add via ProductButtons (tap = +1, long-press = custom qty)
- Quantity adjustment with +/- buttons
- Line-level remove with trash icon
- Real-time line total calculation

### Customer Handling
- Search existing customers by name
- Auto-complete dropdown with phone display
- Create new customer inline
- Template parser auto-fills customer data (name, phone, address)

### Smart Defaults
- Due date: +24 hours from now
- Delivery type: Pickup
- Discount: 0 (no discount)
- Order date: Today (readonly)

### Validation
- At least 1 product required
- Customer name required (existing or new)
- Delivery address required if Delivery selected
- Quantity must be >= 1 per item

---

## State Management

### Items State
```typescript
const [items, setItems] = useState<OrderLineItem[]>([]);
```
Each item:
- `productId`, `productCode`, `productName`, `grams`
- `quantity`, `unitPrice`, `unitCost`
- `lineTotal` (calculated: quantity × unitPrice)

### Customer State
- `selectedCustomerId` - for existing customers
- `customerName`, `customerPhone` - for new customers
- `isNewCustomer` - toggle between existing/new mode
- `customerSearch` - search query for dropdown

### Other State
- `deliveryType`, `deliveryAddress`
- `dueDate` (ISO date string)
- `notes`
- `discountAmount`, `discountType`
- `isSubmitting`

---

## Calculations

### Subtotal
```typescript
const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
```

### Discount Value
```typescript
const discountValue = discountType === 'percentage'
  ? subtotal * (discountAmount / 100)
  : discountAmount;
```

### Total
```typescript
const total = subtotal - discountValue;
```

---

## Key Handlers

### `handleCopyTemplate`
Copies clean WhatsApp template to clipboard with:
- 4 fixed products with bracket notation `[  ]`
- Customer info fields (WA, Nama, Alamat)
- Bank transfer instructions

### `handleParsed(result: ParseResult)`
Processes parsed template data:
1. Maps product codes to fixed products
2. Creates OrderLineItem[] with quantities
3. Auto-fills customer name, phone, address
4. Sets delivery type to Delivery if address found

### `handleAddProduct(product, quantity)`
Adds product or increments existing:
- If product already in items → increment quantity
- If new → add to items array
- Recalculates lineTotal

### `updateItemQuantity(productId, delta)`
Adjusts quantity (min: 1):
- Updates item.quantity
- Recalculates item.lineTotal

### `removeItem(productId)`
Filters out item from array

### `handleSubmit`
1. Validates form (items, customer)
2. Builds `OrderCreateInput` payload
3. Calls `createOrder.mutateAsync()`
4. Success: toast + onSuccess callback
5. Error: toast error message

---

## Integration with Convex

### Queries
```typescript
const { data: fixedProductsData } = useConvexFixedProducts();
const { data: customers } = useConvexCustomerSearch(customerSearch);
```

### Mutations
```typescript
const createOrder = useConvexCreateOrder();
const orderId = await createOrder.mutateAsync({
  customerId?: Id<"customers">,
  newCustomer?: { name, phone },
  deliveryType,
  deliveryAddress?,
  dueDate: timestamp,
  notes?,
  items: [{ productName, quantity, unitPrice, unitCost }]
});
```

---

## Component Dependencies

### Direct Imports
- `ProductButtons` - 2x2 grid with long-press support
- `PasteTemplateBox` - template parser with feedback
- `DiscountInput` - dual input (amount/percent) with sync
- `DeliveryToggle` - toggle button component

### UI Components
- Card, Button, Input, Label, Textarea
- Separator, Tooltip
- Icons: Clipboard, Send, X, Plus, Minus, Trash2, HelpCircle, Loader2

### Hooks
- `useConvexFixedProducts` - fetches fixed menu products
- `useConvexCustomerSearch` - searches customers by name
- `useConvexCreateOrder` - creates order mutation

### Utils
- `formatCurrency` - formats IDR currency
- `cn` - className merging
- `parseOrderTemplate` - parses WhatsApp template text

---

## Example Usage

```tsx
import { OrderFormPOS } from '@/components/orders/OrderFormPOS';

function OrderCreatePage() {
  const navigate = useNavigate();

  return (
    <div className="max-w-2xl mx-auto p-6">
      <OrderFormPOS
        onSuccess={(orderId) => {
          navigate(`/orders/${orderId}`);
        }}
        onCancel={() => {
          navigate('/orders');
        }}
      />
    </div>
  );
}
```

---

## Future Enhancements

1. **WhatsApp Integration** - Auto-copy receipt on success
2. **Product Search** - Add search for non-fixed products
3. **Order Templates** - Save frequent orders as templates
4. **Batch Orders** - Create multiple orders from one template
5. **Payment Capture** - Add payment method/amount during creation
6. **Delivery Slots** - Time slot picker for deliveries
7. **Customer History** - Show previous orders in customer dropdown
8. **Voice Input** - Speech-to-text for notes

---

## Testing Checklist

- [ ] Template copy/paste workflow
- [ ] Product buttons (tap vs long-press)
- [ ] Quantity increment/decrement
- [ ] Item removal
- [ ] Customer search and selection
- [ ] New customer creation
- [ ] Delivery toggle and address
- [ ] Discount calculations (amount and %)
- [ ] Total calculations
- [ ] Form validation errors
- [ ] Submit success flow
- [ ] Submit error handling
- [ ] Loading states

---

## Related Files

| File | Purpose |
|------|---------|
| `ProductButtons.tsx` | 2x2 grid with long-press |
| `PasteTemplateBox.tsx` | Template parser UI |
| `DiscountInput.tsx` | Dual discount input |
| `DeliveryToggle.tsx` | Pickup/Delivery toggle |
| `lib/orderTemplateParser.ts` | Template parsing logic |
| `hooks/convex/useOrders.ts` | Order mutations |
| `hooks/convex/useMenuProducts.ts` | Fixed products query |
| `hooks/convex/useCustomers.ts` | Customer search |

---

**Status:** ✅ Complete
**PRD Reference:** PRD-5: Order System V2 - Wave 1
**Last Updated:** 2026-02-01
