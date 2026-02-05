# Voucher System Integration - Visual Design

**Date:** 2026-02-04 (V2 Plan)
**Status:** Design Specification
**Related:** UI_REDESIGN_V2_PLAN.md

---

## Overview

This document shows exactly how the voucher system components (VoucherInput, ManagerOverrideDialog, LowPriceWarningDialog) will integrate into the terracotta-themed redesigned order form.

---

## 1. Sticky Summary Panel (Desktop)

### Before Voucher Integration

```
┌─────────────────────────┐
│ ORDER SUMMARY           │  ← Dark slate header
├─────────────────────────┤
│                         │
│ 🏷 Discount             │
│ [Amount Input]  [Type▼] │
│                         │
│ Subtotal    Rp 150,000  │
│ Discount    -Rp 15,000  │
│ ─────────────────────   │
│ Total       Rp 135,000  │  ← Large, terracotta
│                         │
│ ┏━━━━━━━━━━━━━━━━━━━┓ │
│ ┃ Create Order      ┃ │  ← Gradient button
│ ┗━━━━━━━━━━━━━━━━━━━┛ │
└─────────────────────────┘
```

### After Voucher Integration (New Section Above Discount)

```
┌─────────────────────────┐
│ ORDER SUMMARY           │  ← Dark slate header
├─────────────────────────┤
│                         │
│ 🎟️ Apply Voucher        │  ← Playfair Display serif
│ ┌─────────────────────┐ │
│ │ [Voucher Code...]   │ │  ← Input with icon
│ │ [Apply] │ [Remove]  │ │
│ └─────────────────────┘ │
│                         │
│ OR                      │  ← Small text, gray
│                         │
│ 🏷️ Manual Discount      │
│ [Amount] [Type▼]        │
│                         │
│ [Manager Override]      │  ← Button (if authorized)
│                         │
│ ─────────────────────   │
│                         │
│ Subtotal    Rp 150,000  │
│ Voucher     -Rp 30,000  │  ← Shows if applied
│ ─────────────────────   │
│ Total       Rp 120,000  │  ← Large, terracotta
│                         │
│ ⚠️ Order total below     │  ← Amber warning (if <20k)
│ Rp 20,000. Confirm.     │
│                         │
│ ┏━━━━━━━━━━━━━━━━━━━┓ │
│ ┃ Create Order      ┃ │  ← Gradient button
│ ┗━━━━━━━━━━━━━━━━━━━┛ │
└─────────────────────────┘
     ↑ Sticky, always visible
```

---

## 2. Voucher Input Component (Styled)

### Default State (No Voucher Applied)

```tsx
<div className="space-y-3 p-4 border border-slate-200 rounded-lg bg-gradient-to-br from-slate-50 to-white">
  {/* Label */}
  <Label className="text-sm font-playfair font-semibold text-slate-700 flex items-center gap-2">
    <Ticket className="h-4 w-4 text-terracotta" />
    Apply Voucher
  </Label>

  {/* Input Group */}
  <div className="flex gap-2">
    <Input
      placeholder="Enter code..."
      className="flex-1 border-terracotta/30 focus:border-terracotta focus:ring-terracotta/20"
    />
    <Button
      className="bg-terracotta hover:bg-terracotta-dark text-white"
      disabled={loading}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply"}
    </Button>
  </div>

  {/* Help Text */}
  <p className="text-xs text-slate-500">
    Enter a discount code if you have one
  </p>
</div>
```

Visual:
```
┌───────────────────────────────┐
│ 🎟️ Apply Voucher              │  ← Icon + serif font
├───────────────────────────────┤
│ ┌─────────────────┬─────────┐│
│ │ Enter code...   │ [Apply] ││  ← Terracotta focus ring
│ └─────────────────┴─────────┘│
│                               │
│ Enter a discount code if you  │  ← Gray help text
│ have one                      │
└───────────────────────────────┘
```

### Success State (Voucher Applied)

```tsx
<div className="space-y-3 p-4 border border-green-200 rounded-lg bg-gradient-to-br from-green-50 to-white">
  {/* Label */}
  <Label className="text-sm font-playfair font-semibold text-green-700 flex items-center gap-2">
    <CheckCircle className="h-4 w-4 text-green-600" />
    Voucher Applied
  </Label>

  {/* Applied Voucher Info */}
  <div className="flex items-center justify-between p-3 bg-white rounded border border-green-200">
    <div>
      <div className="font-semibold text-sm text-slate-800">
        {voucher.name}
      </div>
      <div className="text-xs text-slate-500">
        Code: {voucher.code}
      </div>
    </div>
    <div className="text-right">
      <div className="text-lg font-bold text-green-600">
        -{formatCurrency(voucher.calculatedDiscount)}
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="text-xs text-slate-500 hover:text-red-600"
        onClick={onRemove}
      >
        <X className="h-3 w-3 mr-1" />
        Remove
      </Button>
    </div>
  </div>
</div>
```

