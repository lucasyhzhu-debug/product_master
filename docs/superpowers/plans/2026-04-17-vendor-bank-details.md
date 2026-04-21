# Vendor Bank Details for Payment Requests — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture vendor bank account details inline on `payment_request` expenses so admins have all payee info on the approval card (eliminating WhatsApp round-trips), and store recurring vendors in a reusable directory.

**Architecture:** New `vendors` directory table (soft-deletable) + four snapshot fields on `expenses` populated at submit time. Snapshot guarantees audit integrity (past "paid" expenses never retro-change if vendor bank info is edited later). Submitter UX: combobox picker with inline create. Admin UX: payment details block with per-field and "copy all" buttons.

**Tech Stack:** Convex (backend), React 19 + TypeScript (frontend), shadcn/ui + Tailwind (UI), Vitest + convex-test (backend tests), Playwright (E2E).

**Spec:** `docs/superpowers/specs/2026-04-17-vendor-bank-details-design.md`

---

## Git Workflow

**Branch:** `feature/vendor-bank-details`
**Base:** main (verify phase 74 is merged first — `git switch main && git pull`)
**Checkpoints:** Commit after each task. Merge to main after all waves complete + `npm run build` passes.

---

## Implementation Waves

### Wave 1: Backend foundation [SEQUENTIAL — schema-dependent]
| Task | Files |
|------|-------|
| 1. Schema — add `vendors` table + snapshot fields on `expenses` | `convex/schema.ts` |
| 2. Vendor helpers (pure functions) + tests | `convex/vendors/helpers.ts`, `convex/vendors/__tests__/helpers.test.ts` |
| 3. Expense validation extension + tests | `convex/expenses/helpers.ts`, `convex/expenses/__tests__/helpers.test.ts` |
| 4. Vendor mutations (create/update/deactivate/reactivate) + tests | `convex/vendors/mutations.ts`, `convex/vendors/__tests__/mutations.test.ts` |
| 5. Vendor queries | `convex/vendors/queries.ts` |
| 6. Extend expense mutations to accept vendor args + snapshot | `convex/expenses/mutations.ts` |
| 7. Add `canAccessVendors` permission | `src/lib/types.ts` |

### Wave 2: Frontend components [PARALLEL, after Wave 1]
| Task | Files |
|------|-------|
| 8. `useVendors` hook + barrel export | `src/hooks/convex/useVendors.ts`, `src/hooks/convex/index.ts` |
| 9. `VendorForm` component | `src/components/vendors/VendorForm.tsx` |
| 10. `VendorPicker` component | `src/components/vendors/VendorPicker.tsx` |
| 11. `VendorPaymentDetails` component (copy buttons) | `src/components/vendors/VendorPaymentDetails.tsx` |
| 12. Barrel export | `src/components/vendors/index.ts` |
| 13. `VendorsManager` page | `src/pages/VendorsManager.tsx` |
| 14. Route + nav link | `src/App.tsx`, `src/components/layout/Header.tsx` |

### Wave 3: Frontend integration [SEQUENTIAL, after Wave 2]
| Task | Files |
|------|-------|
| 15. Wire `VendorPicker` into `ExpenseSubmitForm` | `src/components/expense/ExpenseSubmitForm.tsx` |
| 16. Wire `VendorPaymentDetails` into approval + detail views | `src/pages/ExpenseApproval.tsx`, `src/pages/MyExpenses.tsx`, `src/components/expenses/ApprovalActions.tsx`, `src/components/expenses/ExpenseCard.tsx` |
| 17. CSV import validation for payment_request snapshot | `src/lib/csvImportValidation.ts` |

### Wave 4: Tests + docs [PARALLEL, after Wave 3]
| Task | Files |
|------|-------|
| 18. E2E Playwright test | `tests/e2e/vendor-payment-flow.spec.ts` |
| 19. Documentation updates | `docs/SCHEMA.md`, `docs/API_REFERENCE.md`, `docs/CHANGELOG.md`, `CLAUDE.md` |

### Wave 5: Verification [SEQUENTIAL]
| Task | Command |
|------|---------|
| 20. Type check + lint + test | `npm run type-check && npm run lint && npm run test` |
| 21. Full build | `npm run build` |

---

## Documentation Updates

- [ ] `docs/SCHEMA.md` — new `vendors` table + 4 snapshot fields on `expenses`
- [ ] `docs/API_REFERENCE.md` — new vendor mutations and queries
- [ ] `docs/CHANGELOG.md` — user-facing entry
- [ ] `CLAUDE.md` — add "Vendors" row to Quick File Finder

---

## Success Criteria

- [ ] `npm run type-check` passes
- [ ] `npm run lint` passes
- [ ] `npm run test` passes (including new vendor tests)
- [ ] `npm run build` succeeds
- [ ] Submitter can pick existing vendor OR create new inline during payment_request submission
- [ ] Admin sees Vendor Payment Details block on ExpenseApproval cards with per-field copy + "copy all" buttons
- [ ] Mark-as-Paid dialog shows bank details prominently
- [ ] Vendors Manager page lists/edits/deactivates vendors (manager/admin only)
- [ ] Snapshot fields immutable once expense leaves draft
- [ ] Drift tooltip appears when vendor edited between submit and pay
- [ ] Deactivated vendor excluded from picker but pending expenses remain payable
- [ ] E2E test green: submit→approve→pay payment_request flow

---

# Tasks

---

## Task 1: Schema — add `vendors` table + snapshot fields on `expenses`

**Files:**
- Modify: `convex/schema.ts:1793-1854` (expenses table) and immediately after `bankAccounts` at `:1955-1963`

- [ ] **Step 1.1: Add `vendors` table definition**

Open `convex/schema.ts`. Find the `bankAccounts` table (around line 1955). Immediately AFTER the `bankAccounts` table definition and BEFORE the `// BANK RECONCILIATION` comment block, add:

```ts
  // Vendor directory — payees for payment_request expenses.
  // Snapshot-on-submit pattern: vendor rows are editable for future use,
  // but past expenses store immutable copies on the expense row itself.
  vendors: defineTable({
    name: v.string(),                    // Display name, e.g. "PT Kemasan Jaya"
    bankName: v.string(),                // "BCA", "Mandiri", "BRI", etc.
    accountNumber: v.string(),           // Digits only — normalized on insert (strip spaces/dashes/periods)
    accountHolderName: v.string(),       // Exact name on the bank account (may differ from display name)
    notes: v.optional(v.string()),       // Free text — "pays weekly", "invoice lead time 3 days"
    isActive: v.boolean(),               // Soft-delete via deactivate; hidden from picker when false
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_active_name", ["isActive", "name"])
    .searchIndex("search_name", {
      searchField: "name",
      filterFields: ["isActive"],
    }),
```

- [ ] **Step 1.2: Add snapshot fields to `expenses` table**

In `convex/schema.ts`, find the `expenses` table definition (around line 1795). In the field list, after the `sharedReceiptAcknowledged` field (around line 1842) and before `convertedToAssetId`, add:

```ts
    // Vendor bank details snapshot (payment_request only) — immutable after draft.
    // All four fields MUST be present together when paymentMethod === "payment_request",
    // and MUST be absent otherwise (enforced in mutation layer). vendorId may be absent
    // even for payment_request (ad-hoc one-off vendor where submitter didn't save to directory).
    vendorId: v.optional(v.id("vendors")),
    vendorBankName: v.optional(v.string()),
    vendorAccountNumber: v.optional(v.string()),
    vendorAccountHolderName: v.optional(v.string()),
```

- [ ] **Step 1.3: Add index for usage-count query**

In the `expenses` table index list (after `.index("by_account", ["accountId"])` at line 1854), add:

```ts
    .index("by_vendor", ["vendorId"])
```

- [ ] **Step 1.4: Verify schema compiles**

Run: `npx convex dev --once --typecheck disable` (in a separate terminal). Expected: schema push succeeds, no errors. If running `npx convex dev` already, Convex will hot-reload.

Alternative: `npx tsc --noEmit -p convex/tsconfig.json`. Expected: exits 0.

- [ ] **Step 1.5: Commit**

```bash
git add convex/schema.ts
git commit -m "feat(schema): add vendors table and expense vendor snapshot fields"
```

---

## Task 2: Vendor helpers — normalization + validation (TDD)

**Files:**
- Create: `convex/vendors/helpers.ts`
- Create: `convex/vendors/__tests__/helpers.test.ts`

- [ ] **Step 2.1: Write failing test for `normalizeAccountNumber`**

Create `convex/vendors/__tests__/helpers.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  normalizeAccountNumber,
  validateAccountNumber,
  validatePaymentRequestSnapshot,
  type PaymentSnapshotFields,
} from "../helpers";

describe("normalizeAccountNumber", () => {
  it("strips spaces", () => {
    expect(normalizeAccountNumber("123 456 7890")).toBe("1234567890");
  });
  it("strips dashes", () => {
    expect(normalizeAccountNumber("1234-5678-90")).toBe("1234567890");
  });
  it("strips periods", () => {
    expect(normalizeAccountNumber("1234.5678.90")).toBe("1234567890");
  });
  it("strips mixed separators", () => {
    expect(normalizeAccountNumber(" 1234-5678.90 ")).toBe("1234567890");
  });
  it("leaves pure digits untouched", () => {
    expect(normalizeAccountNumber("1234567890")).toBe("1234567890");
  });
});

describe("validateAccountNumber", () => {
  it("accepts 6-20 digit strings", () => {
    expect(() => validateAccountNumber("123456")).not.toThrow();
    expect(() => validateAccountNumber("12345678901234567890")).not.toThrow();
  });
  it("rejects <6 chars", () => {
    expect(() => validateAccountNumber("12345")).toThrow(/at least 6/);
  });
  it("rejects >20 chars", () => {
    expect(() => validateAccountNumber("123456789012345678901")).toThrow(/at most 20/);
  });
  it("rejects non-digits", () => {
    expect(() => validateAccountNumber("12345abc")).toThrow(/digits only/);
  });
});

describe("validatePaymentRequestSnapshot", () => {
  const full: PaymentSnapshotFields = {
    vendorBankName: "BCA",
    vendorAccountNumber: "1234567890",
    vendorAccountHolderName: "Budi Santoso",
  };

  it("accepts all three fields for payment_request", () => {
    expect(() => validatePaymentRequestSnapshot("payment_request", full)).not.toThrow();
  });

  it("rejects missing bankName for payment_request", () => {
    expect(() =>
      validatePaymentRequestSnapshot("payment_request", { ...full, vendorBankName: undefined }),
    ).toThrow(/Vendor bank details required/);
  });

  it("rejects missing accountNumber for payment_request", () => {
    expect(() =>
      validatePaymentRequestSnapshot("payment_request", { ...full, vendorAccountNumber: undefined }),
    ).toThrow(/Vendor bank details required/);
  });

  it("rejects missing accountHolderName for payment_request", () => {
    expect(() =>
      validatePaymentRequestSnapshot("payment_request", {
        ...full,
        vendorAccountHolderName: undefined,
      }),
    ).toThrow(/Vendor bank details required/);
  });

  it("accepts absent snapshot for employee_paid", () => {
    expect(() =>
      validatePaymentRequestSnapshot("employee_paid", {
        vendorBankName: undefined,
        vendorAccountNumber: undefined,
        vendorAccountHolderName: undefined,
      }),
    ).not.toThrow();
  });

  it("rejects snapshot fields present on employee_paid", () => {
    expect(() => validatePaymentRequestSnapshot("employee_paid", full)).toThrow(
      /only allowed on payment_request/,
    );
  });

  it("rejects snapshot fields present on company_paid", () => {
    expect(() => validatePaymentRequestSnapshot("company_paid", full)).toThrow(
      /only allowed on payment_request/,
    );
  });
});
```

