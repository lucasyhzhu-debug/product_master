# Agent 1: Backend Unit Tests Plan

> **Scope:** Pure functions with no database dependencies
> **Est. Test Cases:** 48
> **Parallel Safe:** Yes - no shared state

---

## Target Files

| File | Functions | Priority |
|------|-----------|----------|
| `convex/lib/costCalculator.ts` | 4 functions | P1 |
| `convex/orders/mutations.ts` | `generateOrderNumber`, `calculateLineTotals` | P1 |
| `convex/orders/whatsapp.ts` | 5 template functions | P2 |

---

## Test File 1: `convex/lib/__tests__/costCalculator.test.ts`

### Functions to Test

```typescript
// From costCalculator.ts
export function getBaseUnit(unitType: string): string
export function normalizeToBaseUnit(quantity: number, unit: string): number
export function calculateCostPerBaseUnit(
  volumePurchased: number,
  priceExclShipping: number,
  shippingCost: number,
  unitType: string
): { costPerBaseUnit: number; baseUnit: string }
export function calculateLineCost(
  costPerBaseUnit: number,
  quantity: number,
  unit: string
): number
```

### Test Cases (24 total)

#### `getBaseUnit()` - 6 tests
```typescript
describe('getBaseUnit', () => {
  it('returns "g" for "kg"', () => {
    expect(getBaseUnit('kg')).toBe('g');
  });

  it('returns "g" for "g"', () => {
    expect(getBaseUnit('g')).toBe('g');
  });

  it('returns "ml" for "l"', () => {
    expect(getBaseUnit('l')).toBe('ml');
  });

  it('returns "ml" for "ml"', () => {
    expect(getBaseUnit('ml')).toBe('ml');
  });

  it('returns "cm" for "m"', () => {
    expect(getBaseUnit('m')).toBe('cm');
  });

  it('returns original unit for unknown types (pcs)', () => {
    expect(getBaseUnit('pcs')).toBe('pcs');
  });
});
```

#### `normalizeToBaseUnit()` - 8 tests
```typescript
describe('normalizeToBaseUnit', () => {
  // Weight conversions
  it('converts kg to g (×1000)', () => {
    expect(normalizeToBaseUnit(1.5, 'kg')).toBe(1500);
  });

  it('passes through g unchanged', () => {
    expect(normalizeToBaseUnit(500, 'g')).toBe(500);
  });

  // Volume conversions
  it('converts l to ml (×1000)', () => {
    expect(normalizeToBaseUnit(2, 'l')).toBe(2000);
  });

  it('passes through ml unchanged', () => {
    expect(normalizeToBaseUnit(250, 'ml')).toBe(250);
  });

  // Length conversions
  it('converts m to cm (×100)', () => {
    expect(normalizeToBaseUnit(1.5, 'm')).toBe(150);
  });

  it('passes through cm unchanged', () => {
    expect(normalizeToBaseUnit(50, 'cm')).toBe(50);
  });

  // Edge cases
  it('handles zero quantity', () => {
    expect(normalizeToBaseUnit(0, 'kg')).toBe(0);
  });

  it('handles decimal precision', () => {
    expect(normalizeToBaseUnit(0.001, 'kg')).toBe(1);
  });
});
```

#### `calculateCostPerBaseUnit()` - 6 tests
```typescript
describe('calculateCostPerBaseUnit', () => {
  it('calculates cost per gram for kg purchase', () => {
    // 25kg flour, 250000 + 15000 shipping = 265000 total
    // 265000 / 25 / 1000 = 10.6 IDR/g
    const result = calculateCostPerBaseUnit(25, 250000, 15000, 'kg');
    expect(result.costPerBaseUnit).toBeCloseTo(10.6);
    expect(result.baseUnit).toBe('g');
  });

  it('calculates cost per ml for liter purchase', () => {
    // 18L oil, 360000 + 0 shipping = 360000 total
    // 360000 / 18 / 1000 = 20 IDR/ml
    const result = calculateCostPerBaseUnit(18, 360000, 0, 'l');
    expect(result.costPerBaseUnit).toBe(20);
    expect(result.baseUnit).toBe('ml');
  });

  it('calculates cost per piece correctly', () => {
    // 100 pcs, 50000 total = 500 IDR/pc
    const result = calculateCostPerBaseUnit(100, 50000, 0, 'pcs');
    expect(result.costPerBaseUnit).toBe(500);
    expect(result.baseUnit).toBe('pcs');
  });

  it('includes shipping in calculation', () => {
    const withShipping = calculateCostPerBaseUnit(10, 100000, 20000, 'kg');
    const withoutShipping = calculateCostPerBaseUnit(10, 100000, 0, 'kg');
    expect(withShipping.costPerBaseUnit).toBeGreaterThan(withoutShipping.costPerBaseUnit);
  });

  it('returns 0 for zero volume (prevents division by zero)', () => {
    const result = calculateCostPerBaseUnit(0, 100000, 0, 'kg');
    expect(result.costPerBaseUnit).toBe(0);
  });

  it('handles very small volumes', () => {
    const result = calculateCostPerBaseUnit(0.1, 1000, 0, 'kg');
    // 1000 / 0.1 / 1000 = 10 IDR/g
    expect(result.costPerBaseUnit).toBe(10);
  });
});
```

