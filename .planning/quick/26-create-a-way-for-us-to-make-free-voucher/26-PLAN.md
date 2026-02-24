---
phase: 26-free-vouchers
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - convex/schema.ts
  - convex/vouchers/mutations.ts
  - src/hooks/convex/useVouchers.ts
  - src/pages/VouchersManager.tsx
autonomous: true
requirements:
  - FREE-01
must_haves:
  truths:
    - "Admin can open a 'Create Free Voucher' dialog distinct from the standard voucher creation flow"
    - "Admin selects a reason from dropdown: QA Testing, Gift, or Other (Other requires a text field)"
    - "Created free voucher is always 100% discount, unlimited usage by default, no expiry by default"
    - "Free vouchers are admin-only — managers cannot create them"
    - "Free vouchers are visually distinguishable in the voucher list (e.g., a 'Free' badge)"
  artifacts:
    - path: "convex/schema.ts"
      provides: "isFreeVoucher + freeReason fields on vouchers table"
      contains: "isFreeVoucher"
    - path: "convex/vouchers/mutations.ts"
      provides: "createFreeVoucher mutation — admin only, 100% discount, requires freeReason"
      exports: ["createFreeVoucher"]
    - path: "src/hooks/convex/useVouchers.ts"
      provides: "useCreateFreeVoucher hook"
      exports: ["useCreateFreeVoucher", "FreeVoucherInput"]
    - path: "src/pages/VouchersManager.tsx"
      provides: "Free Voucher button + CreateFreeVoucherDialog component"
  key_links:
    - from: "src/pages/VouchersManager.tsx"
      to: "convex/vouchers/mutations.ts createFreeVoucher"
      via: "useCreateFreeVoucher hook -> protectedMutation"
      pattern: "useCreateFreeVoucher"
    - from: "convex/vouchers/mutations.ts"
      to: "convex/schema.ts vouchers table"
      via: "ctx.db.insert with isFreeVoucher: true"
      pattern: "isFreeVoucher"
---

<objective>
Add the ability for admins to create free (100% discount) vouchers with a structured reason — QA Testing, Gift, or Other (with required text). Free vouchers are admin-only, always 100% percentage discount, and visually flagged in the UI.

Purpose: Operations team needs a formal, auditable way to hand out free access without misusing regular voucher flows. Managers are explicitly excluded (admin-only).
Output: schema change (2 new optional fields), new createFreeVoucher mutation, hook, dialog, and badge in VouchersManager.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@convex/schema.ts
@convex/vouchers/mutations.ts
@src/hooks/convex/useVouchers.ts
@src/pages/VouchersManager.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Schema + Backend — add isFreeVoucher fields and createFreeVoucher mutation</name>
  <files>
    convex/schema.ts
    convex/vouchers/mutations.ts
  </files>
  <action>
**convex/schema.ts** — in the `vouchers` defineTable block (after the `overrideOrderId` line), add two new optional fields:
```
isFreeVoucher: v.optional(v.boolean()),   // True if created via createFreeVoucher
freeReason: v.optional(v.string()),        // "QA Testing" | "Gift" | "Other: {text}"
```
No new indexes needed.

**convex/vouchers/mutations.ts** — add a new exported mutation `createFreeVoucher` at the bottom of the file (before the `generateCode` mutation):

```typescript
/**
 * Create a free (100% discount) voucher.
 * Admin only — managers are explicitly excluded.
 *
 * Always creates a 100% percentage discount voucher with no usage limit
 * and no expiry by default. Requires a structured reason.
 */
export const createFreeVoucher = mutation({
  args: {
    token: v.string(),
    name: v.string(),
    freeReason: v.string(), // "QA Testing" | "Gift" | "Other: {user text}"
    code: v.optional(v.string()), // Auto-generated if not provided
    usageLimit: v.optional(v.number()),
    validUntil: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.token, ["admin"]); // admin ONLY

    if (!args.freeReason.trim()) {
      throw new Error("Reason is required for free voucher");
    }
    if (!args.name.trim()) {
      throw new Error("Voucher name is required");
    }

    // Generate or normalize code
    let code = args.code
      ? args.code.toUpperCase().trim().replace(/\s+/g, "-")
      : generateVoucherCode("FREE");

    // Ensure unique code
    const existing = await ctx.db
      .query("vouchers")
      .withIndex("by_code", (q) => q.eq("code", code))
      .first();
    if (existing) {
      throw new Error(`Voucher code "${code}" already exists`);
    }

    const voucherId = await ctx.db.insert("vouchers", {
      code,
      name: args.name.trim(),
      description: `Free voucher — ${args.freeReason}`,
      discountType: "percentage",
      discountValue: 100,
      isActive: true,
      usageLimit: args.usageLimit,
      validUntil: args.validUntil,
      usageCount: 0,
      isFreeVoucher: true,
      freeReason: args.freeReason,
      createdBy: user.name,
      createdAt: Date.now(),
    });

    return { voucherId, code };
  },
});
```
  </action>
  <verify>
    <automated>cd "D:\Claude\Product Manager\product_master" && npm run type-check 2>&1 | tail -5</automated>
    <manual>Confirm no TypeScript errors on vouchers table schema or mutations.ts</manual>
  </verify>
  <done>
    - `convex/schema.ts` has `isFreeVoucher` and `freeReason` optional fields on vouchers table
    - `convex/vouchers/mutations.ts` exports `createFreeVoucher` mutation with admin-only `requireRole`
    - `npm run type-check` passes
  </done>
