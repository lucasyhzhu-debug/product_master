# Deferred Items - Phase 16

## Build Errors (Pre-existing / Expected)

1. **K3MartCockpit.tsx** (lines 487, 492): Frontend uses old `getWeeklyDispatchPlans` response shape (`.products` property). Plan 02 rewrites the frontend to use the new outlet-first structure.

2. **OrderSlideOver.tsx** (line 141): Type mismatch on `"Packaging"` not assignable to `OrderStatus`. Pre-existing, unrelated to Phase 16.