- [ ] **Step 2.2: Run tests to verify they fail**

Run: `npm run test -- convex/vendors/__tests__/helpers.test.ts`

Expected: All tests FAIL with "Cannot find module '../helpers'".

- [ ] **Step 2.3: Implement helpers**

Create `convex/vendors/helpers.ts`:

```ts
/**
 * Pure helpers for vendor directory.
 * No ctx dependency — safe to import in both mutations and queries.
 */

export type PaymentMethod = "employee_paid" | "company_paid" | "payment_request";

export interface PaymentSnapshotFields {
  vendorBankName: string | undefined;
  vendorAccountNumber: string | undefined;
  vendorAccountHolderName: string | undefined;
}

/**
 * Strip whitespace, dashes, periods. Returns digits-only string.
 * Use before validateAccountNumber.
 */
export function normalizeAccountNumber(raw: string): string {
  return raw.replace(/[\s\-.]/g, "");
}

/**
 * Throws with a clear message if the (already-normalized) account number
 * is not 6-20 digits.
 */
export function validateAccountNumber(normalized: string): void {
  if (!/^\d+$/.test(normalized)) {
    throw new Error("Account number must contain digits only (spaces, dashes, and periods are stripped automatically)");
  }
  if (normalized.length < 6) {
    throw new Error("Account number must be at least 6 digits");
  }
  if (normalized.length > 20) {
    throw new Error("Account number must be at most 20 digits");
  }
}

/**
 * Enforce both-or-neither rule for the four snapshot fields.
 * payment_request MUST have all three bank fields.
 * Other payment methods MUST have none.
 */
export function validatePaymentRequestSnapshot(
  paymentMethod: PaymentMethod,
  fields: PaymentSnapshotFields,
): void {
  const present = [
    fields.vendorBankName,
    fields.vendorAccountNumber,
    fields.vendorAccountHolderName,
  ].filter((v) => v !== undefined && v !== "");

  if (paymentMethod === "payment_request") {
    if (present.length !== 3) {
      throw new Error(
        "Vendor bank details required for payment requests (bank name, account number, and account holder name all required)",
      );
    }
  } else {
    if (present.length > 0) {
      throw new Error(
        "Vendor bank details are only allowed on payment_request expenses",
      );
    }
  }
}
```

- [ ] **Step 2.4: Run tests to verify they pass**

Run: `npm run test -- convex/vendors/__tests__/helpers.test.ts`

Expected: All 13 tests PASS.

- [ ] **Step 2.5: Commit**

```bash
git add convex/vendors/helpers.ts convex/vendors/__tests__/helpers.test.ts
git commit -m "feat(vendors): add normalize/validate helpers with tests"
```

---

## Task 3: Extend expense validation for snapshot rules (TDD)

**Files:**
- Modify: `convex/expenses/helpers.ts`
- Modify: `convex/expenses/__tests__/helpers.test.ts`

- [ ] **Step 3.1: Read existing helpers.ts to find insertion point**

Run: Read `convex/expenses/helpers.ts` start-to-end. Note the exports and the section where validation helpers live (e.g., near `validateExpenseAmount` or similar).

- [ ] **Step 3.2: Append new test block**

At the end of `convex/expenses/__tests__/helpers.test.ts`, before the final closing (or inside a new `describe` block at file level), add:

```ts
import { validatePaymentRequestSnapshot } from "../../vendors/helpers";

describe("expense + vendor snapshot integration", () => {
  it("payment_request with all three fields validates", () => {
    expect(() =>
      validatePaymentRequestSnapshot("payment_request", {
        vendorBankName: "BCA",
        vendorAccountNumber: "1234567890",
        vendorAccountHolderName: "Budi Santoso",
      }),
    ).not.toThrow();
  });

  it("payment_request with missing bank name throws", () => {
    expect(() =>
      validatePaymentRequestSnapshot("payment_request", {
        vendorBankName: undefined,
        vendorAccountNumber: "1234567890",
        vendorAccountHolderName: "Budi Santoso",
      }),
    ).toThrow();
  });

  it("employee_paid with bank details throws", () => {
    expect(() =>
      validatePaymentRequestSnapshot("employee_paid", {
        vendorBankName: "BCA",
        vendorAccountNumber: "1234567890",
        vendorAccountHolderName: "Budi Santoso",
      }),
    ).toThrow(/only allowed on payment_request/);
  });
});
```

- [ ] **Step 3.3: Run tests**

Run: `npm run test -- convex/expenses/__tests__/helpers.test.ts`

Expected: New tests PASS (they simply re-verify the helpers imported from `vendors/helpers.ts`). No changes needed in `convex/expenses/helpers.ts` yet — the enforcement will happen in the mutation layer (Task 6).

- [ ] **Step 3.4: Commit**

```bash
git add convex/expenses/__tests__/helpers.test.ts
git commit -m "test(expenses): verify snapshot validation integration"
```

---

## Task 4: Vendor mutations (TDD)

**Files:**
- Create: `convex/vendors/mutations.ts`
- Create: `convex/vendors/__tests__/mutations.test.ts`

- [ ] **Step 4.1: Review existing mutation pattern**

Read `convex/bankAccounts/mutations.ts` (or any small CRUD file like `convex/tags/mutations.ts`) to match the existing pattern for:
- `protectedMutation` wrapper usage
- Role gates
- Error messages
- `createdBy`, `createdAt`, `updatedAt` fields

- [ ] **Step 4.2: Write failing tests for `createVendor`**

Create `convex/vendors/__tests__/mutations.test.ts`:

```ts
import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "../../schema";
import { api } from "../../_generated/api";

async function setupUser(
  t: ReturnType<typeof convexTest>,
  role: "kitchen" | "order_staff" | "manager" | "admin" = "admin",
) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      pin: "1234",
      name: "Test User",
      role,
      isActive: true,
      createdAt: Date.now(),
    });
    await ctx.db.insert("sessions", {
      userId,
      token: `test-token-${role}`,
      expiresAt: Date.now() + 1_000_000,
      createdAt: Date.now(),
    });
    return { userId, token: `test-token-${role}` };
  });
}

// NOTE: the `users` and `sessions` insert field shapes above are a best-guess
// template. Before running tests, read `convex/staffAttendance/__tests__/helpers.ts`
// (or any sibling `__tests__/helpers.ts`) and mirror the real `seedUser` signature
// — some projects require additional fields (e.g., pinHash, lastActiveAt).

describe("vendors.createVendor", () => {
  it("creates a vendor with normalized account number", async () => {
    const t = convexTest(schema);
    const { token } = await setupUser(t, "admin");

    const vendorId = await t.mutation(api.vendors.mutations.createVendor, {
      token,
      name: "PT Kemasan Jaya",
      bankName: "BCA",
      accountNumber: "1234-5678-90",
      accountHolderName: "Budi Santoso",
    });

    const vendor = await t.run((ctx) => ctx.db.get(vendorId));
    expect(vendor?.accountNumber).toBe("1234567890");
    expect(vendor?.isActive).toBe(true);
    expect(vendor?.name).toBe("PT Kemasan Jaya");
  });

  it("allows kitchen user to create (inline submission)", async () => {
    const t = convexTest(schema);
    const { token } = await setupUser(t, "kitchen");
    await expect(
      t.mutation(api.vendors.mutations.createVendor, {
        token,
        name: "Ad-hoc Vendor",
        bankName: "BCA",
        accountNumber: "1234567890",
        accountHolderName: "Someone",
      }),
    ).resolves.toBeDefined();
  });

  it("rejects account number shorter than 6 digits", async () => {
    const t = convexTest(schema);
    const { token } = await setupUser(t, "admin");
    await expect(
      t.mutation(api.vendors.mutations.createVendor, {
        token,
        name: "Short",
        bankName: "BCA",
        accountNumber: "12345",
        accountHolderName: "Someone",
      }),
    ).rejects.toThrow(/at least 6/);
  });

  it("returns existing vendor on exact case-insensitive name match with same bank details", async () => {
    const t = convexTest(schema);
    const { token } = await setupUser(t, "admin");
    const firstId = await t.mutation(api.vendors.mutations.createVendor, {
      token,
      name: "PT Kemasan Jaya",
      bankName: "BCA",
      accountNumber: "1234567890",
      accountHolderName: "Budi Santoso",
    });
    const secondId = await t.mutation(api.vendors.mutations.createVendor, {
      token,
      name: "pt kemasan jaya", // different case
      bankName: "BCA",
      accountNumber: "1234567890",
      accountHolderName: "Budi Santoso",
    });
    expect(secondId).toBe(firstId);
  });

  it("throws on name match with different bank details", async () => {
    const t = convexTest(schema);
    const { token } = await setupUser(t, "admin");
    await t.mutation(api.vendors.mutations.createVendor, {
      token,
      name: "PT Kemasan Jaya",
      bankName: "BCA",
      accountNumber: "1234567890",
      accountHolderName: "Budi Santoso",
    });
    await expect(
      t.mutation(api.vendors.mutations.createVendor, {
        token,
        name: "PT Kemasan Jaya",
        bankName: "Mandiri", // different bank
        accountNumber: "9999999999",
        accountHolderName: "Budi Santoso",
      }),
    ).rejects.toThrow(/already exists/);
  });
});

describe("vendors.updateVendor", () => {
  it("allows manager to update", async () => {
    const t = convexTest(schema);
    const { token } = await setupUser(t, "manager");
    const vendorId = await t.mutation(api.vendors.mutations.createVendor, {
      token,
      name: "Original",
      bankName: "BCA",
      accountNumber: "1234567890",
      accountHolderName: "Person",
    });
    await t.mutation(api.vendors.mutations.updateVendor, {
      token,
      vendorId,
      name: "Updated",
      notes: "Now pays monthly",
    });
    const vendor = await t.run((ctx) => ctx.db.get(vendorId));
    expect(vendor?.name).toBe("Updated");
    expect(vendor?.notes).toBe("Now pays monthly");
  });

  it("forbids kitchen user from updating", async () => {
    const t = convexTest(schema);
    const { token: adminToken } = await setupUser(t, "admin");
    const vendorId = await t.mutation(api.vendors.mutations.createVendor, {
      token: adminToken,
      name: "X",
      bankName: "BCA",
      accountNumber: "1234567890",
      accountHolderName: "Y",
    });
    const { token: kitchenToken } = await setupUser(t, "kitchen");
    await expect(
      t.mutation(api.vendors.mutations.updateVendor, {
        token: kitchenToken,
        vendorId,
        name: "hacked",
      }),
    ).rejects.toThrow();
  });
});

describe("vendors.deactivateVendor", () => {
  it("sets isActive=false (soft-delete)", async () => {
    const t = convexTest(schema);
    const { token } = await setupUser(t, "admin");
    const vendorId = await t.mutation(api.vendors.mutations.createVendor, {
      token,
      name: "Disappearing",
      bankName: "BCA",
      accountNumber: "1234567890",
      accountHolderName: "X",
    });
    await t.mutation(api.vendors.mutations.deactivateVendor, { token, vendorId });
    const vendor = await t.run((ctx) => ctx.db.get(vendorId));
    expect(vendor?.isActive).toBe(false);
  });

  it("can be reactivated", async () => {
    const t = convexTest(schema);
    const { token } = await setupUser(t, "admin");
    const vendorId = await t.mutation(api.vendors.mutations.createVendor, {
      token,
      name: "Toggle",
      bankName: "BCA",
      accountNumber: "1234567890",
      accountHolderName: "X",
    });
    await t.mutation(api.vendors.mutations.deactivateVendor, { token, vendorId });
    await t.mutation(api.vendors.mutations.reactivateVendor, { token, vendorId });
    const vendor = await t.run((ctx) => ctx.db.get(vendorId));
    expect(vendor?.isActive).toBe(true);
  });
});
```

