---
phase: quick-22
plan: "01"
subsystem: whatsapp-templates
tags: [whatsapp, delivery-fee, templates]
dependency_graph:
  requires: []
  provides: ["{delivery_fee} variable in payment_request and receipt WhatsApp DB templates"]
  affects: [convex/orders/whatsapp.ts, convex/whatsappTemplates/mutations.ts]
tech_stack:
  added: []
  patterns: [template-variable-substitution]
key_files:
  modified:
    - convex/orders/whatsapp.ts
    - convex/whatsappTemplates/mutations.ts
decisions:
  - "{delivery_fee} emits full 'ongkir line with emoji + trailing newline' when fee > 0, empty string when 0 — enables clean conditional rendering without template conditional logic"
  - "Hardcoded fallback generators (generatePaymentRequest, generateReceipt) left unchanged — they manage their own deliveryFeeLine independently"
  - "No automatic DB migration needed — users click Reset to Default in WhatsApp Templates Manager to pick up the new variable"
metrics:
  duration: "4 min"
  completed: "2026-02-22"
  tasks_completed: 1
  files_modified: 2
---

# Quick Task 22: Add {delivery_fee} to WhatsApp Payment Request and Receipt Templates Summary

**One-liner:** Wired `{delivery_fee}` template variable into payment_request and receipt DB templates (ID + EN) so delivery fee appears above Total when set, with zero-fee collapsing cleanly to nothing.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add {delivery_fee} to payment_request and receipt DEFAULT_TEMPLATES | ee22f43 | convex/orders/whatsapp.ts, convex/whatsappTemplates/mutations.ts |

## What Changed

### convex/orders/whatsapp.ts

Updated `buildTemplateVariables()` — the `{delivery_fee}` mapping in the variables object changed from:

```typescript
// Before: bare currency string
"{delivery_fee}": deliveryFeeFormatted,  // "Rp 15.000" or ""
```

To:

```typescript
// After: full line with emoji prefix and trailing newline
const deliveryFeeFormatted = order.deliveryFee && order.deliveryFee > 0
  ? `🚚 Ongkir: ${formatCurrency(order.deliveryFee)}\n`
  : "";
"{delivery_fee}": deliveryFeeFormatted,  // "🚚 Ongkir: Rp 15.000\n" or ""
```

This allows the template to simply place `{delivery_fee}` immediately before `*Total:*` — when the fee is set, the trailing `\n` separates the ongkir line from Total; when empty, nothing appears.

### convex/whatsappTemplates/mutations.ts

Updated `DEFAULT_TEMPLATES` for `payment_request` and `receipt`:

**Before (both payment_request and receipt templates):**
```
────────────
*Total: {total_amount}*{discount_note}
```

**After:**
```
────────────
{delivery_fee}*Total: {total_amount}*{discount_note}
```

Also added `"{delivery_fee}"` to `availableVariables` for both `payment_request` and `receipt` template objects.

## Decisions Made

1. **Full line in variable, not bare currency** — `{delivery_fee}` emits the complete `🚚 Ongkir: Rp X.XXX\n` string rather than just the formatted currency. This avoids needing template conditional logic and keeps the template strings clean.

2. **Hardcoded fallback generators untouched** — `generatePaymentRequest()` and `generateReceipt()` already handle delivery fee via their own `deliveryFeeLine` local variable. These are only used when no DB template exists — they are not affected by this change.

3. **No DB migration** — Existing production templates were seeded before this change. Users who want the new variable must click "Reset to Default" in the WhatsApp Templates Manager. This is intentional — auto-migrating user-edited templates would overwrite customizations.

## Verification

- `npm run type-check` — PASSED (no errors)
- `npm run build` — PASSED (3479 modules, existing CSS warnings only, unrelated to this change)
- `{delivery_fee}` present in payment_request templateId (line 29)
- `{delivery_fee}` present in payment_request templateEn (line 50)
- `{delivery_fee}` present in receipt templateId (line 130)
- `{delivery_fee}` present in receipt templateEn (line 144)
- `availableVariables` updated for payment_request (line 69) and receipt (line 158)
- `buildTemplateVariables` emits full emoji+currency+newline string when fee > 0

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- convex/orders/whatsapp.ts: FOUND (modified)
- convex/whatsappTemplates/mutations.ts: FOUND (modified)
- Commit ee22f43: FOUND