#### `calculateLineCost()` - 4 tests
```typescript
describe('calculateLineCost', () => {
  it('calculates line cost for grams', () => {
    // 500g at 10.6 IDR/g = 5300
    expect(calculateLineCost(10.6, 500, 'g')).toBe(5300);
  });

  it('calculates line cost with unit conversion (kg)', () => {
    // 1.5kg = 1500g at 10.6 IDR/g = 15900
    expect(calculateLineCost(10.6, 1.5, 'kg')).toBe(15900);
  });

  it('returns 0 for zero quantity', () => {
    expect(calculateLineCost(10.6, 0, 'g')).toBe(0);
  });

  it('handles pieces without conversion', () => {
    // 5 pcs at 500 IDR/pc = 2500
    expect(calculateLineCost(500, 5, 'pcs')).toBe(2500);
  });
});
```

---

## Test File 2: `convex/orders/__tests__/orderHelpers.test.ts`

### Extract Helper Functions

First, refactor to extract pure functions from mutations.ts:

**Create:** `convex/orders/helpers.ts`
```typescript
/**
 * Generate order number in MMDD-NNN format
 */
export function generateOrderNumber(date: Date, existingOrdersToday: number): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const sequence = String(existingOrdersToday + 1).padStart(3, '0');
  return `${month}${day}-${sequence}`;
}

/**
 * Calculate line totals for an order item
 */
export function calculateLineTotals(
  quantity: number,
  unitPrice: number,
  unitCost: number,
  discountAmount: number
): { lineTotal: number; lineCost: number; lineMargin: number } {
  const lineTotal = quantity * (unitPrice - discountAmount);
  const lineCost = quantity * unitCost;
  const lineMargin = lineTotal - lineCost;
  return { lineTotal, lineCost, lineMargin };
}

/**
 * Calculate order totals from items
 */
export function calculateOrderTotals(
  items: Array<{ lineTotal: number; lineCost: number; lineMargin: number }>
): { totalAmount: number; totalCost: number; totalMargin: number } {
  return items.reduce(
    (acc, item) => ({
      totalAmount: acc.totalAmount + item.lineTotal,
      totalCost: acc.totalCost + item.lineCost,
      totalMargin: acc.totalMargin + item.lineMargin,
    }),
    { totalAmount: 0, totalCost: 0, totalMargin: 0 }
  );
}
```

### Test Cases (14 total)

#### `generateOrderNumber()` - 8 tests
```typescript
describe('generateOrderNumber', () => {
  it('generates first order of the day correctly', () => {
    const date = new Date('2026-01-31');
    expect(generateOrderNumber(date, 0)).toBe('0131-001');
  });

  it('generates 10th order correctly', () => {
    const date = new Date('2026-01-31');
    expect(generateOrderNumber(date, 9)).toBe('0131-010');
  });

  it('generates 100th order correctly', () => {
    const date = new Date('2026-01-31');
    expect(generateOrderNumber(date, 99)).toBe('0131-100');
  });

  it('pads single-digit months', () => {
    const date = new Date('2026-02-05');
    expect(generateOrderNumber(date, 0)).toBe('0205-001');
  });

  it('handles December correctly', () => {
    const date = new Date('2026-12-25');
    expect(generateOrderNumber(date, 4)).toBe('1225-005');
  });

  it('pads single-digit days', () => {
    const date = new Date('2026-01-05');
    expect(generateOrderNumber(date, 0)).toBe('0105-001');
  });

  it('handles month boundaries', () => {
    const jan31 = new Date('2026-01-31');
    const feb01 = new Date('2026-02-01');
    expect(generateOrderNumber(jan31, 50)).toBe('0131-051');
    expect(generateOrderNumber(feb01, 0)).toBe('0201-001');
  });

  it('handles year end', () => {
    const date = new Date('2026-12-31');
    expect(generateOrderNumber(date, 999)).toBe('1231-1000');
  });
});
```

