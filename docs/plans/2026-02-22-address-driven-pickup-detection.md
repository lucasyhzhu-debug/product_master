# Address-Driven Pickup/Delivery Detection Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the broken `deliveryType` flag (always defaulted to "Pickup") with automatic parsing of the `deliveryAddress` field — "Pick up: [location]" means pickup, everything else is delivery.

**Architecture:** A shared pure function `parseDeliveryAddress` derives `deliveryType` + `pickupLocation` at mutation save time. The frontend mirrors the same function for live preview badges and a soft-block confirm modal. QuickAddressButtons are updated to emit the "Pick up: " prefix format.

**Tech Stack:** Convex mutations (TypeScript), React 19, Vitest for tests.

---

## Git Workflow

**Branch:** `feature/address-driven-pickup-detection`

```bash
git switch main && git pull
git switch -c feature/address-driven-pickup-detection
```

**Checkpoints:** After Task 1 (parser + tests), after Task 2 (backend wired), after Task 3 (frontend complete).

---

## Task 1: Add `parseDeliveryAddress` shared utility + tests

**Files:**
- Modify: `convex/orders/helpers.ts`
- Create: `src/lib/deliveryUtils.ts`
- Modify: `src/lib/__tests__/orderHelpers.test.ts` (add new test block)

### Step 1: Write the failing tests

Add to `src/lib/__tests__/orderHelpers.test.ts` (or create a new file `src/lib/__tests__/deliveryUtils.test.ts`):

```typescript
import { describe, it, expect } from 'vitest';
import { parseDeliveryAddress } from '../deliveryUtils';

describe('parseDeliveryAddress', () => {
  it('detects pickup when starts with "Pick up: "', () => {
    const result = parseDeliveryAddress('Pick up: Crystal');
    expect(result.deliveryType).toBe('Pickup');
    expect(result.pickupLocation).toBe('Crystal');
  });

  it('detects pickup case-insensitively', () => {
    const result = parseDeliveryAddress('pick up: Legato Gelato - Goldfinch');
    expect(result.deliveryType).toBe('Pickup');
    expect(result.pickupLocation).toBe('Legato Gelato - Goldfinch');
  });

  it('treats multi-word input as delivery', () => {
    const result = parseDeliveryAddress('Citraland Mekarsari Cibubur');
    expect(result.deliveryType).toBe('Delivery');
    expect(result.pickupLocation).toBeUndefined();
  });

  it('treats Jl. address as delivery', () => {
    const result = parseDeliveryAddress('Jl. Sudirman No. 5, Jakarta');
    expect(result.deliveryType).toBe('Delivery');
    expect(result.pickupLocation).toBeUndefined();
  });

  it('treats single-word as delivery (suspicious)', () => {
    const result = parseDeliveryAddress('home');
    expect(result.deliveryType).toBe('Delivery');
    expect(result.pickupLocation).toBeUndefined();
    expect(result.suspicious).toBe(true);
  });

  it('treats empty string as delivery (suspicious)', () => {
    const result = parseDeliveryAddress('');
    expect(result.deliveryType).toBe('Delivery');
    expect(result.suspicious).toBe(true);
  });

  it('trims whitespace from pickup location', () => {
    const result = parseDeliveryAddress('Pick up:   Legato Gelato - Goldfinch  ');
    expect(result.pickupLocation).toBe('Legato Gelato - Goldfinch');
  });
});
```

### Step 2: Run tests to confirm they fail

```bash
npm run test -- --run src/lib/__tests__/deliveryUtils.test.ts
```

Expected: FAIL — module not found.

### Step 3: Create `src/lib/deliveryUtils.ts`

```typescript
export interface DeliveryParseResult {
  deliveryType: 'Pickup' | 'Delivery';
  pickupLocation?: string;
  /** True when the address is empty or single-word — UI should show confirm modal */
  suspicious?: boolean;
}

const PICKUP_PREFIX = /^pick up:\s*/i;

export function parseDeliveryAddress(address: string): DeliveryParseResult {
  const trimmed = address.trim();

  // Pickup: starts with "Pick up: " (case-insensitive)
  if (PICKUP_PREFIX.test(trimmed)) {
    const location = trimmed.replace(PICKUP_PREFIX, '').trim();
    return { deliveryType: 'Pickup', pickupLocation: location || undefined };
  }

  // Suspicious: empty or single word
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  if (wordCount <= 1) {
    return { deliveryType: 'Delivery', suspicious: true };
  }

  // Everything else: delivery
  return { deliveryType: 'Delivery' };
}
```