</task>

<task type="auto">
  <name>Task 2: Hook + UI — useCreateFreeVoucher hook and CreateFreeVoucherDialog in VouchersManager</name>
  <files>
    src/hooks/convex/useVouchers.ts
    src/pages/VouchersManager.tsx
  </files>
  <action>
**src/hooks/convex/useVouchers.ts**

1. Add `createFreeVoucher` to the `vouchersApi` mutations type cast block:
```typescript
createFreeVoucher: unknown;
```

2. Add `FreeVoucherInput` interface after `ManagerOverrideInput`:
```typescript
export interface FreeVoucherInput {
  name: string;
  freeReason: string;  // "QA Testing" | "Gift" | "Other: {text}"
  code?: string;
  usageLimit?: number;
  validUntil?: number;
}
```

3. Add `useCreateFreeVoucher` hook (after `useCreateManagerOverride`):
```typescript
export function useCreateFreeVoucher() {
  const protectedCreate = useProtectedMutation(vouchersApi.mutations.createFreeVoucher as any);
  return {
    createFreeVoucher: async (data: FreeVoucherInput) => {
      try {
        const result = await protectedCreate({ ...data });
        toast.success(`Free voucher created: ${result.code}`);
        return result;
      } catch (error) {
        if (!(error instanceof Error && error.message === "Not authenticated")) {
          toast.error(getErrorMessage(error, "Failed to create free voucher"));
        }
        throw error;
      }
    },
  };
}
```

---

**src/pages/VouchersManager.tsx**

**Imports to add:** `Gift` from `lucide-react` (already has lucide imports, just add `Gift` to the destructured list). Also import `useCreateFreeVoucher` and `FreeVoucherInput` from `useVouchers`.

**State to add** in `VouchersManager` component body (alongside existing dialog state):
```typescript
const [showFreeDialog, setShowFreeDialog] = useState(false);
const [freeForm, setFreeForm] = useState({
  name: "",
  reasonType: "QA Testing" as "QA Testing" | "Gift" | "Other",
  reasonOther: "",
  code: "",
  usageLimit: "",
  validUntil: "",
});
const [isSubmittingFree, setIsSubmittingFree] = useState(false);
```

**Hook to add:**
```typescript
const { createFreeVoucher } = useCreateFreeVoucher();
```

**Handler to add:**
```typescript
const handleCreateFree = async () => {
  if (!freeForm.name.trim()) {
    toast.error("Voucher name is required");
    return;
  }
  if (freeForm.reasonType === "Other" && !freeForm.reasonOther.trim()) {
    toast.error("Please describe the reason");
    return;
  }
  const freeReason =
    freeForm.reasonType === "Other"
      ? `Other: ${freeForm.reasonOther.trim()}`
      : freeForm.reasonType;

  setIsSubmittingFree(true);
  try {
    await createFreeVoucher({
      name: freeForm.name.trim(),
      freeReason,
      code: freeForm.code.trim() || undefined,
      usageLimit: freeForm.usageLimit ? parseInt(freeForm.usageLimit) : undefined,
      validUntil: freeForm.validUntil
        ? new Date(freeForm.validUntil + "T23:59:59").getTime()
        : undefined,
    });
    setShowFreeDialog(false);
    setFreeForm({ name: "", reasonType: "QA Testing", reasonOther: "", code: "", usageLimit: "", validUntil: "" });
  } finally {
    setIsSubmittingFree(false);
  }
};
```

**PageHeader — add a second button** next to "Create Voucher":
```tsx
<Button variant="outline" onClick={() => setShowFreeDialog(true)}>
  <Gift className="w-4 h-4 mr-2" />
  Free Voucher
</Button>
```
Place the "Free Voucher" button before the existing "Create Voucher" button inside the PageHeader children.

**VoucherCard badge** — in the `VoucherCard` component, inside the `CardHeader` `div.flex items-center gap-2 mb-1`, after the existing `<Badge variant={status.variant}>` line, add:
```tsx
{voucher.isFreeVoucher && (
  <Badge variant="outline" className="text-green-600 border-green-600">
    Free
  </Badge>
)}
```
The `Voucher` type is `Doc<"vouchers">` so `isFreeVoucher` will be available after schema regeneration. Use optional chaining: `voucher.isFreeVoucher`.