Visual:
```
┌───────────────────────────────┐
│ ✅ Voucher Applied             │  ← Green theme
├───────────────────────────────┤
│ ┌───────────────────────────┐ │
│ │ NEWCUSTOMER10             │ │  ← Voucher name
│ │ Code: NC10                │ │  ← Code
│ │                           │ │
│ │          -Rp 30,000   [×] │ │  ← Discount + remove
│ └───────────────────────────┘ │
└───────────────────────────────┘
```

### Error State (Invalid Code)

```
┌───────────────────────────────┐
│ 🎟️ Apply Voucher              │
├───────────────────────────────┤
│ ┌─────────────────┬─────────┐│
│ │ INVALID123      │ [Apply] ││  ← Red border
│ └─────────────────┴─────────┘│
│                               │
│ ⚠️ Invalid or expired code    │  ← Red error text
└───────────────────────────────┘
```

---

## 3. Manager Override Button (Conditional Render)

Only shown if:
- User has `canCreateOverrideVoucher` permission
- No voucher currently applied
- Subtotal > 0

```tsx
{canCreateOverride && !appliedVoucher && subtotal > 0 && (
  <Button
    variant="outline"
    size="sm"
    className="w-full border-terracotta text-terracotta hover:bg-terracotta/10 transition-colors"
    onClick={() => setShowManagerOverride(true)}
  >
    <ShieldCheck className="h-4 w-4 mr-2" />
    Manager Override
  </Button>
)}
```

Visual:
```
┌───────────────────────────────┐
│ ┏━━━━━━━━━━━━━━━━━━━━━━━━━━┓│
│ ┃ 🛡️ Manager Override       ┃│  ← Outlined, terracotta
│ ┗━━━━━━━━━━━━━━━━━━━━━━━━━━┛│
└───────────────────────────────┘
```

---

## 4. Manager Override Dialog (Popup)

When "Manager Override" button clicked, opens centered modal:

```
┌─────────────────────────────────────────┐
│ Manager Override Voucher            [×] │  ← Modal header
├─────────────────────────────────────────┤
│                                         │
│ Create a custom discount voucher        │
│ for this order                          │
│                                         │
│ Discount Type                           │
│ [Fixed Amount ▼]                        │
│                                         │
│ Discount Value                          │
│ [50000]                                 │
│                                         │
│ Code (auto-generated)                   │
│ [MGR-2026-001]         [Regenerate]     │
│                                         │
│ ─────────────────────────────────────   │
│                                         │
│ Preview                                 │
│ Subtotal:       Rp 150,000              │
│ Discount:       -Rp 50,000              │
│ ─────────────                           │
│ Final Total:    Rp 100,000              │
│                                         │
│ [Cancel]              [Create & Apply]  │  ← Terracotta primary
└─────────────────────────────────────────┘
```

Styling:
- Modal backdrop: `bg-black/50`
- Modal content: `bg-white rounded-xl shadow-2xl p-6`
- Primary button: `bg-terracotta hover:bg-terracotta-dark`
- Preview section: `bg-slate-50 border border-slate-200 rounded p-3`

---

## 5. Low Price Warning Dialog (Popup)

When order total < Rp 20,000 and user clicks "Create Order", shows modal:

```
┌─────────────────────────────────────────┐
│ ⚠️ Low Price Warning                [×] │  ← Amber theme
├─────────────────────────────────────────┤
│                                         │
│ This order's final price is below       │
│ the minimum threshold of Rp 20,000.     │
│                                         │
│ ┌─────────────────────────────────────┐│
│ │ Original Price:   Rp 50,000         ││
│ │ Discount Applied: -Rp 35,000        ││
│ │ ───────────────────────────────     ││
│ │ Final Price:      Rp 15,000  ⚠️     ││  ← Large, amber
│ └─────────────────────────────────────┘│
│                                         │
│ Are you sure you want to proceed?       │
│                                         │
│ [Go Back]           [Confirm Order]     │  ← Amber primary
└─────────────────────────────────────────┘
```

Styling:
- Modal backdrop: `bg-black/50`
- Header: `text-amber-600 flex items-center gap-2`
- Price breakdown: `bg-amber-50 border border-amber-200 rounded p-4`
- Primary button: `bg-amber-500 hover:bg-amber-600 text-white`

---

## 6. Full Layout (Desktop, With Voucher)