### Step 4: Run tests to confirm they pass

```bash
npm run test -- --run src/lib/__tests__/deliveryUtils.test.ts
```

Expected: All 7 tests PASS.

### Step 5: Add the same function to `convex/orders/helpers.ts`

Append at the end of `convex/orders/helpers.ts`:

```typescript
// ============================================
// Delivery Address Parsing
// ============================================

export interface DeliveryParseResult {
  deliveryType: 'Pickup' | 'Delivery';
  pickupLocation?: string;
}

const PICKUP_PREFIX_RE = /^pick up:\s*/i;

/**
 * Derive deliveryType and pickupLocation from the raw address string.
 * "Pick up: [location]" → Pickup. Everything else → Delivery.
 */
export function parseDeliveryAddress(address: string): DeliveryParseResult {
  const trimmed = (address ?? '').trim();
  if (PICKUP_PREFIX_RE.test(trimmed)) {
    const location = trimmed.replace(PICKUP_PREFIX_RE, '').trim();
    return { deliveryType: 'Pickup', pickupLocation: location || undefined };
  }
  return { deliveryType: 'Delivery' };
}
```

> Note: No `suspicious` flag in the Convex version — that's a frontend-only concern.

### Step 6: Type-check

```bash
npm run type-check
```

Expected: No errors.

### Step 7: Commit

```bash
git add convex/orders/helpers.ts src/lib/deliveryUtils.ts src/lib/__tests__/deliveryUtils.test.ts
git commit -m "feat: add parseDeliveryAddress shared utility"
```

---

## Task 2: Wire parser into Convex mutations

**Files:**
- Modify: `convex/orders/mutations/orderCrud.ts`

### Step 1: Update `createOrder` mutation

In `convex/orders/mutations/orderCrud.ts`, find the line (around line 312):
```typescript
deliveryType: args.deliveryType ?? "Pickup",
pickupLocation: args.pickupLocation,
deliveryAddress: args.deliveryAddress,
```

Replace with:
```typescript
...parseDeliveryAddress(args.deliveryAddress ?? ''),
deliveryAddress: args.deliveryAddress,
```