- [ ] **Step 4.3: Run tests to verify they fail**

Run: `npm run test -- convex/vendors/__tests__/mutations.test.ts`

Expected: All tests FAIL with module-not-found errors.

- [ ] **Step 4.4: Implement mutations**

Create `convex/vendors/mutations.ts`:

```ts
import { v } from "convex/values";
import { protectedMutation } from "../lib/auth";
import {
  normalizeAccountNumber,
  validateAccountNumber,
} from "./helpers";

const MANAGE_ROLES = ["manager", "admin"] as const;
const CREATE_ROLES = ["kitchen", "order_staff", "manager", "admin"] as const;

/**
 * Create a vendor. Any authenticated role may create (inline flow during
 * expense submission). Case-insensitive name match with identical bank
 * details returns existing vendor (idempotent). Name match with different
 * bank details throws — submitter must pick existing or update it first.
 */
export const createVendor = protectedMutation({
  roles: [...CREATE_ROLES],
  args: {
    name: v.string(),
    bankName: v.string(),
    accountNumber: v.string(),
    accountHolderName: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const name = args.name.trim();
    const bankName = args.bankName.trim();
    const accountHolderName = args.accountHolderName.trim();
    const normalizedAccount = normalizeAccountNumber(args.accountNumber);

    if (!name) throw new Error("Vendor name is required");
    if (!bankName) throw new Error("Bank name is required");
    if (!accountHolderName) throw new Error("Account holder name is required");
    validateAccountNumber(normalizedAccount);

    // Case-insensitive duplicate check
    const existing = await ctx.db
      .query("vendors")
      .withIndex("by_active_name", (q) => q.eq("isActive", true))
      .collect();

    const match = existing.find(
      (v) => v.name.toLowerCase() === name.toLowerCase(),
    );

    if (match) {
      const sameBank =
        match.bankName === bankName &&
        match.accountNumber === normalizedAccount &&
        match.accountHolderName === accountHolderName;
      if (sameBank) {
        return match._id;
      }
      throw new Error(
        `Vendor "${match.name}" already exists with different bank details. Pick the existing vendor or update it via the Vendors page.`,
      );
    }

    const now = Date.now();
    return await ctx.db.insert("vendors", {
      name,
      bankName,
      accountNumber: normalizedAccount,
      accountHolderName,
      notes: args.notes?.trim() || undefined,
      isActive: true,
      createdBy: ctx.user._id,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateVendor = protectedMutation({
  roles: [...MANAGE_ROLES],
  args: {
    vendorId: v.id("vendors"),
    name: v.optional(v.string()),
    bankName: v.optional(v.string()),
    accountNumber: v.optional(v.string()),
    accountHolderName: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const vendor = await ctx.db.get(args.vendorId);
    if (!vendor) throw new Error("Vendor not found");

    const patch: Record<string, unknown> = { updatedAt: Date.now() };

    if (args.name !== undefined) {
      const trimmed = args.name.trim();
      if (!trimmed) throw new Error("Vendor name cannot be empty");
      patch.name = trimmed;
    }
    if (args.bankName !== undefined) {
      const trimmed = args.bankName.trim();
      if (!trimmed) throw new Error("Bank name cannot be empty");
      patch.bankName = trimmed;
    }
    if (args.accountNumber !== undefined) {
      const normalized = normalizeAccountNumber(args.accountNumber);
      validateAccountNumber(normalized);
      patch.accountNumber = normalized;
    }
    if (args.accountHolderName !== undefined) {
      const trimmed = args.accountHolderName.trim();
      if (!trimmed) throw new Error("Account holder name cannot be empty");
      patch.accountHolderName = trimmed;
    }
    if (args.notes !== undefined) {
      patch.notes = args.notes.trim() || undefined;
    }

    await ctx.db.patch(args.vendorId, patch);
    return args.vendorId;
  },
});

export const deactivateVendor = protectedMutation({
  roles: [...MANAGE_ROLES],
  args: { vendorId: v.id("vendors") },
  handler: async (ctx, args) => {
    const vendor = await ctx.db.get(args.vendorId);
    if (!vendor) throw new Error("Vendor not found");
    await ctx.db.patch(args.vendorId, {
      isActive: false,
      updatedAt: Date.now(),
    });
    return args.vendorId;
  },
});

export const reactivateVendor = protectedMutation({
  roles: [...MANAGE_ROLES],
  args: { vendorId: v.id("vendors") },
  handler: async (ctx, args) => {
    const vendor = await ctx.db.get(args.vendorId);
    if (!vendor) throw new Error("Vendor not found");
    await ctx.db.patch(args.vendorId, {
      isActive: true,
      updatedAt: Date.now(),
    });
    return args.vendorId;
  },
});
```

- [ ] **Step 4.5: Run tests to verify they pass**

Run: `npm run test -- convex/vendors/__tests__/mutations.test.ts`

Expected: All tests PASS.

- [ ] **Step 4.6: Commit**

```bash
git add convex/vendors/mutations.ts convex/vendors/__tests__/mutations.test.ts
git commit -m "feat(vendors): CRUD mutations with role gates and dedup"
```

---

## Task 5: Vendor queries

**Files:**
- Create: `convex/vendors/queries.ts`

- [ ] **Step 5.1: Implement queries**

Create `convex/vendors/queries.ts`:

```ts
import { v } from "convex/values";
import { query } from "../_generated/server";

/**
 * List vendors. Default returns active only. Pass includeInactive=true
 * to return both (used by VendorsManager inactive tab).
 */
export const list = query({
  args: { includeInactive: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    if (args.includeInactive) {
      const all = await ctx.db.query("vendors").collect();
      return all.sort((a, b) => a.name.localeCompare(b.name));
    }
    const active = await ctx.db
      .query("vendors")
      .withIndex("by_active_name", (q) => q.eq("isActive", true))
      .collect();
    return active.sort((a, b) => a.name.localeCompare(b.name));
  },
});

/**
 * Search active vendors by name. Used by VendorPicker combobox typeahead.
 * Empty queryString returns first 20 active vendors alphabetically.
 */
export const search = query({
  args: {
    queryString: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;
    const trimmed = args.queryString.trim();

    if (!trimmed) {
      const active = await ctx.db
        .query("vendors")
        .withIndex("by_active_name", (q) => q.eq("isActive", true))
        .take(limit);
      return active.sort((a, b) => a.name.localeCompare(b.name));
    }

    const results = await ctx.db
      .query("vendors")
      .withSearchIndex("search_name", (q) =>
        q.search("name", trimmed).eq("isActive", true),
      )
      .take(limit);
    return results;
  },
});

export const getById = query({
  args: { vendorId: v.id("vendors") },
  handler: async (ctx, args) => ctx.db.get(args.vendorId),
});

/**
 * Count how many expenses reference this vendor.
 * Used on VendorsManager page to show usage and guard hard-delete.
 */
export const getUsageCount = query({
  args: { vendorId: v.id("vendors") },
  handler: async (ctx, args) => {
    const refs = await ctx.db
      .query("expenses")
      .withIndex("by_vendor", (q) => q.eq("vendorId", args.vendorId))
      .collect();
    return refs.length;
  },
});
```

- [ ] **Step 5.2: Type-check**

Run: `npx tsc --noEmit -p convex/tsconfig.json`

Expected: exits 0.

- [ ] **Step 5.3: Commit**

```bash
git add convex/vendors/queries.ts
git commit -m "feat(vendors): list/search/getById/getUsageCount queries"
```

---

## Task 6: Extend expense mutations to accept + snapshot vendor args

**Files:**
- Modify: `convex/expenses/mutations.ts`

- [ ] **Step 6.1: Read the existing submit flow**

Read `convex/expenses/mutations.ts` paying attention to:
- `createDraft`, `updateDraft`, `submitExpense` (or equivalent) mutation signatures
- Where the expense record is inserted/patched
- How `paymentMethod` flows through

Note the exact function names and signatures.

- [ ] **Step 6.2: Add vendor args to `createDraft`**

In the `createDraft` mutation args object, add:

```ts
    // Vendor bank snapshot — required when paymentMethod === "payment_request".
    // Either: (a) select existing vendor via vendorId + snapshot fields, or
    //         (b) inline-create a new vendor by passing createVendor sub-object + snapshot fields.
    vendorId: v.optional(v.id("vendors")),
    vendorBankName: v.optional(v.string()),
    vendorAccountNumber: v.optional(v.string()),
    vendorAccountHolderName: v.optional(v.string()),
    createVendorFromSnapshot: v.optional(v.object({
      name: v.string(),
      notes: v.optional(v.string()),
    })),
```

In the handler body, BEFORE the `ctx.db.insert("expenses", ...)` call, add:

```ts
    // --- Vendor snapshot handling ----------------------------------------
    const { validatePaymentRequestSnapshot } = await import("../vendors/helpers");
    let resolvedVendorId: typeof args.vendorId = args.vendorId;

    // If caller asked to create a new vendor inline, do it first so we have an ID
    if (args.createVendorFromSnapshot && args.paymentMethod === "payment_request") {
      if (
        !args.vendorBankName ||
        !args.vendorAccountNumber ||
        !args.vendorAccountHolderName
      ) {
        throw new Error("Bank details required when creating vendor inline");
      }
      // Reuse createVendor mutation logic — but we are in a mutation context already.
      // Import the helpers and inline the insert (createVendor is a separate mutation
      // entrypoint; inside a mutation handler we go direct to ctx.db).
      const { normalizeAccountNumber, validateAccountNumber } = await import("../vendors/helpers");
      const normalized = normalizeAccountNumber(args.vendorAccountNumber);
      validateAccountNumber(normalized);

      // Case-insensitive duplicate check
      const actives = await ctx.db
        .query("vendors")
        .withIndex("by_active_name", (q) => q.eq("isActive", true))
        .collect();
      const match = actives.find(
        (v) => v.name.toLowerCase() === args.createVendorFromSnapshot!.name.trim().toLowerCase(),
      );
      if (match) {
        resolvedVendorId = match._id;
      } else {
        const now = Date.now();
        resolvedVendorId = await ctx.db.insert("vendors", {
          name: args.createVendorFromSnapshot.name.trim(),
          bankName: args.vendorBankName.trim(),
          accountNumber: normalized,
          accountHolderName: args.vendorAccountHolderName.trim(),
          notes: args.createVendorFromSnapshot.notes?.trim() || undefined,
          isActive: true,
          createdBy: ctx.user._id,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    // Validate the snapshot both-or-neither rule
    validatePaymentRequestSnapshot(args.paymentMethod, {
      vendorBankName: args.vendorBankName,
      vendorAccountNumber: args.vendorAccountNumber
        ? (await import("../vendors/helpers")).normalizeAccountNumber(args.vendorAccountNumber)
        : undefined,
      vendorAccountHolderName: args.vendorAccountHolderName,
    });
```