```
┌────────────────────────────────────────────────────────────────────────┐
│ New Order          [✓ Products] → [○ Customer] → [○ Ready]             │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│ ✨ Quick Start with WhatsApp Template                            [+]  │  ← Collapsible
│    Copy → Send → Paste                                                │
│                                                                        │
├─────────────────────────────────┬──────────────────────────────────────┤
│ LEFT (2/3 width)                │ RIGHT (1/3 width) STICKY             │
│                                 │                                      │
│ 📦 Products                     │ ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓  │
│    Select items                 │ ┃ ORDER SUMMARY                  ┃  │
│ [Slot 1] [Slot 2] [Slot 3]      │ ┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫  │
│                                 │ ┃                                ┃  │
│ Order Items              [2]    │ ┃ 🎟️ Apply Voucher               ┃  │
│ ╔════════════════════════════╗  │ ┃ ┌──────────────┬──────────┐  ┃  │
│ ║ Pistachio Chips        [×] ║  │ ┃ │ Enter code...│ [Apply]  │  ┃  │
│ ║ [-] 3 [+]      Rp 45,000  ║  │ ┃ └──────────────┴──────────┘  ┃  │
│ ╚════════════════════════════╝  │ ┃                                ┃  │
│                                 │ ┃ ─── OR ───                     ┃  │
│ 👤 Customer                     │ ┃                                ┃  │
│    Who is this for?             │ ┃ 🏷️ Manual Discount             ┃  │
│ [Search customer...]            │ ┃ [Amount] [Type▼]               ┃  │
│                                 │ ┃                                ┃  │
│ 📍 Delivery                     │ ┃ [🛡️ Manager Override]          ┃  │
│    Pickup or delivery?          │ ┃                                ┃  │
│ (•) Pickup  ( ) Delivery        │ ┃ ──────────────────────────     ┃  │
│                                 │ ┃                                ┃  │
│ 📅 Dates + 📝 Notes             │ ┃ Subtotal    Rp 150,000         ┃  │
│ Order: 4 Jan  Due: 5 Jan        │ ┃ Voucher     -Rp 30,000         ┃  │
│ [Notes...]                      │ ┃ ──────────────────────────     ┃  │
│                                 │ ┃ Total       Rp 120,000         ┃  │
│                                 │ ┃               ↑ Terracotta     ┃  │
│                                 │ ┃                                ┃  │
│                                 │ ┃ ┏━━━━━━━━━━━━━━━━━━━━━━━━┓   ┃  │
│                                 │ ┃ ┃ Create Order           ┃   ┃  │
│                                 │ ┃ ┗━━━━━━━━━━━━━━━━━━━━━━━━┛   ┃  │
│                                 │ ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛  │
└─────────────────────────────────┴──────────────────────────────────────┘
```

---

## 7. Mobile Layout (Stacked, Voucher at Bottom)

On mobile (< 640px), summary panel moves to bottom:

```
┌────────────────────────────┐
│ New Order                  │
│ [●○○]                      │  ← Progress dots
├────────────────────────────┤
│ ✨ Template        [+]     │  ← Collapsed
├────────────────────────────┤
│ 📦 Products                │
│ [Slot 1] [Slot 2]          │
│ [Slot 3] [Slot 4]          │
│                            │
│ Items [2]                  │
│ ╔════════════════════════╗│
│ ║ Pistachio     [×]     ║│
│ ║ [-] 3 [+]  Rp 45,000  ║│
│ ╚════════════════════════╝│
├────────────────────────────┤
│ 👤 Customer                │
│ [Search...]                │
├────────────────────────────┤
│ 📍 Delivery                │
│ (•) Pickup  ( ) Delivery   │
├────────────────────────────┤
│ 📅 Dates + Notes           │
│ [Dates] [Notes]            │
├────────────────────────────┤
│ 🎟️ Voucher                 │
│ [Code...]        [Apply]   │
├────────────────────────────┤
│ 🏷️ Discount                │
│ [Amount]  [Type▼]          │
├────────────────────────────┤
│ ORDER SUMMARY              │
│ Subtotal    Rp 150,000     │
│ Voucher     -Rp 30,000     │
│ ───────────────────        │
│ Total       Rp 120,000     │
│                            │
│ ┏━━━━━━━━━━━━━━━━━━━━┓   │
│ ┃ Create Order       ┃   │  ← Sticky bottom
│ ┗━━━━━━━━━━━━━━━━━━━━┛   │
└────────────────────────────┘
```

---

## 8. Color Palette (Voucher Theme Integration)

### Terracotta (Existing)

- Primary: `#E07856`
- Primary Dark: `#D66A4A`
- Background: `#FFF5F2` (5% terracotta tint)

### Voucher States (New)

- **Default:** Inherit terracotta theme
  - Border: `border-terracotta/30`
  - Focus ring: `focus:ring-terracotta/20`
  - Button: `bg-terracotta hover:bg-terracotta-dark`

- **Success (Applied):** Green
  - Background: `bg-gradient-to-br from-green-50 to-white`
  - Border: `border-green-200`
  - Text: `text-green-700`
  - Icon: `text-green-600`