#### `calculateLineTotals()` - 4 tests
```typescript
describe('calculateLineTotals', () => {
  it('calculates totals without discount', () => {
    const result = calculateLineTotals(2, 85000, 35000, 0);
    expect(result.lineTotal).toBe(170000);
    expect(result.lineCost).toBe(70000);
    expect(result.lineMargin).toBe(100000);
  });

  it('calculates totals with discount', () => {
    const result = calculateLineTotals(5, 25000, 8000, 5000);
    // lineTotal = 5 * (25000 - 5000) = 100000
    // lineCost = 5 * 8000 = 40000
    // lineMargin = 100000 - 40000 = 60000
    expect(result.lineTotal).toBe(100000);
    expect(result.lineCost).toBe(40000);
    expect(result.lineMargin).toBe(60000);
  });

  it('handles zero quantity', () => {
    const result = calculateLineTotals(0, 85000, 35000, 0);
    expect(result.lineTotal).toBe(0);
    expect(result.lineCost).toBe(0);
    expect(result.lineMargin).toBe(0);
  });

  it('handles discount equal to price (free item)', () => {
    const result = calculateLineTotals(1, 50000, 20000, 50000);
    expect(result.lineTotal).toBe(0);
    expect(result.lineCost).toBe(20000);
    expect(result.lineMargin).toBe(-20000); // Loss
  });
});
```

#### `calculateOrderTotals()` - 2 tests
```typescript
describe('calculateOrderTotals', () => {
  it('sums multiple line items', () => {
    const items = [
      { lineTotal: 170000, lineCost: 70000, lineMargin: 100000 },
      { lineTotal: 100000, lineCost: 40000, lineMargin: 60000 },
    ];
    const result = calculateOrderTotals(items);
    expect(result.totalAmount).toBe(270000);
    expect(result.totalCost).toBe(110000);
    expect(result.totalMargin).toBe(160000);
  });

  it('handles empty items array', () => {
    const result = calculateOrderTotals([]);
    expect(result.totalAmount).toBe(0);
    expect(result.totalCost).toBe(0);
    expect(result.totalMargin).toBe(0);
  });
});
```

---

## Test File 3: `convex/orders/__tests__/whatsapp.test.ts`

### Test Cases (10 total)

```typescript
import { describe, it, expect } from 'vitest';
import {
  formatCurrency,
  formatDate,
  generatePaymentRequest,
  generateReceipt,
  getStatusEmoji,
} from '../whatsapp';

describe('WhatsApp Message Formatting', () => {
  describe('formatCurrency', () => {
    it('formats Indonesian Rupiah correctly', () => {
      expect(formatCurrency(1500000)).toBe('Rp 1.500.000');
    });

    it('handles zero', () => {
      expect(formatCurrency(0)).toBe('Rp 0');
    });

    it('handles small amounts', () => {
      expect(formatCurrency(500)).toBe('Rp 500');
    });
  });

  describe('formatDate', () => {
    it('formats date in Indonesian locale', () => {
      const date = new Date('2026-01-31T10:00:00');
      const formatted = formatDate(date);
      expect(formatted).toContain('31');
      expect(formatted).toContain('Januari');
    });
  });

  describe('getStatusEmoji', () => {
    it('returns correct emoji for each status', () => {
      expect(getStatusEmoji('Draft')).toBe('📝');
      expect(getStatusEmoji('AwaitingPayment')).toBe('⏳');
      expect(getStatusEmoji('Confirmed')).toBe('✅');
      expect(getStatusEmoji('Production')).toBe('🔥');
      expect(getStatusEmoji('Shipped')).toBe('🚚');
      expect(getStatusEmoji('Delivered')).toBe('📦');
    });
  });

  describe('generatePaymentRequest', () => {
    const mockOrder = {
      orderNumber: '0131-001',
      customerName: 'John Doe',
      totalAmount: 270000,
      items: [
        { productName: 'Dubai Chocolate', quantity: 2, lineTotal: 170000 },
        { productName: 'Milo Nugget', quantity: 5, lineTotal: 100000 },
      ],
    };

    it('includes order number', () => {
      const message = generatePaymentRequest(mockOrder);
      expect(message).toContain('0131-001');
    });

    it('includes customer name', () => {
      const message = generatePaymentRequest(mockOrder);
      expect(message).toContain('John Doe');
    });

    it('includes total amount formatted', () => {
      const message = generatePaymentRequest(mockOrder);
      expect(message).toContain('270.000');
    });
  });
});
```

---

## Implementation Checklist

- [ ] Create `convex/lib/__tests__/costCalculator.test.ts` (24 tests)
- [ ] Extract helpers to `convex/orders/helpers.ts`
- [ ] Create `convex/orders/__tests__/orderHelpers.test.ts` (14 tests)
- [ ] Create `convex/orders/__tests__/whatsapp.test.ts` (10 tests)
- [ ] Run `npm run test:unit` - all pass
- [ ] Check coverage for `convex/lib/` reaches 100%

---

## Completion Criteria

```bash
# All tests pass
npm run test:run -- convex/lib convex/orders

# Coverage check
npm run test:coverage -- --dir convex/lib
# Expected: 100% for costCalculator.ts
```