Also remove `deliveryType` and `pickupLocation` from the args validator for `createOrder` (they're no longer accepted from callers):

Find and remove these lines from the `args` block:
```typescript
deliveryType: v.optional(v.string()),
pickupLocation: v.optional(v.string()),
```

Add the import at the top of the file:
```typescript
import { parseDeliveryAddress } from '../helpers';
```

### Step 2: Update `createDraft` mutation (line ~645)

Find the `createDraft` mutation. It hardcodes:
```typescript
deliveryType: "Pickup",
```

Replace with:
```typescript
deliveryType: "Delivery",
```

> Drafts start with no address set, so "Delivery" is a safer default until the address is saved.

### Step 3: Update `updateOrder`/`updateDraft` mutation (line ~774)

Find:
```typescript
if (args.deliveryAddress !== undefined) patch.deliveryAddress = args.deliveryAddress;
if (args.deliveryType !== undefined) patch.deliveryType = args.deliveryType;
```

Replace with:
```typescript
if (args.deliveryAddress !== undefined) {
  patch.deliveryAddress = args.deliveryAddress;
  const parsed = parseDeliveryAddress(args.deliveryAddress);
  patch.deliveryType = parsed.deliveryType;
  patch.pickupLocation = parsed.pickupLocation;
}
```

Also remove `deliveryType: v.optional(v.string())` and `pickupLocation: v.optional(v.string())` from the `updateOrder`/`updateDraft` args validator.

### Step 4: Update `duplicateOrder` (line ~953)

Find:
```typescript
deliveryType: sourceOrder.deliveryType,
pickupLocation: sourceOrder.pickupLocation,
deliveryAddress: sourceOrder.deliveryAddress,
```

This is fine to leave as-is — it copies existing DB values (already parsed). No change needed here.

### Step 5: Type-check

```bash
npm run type-check
```

Expected: No errors. If any callers were passing `deliveryType`/`pickupLocation`, TypeScript will catch them here — remove those call-site args.

### Step 6: Run existing WhatsApp tests

```bash
npm run test -- --run convex/orders/__tests__/whatsapp.test.ts
```

Expected: All pass (WhatsApp template reads from DB fields, which are now correctly set).

### Step 7: Commit

```bash
git add convex/orders/mutations/orderCrud.ts
git commit -m "feat: derive deliveryType from address in mutations"
```

---

## Task 3: Update QuickAddressButtons to "Pick up: " format

**Files:**
- Modify: `src/components/orders/QuickAddressButtons.tsx`

### Step 1: Update the component

Replace the entire file content:

```typescript
import { MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface QuickAddressButtonsProps {
  onSelect: (address: string) => void;
}

const LOCATIONS = [
  { name: 'Crystal', address: 'Pick up: Crystal' },
  { name: 'Goldfinch', address: 'Pick up: Legato Gelato - Goldfinch' },
] as const;

export function QuickAddressButtons({ onSelect }: QuickAddressButtonsProps) {
  return (
    <div className="flex gap-2">
      {LOCATIONS.map((loc) => (
        <Button
          key={loc.name}
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => onSelect(loc.address)}
        >
          <MapPin className="h-3.5 w-3.5" />
          {loc.name}
        </Button>
      ))}
    </div>
  );
}
```

> Note: Removed the `deliveryType` second argument from `onSelect` — it's no longer needed.

### Step 2: Update the `handleQuickAddress` caller in `OrderCreate.tsx`

Find (line ~281):
```typescript
const handleQuickAddress = useCallback((address: string, _type: string) => {
  setDeliveryAddress(address);
}, []);
```

Replace with:
```typescript
const handleQuickAddress = useCallback((address: string) => {
  setDeliveryAddress(address);
}, []);
```

### Step 3: Type-check

```bash
npm run type-check
```

Expected: No errors.

### Step 4: Commit

```bash
git add src/components/orders/QuickAddressButtons.tsx src/pages/OrderCreate.tsx
git commit -m "feat: quick address buttons now emit Pick up: prefix"
```

---

## Task 4: Add live inference badge to OrderCreate

**Files:**
- Modify: `src/pages/OrderCreate.tsx`

### Step 1: Import the parser

At the top of `src/pages/OrderCreate.tsx`, add:
```typescript
import { parseDeliveryAddress } from '@/lib/deliveryUtils';
```

### Step 2: Add soft-block state

Near the other `useState` declarations (around line 70):
```typescript
const [showAddressConfirm, setShowAddressConfirm] = useState(false);
const [addressConfirmed, setAddressConfirmed] = useState(false);
```

### Step 3: Compute the parsed result reactively

Add a `useMemo` after the state declarations:
```typescript
const deliveryParsed = useMemo(
  () => parseDeliveryAddress(deliveryAddress),
  [deliveryAddress]
);
```

### Step 4: Add address validation to `handleSubmit`

In `handleSubmit`, after the existing guards (hasItems, customerSet, isLowPrice), add:
```typescript
if (deliveryParsed.suspicious && !addressConfirmed) {
  setShowAddressConfirm(true);
  return;
}
```

### Step 5: Add inference badge to the address section

Find the address `<input>` block in the JSX (around line 549). After the `<input>`, add the badge:

```tsx
{/* Delivery inference badge */}
{deliveryAddress.trim().length > 0 && (
  <p className={`text-xs font-medium mt-1 ${
    deliveryParsed.deliveryType === 'Pickup'
      ? 'text-purple-600'
      : 'text-blue-600'
  }`}>
    {deliveryParsed.deliveryType === 'Pickup'
      ? `📍 Pickup at: ${deliveryParsed.pickupLocation ?? '—'}`
      : `🚚 Delivery to: ${deliveryAddress.trim()}`
    }
  </p>
)}
```

### Step 6: Add the confirm modal

Before the closing `</form>` or at the end of the JSX return, add:

```tsx
{/* Soft-block: address doesn't look valid */}
{showAddressConfirm && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
    <div className="bg-background rounded-xl shadow-xl p-6 max-w-sm mx-4 space-y-4">
      <h3 className="font-semibold text-base">
        This doesn't look like an address
      </h3>
      <p className="text-sm text-muted-foreground">
        "{deliveryAddress}" doesn't look like a delivery address. Save anyway?
      </p>
      <div className="flex gap-3 justify-end">
        <Button variant="outline" onClick={() => setShowAddressConfirm(false)}>
          Edit address
        </Button>
        <Button onClick={() => {
          setAddressConfirmed(true);
          setShowAddressConfirm(false);
          void executeSubmit();
        }}>
          Save anyway
        </Button>
      </div>
    </div>
  </div>
)}
```

> Also reset `addressConfirmed` to `false` when `deliveryAddress` changes, to prevent stale override:
```typescript
const handleDeliveryAddressChange = (value: string) => {
  setDeliveryAddress(value);
  setAddressConfirmed(false);
};
```
Update the input's `onChange` to call `handleDeliveryAddressChange` instead of `setDeliveryAddress` directly.

### Step 7: Type-check

```bash
npm run type-check
```

Expected: No errors.

### Step 8: Build check

```bash
npm run build
```

Expected: Builds cleanly with no errors.

### Step 9: Commit

```bash
git add src/pages/OrderCreate.tsx
git commit -m "feat: live delivery inference badge and soft-block confirm modal"
```

---

## Task 5: Verify WhatsApp templates work end-to-end

**Files:** No code changes — verification only.

### Step 1: Run all tests

```bash
npm run test -- --run
```

Expected: All pass.

### Step 2: Manual smoke test (in running dev environment)

1. Open `OrderCreate`
2. Type "Citraland Mekarsari Cibubur" → badge shows `🚚 Delivery to: Citraland Mekarsari Cibubur`
3. Click "Goldfinch" button → field fills "Pick up: Legato Gelato - Goldfinch", badge shows `📍 Pickup at: Legato Gelato - Goldfinch`
4. Click "Crystal" button → field fills "Pick up: Crystal", badge shows `📍 Pickup at: Crystal`
5. Clear field, try to submit → confirm modal appears
6. Click "Save anyway" → order saves, modal closes
7. Open the order → click "Send Payment Request via WhatsApp"
   - Delivery order: template shows `📍 Delivery to: Citraland Mekarsari Cibubur`
   - Pickup order: template shows `📍 Pickup at: Legato Gelato - Goldfinch`

### Step 3: Final commit (docs update)

```bash
# Update CHANGELOG.md with this feature, then:
git add docs/CHANGELOG.md
git commit -m "docs: changelog for address-driven pickup detection"
```

---

## Implementation Waves

### Wave 1: Pure utility (no dependencies)
| Task | Files |
|------|-------|
| Task 1 | `convex/orders/helpers.ts`, `src/lib/deliveryUtils.ts`, tests |

### Wave 2: Backend wiring (after Wave 1)
| Task | Files |
|------|-------|
| Task 2 | `convex/orders/mutations/orderCrud.ts` |

### Wave 3: Frontend (after Wave 1, parallel with Wave 2)
| Task | Files |
|------|-------|
| Task 3 | `src/components/orders/QuickAddressButtons.tsx` |
| Task 4 | `src/pages/OrderCreate.tsx` |

### Wave 4: Verification
| Step | Command |
|------|---------|
| All tests | `npm run test -- --run` |
| Type-check | `npm run type-check` |
| Build | `npm run build` |

---

## Documentation Updates
- [ ] `docs/CHANGELOG.md` — required after merge

---

## Success Criteria
- [ ] `npm run type-check` passes
- [ ] `npm run build` passes
- [ ] All tests pass
- [ ] QuickAddressButtons emit "Pick up: Crystal" and "Pick up: Legato Gelato - Goldfinch"
- [ ] Live badge shows correct type as user types
- [ ] Empty/single-word address triggers confirm modal on save
- [ ] WhatsApp payment request shows delivery address for delivery orders
- [ ] WhatsApp payment request shows "Pickup at: Legato Gelato - Goldfinch" for Goldfinch pickup orders