Then in the `ctx.db.insert("expenses", {...})` object literal, spread the vendor fields. Add these properties:

```ts
      ...(resolvedVendorId && { vendorId: resolvedVendorId }),
      ...(args.vendorBankName && { vendorBankName: args.vendorBankName.trim() }),
      ...(args.vendorAccountNumber && {
        vendorAccountNumber: (await import("../vendors/helpers")).normalizeAccountNumber(
          args.vendorAccountNumber,
        ),
      }),
      ...(args.vendorAccountHolderName && {
        vendorAccountHolderName: args.vendorAccountHolderName.trim(),
      }),
```

> **Note to implementer:** `await import(...)` inside a conditional is awkward. Pull the dynamic imports up to top-of-handler so they run once. In the final implementation, replace all `await import("../vendors/helpers")` occurrences with a single static import at the top of the file:
> ```ts
> import {
>   normalizeAccountNumber,
>   validateAccountNumber,
>   validatePaymentRequestSnapshot,
> } from "../vendors/helpers";
> ```
> Convex forbids **dynamic** `import()` (Pitfall #8 in CLAUDE.md), so this MUST be a static import. The `await import()` usage in this task description is illustrative only.

- [ ] **Step 6.3: Add same logic to `updateDraft`**

In the `updateDraft` mutation, add the same four vendor args (all optional). In the handler:
1. Fetch the existing expense.
2. If status is not "draft", throw if any vendor field is being changed: `if (existing.status !== "draft" && (args.vendorId !== undefined || args.vendorBankName !== undefined || args.vendorAccountNumber !== undefined || args.vendorAccountHolderName !== undefined)) throw new Error("Vendor details are immutable after draft");`
3. Compute the effective paymentMethod (args.paymentMethod ?? existing.paymentMethod).
4. Run the same snapshot validation and vendor resolution as in createDraft.
5. Patch the expense with the resolved vendor fields.

- [ ] **Step 6.4: Add same logic to `submitExpense`**

If `submitExpense` is a distinct mutation that accepts snapshot fields directly (rather than reading them from a draft row), apply the same pattern. If it only flips status from "draft" to "submitted" based on the draft row, no changes needed — the snapshot is already on the row.

- [ ] **Step 6.5: Add snapshot guard to any other mutations that patch expenses**

Grep for other mutations that patch `expenses` rows (e.g., `convex/expenses/mutations.ts` and `convex/expenses/bulkMutations.ts`):

Run: `grep -n "ctx.db.patch(" convex/expenses/mutations.ts convex/expenses/bulkMutations.ts`

For any mutation that patches an expense row AFTER it's left draft status, ensure the patch object does NOT include any of the four snapshot fields. Add a TypeScript comment: `// snapshot fields immutable after draft — not included in patch`.

- [ ] **Step 6.6: Type-check**

Run: `npx tsc --noEmit -p convex/tsconfig.json`

Expected: exits 0.

- [ ] **Step 6.7: Add an integration test**

In `convex/expenses/__tests__/` find the existing mutation test file (or create `convex/expenses/__tests__/mutations.vendor.test.ts`). Add:

```ts
import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "../../schema";
import { api } from "../../_generated/api";

async function setupAdmin(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      pin: "1234",
      name: "Admin",
      role: "admin",
      isActive: true,
      createdAt: Date.now(),
    });
    await ctx.db.insert("sessions", {
      userId,
      token: "admin-token",
      expiresAt: Date.now() + 1_000_000,
      createdAt: Date.now(),
    });
    return { userId, token: "admin-token" };
  });
}

describe("expense + vendor snapshot", () => {
  it("payment_request with all snapshot fields + inline vendor create", async () => {
    const t = convexTest(schema);
    const { token } = await setupAdmin(t);
    // Seed an OpEx account
    const accountId = await t.run((ctx) =>
      ctx.db.insert("accounts", {
        code: "5000",
        name: "Office Supplies",
        type: "opex",
        isActive: true,
        createdAt: Date.now(),
      } as any),
    );
    const draftId = await t.mutation(api.expenses.mutations.createDraft, {
      token,
      description: "Office chair",
      amount: 500000,
      accountId,
      expenseDate: Date.now(),
      vendorName: "PT Kemasan",
      paymentMethod: "payment_request",
      vendorBankName: "BCA",
      vendorAccountNumber: "1234-5678-90",
      vendorAccountHolderName: "Budi Santoso",
      createVendorFromSnapshot: { name: "PT Kemasan" },
    });
    const expense = await t.run((ctx) => ctx.db.get(draftId));
    expect(expense?.vendorBankName).toBe("BCA");
    expect(expense?.vendorAccountNumber).toBe("1234567890"); // normalized
    expect(expense?.vendorAccountHolderName).toBe("Budi Santoso");
    expect(expense?.vendorId).toBeDefined();
  });

  it("payment_request without bank details throws", async () => {
    const t = convexTest(schema);
    const { token } = await setupAdmin(t);
    const accountId = await t.run((ctx) =>
      ctx.db.insert("accounts", {
        code: "5000",
        name: "Office Supplies",
        type: "opex",
        isActive: true,
        createdAt: Date.now(),
      } as any),
    );
    await expect(
      t.mutation(api.expenses.mutations.createDraft, {
        token,
        description: "Missing details",
        amount: 100000,
        accountId,
        expenseDate: Date.now(),
        vendorName: "X",
        paymentMethod: "payment_request",
      }),
    ).rejects.toThrow(/Vendor bank details required/);
  });

  it("employee_paid with bank details throws", async () => {
    const t = convexTest(schema);
    const { token } = await setupAdmin(t);
    const accountId = await t.run((ctx) =>
      ctx.db.insert("accounts", {
        code: "5000",
        name: "Office Supplies",
        type: "opex",
        isActive: true,
        createdAt: Date.now(),
      } as any),
    );
    await expect(
      t.mutation(api.expenses.mutations.createDraft, {
        token,
        description: "Shouldn't work",
        amount: 100000,
        accountId,
        expenseDate: Date.now(),
        vendorName: "X",
        paymentMethod: "employee_paid",
        vendorBankName: "BCA",
        vendorAccountNumber: "1234567890",
        vendorAccountHolderName: "Y",
      }),
    ).rejects.toThrow(/only allowed on payment_request/);
  });
});
```

- [ ] **Step 6.8: Run full expense test suite**

Run: `npm run test -- convex/expenses`

Expected: All pass, including new vendor integration tests.

> **Adapt to reality:** field names in the `accounts` seed and `createDraft` args above are inferred from spec and existing hooks index. If the real `createDraft` uses different arg names (e.g., `expenseType` required), adjust the test. Read `convex/expenses/mutations.ts` first and mirror the existing signature.

- [ ] **Step 6.9: Commit**

```bash
git add convex/expenses/mutations.ts convex/expenses/__tests__/
git commit -m "feat(expenses): accept + snapshot vendor bank details for payment_request"
```

---

## Task 7: Add `canAccessVendors` permission

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 7.1: Add permission field to `PermissionMatrix` interface**

In `src/lib/types.ts`, find the interface around line 720–731 (the one with `canSubmitExpenses`, `canApproveExpenses`, etc.). Add:

```ts
  canAccessVendors: boolean;  // Vendor directory management (manager + admin)
```

Place it after `canAccessAssets`.

- [ ] **Step 7.2: Set per-role values**

In the same file, for each role object in the `PERMISSIONS` map:
- `kitchen`: `canAccessVendors: false,`
- `order_staff`: `canAccessVendors: false,`
- `manager`: `canAccessVendors: true,`
- `admin`: `canAccessVendors: true,`

Place the line after `canAccessAssets` in each role block.

- [ ] **Step 7.3: Type-check**

Run: `npm run type-check`

Expected: exits 0.

- [ ] **Step 7.4: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat(auth): add canAccessVendors permission for manager+admin"
```

---

## Task 8: `useVendors` hook + barrel export

**Files:**
- Create: `src/hooks/convex/useVendors.ts`
- Modify: `src/hooks/convex/index.ts`

- [ ] **Step 8.1: Create hook file**

Create `src/hooks/convex/useVendors.ts`:

```ts
/**
 * Convex hooks for vendors directory.
 * Usage: import from `@/hooks/convex` (barrel) rather than this file directly.
 */
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { useProtectedMutation } from "./useProtectedMutation";

export type Vendor = Doc<"vendors">;

/** List vendors. Default: active only. */
export function useVendors(includeInactive = false) {
  return useQuery(api.vendors.queries.list, { includeInactive });
}

/** Search vendors by name (for combobox typeahead). */
export function useVendorSearch(queryString: string, limit = 20) {
  return useQuery(api.vendors.queries.search, { queryString, limit });
}

export function useVendor(vendorId: Id<"vendors"> | undefined) {
  return useQuery(api.vendors.queries.getById, vendorId ? { vendorId } : "skip");
}

export function useVendorUsageCount(vendorId: Id<"vendors"> | undefined) {
  return useQuery(
    api.vendors.queries.getUsageCount,
    vendorId ? { vendorId } : "skip",
  );
}

export const useCreateVendor = () =>
  useProtectedMutation(api.vendors.mutations.createVendor);

export const useUpdateVendor = () =>
  useProtectedMutation(api.vendors.mutations.updateVendor);

export const useDeactivateVendor = () =>
  useProtectedMutation(api.vendors.mutations.deactivateVendor);

export const useReactivateVendor = () =>
  useProtectedMutation(api.vendors.mutations.reactivateVendor);
```

- [ ] **Step 8.2: Add barrel export**

At the end of `src/hooks/convex/index.ts`, append:

```ts
// Vendors (Payment Request Vendor Directory)
export {
  useVendors,
  useVendorSearch,
  useVendor,
  useVendorUsageCount,
  useCreateVendor,
  useUpdateVendor,
  useDeactivateVendor,
  useReactivateVendor,
  type Vendor,
} from "./useVendors";
```

- [ ] **Step 8.3: Type-check**

Run: `npm run type-check`

Expected: exits 0.

- [ ] **Step 8.4: Commit**

```bash
git add src/hooks/convex/useVendors.ts src/hooks/convex/index.ts
git commit -m "feat(hooks): useVendors with search/CRUD hooks"
```

---

## Task 9: `VendorForm` component

**Files:**
- Create: `src/components/vendors/VendorForm.tsx`

- [ ] **Step 9.1: Implement the form**

Create `src/components/vendors/VendorForm.tsx`:

```tsx
/**
 * VendorForm — shared create/edit form for a vendor.
 * Used in:
 *   - VendorsManager page (edit mode with existing vendor)
 *   - VendorPicker inline create (create mode, no vendorId)
 *
 * Controlled component — parent owns the values state.
 */
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface VendorFormValues {
  name: string;
  bankName: string;
  accountNumber: string;
  accountHolderName: string;
  notes: string;
}

export const EMPTY_VENDOR_FORM: VendorFormValues = {
  name: "",
  bankName: "",
  accountNumber: "",
  accountHolderName: "",
  notes: "",
};

export interface VendorFormProps {
  values: VendorFormValues;
  onChange: (values: VendorFormValues) => void;
  disabled?: boolean;
  /** Hide the name field (used in VendorPicker when name comes from the combobox). */
  hideName?: boolean;
}

export function VendorForm({ values, onChange, disabled, hideName }: VendorFormProps) {
  const update = <K extends keyof VendorFormValues>(field: K, value: VendorFormValues[K]) => {
    onChange({ ...values, [field]: value });
  };

  return (
    <div className="space-y-3">
      {!hideName && (
        <div className="space-y-1.5">
          <Label htmlFor="vendor-form-name">Vendor Name *</Label>
          <Input
            id="vendor-form-name"
            placeholder="e.g. PT Kemasan Jaya"
            value={values.name}
            onChange={(e) => update("name", e.target.value)}
            disabled={disabled}
          />
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="vendor-form-bank">Bank Name *</Label>
          <Input
            id="vendor-form-bank"
            placeholder="BCA, Mandiri, BRI..."
            value={values.bankName}
            onChange={(e) => update("bankName", e.target.value)}
            disabled={disabled}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="vendor-form-acct">Account Number *</Label>
          <Input
            id="vendor-form-acct"
            placeholder="1234567890"
            inputMode="numeric"
            value={values.accountNumber}
            onChange={(e) => update("accountNumber", e.target.value)}
            disabled={disabled}
          />
          <p className="text-xs text-muted-foreground">
            Spaces and dashes will be stripped automatically.
          </p>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="vendor-form-holder">Account Holder Name *</Label>
        <Input
          id="vendor-form-holder"
          placeholder="Exact name on the bank account"
          value={values.accountHolderName}
          onChange={(e) => update("accountHolderName", e.target.value)}
          disabled={disabled}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="vendor-form-notes">Notes (optional)</Label>
        <Input
          id="vendor-form-notes"
          placeholder="e.g. pays weekly on Fridays"
          value={values.notes}
          onChange={(e) => update("notes", e.target.value)}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 9.2: Commit**

```bash
git add src/components/vendors/VendorForm.tsx
git commit -m "feat(vendors): VendorForm controlled component"
```

---

## Task 10: `VendorPicker` component

**Files:**
- Create: `src/components/vendors/VendorPicker.tsx`

- [ ] **Step 10.1: Check shadcn Combobox availability**

Run: `ls src/components/ui/command.tsx src/components/ui/popover.tsx`

Expected: both files exist. If NOT, install shadcn combobox primitives first: `npx shadcn@latest add command popover`.

- [ ] **Step 10.2: Implement VendorPicker**

Create `src/components/vendors/VendorPicker.tsx`:

```tsx
/**
 * VendorPicker — combobox for selecting a vendor from the directory OR
 * creating a new one inline. Used in ExpenseSubmitForm when the expense's
 * paymentMethod is "payment_request".
 *
 * Selecting an existing vendor auto-fills bank details (read-only with an
 * "Edit details" toggle). Selecting "+ Add new vendor" clears the combobox
 * and shows empty editable fields with a "Save to vendor directory" checkbox.
 */
import { useState, useMemo } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useVendorSearch, type Vendor } from "@/hooks/convex";
import type { Id } from "../../../convex/_generated/dataModel";
import { VendorForm, type VendorFormValues, EMPTY_VENDOR_FORM } from "./VendorForm";

export interface VendorPickerValue {
  /** If set, submitter picked an existing vendor. Snapshot fields come from vendor record. */
  vendorId?: Id<"vendors">;
  /** If set, submitter is creating a new vendor inline. saveToDirectory controls whether a vendors row is persisted. */
  createVendor?: { name: string; saveToDirectory: boolean };
  /** The resolved snapshot values — always present when a vendor is picked or created. */
  bankName: string;
  accountNumber: string;
  accountHolderName: string;
  notes: string;
}

export interface VendorPickerProps {
  value: VendorPickerValue | null;
  onChange: (value: VendorPickerValue | null) => void;
  disabled?: boolean;
}

export function VendorPicker({ value, onChange, disabled }: VendorPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<"picked" | "creating" | "idle">(() =>
    value?.vendorId ? "picked" : value?.createVendor ? "creating" : "idle",
  );
  const [editExisting, setEditExisting] = useState(false);

  const results = useVendorSearch(search, 20);

  const formValues: VendorFormValues = useMemo(
    () => ({
      name: value?.createVendor?.name ?? "",
      bankName: value?.bankName ?? "",
      accountNumber: value?.accountNumber ?? "",
      accountHolderName: value?.accountHolderName ?? "",
      notes: value?.notes ?? "",
    }),
    [value],
  );

  const handlePickExisting = (vendor: Vendor) => {
    setMode("picked");
    setEditExisting(false);
    setOpen(false);
    onChange({
      vendorId: vendor._id,
      bankName: vendor.bankName,
      accountNumber: vendor.accountNumber,
      accountHolderName: vendor.accountHolderName,
      notes: vendor.notes ?? "",
    });
  };

  const handleStartCreate = () => {
    setMode("creating");
    setOpen(false);
    onChange({
      createVendor: { name: search.trim(), saveToDirectory: true },
      bankName: "",
      accountNumber: "",
      accountHolderName: "",
      notes: "",
    });
  };

  const handleFormChange = (form: VendorFormValues) => {
    if (mode === "creating") {
      onChange({
        createVendor: {
          name: form.name,
          saveToDirectory: value?.createVendor?.saveToDirectory ?? true,
        },
        bankName: form.bankName,
        accountNumber: form.accountNumber,
        accountHolderName: form.accountHolderName,
        notes: form.notes,
      });
    } else if (mode === "picked" && editExisting) {
      // User is overriding a picked vendor's bank details for THIS expense only.
      // Drop vendorId so we don't imply the vendor record changed.
      onChange({
        createVendor: { name: formValues.name || "(override)", saveToDirectory: false },
        bankName: form.bankName,
        accountNumber: form.accountNumber,
        accountHolderName: form.accountHolderName,
        notes: form.notes,
      });
      setMode("creating");
    }
  };

  const handleClear = () => {
    setMode("idle");
    setEditExisting(false);
    setSearch("");
    onChange(null);
  };

  const pickedVendorName = value?.vendorId
    ? results?.find((v) => v._id === value.vendorId)?.name ?? "(selected)"
    : value?.createVendor?.name ?? "";

  return (
    <div className="space-y-3 rounded-md border bg-muted/30 p-3">
      <div className="flex items-center justify-between">
        <Label>Vendor Bank Details *</Label>
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleClear}
            disabled={disabled}
          >
            Clear
          </Button>
        )}
      </div>

      {mode === "idle" && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              role="combobox"
              className="w-full justify-between"
              disabled={disabled}
            >
              Search or add vendor...
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
            <Command shouldFilter={false}>
              <CommandInput
                placeholder="Type vendor name..."
                value={search}
                onValueChange={setSearch}
              />
              <CommandList>
                <CommandEmpty>
                  <button
                    type="button"
                    className="flex items-center gap-2 w-full px-2 py-1.5 text-sm text-left hover:bg-accent rounded-sm"
                    onClick={handleStartCreate}
                  >
                    <Plus className="h-4 w-4" />
                    Add new vendor {search.trim() && <>&quot;{search.trim()}&quot;</>}
                  </button>
                </CommandEmpty>
                <CommandGroup>
                  {(results ?? []).map((vendor) => (
                    <CommandItem
                      key={vendor._id}
                      value={vendor.name}
                      onSelect={() => handlePickExisting(vendor)}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          value?.vendorId === vendor._id ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <div className="flex flex-col">
                        <span>{vendor.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {vendor.bankName} · {vendor.accountNumber}
                        </span>
                      </div>
                    </CommandItem>
                  ))}
                  <CommandItem value="__add_new__" onSelect={handleStartCreate}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add new vendor
                    {search.trim() && <span className="ml-1">&quot;{search.trim()}&quot;</span>}
                  </CommandItem>
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )}

      {mode === "picked" && !editExisting && (
        <div className="space-y-2 text-sm">
          <div className="font-medium">{pickedVendorName}</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-muted-foreground">
            <div><span className="font-medium text-foreground">Bank:</span> {value?.bankName}</div>
            <div><span className="font-medium text-foreground">Acct #:</span> {value?.accountNumber}</div>
            <div><span className="font-medium text-foreground">Holder:</span> {value?.accountHolderName}</div>
          </div>
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto p-0"
            onClick={() => setEditExisting(true)}
            disabled={disabled}
          >
            Edit details for this expense only
          </Button>
        </div>
      )}

      {(mode === "creating" || (mode === "picked" && editExisting)) && (
        <>
          <VendorForm
            values={formValues}
            onChange={handleFormChange}
            disabled={disabled}
            hideName={mode === "picked" && editExisting}
          />
          {mode === "creating" && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="vendor-save-to-directory"
                checked={value?.createVendor?.saveToDirectory ?? true}
                onCheckedChange={(checked) => {
                  if (!value?.createVendor) return;
                  onChange({
                    ...value,
                    createVendor: {
                      ...value.createVendor,
                      saveToDirectory: checked === true,
                    },
                  });
                }}
                disabled={disabled}
              />
              <Label htmlFor="vendor-save-to-directory" className="text-sm font-normal cursor-pointer">
                Save to vendor directory for next time
              </Label>
            </div>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 10.3: Type-check**

Run: `npm run type-check`

Expected: exits 0.

- [ ] **Step 10.4: Commit**

```bash
git add src/components/vendors/VendorPicker.tsx
git commit -m "feat(vendors): VendorPicker combobox with inline create"
```

---

## Task 11: `VendorPaymentDetails` component (with copy buttons)

**Files:**
- Create: `src/components/vendors/VendorPaymentDetails.tsx`

- [ ] **Step 11.1: Implement component**

Create `src/components/vendors/VendorPaymentDetails.tsx`:

```tsx
/**
 * VendorPaymentDetails — display block for payment_request expenses.
 * Shown on ExpenseApproval, MyExpenses detail, and Mark-as-Paid dialog.
 *
 * Renders the snapshot fields from the expense (NOT live vendor record —
 * audit integrity). Drift tooltip appears if the referenced vendor's current
 * bank details differ from the snapshot.
 */
import { Copy, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useVendor } from "@/hooks/convex";
import { formatCurrency } from "@/lib/utils";
import type { Id } from "../../../convex/_generated/dataModel";

export interface VendorPaymentDetailsProps {
  /** Snapshot from the expense row */
  vendorBankName: string;
  vendorAccountNumber: string;
  vendorAccountHolderName: string;
  /** Optional vendor reference (shown to detect drift). */
  vendorId?: Id<"vendors">;
  /** For the "Copy all" block */
  amount: number;
  expenseNumber: string;
  /** Compact mode: no "Copy all" button, smaller padding. Used in Mark-as-Paid dialog header. */
  compact?: boolean;
}

function copyToClipboard(text: string, label: string) {
  navigator.clipboard.writeText(text).then(
    () => toast.success(`${label} copied`),
    () => toast.error(`Failed to copy ${label}`),
  );
}

export function VendorPaymentDetails(props: VendorPaymentDetailsProps) {
  const {
    vendorBankName,
    vendorAccountNumber,
    vendorAccountHolderName,
    vendorId,
    amount,
    expenseNumber,
    compact,
  } = props;

  const liveVendor = useVendor(vendorId);
  const drift =
    liveVendor &&
    (liveVendor.bankName !== vendorBankName ||
      liveVendor.accountNumber !== vendorAccountNumber ||
      liveVendor.accountHolderName !== vendorAccountHolderName);

  const copyAll = () => {
    const text = [
      `Bank: ${vendorBankName}`,
      `Acct: ${vendorAccountNumber}`,
      `Name: ${vendorAccountHolderName}`,
      `Amount: ${formatCurrency(amount)}`,
      `Ref: ${expenseNumber}`,
    ].join("\n");
    copyToClipboard(text, "Payment details");
  };

  return (
    <div
      className={
        compact
          ? "space-y-1.5"
          : "rounded-md border bg-muted/30 p-3 space-y-2"
      }
    >
      {!compact && (
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium flex items-center gap-1.5">
            Vendor Payment Details
            {drift && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <AlertCircle className="h-4 w-4 text-amber-600" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-[280px]">
                    <p className="text-xs">
                      Vendor&apos;s current bank details differ from this snapshot.
                      Verify with the submitter before paying. The snapshot above
                      is what will be audited.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={copyAll}
            className="h-7 px-2 text-xs"
          >
            <Copy className="h-3 w-3 mr-1" />
            Copy all
          </Button>
        </div>
      )}

      <DetailRow label="Bank" value={vendorBankName} />
      <DetailRow label="Acct #" value={vendorAccountNumber} />
      <DetailRow label="Holder" value={vendorAccountHolderName} />
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm gap-2">
      <span className="text-muted-foreground w-16 shrink-0">{label}:</span>
      <span className="font-mono flex-1 truncate">{value}</span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => copyToClipboard(value, label)}
        className="h-6 w-6 p-0 shrink-0"
        aria-label={`Copy ${label}`}
      >
        <Copy className="h-3 w-3" />
      </Button>
    </div>
  );
}
```

- [ ] **Step 11.2: Type-check**

Run: `npm run type-check`

Expected: exits 0.

- [ ] **Step 11.3: Commit**

```bash
git add src/components/vendors/VendorPaymentDetails.tsx
git commit -m "feat(vendors): VendorPaymentDetails with per-field + copy-all buttons"
```

---

## Task 12: Barrel export

**Files:**
- Create: `src/components/vendors/index.ts`

- [ ] **Step 12.1: Write barrel**

Create `src/components/vendors/index.ts`:

```ts
export { VendorForm, EMPTY_VENDOR_FORM, type VendorFormValues, type VendorFormProps } from "./VendorForm";
export { VendorPicker, type VendorPickerValue, type VendorPickerProps } from "./VendorPicker";
export { VendorPaymentDetails, type VendorPaymentDetailsProps } from "./VendorPaymentDetails";
```

- [ ] **Step 12.2: Commit**

```bash
git add src/components/vendors/index.ts
git commit -m "feat(vendors): barrel export"
```

---

## Task 13: `VendorsManager` page

**Files:**
- Create: `src/pages/VendorsManager.tsx`

- [ ] **Step 13.1: Implement page**

Create `src/pages/VendorsManager.tsx`:

```tsx
/**
 * VendorsManager — admin/manager page to edit vendor directory entries
 * outside of expense submission. Soft-delete (deactivate) preserves history.
 */
import { useState } from "react";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Users, Edit, Archive, RotateCcw } from "lucide-react";
import {
  useVendors,
  useUpdateVendor,
  useDeactivateVendor,
  useReactivateVendor,
  useVendorUsageCount,
  type Vendor,
} from "@/hooks/convex";
import {
  VendorForm,
  EMPTY_VENDOR_FORM,
  type VendorFormValues,
} from "@/components/vendors";

export function VendorsManager() {
  useDocumentTitle("Vendors");

  const [tab, setTab] = useState<"active" | "inactive">("active");
  const vendors = useVendors(tab === "inactive");

  const filtered = vendors?.filter((v) =>
    tab === "active" ? v.isActive : !v.isActive,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vendors"
        description="Bank account directory for payment requests. Managed by managers and admins."
        icon={Users}
      />

      <Tabs value={tab} onValueChange={(t) => setTab(t as "active" | "inactive")}>
        <TabsList>
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="inactive">Inactive</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="mt-4">
          <VendorList vendors={filtered} loading={vendors === undefined} active />
        </TabsContent>
        <TabsContent value="inactive" className="mt-4">
          <VendorList vendors={filtered} loading={vendors === undefined} active={false} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function VendorList({
  vendors,
  loading,
  active,
}: {
  vendors: Vendor[] | undefined;
  loading: boolean;
  active: boolean;
}) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    );
  }
  if (!vendors || vendors.length === 0) {
    return (
      <div className="text-center py-12 text-sm text-muted-foreground">
        No {active ? "active" : "inactive"} vendors.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {vendors.map((vendor) => (
        <VendorRow key={vendor._id} vendor={vendor} />
      ))}
    </div>
  );
}

function VendorRow({ vendor }: { vendor: Vendor }) {
  const [editOpen, setEditOpen] = useState(false);
  const usageCount = useVendorUsageCount(vendor._id);
  const deactivate = useDeactivateVendor();
  const reactivate = useReactivateVendor();

  const handleToggle = async () => {
    try {
      if (vendor.isActive) {
        await deactivate({ vendorId: vendor._id });
        toast.success(`${vendor.name} deactivated`);
      } else {
        await reactivate({ vendorId: vendor._id });
        toast.success(`${vendor.name} reactivated`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update vendor");
    }
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium">{vendor.name}</span>
              {!vendor.isActive && <Badge variant="secondary">Inactive</Badge>}
              {usageCount !== undefined && (
                <Badge variant="outline" className="text-xs">
                  Used in {usageCount} expense{usageCount === 1 ? "" : "s"}
                </Badge>
              )}
            </div>
            <div className="mt-1 text-sm text-muted-foreground font-mono">
              {vendor.bankName} · {vendor.accountNumber} · {vendor.accountHolderName}
            </div>
            {vendor.notes && (
              <div className="mt-1 text-xs text-muted-foreground italic">
                {vendor.notes}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => setEditOpen(true)}>
              <Edit className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="sm" onClick={handleToggle}>
              {vendor.isActive ? (
                <Archive className="h-3.5 w-3.5" />
              ) : (
                <RotateCcw className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </div>

        <EditVendorDialog
          vendor={vendor}
          open={editOpen}
          onOpenChange={setEditOpen}
        />
      </CardContent>
    </Card>
  );
}

function EditVendorDialog({
  vendor,
  open,
  onOpenChange,
}: {
  vendor: Vendor;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [form, setForm] = useState<VendorFormValues>({
    name: vendor.name,
    bankName: vendor.bankName,
    accountNumber: vendor.accountNumber,
    accountHolderName: vendor.accountHolderName,
    notes: vendor.notes ?? "",
  });
  const [saving, setSaving] = useState(false);
  const updateVendor = useUpdateVendor();

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateVendor({
        vendorId: vendor._id,
        name: form.name,
        bankName: form.bankName,
        accountNumber: form.accountNumber,
        accountHolderName: form.accountHolderName,
        notes: form.notes,
      });
      toast.success("Vendor updated");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update vendor");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Vendor</DialogTitle>
        </DialogHeader>
        <VendorForm values={form} onChange={setForm} disabled={saving} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 13.2: Verify shadcn primitives exist**

Run: `ls src/components/ui/tabs.tsx src/components/ui/dialog.tsx src/components/ui/skeleton.tsx`

Expected: all exist. If any missing: `npx shadcn@latest add tabs dialog skeleton`.

- [ ] **Step 13.3: Type-check**

Run: `npm run type-check`

Expected: exits 0.

- [ ] **Step 13.4: Commit**

```bash
git add src/pages/VendorsManager.tsx
git commit -m "feat(vendors): VendorsManager page with active/inactive tabs"
```

---

## Task 14: Route + nav link

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/layout/Header.tsx`

- [ ] **Step 14.1: Add lazy import and route in App.tsx**

In `src/App.tsx`, find the lazy imports block (around lines 92–106 where `ExpenseSubmit`, `MyExpenses`, `ExpenseApproval` are imported). Add:

```tsx
const VendorsManager = lazyWithPreload(() =>
  import('./pages/VendorsManager').then(m => ({ default: m.VendorsManager }))
);
```

Find the Routes block near the `/expenses/approve` route (around line 362–368). Add AFTER the `BankAccountsManager` route (grep for `BankAccountsManager` to locate it):

```tsx
                  <Route
                    path="vendors"
                    element={
                      <ProtectedRoute requiredPermission="canAccessVendors">
                        <VendorsManager />
                      </ProtectedRoute>
                    }
                  />
```

- [ ] **Step 14.2: Add nav link in Header.tsx**

Open `src/components/layout/Header.tsx`. Find the navigation block that contains expense-related links (grep for `expenses/approve` or `canApproveExpenses`). Add a nav item for `/vendors` visible when `canAccessVendors` is true. Match the existing pattern — same icon style (use `Users` from lucide-react if not already imported).

Concrete steps:
1. Grep for an existing nav pattern like `canApproveExpenses` in Header.tsx.
2. Mirror the Link/MenuItem block that wraps the expense approvals link.
3. Label: "Vendors". Icon: `Users` (from `lucide-react`). Permission check: `canAccessVendors`. Route: `/vendors`.

Concrete insertion: find the nav-link block for `/expenses/approve` (guarded by `canApproveExpenses`). Copy the entire JSX block for that link, paste it below, then:
- Change `to="/expenses/approve"` → `to="/vendors"`
- Change the icon component → `<Users .../>` (keep the same className as the copied icon)
- Change the label text → `Vendors`
- Change the permission check from `canApproveExpenses` → `canAccessVendors`

Add `Users` to the `lucide-react` imports at the top of the file if not already imported (grep the file for `from "lucide-react"` and append `Users` to the destructure).

- [ ] **Step 14.3: Type-check + sanity-run dev server**

Run: `npm run type-check`

Expected: exits 0.

Run `npm run dev` in a terminal and navigate to `http://localhost:5173/vendors` (while logged in as admin). Expected: page loads, "No active vendors" empty state.

- [ ] **Step 14.4: Commit**

```bash
git add src/App.tsx src/components/layout/Header.tsx
git commit -m "feat(vendors): add /vendors route and nav link"
```

---

## Task 15: Wire `VendorPicker` into `ExpenseSubmitForm`

**Files:**
- Modify: `src/components/expense/ExpenseSubmitForm.tsx`

- [ ] **Step 15.1: Extend form values and props**

At the top of `src/components/expense/ExpenseSubmitForm.tsx`, extend `ExpenseSubmitFormValues` to include vendor picker state:

```ts
import { VendorPicker, type VendorPickerValue } from "@/components/vendors";

export interface ExpenseSubmitFormValues {
  description: string;
  amount: string;
  expenseType: "cogs" | "opex" | "other" | "";
  accountId: string;
  expenseDate: string;
  vendorName: string;
  paymentMethod: PaymentMethod;
  transactionReference: string;
  receiptFileId?: Id<"_storage">;
  receiptImageHash?: string;
  sharedReceiptAcknowledged?: boolean;
  vendorPicker?: VendorPickerValue | null;  // NEW
}
```

Update `INITIAL` constant to include `vendorPicker: null`.

- [ ] **Step 15.2: Extend `BuildArgs`**

Update `BuildArgs` type:

```ts
export type BuildArgs = {
  description: string;
  amount: number;
  accountId: Id<"accounts">;
  expenseDate: number;
  vendorName: string;
  paymentMethod: PaymentMethod;
  transactionReference?: string;
  receiptFileId?: Id<"_storage">;
  receiptImageHash?: string;
  sharedReceiptAcknowledged?: true;
  // Vendor snapshot (only when paymentMethod === "payment_request")
  vendorId?: Id<"vendors">;
  vendorBankName?: string;
  vendorAccountNumber?: string;
  vendorAccountHolderName?: string;
  createVendorFromSnapshot?: { name: string; notes?: string };
};
```

- [ ] **Step 15.3: Render picker conditionally**

Find the JSX block where the Vendor input field ends (around line 391, closing of the `<Input id="vendorName" ...>` div). IMMEDIATELY AFTER the entire `{/* Vendor + Payment Method */}` grid closes, add:

```tsx
      {/* Vendor Bank Details — payment_request only */}
      {form.paymentMethod === "payment_request" && (
        <VendorPicker
          value={form.vendorPicker ?? null}
          onChange={(v) => updateField("vendorPicker", v)}
          disabled={disabled}
        />
      )}
```

- [ ] **Step 15.4: Extend validation**

In the `validate` function inside `ExpenseSubmitForm`, add after the existing vendorName check:

```ts
      if (form.paymentMethod === "payment_request") {
        const vp = form.vendorPicker;
        if (!vp) {
          return { ok: false, error: "Vendor bank details are required for payment requests" };
        }
        if (!vp.bankName.trim()) return { ok: false, error: "Bank name is required" };
        if (!vp.accountNumber.trim()) return { ok: false, error: "Account number is required" };
        if (!vp.accountHolderName.trim()) return { ok: false, error: "Account holder name is required" };
        if (vp.createVendor && !vp.createVendor.name.trim()) {
          return { ok: false, error: "New vendor name is required" };
        }
      }
```

- [ ] **Step 15.5: Extend `buildArgs`**

In the `buildArgs` function, extend the `args` object:

```ts
    if (f.paymentMethod === "payment_request" && f.vendorPicker) {
      const vp = f.vendorPicker;
      if (vp.vendorId) {
        args.vendorId = vp.vendorId;
      }
      args.vendorBankName = vp.bankName.trim();
      args.vendorAccountNumber = vp.accountNumber.trim();
      args.vendorAccountHolderName = vp.accountHolderName.trim();
      if (vp.createVendor && vp.createVendor.saveToDirectory) {
        args.createVendorFromSnapshot = {
          name: vp.createVendor.name.trim(),
          ...(vp.notes.trim() && { notes: vp.notes.trim() }),
        };
      }
    }
```

- [ ] **Step 15.6: Handle paymentMethod change — clear picker**

At the top of the component (near other `useEffect`s), add:

```ts
  useEffect(() => {
    if (form.paymentMethod !== "payment_request" && form.vendorPicker) {
      setForm((prev) => ({ ...prev, vendorPicker: null }));
    }
  }, [form.paymentMethod, form.vendorPicker]);
```

- [ ] **Step 15.7: Update hooks for expense submission**

Open `src/hooks/convex/useExpenses.ts`. Find where `useCreateExpenseDraft` / `useUpdateExpenseDraft` / `useSubmitExpense` are declared. Their TypeScript arg types are generated from the Convex API so they'll automatically accept the new optional vendor args — no changes needed. Verify by running `npm run type-check`.

- [ ] **Step 15.8: Manual smoke test**

Run: `npm run dev` (and `npx convex dev` in another terminal).
1. Log in.
2. Navigate to Expenses → Submit New.
3. Select Payment Method = "Payment Request".
4. Expect the VendorPicker block to appear with "Search or add vendor..." button.
5. Click the button → type a new name → click "Add new vendor" → fill bank details → check "Save to vendor directory".
6. Fill in required expense fields, submit.
7. Navigate to `/vendors`. Expect the new vendor to appear.

If all 7 steps pass, continue. If not, fix and re-commit.

- [ ] **Step 15.9: Commit**

```bash
git add src/components/expense/ExpenseSubmitForm.tsx
git commit -m "feat(expense): wire VendorPicker into submit form for payment_request"
```

---

## Task 16: Wire `VendorPaymentDetails` into approval + detail views

**Files:**
- Modify: `src/pages/ExpenseApproval.tsx`
- Modify: `src/pages/MyExpenses.tsx`
- Modify: `src/components/expenses/ApprovalActions.tsx`
- Modify: `src/components/expenses/ExpenseCard.tsx`

- [ ] **Step 16.1: Update the `PendingExpense` type**

The Convex-generated types will automatically reflect the schema changes. No type-level changes required. If the hook file explicitly narrows the expense type with a handwritten `type PendingExpense = { ... }`, add the four new fields there.

Grep to confirm:
```bash
grep -n "PendingExpense" src/hooks/convex/useExpenses.ts
```

If the type is `type PendingExpense = Doc<"expenses">`, no change. If it's an object literal, add:
```ts
  vendorId?: Id<"vendors">;
  vendorBankName?: string;
  vendorAccountNumber?: string;
  vendorAccountHolderName?: string;
```

- [ ] **Step 16.2: Render block in `ExpenseApproval.tsx`**

Open `src/pages/ExpenseApproval.tsx`. Find the card render block (grep for `ExpenseStatusBadge` to locate the card JSX).

Locate where the expense metadata (vendor name, amount, date) is rendered in the card. Import:

```tsx
import { VendorPaymentDetails } from "@/components/vendors";
```

Add a conditional render block inside each expense card, after the receipt viewer:

```tsx
{expense.paymentMethod === "payment_request" &&
  expense.vendorBankName &&
  expense.vendorAccountNumber &&
  expense.vendorAccountHolderName && (
    <VendorPaymentDetails
      vendorBankName={expense.vendorBankName}
      vendorAccountNumber={expense.vendorAccountNumber}
      vendorAccountHolderName={expense.vendorAccountHolderName}
      vendorId={expense.vendorId}
      amount={expense.amount}
      expenseNumber={expense.expenseNumber}
    />
  )}
```

- [ ] **Step 16.3: Render block in `MyExpenses.tsx`**

Same pattern as Step 16.2 — import `VendorPaymentDetails` and conditionally render it on each expense card.

- [ ] **Step 16.4: Render block in `ExpenseCard.tsx`**

If `ExpenseCard.tsx` is the shared card component used by both pages, the render block goes here (and Steps 16.2 and 16.3 just confirm that page doesn't duplicate the block). Read the file first:

Read `src/components/expenses/ExpenseCard.tsx` — find where metadata is rendered. Insert the same conditional block.

- [ ] **Step 16.5: Enhance Mark-as-Paid dialog in `ApprovalActions.tsx`**

Open `src/components/expenses/ApprovalActions.tsx`. Find the Mark-as-Paid `ActionDialog` (grep `markAsPaid`). Replace or extend the dialog's description to prominently show the payee block.

The existing `ActionDialog` abstraction may not accept arbitrary JSX. If so, either:

**Option A** (simpler): change `ActionDialog` to accept `description: React.ReactNode` instead of `description: string`. Pass a fragment that includes `<VendorPaymentDetails compact ... />` + the existing string.

**Option B** (less invasive): render a separate native `<Dialog>` for Mark-as-Paid only, copying the existing dialog structure but adding the payment details block above the transaction reference input.

Use Option A. In `ActionDialog` (same file or a sub-component), change the prop type:

```ts
description: React.ReactNode;
```

Then in the Mark-as-Paid dialog invocation (search for `onSubmit={handleMarkAsPaidSubmit}`), pass:

```tsx
description={
  <div className="space-y-3">
    {expense?.paymentMethod === "payment_request" &&
      expense?.vendorBankName &&
      expense?.vendorAccountNumber &&
      expense?.vendorAccountHolderName && (
        <VendorPaymentDetails
          compact
          vendorBankName={expense.vendorBankName}
          vendorAccountNumber={expense.vendorAccountNumber}
          vendorAccountHolderName={expense.vendorAccountHolderName}
          vendorId={expense.vendorId}
          amount={amount}
          expenseNumber={expense.expenseNumber}
        />
      )}
    <p className="text-sm">
      Enter the bank reference number after completing the transfer.
    </p>
  </div>
}
```

- [ ] **Step 16.6: Type-check**

Run: `npm run type-check`

Expected: exits 0.

- [ ] **Step 16.7: Manual smoke test**

Run dev server. Log in as manager/admin.
1. Submit a payment_request expense with bank details (from Task 15).
2. Switch to manager account → navigate to /expenses/approve.
3. Expect the vendor details block on the pending card.
4. Click "Approve".
5. After approval, click "Mark as Paid".
6. Expect the dialog to show vendor bank details prominently at the top.
7. Enter a reference, click Confirm.
8. Verify status flips to "paid".

- [ ] **Step 16.8: Commit**

```bash
git add src/pages/ExpenseApproval.tsx src/pages/MyExpenses.tsx src/components/expenses/
git commit -m "feat(expense): display vendor payment details on approval and detail views"
```

---

## Task 17: CSV import validation for payment_request

**Files:**
- Modify: `src/lib/csvImportValidation.ts`

- [ ] **Step 17.1: Read existing validation**

Read `src/lib/csvImportValidation.ts` — find the function that validates each row (grep for `payment_request`).

- [ ] **Step 17.2: Add snapshot field check**

In the row validation function, after the existing payment method check, add:

```ts
  if (row.paymentMethod === "payment_request") {
    if (!row.vendorBankName?.trim()) {
      errors.push("vendorBankName is required for payment_request rows");
    }
    if (!row.vendorAccountNumber?.trim()) {
      errors.push("vendorAccountNumber is required for payment_request rows");
    }
    if (!row.vendorAccountHolderName?.trim()) {
      errors.push("vendorAccountHolderName is required for payment_request rows");
    }
  } else if (
    row.vendorBankName?.trim() ||
    row.vendorAccountNumber?.trim() ||
    row.vendorAccountHolderName?.trim()
  ) {
    errors.push(
      "Vendor bank details are only allowed on payment_request rows",
    );
  }
```

Extend the CSV row type (at the top of the file or wherever the `ExpenseCsvRow` type lives) to include the three optional string fields.

- [ ] **Step 17.3: Update CSV template / sample if present**

Grep for a sample CSV or documentation of column headers in `src/pages/HistoricalImportPage.tsx`. If the page shows a header list or download-sample button, add the three new columns to the documented schema.

- [ ] **Step 17.4: Type-check**

Run: `npm run type-check`

Expected: exits 0.

- [ ] **Step 17.5: Commit**

```bash
git add src/lib/csvImportValidation.ts src/pages/HistoricalImportPage.tsx
git commit -m "feat(csv-import): enforce vendor snapshot fields on payment_request rows"
```

---

## Task 18: E2E Playwright test

**Files:**
- Create: `tests/e2e/vendor-payment-flow.spec.ts`

- [ ] **Step 18.1: Check existing E2E patterns**

Run: `ls tests/e2e/*.spec.ts | head -5`

Read one existing expense spec (e.g., `tests/e2e/expense-access.spec.ts`) to match login/setup pattern.

- [ ] **Step 18.2: Implement E2E test**

Create `tests/e2e/vendor-payment-flow.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers";

test.describe("Vendor payment flow", () => {
  test("submit payment_request → approve → mark as paid", async ({ page }) => {
    // Step 1: Submitter creates expense with new vendor
    await loginAs(page, "order_staff");
    await page.goto("/expenses/submit");
    await page.getByLabel("Description *").fill("Office chair");
    await page.getByLabel("Amount (IDR) *").fill("500000");
    // Set expense type + GL account — follow existing pattern
    await page.getByLabel("Expense Type *").click();
    await page.getByRole("option", { name: /Operating Expenses/i }).click();
    await page.getByLabel("GL Account *").click();
    await page.getByRole("option").first().click();
    await page.getByLabel("Vendor *").fill("Test Vendor PT");
    await page.getByLabel("Payment Method").click();
    await page.getByRole("option", { name: /Payment Request/i }).click();

    // Vendor picker appears
    await expect(page.getByText("Vendor Bank Details")).toBeVisible();
    await page.getByRole("combobox").click();
    await page.getByPlaceholder("Type vendor name...").fill("Test Vendor PT");
    await page.getByRole("option", { name: /Add new vendor/i }).click();

    await page.getByLabel("Bank Name *").fill("BCA");
    await page.getByLabel("Account Number *").fill("1234-5678-90");
    await page.getByLabel("Account Holder Name *").fill("Budi Test");
    await page.getByRole("button", { name: "Submit for Approval" }).click();
    await expect(page.getByText(/submitted/i)).toBeVisible({ timeout: 5000 });

    // Step 2: Approver sees bank details
    await loginAs(page, "admin");
    await page.goto("/expenses/approve");
    await expect(page.getByText("Test Vendor PT").first()).toBeVisible();
    await expect(page.getByText("1234567890").first()).toBeVisible(); // normalized
    await expect(page.getByText("Budi Test").first()).toBeVisible();
    await page.getByRole("button", { name: /^Approve$/i }).first().click();
    // Approval dialog may appear for high-value — handle either way
    const approveConfirm = page.getByRole("button", { name: /Confirm Approve/i });
    if (await approveConfirm.isVisible({ timeout: 1000 }).catch(() => false)) {
      await approveConfirm.click();
    }

    // Step 3: Mark as paid
    await page.getByRole("button", { name: /Mark as Paid/i }).first().click();
    // Dialog shows vendor details
    await expect(page.getByText("BCA")).toBeVisible();
    await page.getByPlaceholder(/reference/i).fill("BCA-REF-12345");
    await page.getByRole("button", { name: /Confirm Paid/i }).click();
    await expect(page.getByText(/paid/i).first()).toBeVisible({ timeout: 5000 });

    // Step 4: Vendor appears in directory
    await page.goto("/vendors");
    await expect(page.getByText("Test Vendor PT")).toBeVisible();
    await expect(page.getByText("Used in 1 expense")).toBeVisible();
  });

  test("deactivated vendor is hidden from picker", async ({ page }) => {
    await loginAs(page, "admin");

    // 1. Create a vendor via the form in /vendors (use VendorsManager directly)
    // If VendorsManager has no "add" button (it's edit-only), seed via expense flow:
    await page.goto("/expenses/submit");
    await page.getByLabel("Description *").fill("Seed expense");
    await page.getByLabel("Amount (IDR) *").fill("100000");
    await page.getByLabel("Expense Type *").click();
    await page.getByRole("option", { name: /Operating Expenses/i }).click();
    await page.getByLabel("GL Account *").click();
    await page.getByRole("option").first().click();
    await page.getByLabel("Vendor *").fill("Deactivate Me");
    await page.getByLabel("Payment Method").click();
    await page.getByRole("option", { name: /Payment Request/i }).click();
    await page.getByRole("combobox").click();
    await page.getByPlaceholder("Type vendor name...").fill("Deactivate Me");
    await page.getByRole("option", { name: /Add new vendor/i }).click();
    await page.getByLabel("Bank Name *").fill("BCA");
    await page.getByLabel("Account Number *").fill("9876543210");
    await page.getByLabel("Account Holder Name *").fill("Test Holder");
    await page.getByRole("button", { name: /Save Draft/i }).click();

    // 2. Deactivate via VendorsManager
    await page.goto("/vendors");
    const row = page.getByText("Deactivate Me").locator("..").locator("..");
    await row.getByRole("button").nth(1).click(); // Archive button
    await expect(page.getByText(/deactivated/i)).toBeVisible({ timeout: 3000 });

    // 3. Open a new payment_request submission and verify vendor not in picker
    await page.goto("/expenses/submit");
    await page.getByLabel("Payment Method").click();
    await page.getByRole("option", { name: /Payment Request/i }).click();
    await page.getByRole("combobox").click();
    await page.getByPlaceholder("Type vendor name...").fill("Deactivate Me");
    // Expect only the "Add new vendor" option, not the existing deactivated row
    await expect(page.getByRole("option", { name: "Deactivate Me" })).not.toBeVisible();

    // 4. Verify the Inactive tab still shows it
    await page.goto("/vendors");
    await page.getByRole("tab", { name: /Inactive/i }).click();
    await expect(page.getByText("Deactivate Me")).toBeVisible();
  });
});
```

- [ ] **Step 18.3: Run E2E**

Run: `npx playwright test tests/e2e/vendor-payment-flow.spec.ts --headed`

Expected: first test passes. If selectors drift, adjust to match actual button/label text.

- [ ] **Step 18.4: Commit**

```bash
git add tests/e2e/vendor-payment-flow.spec.ts
git commit -m "test(e2e): vendor payment flow submit→approve→pay"
```

---

## Task 19: Documentation updates

**Files:**
- Modify: `docs/SCHEMA.md`
- Modify: `docs/API_REFERENCE.md`
- Modify: `docs/CHANGELOG.md`
- Modify: `CLAUDE.md`

- [ ] **Step 19.1: Update `docs/SCHEMA.md`**

Locate the section listing tables (or the section describing `expenses`). Add:

- A new section/entry for the `vendors` table matching the schema from Task 1 (include fields + indexes + description).
- Under `expenses` table, add the four new snapshot fields with "(snapshot, payment_request only, immutable after draft)" notes.

- [ ] **Step 19.2: Update `docs/API_REFERENCE.md`**

Add a section for vendor queries and mutations. Example block:

```markdown
### Vendors (Payment Request Directory)

**Queries:**
- `vendors.list({ includeInactive? })` → `Vendor[]`
- `vendors.search({ queryString, limit? })` → `Vendor[]` (search index)
- `vendors.getById({ vendorId })` → `Vendor | null`
- `vendors.getUsageCount({ vendorId })` → `number`

**Mutations:**
- `vendors.createVendor({ token, name, bankName, accountNumber, accountHolderName, notes? })` → `Id<"vendors">` (all roles; normalizes account number; returns existing on dedup match)
- `vendors.updateVendor({ token, vendorId, ...fields })` → `Id<"vendors">` (manager, admin)
- `vendors.deactivateVendor({ token, vendorId })` → `Id<"vendors">` (manager, admin)
- `vendors.reactivateVendor({ token, vendorId })` → `Id<"vendors">` (manager, admin)
```

Also add to the `expenses` mutations section: note that `createDraft` and `updateDraft` now accept optional `vendorId`, `vendorBankName`, `vendorAccountNumber`, `vendorAccountHolderName`, and `createVendorFromSnapshot` args (required when `paymentMethod === "payment_request"`).

- [ ] **Step 19.3: Update `docs/CHANGELOG.md`**

Add a top-of-file entry under the appropriate version heading:

```markdown
### Added
- Vendor bank details captured inline on payment-request expenses — eliminates WhatsApp round-trips when admins execute vendor payments. New vendors directory with search, inline create, and usage tracking. Snapshot-on-submit pattern preserves audit integrity.
- `/vendors` admin page (manager + admin) for editing and deactivating vendor records.
```

- [ ] **Step 19.4: Update `CLAUDE.md` Quick File Finder**

Find the Quick File Finder table. Add a row:

```markdown
| **Vendors (payment-request directory)** | `convex/vendors/` (mutations, queries, helpers) | `src/pages/VendorsManager.tsx`, `src/components/vendors/`, `src/hooks/convex/useVendors.ts` |
```

Place it near the Expenses / Vouchers rows.

- [ ] **Step 19.5: Commit**

```bash
git add docs/SCHEMA.md docs/API_REFERENCE.md docs/CHANGELOG.md CLAUDE.md
git commit -m "docs: add vendors table, API, changelog, and CLAUDE.md refs"
```

---

## Task 20: Type check, lint, tests

- [ ] **Step 20.1: Run type-check**

Run: `npm run type-check`

Expected: exits 0. If errors, fix and re-commit.

- [ ] **Step 20.2: Run lint**

Run: `npm run lint`

Expected: exits 0. If warnings about new files, either fix or add specific eslint-disable comments with justifications (avoid blanket disables).

- [ ] **Step 20.3: Run full test suite**

Run: `npm run test`

Expected: all green, including new vendor + expense tests.

- [ ] **Step 20.4: Commit any fixes**

If fixes needed:

```bash
git add <files>
git commit -m "fix: lint/type-check fixes"
```

---

## Task 21: Full build

- [ ] **Step 21.1: Run build**

Run: `npm run build`

Expected: exits 0. Check for bundle-size warnings.

- [ ] **Step 21.2: Manual smoke test on built artifacts**

Run: `npm run preview`

Navigate to `http://localhost:4173` (or whatever port preview uses). Repeat the submit→approve→pay smoke test from Task 16.7 against the production build.

- [ ] **Step 21.3: Merge to main**

When all waves green:

```bash
git switch main
git pull
git merge --no-ff feature/vendor-bank-details
git push origin main
```

Do NOT force-push. Do NOT skip hooks.

---

## Open items for follow-up (deferred from this plan)

These are intentionally NOT in this plan. Surface as separate phases if needed:

- Bank reconciliation auto-match using payee account number (Phase 73 follow-up)
- Per-vendor spend analytics
- Vendor merge tool for duplicate cleanup
- Contact info (phone, email) on vendors
- Bank code / account number checksum validation
