---
phase: quick-22
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - convex/whatsappTemplates/mutations.ts
autonomous: true
requirements: [QUICK-22]

must_haves:
  truths:
    - "{delivery_fee} variable appears above *Total:* line in payment_request template (ID and EN)"
    - "{delivery_fee} variable appears above *Total:* line in receipt template (ID and EN)"
    - "{delivery_fee} is listed in availableVariables for payment_request and receipt templates"
    - "resetToDefault restores templates with {delivery_fee} in the correct position"
    - "When delivery_fee is empty string (no fee set), the line is omitted cleanly"
  artifacts:
    - path: "convex/whatsappTemplates/mutations.ts"
      provides: "Updated DEFAULT_TEMPLATES with {delivery_fee} in payment_request and receipt"
      contains: "{delivery_fee}"
  key_links:
    - from: "convex/whatsappTemplates/mutations.ts"
      to: "convex/orders/whatsapp.ts"
      via: "buildTemplateVariables returns {delivery_fee} key already mapped"
      pattern: "delivery_fee.*deliveryFeeFormatted"
---

<objective>
Add the `{delivery_fee}` template variable to the WhatsApp payment_request and receipt default templates (both Indonesian and English). The variable is already resolved by `buildTemplateVariables()` in `whatsapp.ts` — it only needs to be inserted into the `DEFAULT_TEMPLATES` string bodies and added to `availableVariables`.

Purpose: When an order has a delivery fee, it should appear as a line above the Total in customer-facing templates so the math adds up (items subtotal + delivery fee = total).
Output: Updated `DEFAULT_TEMPLATES` in `mutations.ts` with `{delivery_fee}` wired into payment_request and receipt templates.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@convex/orders/whatsapp.ts
@convex/whatsappTemplates/mutations.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add {delivery_fee} to payment_request and receipt DEFAULT_TEMPLATES</name>
  <files>convex/whatsappTemplates/mutations.ts</files>
  <action>
In `convex/whatsappTemplates/mutations.ts`, update `DEFAULT_TEMPLATES` for two template codes:

**1. `payment_request` template:**

In `templateId` (Indonesian), insert `{delivery_fee}` line between the separator and `*Total:*`:

Current (after `────────────`):
```
────────────
*Total: {total_amount}*{discount_note}
```

Updated:
```
────────────
{delivery_fee}*Total: {total_amount}*{discount_note}
```

Note: `{delivery_fee}` resolves to `"🚚 Ongkir: Rp X.XXX\n"` when fee > 0, or `""` when no fee. The variable already includes a trailing newline in `buildTemplateVariables` — so when non-empty it naturally pushes Total to the next line. When empty, it collapses to nothing.

WAIT — check `buildTemplateVariables`: `{delivery_fee}` maps to `deliveryFeeFormatted` which is `formatCurrency(order.deliveryFee)` or `""`. It does NOT include the emoji prefix or trailing newline. The hardcoded generators build `deliveryFeeLine` separately with the emoji/newline.

So for the DB template, we need a conditional pattern. Since template variables are simple string substitution (no conditionals), the cleanest approach is:
- When `deliveryFee > 0`: `{delivery_fee}` = `"🚚 Ongkir: Rp X.XXX"`
- When `deliveryFee == 0`: `{delivery_fee}` = `""`

Update `buildTemplateVariables` in `convex/orders/whatsapp.ts` to make `{delivery_fee}` emit the full line (with emoji prefix) when non-zero, or empty string when zero. Then use `{delivery_fee}` on its own line in the template, with a conditional newline approach.

**Revised approach for `buildTemplateVariables` in `whatsapp.ts`:**

Change `{delivery_fee}` mapping from:
```typescript
"{delivery_fee}": deliveryFeeFormatted,
```
To:
```typescript
"{delivery_fee}": order.deliveryFee && order.deliveryFee > 0
  ? `🚚 Ongkir: ${formatCurrency(order.deliveryFee)}\n`
  : "",
```

This makes `{delivery_fee}` emit `"🚚 Ongkir: Rp X.XXX\n"` (with trailing newline) when fee exists, or `""` when not.

**Then in `mutations.ts` DEFAULT_TEMPLATES:**

For `payment_request.templateId`:
```
────────────
{delivery_fee}*Total: {total_amount}*{discount_note}
```

For `payment_request.templateEn`:
```
────────────
{delivery_fee}*Total: {total_amount}*{discount_note}
```

For `receipt.templateId` (Indonesian), insert before `*Total:*`:
```
----------------
{delivery_fee}*Total: {total_amount}*{discount_note}
```

For `receipt.templateEn` (English), same pattern:
```
----------------
{delivery_fee}*Total: {total_amount}*{discount_note}
```

Add `"{delivery_fee}"` to `availableVariables` for both `payment_request` and `receipt` template objects.

**Files to edit:**
1. `convex/orders/whatsapp.ts` — update `{delivery_fee}` value in `buildTemplateVariables` to include emoji prefix and trailing newline
2. `convex/whatsappTemplates/mutations.ts` — update 4 template strings + 2 availableVariables arrays

**Important:** The hardcoded fallback generators (`generatePaymentRequest`, `generateReceipt`) already handle delivery fee independently via `deliveryFeeLine` local variable — do NOT change those functions. Only `buildTemplateVariables` and `DEFAULT_TEMPLATES` need updating.

**DB migration note:** Existing seeded templates in production DB will NOT automatically update. The `resetToDefault` mutation reads from `DEFAULT_TEMPLATES` — users can click "Reset to Default" in the WhatsApp Templates Manager to pick up the new variable. No automatic migration needed.
  </action>
  <verify>
Run: `npm run type-check`
Confirm no TypeScript errors.

Manual check: In `convex/orders/whatsapp.ts`, verify `{delivery_fee}` in `buildTemplateVariables` now returns the full line with emoji when fee > 0 (not just the formatted currency).

In `convex/whatsappTemplates/mutations.ts`, verify both `payment_request` and `receipt` templates contain `{delivery_fee}` in their template strings (both ID and EN), and `availableVariables` arrays include `"{delivery_fee}"`.
  </verify>
  <done>
`npm run type-check` passes. `{delivery_fee}` appears in payment_request (ID + EN) and receipt (ID + EN) template bodies, positioned immediately before `*Total:*`. Both `availableVariables` arrays include `"{delivery_fee}"`. When an order has no delivery fee, `{delivery_fee}` renders as empty string — no blank line appears before Total.
  </done>
</task>

</tasks>

<verification>
1. `npm run type-check` passes with no errors
2. `npm run build` succeeds
3. Grep confirms `{delivery_fee}` appears in both payment_request and receipt template bodies in `mutations.ts`
4. Grep confirms `buildTemplateVariables` in `whatsapp.ts` maps `{delivery_fee}` to a string that includes the emoji prefix when fee > 0
</verification>

<success_criteria>
- `npm run type-check` passes
- `npm run build` succeeds
- `{delivery_fee}` variable present in payment_request (templateId + templateEn) with correct position (before Total line)
- `{delivery_fee}` variable present in receipt (templateId + templateEn) with correct position (before Total line)
- `availableVariables` for payment_request and receipt include `"{delivery_fee}"`
- `buildTemplateVariables` emits full `"🚚 Ongkir: Rp X.XXX\n"` string (not bare currency) so template rendering works without conditional logic
</success_criteria>

<output>
After completion, create `.planning/quick/22-add-shipping-fee-variable-to-whatsapp-pa/22-SUMMARY.md`
</output>