- **Error (Invalid):** Red
  - Border: `border-red-300`
  - Text: `text-red-600`
  - Icon: `text-red-500`

- **Warning (Low Price):** Amber
  - Background: `bg-amber-50`
  - Border: `border-amber-200`
  - Text: `text-amber-700`
  - Button: `bg-amber-500 hover:bg-amber-600`

### Manager Override Button

- Outlined style to differentiate from primary actions
- Border: `border-terracotta`
- Text: `text-terracotta`
- Hover: `hover:bg-terracotta/10`
- Icon: `text-terracotta`

---

## 9. Animation Integration

### Voucher Apply Success

```tsx
<motion.div
  initial={{ scale: 0.95, opacity: 0 }}
  animate={{ scale: 1, opacity: 1 }}
  transition={{ type: "spring", stiffness: 300, damping: 24 }}
  className="border border-green-200 rounded-lg..."
>
  {/* Applied voucher content */}
</motion.div>
```

Effect: Gentle scale-in with spring physics when voucher applied

### Voucher Remove

```tsx
<motion.div
  exit={{ scale: 0.9, opacity: 0 }}
  transition={{ duration: 0.2 }}
>
  {/* Voucher being removed */}
</motion.div>
```

Effect: Quick fade-out when removed

### Manager Override Dialog

```tsx
<motion.div
  initial={{ opacity: 0, scale: 0.95 }}
  animate={{ opacity: 1, scale: 1 }}
  exit={{ opacity: 0, scale: 0.95 }}
  transition={{ type: "spring", stiffness: 300, damping: 24 }}
>
  {/* Dialog content */}
</motion.div>
```

Effect: Smooth modal entrance/exit

### Low Price Warning Dialog

```tsx
<motion.div
  initial={{ opacity: 0, y: -20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ type: "spring", stiffness: 400, damping: 25 }}
>
  {/* Warning content */}
</motion.div>
```

Effect: Slight downward slide to emphasize warning

---

## 10. Implementation Checklist

### Phase 0.5: Voucher Integration (4 hours)

- [x] **State Management** (1.5 hours)
  - [ ] Add `appliedVoucher` state
  - [ ] Add `showManagerOverride` state
  - [ ] Add `showLowPriceWarning` state
  - [ ] Add `lowPriceConfirmed` state
  - [ ] Import `useAuth` hook
  - [ ] Check `canCreateOverrideVoucher` permission

- [x] **Component Imports** (30 min)
  - [ ] Import `VoucherInput` with `AppliedVoucher` type
  - [ ] Import `ManagerOverrideDialog`
  - [ ] Import `LowPriceWarningDialog`
  - [ ] Import `useAuth` context

- [x] **UI Integration** (1.5 hours)
  - [ ] Add voucher section to sticky summary
  - [ ] Apply terracotta styling to voucher input
  - [ ] Add manager override button (conditional)
  - [ ] Position dialogs (modals)
  - [ ] Update discount section (hide when voucher applied)
  - [ ] Update totals calculation display

- [x] **Handlers** (30 min)
  - [ ] Implement `handleApplyVoucher`
  - [ ] Implement `handleRemoveVoucher`
  - [ ] Implement `handleOverrideCreated`
  - [ ] Implement `handleLowPriceConfirm`
  - [ ] Update `executeSubmit` with voucher data

- [x] **Testing** (1 hour)
  - [ ] Apply valid voucher → verify discount
  - [ ] Apply invalid voucher → verify error
  - [ ] Remove voucher → verify cleared
  - [ ] Manager override → verify auth → verify creation
  - [ ] Low price warning → verify threshold → verify confirmation
  - [ ] Modify order items → verify voucher clears

---

## 11. Final Visual Summary

### Key Changes

1. **Voucher input moved to sticky summary** (always visible)
2. **Manual discount now secondary** ("OR" divider)
3. **Manager override button** (conditional, outlined terracotta)
4. **Dialogs styled consistently** (terracotta for override, amber for warning)
5. **Success/error states** (green/red with gradients)
6. **Animations** (spring physics for apply/remove)

### Design Cohesion

- ✅ Terracotta remains primary color
- ✅ Playfair Display for section headers
- ✅ Spring physics animations throughout
- ✅ Consistent card styling (rounded, shadowed)
- ✅ Semantic colors (green=success, red=error, amber=warning)
- ✅ Icons anchor each section (Ticket, ShieldCheck, AlertTriangle)

### Mobile Considerations

- Voucher section full-width on mobile
- Dialogs take 90% of viewport height
- Touch targets ≥48px
- Text inputs large enough for easy typing

---

**Status:** ✅ Design specification complete
**Next:** Implement in Phase 0.5 (4 hours)
**File:** `src/components/orders/OrderFormPOS_Redesign.tsx`
