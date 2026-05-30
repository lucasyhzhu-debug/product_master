# Plan 64-02 Summary: Mobile Order Creation Safety

## Status: COMPLETE

## Changes Made

### 1. ProductButtons.tsx - Touch scroll detection
- Added `touchStartX`, `touchStartY`, `isScrolling` refs and 10px `SCROLL_THRESHOLD` constant
- Created four touch-specific handlers:
  - `handleTouchStart`: records touch coordinates, resets scroll state, starts press timer
  - `handleTouchMove`: detects scroll gesture (>10px delta), cancels press if scrolling
  - `handleTouchEnd`: suppresses product addition if user was scrolling
  - `handleTouchCancel`: resets scroll state and cancels press
- Replaced generic `onTouchStart`/`onTouchEnd` with scroll-aware versions, added `onTouchMove` and `onTouchCancel`
- Changed grid gap from `gap-3` to `gap-4`
- Added `min-h-[56px]` to button for WCAG touch target compliance

### 2. SwipeableLineItem.tsx - NEW component
- Created `src/components/orders/SwipeableLineItem.tsx`
- Uses framer-motion `drag="x"` with `dragDirectionLock` for horizontal swipe gesture
- Reveals destructive red background with Trash2 icon as user swipes left
- Triggers removal on swipe past -60px offset or -500px/s velocity
- Springs back to origin on insufficient swipe
- Uses `isMounted` ref guard to prevent state updates after unmount

### 3. OrderCreate.tsx - Line item UX improvements
- Imported `SwipeableLineItem` component
- Replaced `updateItemQuantity` implementation: `prev.map` with `Math.max(1, ...)` changed to `prev.flatMap` that removes items when quantity reaches zero
- Removed `disabled={item.quantity <= 1}` from minus button (minus-to-zero now removes the item)
- Delete button: removed `opacity-0 group-hover:opacity-100` (always visible on mobile), changed to `text-muted-foreground hover:text-destructive`, replaced `x` text with `<Trash2>` icon
- Wrapped each line item with `<SwipeableLineItem>` for swipe-to-delete gesture, moved `key` prop to wrapper

## Verification
- `npx tsc --noEmit` passes with zero errors

## Files Modified
- `src/components/orders/ProductButtons.tsx` (touch scroll detection, WCAG touch targets)
- `src/components/orders/SwipeableLineItem.tsx` (NEW - swipe-to-delete gesture)
- `src/pages/OrderCreate.tsx` (minus-to-zero, always-visible delete, swipe wrapper)