**CreateFreeVoucherDialog** — add this Dialog before the closing `</div>` of the component return:
```tsx
<Dialog open={showFreeDialog} onOpenChange={setShowFreeDialog}>
  <DialogContent className="max-w-md">
    <DialogHeader>
      <DialogTitle>Create Free Voucher</DialogTitle>
      <DialogDescription>
        Creates a 100% discount voucher. Admin only.
      </DialogDescription>
    </DialogHeader>
    <div className="space-y-4 py-4">
      {/* Name */}
      <div className="space-y-2">
        <Label htmlFor="free-name">Voucher Name *</Label>
        <Input
          id="free-name"
          value={freeForm.name}
          onChange={(e) => setFreeForm((p) => ({ ...p, name: e.target.value }))}
          placeholder="QA Test — Feb 2026"
        />
      </div>
      {/* Reason */}
      <div className="space-y-2">
        <Label>Reason *</Label>
        <Select
          value={freeForm.reasonType}
          onValueChange={(v: "QA Testing" | "Gift" | "Other") =>
            setFreeForm((p) => ({ ...p, reasonType: v, reasonOther: "" }))
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="QA Testing">QA Testing</SelectItem>
            <SelectItem value="Gift">Gift</SelectItem>
            <SelectItem value="Other">Other</SelectItem>
          </SelectContent>
        </Select>
        {freeForm.reasonType === "Other" && (
          <Input
            value={freeForm.reasonOther}
            onChange={(e) => setFreeForm((p) => ({ ...p, reasonOther: e.target.value }))}
            placeholder="Describe the reason..."
          />
        )}
      </div>
      {/* Optional Code */}
      <div className="space-y-2">
        <Label htmlFor="free-code">Custom Code (optional)</Label>
        <Input
          id="free-code"
          value={freeForm.code}
          onChange={(e) =>
            setFreeForm((p) => ({ ...p, code: e.target.value.toUpperCase().replace(/\s+/g, "-") }))
          }
          placeholder="Auto-generated (FREE-XXXX-XXXX)"
          className="font-mono"
        />
      </div>
      {/* Optional Usage Limit */}
      <div className="space-y-2">
        <Label htmlFor="free-limit">Usage Limit (optional)</Label>
        <Input
          id="free-limit"
          type="number"
          min="1"
          value={freeForm.usageLimit}
          onChange={(e) => setFreeForm((p) => ({ ...p, usageLimit: e.target.value }))}
          placeholder="Leave empty for unlimited"
        />
      </div>
      {/* Optional Expiry */}
      <div className="space-y-2">
        <Label htmlFor="free-until">Valid Until (optional)</Label>
        <Input
          id="free-until"
          type="date"
          value={freeForm.validUntil}
          onChange={(e) => setFreeForm((p) => ({ ...p, validUntil: e.target.value }))}
        />
      </div>
    </div>
    <DialogFooter>
      <Button
        variant="outline"
        onClick={() => setShowFreeDialog(false)}
        disabled={isSubmittingFree}
      >
        Cancel
      </Button>
      <Button onClick={handleCreateFree} disabled={isSubmittingFree}>
        {isSubmittingFree ? "Creating..." : "Create Free Voucher"}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```
  </action>
  <verify>
    <automated>cd "D:\Claude\Product Manager\product_master" && npm run build 2>&1 | tail -10</automated>
    <manual>Open VouchersManager in browser. Verify "Free Voucher" button appears. Create one with reason "QA Testing" — confirm it appears in the list with a green "Free" badge and shows 100% discount value.</manual>
  </verify>
  <done>
    - `useVouchers.ts` exports `useCreateFreeVoucher` and `FreeVoucherInput`
    - VouchersManager has "Free Voucher" button in PageHeader
    - Free voucher dialog has reason dropdown (QA Testing / Gift / Other) with conditional text input for Other
    - Free vouchers show green "Free" badge in VoucherCard
    - `npm run build` passes with no errors
  </done>
</task>

</tasks>

<verification>
After both tasks complete:
1. `npm run type-check` passes
2. `npm run build` passes
3. `npm run test` passes (no regressions — no new tests required as this is UI/schema with no pure business logic functions)
4. VouchersManager page loads without errors
5. "Free Voucher" button is visible and opens the dialog
6. Creating a free voucher with reason "Gift" saves successfully and shows in the Vouchers tab with green "Free" badge
7. Attempting to create via a manager account fails at the backend (`requireRole` enforces admin-only)
</verification>

<success_criteria>
- Free vouchers are always 100% percentage discount (enforced in backend, not adjustable from UI)
- Reason dropdown has exactly three options: QA Testing, Gift, Other
- "Other" selection reveals a required text input
- Created free vouchers show `isFreeVoucher: true` and `freeReason` in the database
- Mutation `createFreeVoucher` uses `requireRole(ctx, args.token, ["admin"])` — managers get a rejected call
- `npm run build` passes clean
</success_criteria>

<output>
After completion, create `.planning/quick/26-create-a-way-for-us-to-make-free-voucher/26-SUMMARY.md`
</output>
