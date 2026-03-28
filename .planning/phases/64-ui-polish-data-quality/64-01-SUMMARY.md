# Plan 64-01: Navbar Restructure — Summary

## Status: COMPLETE

## Changes Made

### Header.tsx (`src/components/layout/Header.tsx`)

1. **Logo made clickable**: Replaced the static `<div>` wrapping the Frollie Pro logo/text with `<Link to="/home">`, so clicking the logo navigates to the hub page.

2. **Home nav item removed**: Removed `{ path: '/home', label: 'Home', icon: Home, ... }` from `mainNavItems`. Removed the `Home` icon import from lucide-react. Removed the `_prefetchHome` factory (no longer needed).

3. **New icon imports added**: `Calculator`, `BookMarked`, `FileUp` added to the lucide-react import block.

4. **Financials dropdown split into two**:
   - **Financials** (5 items): Income Statement, Expenses, Exp. Analytics, Reimburse, Payroll
   - **Accounting** (5 items, new): Journal Entry (BookMarked), Chart of Accounts (Landmark), Bank Accounts (Landmark), Historical Import (FileUp), Asset Register (Building2)

5. **Desktop Accounting dropdown**: New dropdown with Calculator icon added between Financials and Depots dropdowns, using the same pattern as Financials.

6. **Mobile sheet Accounting section**: New "Accounting" section header and item list added between the Financials and Depot Management sections in the mobile hamburger sheet.

### MobileBottomNav.tsx (`src/components/layout/MobileBottomNav.tsx`)

1. **Home tab removed**: Removed `{ path: '/home', ... }` from `primaryTabs`. Removed `Home` icon import. Removed `_prefetchHome` factory.

2. **New icon imports added**: `Building2`, `BookMarked`, `FileUp` added to the lucide-react import block.

3. **Accounting pages added to moreItems**: After Payroll and before K3 Mart, added:
   - `/journal` — Journal Entry (BookMarked icon)
   - `/accounts` — Accounts (Landmark icon)
   - `/import` — Hist. Import (FileUp icon)
   - `/assets` — Assets (Building2 icon)
   - Bank Accounts (`/bank-accounts`) was already present — not duplicated.

## Verification

- `npx tsc --noEmit` passes with zero errors.
