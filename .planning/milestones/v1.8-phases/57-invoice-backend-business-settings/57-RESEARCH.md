# Phase 57: Invoice Backend & Business Settings - Research

**Researched:** 2026-03-16
**Domain:** Convex schema design, file storage, singleton pattern, sequential numbering, settings page
**Confidence:** HIGH

## Summary

Phase 57 builds the data foundation and admin settings page for the invoice generation feature. It introduces 3 new tables (`businessSettings`, `invoiceCounters`, `invoices`), extends the existing `customers` table with 3 optional fields, creates 6 backend API functions, a full Business Settings admin page, and 2 new frontend hooks. The design spec at `docs/superpowers/specs/2026-03-16-invoice-generation-design.md` is the authoritative reference.

The codebase already has well-established patterns for every building block needed: `protectedMutation`/`protectedQuery` for auth, `ctx.storage.generateUploadUrl()` for file uploads, `getWibComponents()` for WIB timezone handling, and `createMutationHook` for frontend hook factory. The existing `bankAccounts` table with `by_active` index already provides the data for the bank account selector. The `counters` table provides a reference for atomic sequential numbering, though invoices use a different format (YYMM monthly prefix vs MMDD daily prefix).

**Primary recommendation:** Follow existing project patterns exactly. The only novel element is the singleton table pattern (first in this codebase) -- use "query first row, upsert" approach. The invoice counter needs its own dedicated `invoiceCounters` table (not the existing `counters` table) because the numbering format differs (YYMM monthly vs MMDD daily).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Single scroll page with 5 stacked sections (Brand Identity, Contact Info, Tax Info, Default Bank Account, Invoice Header Preview)
- Click-to-upload button for logo (not drag-and-drop) -- matches existing `generateUploadUrl` pattern from expenses/payroll
- Logo constraints: max 1MB, PNG/JPG/SVG only, display at fixed height in preview
- Bank account selector shows only active accounts (`isActive=true`)
- Invoice header preview updates live as user types (mirrors local form state, no API call)
- Page is admin-only (managers don't see it)
- Add nav link + route in this phase
- YYMM prefix uses WIB timezone (Asia/Jakarta) -- consistent with `convex/lib/periodRange.ts`
- 3-digit minimum zero-pad: INV-2603-001 through INV-2603-999
- On overflow (>999), extend to 4+ digits: INV-2603-1000 -- no hard cap
- Finalized invoices are immutable -- Business Settings changes only affect new invoices
- Race-safe numbering via `invoiceCounters` table with Convex OCC
- Auto-save feedback: subtle inline status text near page top ("Saving..." -> "Saved just now" -> "Saved 2 min ago") -- no toasts
- Concurrent tab editing: last write wins (Convex OCC handles)
- No stale draft auto-cleanup
- Discard draft requires ConfirmDialog
- Phase 57 delivers: schema, all 6 backend mutations/queries, Business Settings page, nav link, both hooks (useBusinessSettings + useInvoice)
- Phase 58 delivers: invoice form page, print view, Order Detail sidebar card, invoice routes
- No invoice UI scaffolding in Phase 57

### Claude's Discretion
- Exact section card styling on Business Settings page
- Bank account radio card visual design
- Save button placement and loading state
- Error handling patterns for logo upload failures
- Hook implementation details (return shape, loading states)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| BSET-01 | Admin can access Business Settings page at `/settings/business` | Route in App.tsx with `canAccessBusinessSettings` permission, lazy-loaded page, nav link in Admin dropdown of Header.tsx |
| BSET-02 | Admin can set business name, address, phone, email, NPWP | `businessSettings` singleton table with upsert mutation, `protectedMutation` with `roles: ["admin"]` |
| BSET-03 | Admin can upload company logo (Convex file storage) | `generateUploadUrl` pattern from ReceiptUpload.tsx, `ctx.storage.getUrl()` for resolution, 1MB max PNG/JPG/SVG |
| BSET-04 | Admin can select default bank account for invoices | Query `bankAccounts` with `by_active` index, store `defaultBankAccountId` on settings singleton |
| BSET-05 | Live invoice header preview shows how seller info will appear | Pure frontend -- mirrors local form state, no API call needed |
| IDAT-01 | `businessSettings` singleton table with seller identity fields | New table in schema.ts, no indexes needed (singleton), upsert mutation |
| IDAT-02 | `invoiceCounters` table for race-safe sequential numbering per month | New table with `by_prefix` index, OCC-serialized read-increment-write in finalize mutation |
| IDAT-03 | `invoices` table with status (draft/final), seller/buyer/order snapshots, items array | New table with 3 indexes (`by_order`, `by_status_number`, `by_date`), exact validators from design spec |
| IDAT-04 | `customers` table extended with optional `companyName`, `npwp`, `billingAddress` | Add 3 `v.optional(v.string())` fields to existing customers table definition, update customer mutations |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Convex | ^1.31.7 | Backend + real-time database | Project standard |
| convex-helpers | (existing) | `protectedMutation`, `protectedQuery`, `useSessionQuery`, `useSessionMutation` | Project auth pattern |
| React | ^19.2.0 | UI framework | Project standard |
| React Router | ^7.13.0 | Client routing | Project standard |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| shadcn/ui | (existing) | Form inputs, buttons, cards, radio groups | All UI elements on settings page |
| Lucide React | (existing) | Icons (Settings, Upload, Building2, etc.) | Nav items and section headers |
| Sonner | (existing) | Toast notifications for save success/error | Settings save actions |
| Tailwind CSS | ^4.1.18 | Styling | All component styles |

### Alternatives Considered
None -- all locked to existing project stack.

## Architecture Patterns

### Recommended Project Structure
```
convex/
├── businessSettings/
│   ├── queries.ts          # get (singleton read)
│   └── mutations.ts        # upsert, generateUploadUrl
├── invoices/
│   ├── queries.ts          # getByOrder, getById
│   └── mutations.ts        # createDraft, updateDraft, discardDraft, finalize
src/
├── pages/
│   └── BusinessSettings.tsx  # Full settings page
├── components/
│   └── settings/
│       ├── BusinessSettingsForm.tsx    # Form with 5 sections
│       ├── LogoUploader.tsx           # Click-to-upload logo
│       ├── BankAccountSelector.tsx    # Radio card selector
│       └── InvoiceHeaderPreview.tsx   # Live preview block
├── hooks/convex/
│   ├── useBusinessSettings.ts  # Query + mutation hooks
│   └── useInvoice.ts           # Invoice query + mutation hooks
```

### Pattern 1: Singleton Table (first in codebase)
**What:** `businessSettings` has at most one row. No need for indexes.
**When to use:** Global app configuration that applies to all users.
**Example:**
```typescript
// Query: read singleton
export const get = protectedQuery({
  roles: ["admin", "manager"],
  args: {},
  handler: async (ctx) => {
    const settings = await ctx.db.query("businessSettings").first();
    if (!settings) return null;
    // Resolve logo URL if storageId exists
    const logoUrl = settings.logoStorageId
      ? await ctx.storage.getUrl(settings.logoStorageId)
      : null;
    return { ...settings, logoUrl };
  },
});

// Mutation: upsert singleton
export const upsert = protectedMutation({
  roles: ["admin"],
  args: {
    businessName: v.string(),
    address: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    npwp: v.optional(v.string()),
    logoStorageId: v.optional(v.id("_storage")),
    defaultBankAccountId: v.optional(v.id("bankAccounts")),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("businessSettings").first();
    const data = {
      ...args,
      updatedBy: ctx.user._id,
      updatedAt: Date.now(),
    };
    if (existing) {
      await ctx.db.patch(existing._id, data);
      return existing._id;
    } else {
      return await ctx.db.insert("businessSettings", data);
    }
  },
});
```

### Pattern 2: Race-Safe Invoice Counter
**What:** Dedicated `invoiceCounters` table with YYMM prefix, separate from existing `counters` table.
**Why separate:** Existing `counters` uses MMDD daily format with `by_prefix_date` compound index. Invoice numbering uses YYMM monthly format with `by_prefix` single-field index. Different granularity, different index shape.
**Example:**
```typescript
// Inside finalize mutation
async function getNextInvoiceNumber(ctx: MutationCtx): Promise<string> {
  const now = Date.now();
  const { year, month } = getWibComponents(now);
  // YYMM format: 2-digit year + 2-digit month (1-indexed)
  const prefix = `${String(year).slice(-2)}${String(month + 1).padStart(2, "0")}`;

  const counter = await ctx.db
    .query("invoiceCounters")
    .withIndex("by_prefix", (q) => q.eq("prefix", prefix))
    .unique();

  let sequence: number;
  if (counter) {
    sequence = counter.lastNumber + 1;
    await ctx.db.patch(counter._id, { lastNumber: sequence });
  } else {
    sequence = 1;
    await ctx.db.insert("invoiceCounters", { prefix, lastNumber: 1 });
  }

  return `INV-${prefix}-${String(sequence).padStart(3, "0")}`;
}
```

### Pattern 3: File Upload (Logo)
**What:** Convex file storage with `generateUploadUrl` pattern.
**Established in:** `convex/expenses/mutations.ts`, `src/components/expenses/ReceiptUpload.tsx`
**Flow:**
1. Frontend calls `generateUploadUrl` mutation to get signed URL
2. Frontend POSTs file to signed URL with correct Content-Type
3. Response contains `storageId`
4. Frontend passes `storageId` to upsert mutation
5. Query resolves URL via `ctx.storage.getUrl(storageId)`

**Logo-specific constraints:** Max 1MB (vs 5MB for receipts), PNG/JPG/SVG only (no PDF/WebP), display at fixed height in preview.

### Pattern 4: Permission-Based Access
**What:** Add `canAccessBusinessSettings` to `ROLE_PERMISSIONS` (admin-only).
**Where:** `src/lib/types.ts` -- add to the `ROLE_PERMISSIONS` Record type and all 4 role entries.
**Also add:** `canAccessInvoices` for manager + admin (used by Phase 58 but defined now).

### Pattern 5: Nav Link in Admin Dropdown
**What:** Add "Business Settings" to `adminItems` array in Header.tsx.
**Where:** `src/components/layout/Header.tsx` -- add to the `adminItems` const array.
**Permission:** `canAccessBusinessSettings` (admin-only).
**Icon:** `Settings` or `Building2` from lucide-react.

### Anti-Patterns to Avoid
- **Don't reuse `counters` table for invoice numbering:** Different format (YYMM monthly vs MMDD daily), different index shape. Creating a dedicated `invoiceCounters` table is cleaner and avoids confusion.
- **Don't create draft invoice records in Phase 57:** Phase 57 builds the mutations, but no invoice UI exists yet. The `createDraft` mutation will be called from Phase 58's invoice form page.
- **Don't use `requireRole()` from `convex/lib/auth.ts`:** This is the old auth pattern. All new backend functions MUST use `protectedMutation`/`protectedQuery` from `convex/lib/functions.ts` with `roles` arrays.
- **Don't resolve logo URL on mutation side:** Resolve `ctx.storage.getUrl()` in queries only. Mutations store `storageId` only.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Auth/session handling | Custom session validation | `protectedMutation`/`protectedQuery` from `convex/lib/functions.ts` | Session injection, role checking, user loading all handled automatically |
| Mutation toast wrappers | Individual try/catch per hook | `createMutationHook` from `src/hooks/convex/createMutationHook.ts` | Factory pattern eliminates boilerplate |
| WIB timezone offset | Manual UTC+7 arithmetic | `getWibComponents()` from `convex/lib/periodRange.ts` | Already handles month/year correctly, tested |
| File upload flow | Custom upload logic | Copy `ReceiptUpload.tsx` pattern (generateUploadUrl -> POST -> storageId) | Proven pattern used in expenses, payroll, feedback |
| Lazy loading pages | Manual React.lazy() | `lazyWithPreload()` from `src/lib/lazyWithPreload` | Supports hover-prefetching |
| Confirmation dialogs | Custom modals | `ConfirmDialog` from `src/components/shared/` | Established shared component |

## Common Pitfalls

### Pitfall 1: Singleton Query Returns Null Initially
**What goes wrong:** Business settings don't exist yet on first load -- query returns `null`.
**Why it happens:** No seeded data for the singleton table.
**How to avoid:** Handle `null` return in both frontend (show empty form with defaults) and backend (queries that need settings should handle missing gracefully).
**Warning signs:** Undefined access errors when trying to read settings fields.

### Pitfall 2: Schema Addition Without Default Values
**What goes wrong:** Adding required fields to `customers` table breaks existing documents.
**Why it happens:** Existing customer documents don't have the new fields.
**How to avoid:** All 3 new customer fields (`companyName`, `npwp`, `billingAddress`) MUST be `v.optional(v.string())`. Never add required fields to existing tables.
**Warning signs:** Schema validation errors on deploy.

### Pitfall 3: bankAccounts Query Role Restriction
**What goes wrong:** Business Settings page can't load bank accounts because `bankAccounts.queries.list` is restricted to `roles: ["admin"]`.
**Why it happens:** bankAccounts queries were built for the admin-only BankAccountsManager page.
**How to avoid:** This is fine for Phase 57 since Business Settings is admin-only. But Phase 58 (invoice form, manager + admin) will need bank account data. Either: (a) add "manager" to bankAccounts.queries.list roles NOW, or (b) read the default bank account through the businessSettings query which resolves the bank details server-side. Recommendation: option (b) -- the businessSettings.get query already resolves `defaultBankAccountId` to full bank details, and the invoice createDraft mutation reads bank data server-side. No need to widen bankAccounts access.
**Warning signs:** Manager role getting "Unauthorized" errors when loading invoice form.

### Pitfall 4: Counter Race With `.first()` Instead of `.unique()`
**What goes wrong:** If a duplicate counter row somehow exists, `.first()` silently returns one of them, potentially causing duplicate invoice numbers.
**Why it happens:** Using `.first()` instead of `.unique()` masks data corruption.
**How to avoid:** Use `.unique()` for `invoiceCounters` lookup (same pattern as existing `counters` table). This throws on duplicates, catching corruption early.
**Warning signs:** Two invoices with the same number in the same month.

### Pitfall 5: Logo StorageId Becomes Stale
**What goes wrong:** If user uploads a new logo, the old `storageId` remains in Convex storage forever (orphaned blob).
**Why it happens:** Convex file storage doesn't auto-delete old files when references change.
**How to avoid:** In the upsert mutation, if `existing.logoStorageId` differs from `args.logoStorageId` and both exist, delete the old file via `ctx.storage.delete(existing.logoStorageId)`. This prevents storage bloat.
**Warning signs:** Growing storage usage with unreferenced files.

### Pitfall 6: Forgetting `*By` Fields Are Server-Side Only
**What goes wrong:** Passing `updatedBy` from the client in mutation args.
**Why it happens:** Design spec note says "All `*By` fields are set server-side from `ctx.user._id`."
**How to avoid:** `updatedBy` and `generatedBy` are set in the handler from `ctx.user._id`, never included in `args` validators.
**Warning signs:** Extra fields in args that the mutation ignores or misuses.

## Code Examples

### Schema Addition (convex/schema.ts)
```typescript
// Source: Design spec + existing schema patterns
// Add BEFORE the closing of defineSchema (before counters table)

// Business settings singleton -- seller identity for invoices
businessSettings: defineTable({
  businessName: v.string(),
  logoStorageId: v.optional(v.id("_storage")),
  address: v.optional(v.string()),
  phone: v.optional(v.string()),
  email: v.optional(v.string()),
  npwp: v.optional(v.string()),
  defaultBankAccountId: v.optional(v.id("bankAccounts")),
  updatedBy: v.id("users"),
  updatedAt: v.number(),
}),
// No indexes needed -- singleton table (at most one row)

// Invoice counters -- race-safe monthly sequential numbering
invoiceCounters: defineTable({
  prefix: v.string(),    // "2603" (YYMM)
  lastNumber: v.number(),
})
  .index("by_prefix", ["prefix"]),

// Invoices -- draft and finalized invoice records
invoices: defineTable({
  status: v.union(v.literal("draft"), v.literal("final")),
  invoiceNumber: v.optional(v.string()),
  orderId: v.id("orders"),
  generatedAt: v.optional(v.number()),
  generatedBy: v.id("users"),
  updatedAt: v.number(),
  // Seller snapshot
  sellerName: v.string(),
  sellerAddress: v.optional(v.string()),
  sellerPhone: v.optional(v.string()),
  sellerEmail: v.optional(v.string()),
  sellerNpwp: v.optional(v.string()),
  sellerLogoStorageId: v.optional(v.id("_storage")),
  bankName: v.string(),
  bankAccountNumber: v.string(),
  bankAccountName: v.string(),
  // Buyer snapshot
  buyerName: v.string(),
  buyerCompany: v.optional(v.string()),
  buyerNpwp: v.optional(v.string()),
  buyerAddress: v.optional(v.string()),
  buyerPhone: v.optional(v.string()),
  poNumber: v.optional(v.string()),
  // Order snapshot
  orderNumber: v.string(),
  orderDate: v.number(),
  dueDate: v.optional(v.number()),
  items: v.array(v.object({
    productName: v.string(),
    variant: v.optional(v.string()),
    qty: v.number(),
    unitPrice: v.number(),
    lineTotal: v.number(),
  })),
  subtotal: v.number(),
  discountAmount: v.optional(v.number()),
  discountLabel: v.optional(v.string()),
  deliveryFee: v.optional(v.number()),
  finalTotal: v.number(),
  paymentStatus: v.string(),
  paymentMethod: v.optional(v.string()),
  notes: v.optional(v.string()),
})
  .index("by_order", ["orderId"])
  .index("by_status_number", ["status", "invoiceNumber"])
  .index("by_date", ["generatedAt"]),
```

### Customer Table Extension
```typescript
// In customers table definition, add after existing fields:
companyName: v.optional(v.string()),
npwp: v.optional(v.string()),
billingAddress: v.optional(v.string()),
```

### Permission Addition (src/lib/types.ts)
```typescript
// Add to ROLE_PERMISSIONS type and all 4 role entries:
canAccessBusinessSettings: boolean;  // Admin only
canAccessInvoices: boolean;          // Manager + Admin

// kitchen:  canAccessBusinessSettings: false, canAccessInvoices: false
// order_staff: canAccessBusinessSettings: false, canAccessInvoices: false
// manager:  canAccessBusinessSettings: false, canAccessInvoices: true
// admin:    canAccessBusinessSettings: true, canAccessInvoices: true
```

### Hook Pattern (useBusinessSettings.ts)
```typescript
// Source: Established pattern from useExpenses.ts, useBankAccounts.ts
import { useSessionQuery, useSessionMutation } from "convex-helpers/react/sessions";
import { api } from "../../../convex/_generated/api";
import { createMutationHook } from "./createMutationHook";

// Query hooks
export function useBusinessSettings() {
  return useSessionQuery(api.businessSettings.queries.get, {});
}

// Mutation hooks
export const useUpsertBusinessSettings = createMutationHook(
  api.businessSettings.mutations.upsert,
  { successMessage: "Settings saved", errorMessage: "Failed to save settings" }
);

// Upload URL -- raw mutation (no toast), same as useExpenseUploadUrl
export function useBusinessSettingsUploadUrl() {
  return useSessionMutation(api.businessSettings.mutations.generateUploadUrl);
}

// Types
export type BusinessSettings = NonNullable<ReturnType<typeof useBusinessSettings>>;
```

### Route Addition (App.tsx)
```typescript
// Lazy import
const BusinessSettings = lazyWithPreload(() =>
  import('./pages/BusinessSettings').then(m => ({ default: m.BusinessSettings }))
);

// Route inside standard pages Layout
<Route
  path="settings/business"
  element={
    <ProtectedRoute requiredPermission="canAccessBusinessSettings">
      <BusinessSettings />
    </ProtectedRoute>
  }
/>
```

### Nav Link Addition (Header.tsx)
```typescript
// Add to adminItems array
{ path: '/settings/business', label: 'Settings', icon: Settings, permission: 'canAccessBusinessSettings' },
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `requireRole(ctx, args.token, [...])` | `protectedMutation({ roles: [...] })` | Phase 44 (expenses) | All new functions MUST use new pattern |
| Direct `mutation()` calls | `createMutationHook()` factory | Phase 44 (expenses) | Eliminates toast boilerplate |
| Manual session token in args | `useSessionMutation`/`useSessionQuery` auto-injection | Phase 44 (expenses) | No `token: v.string()` in args |

**Deprecated/outdated:**
- `requireRole(ctx, args.token, roles)` from `convex/lib/auth.ts` -- still exists for legacy code but new functions use `protectedMutation`/`protectedQuery`
- `token: v.string()` in mutation args -- replaced by automatic `SessionIdArg` injection

## Open Questions

1. **Logo deletion on replacement**
   - What we know: Convex storage does not auto-cleanup orphaned files
   - What's unclear: Whether `ctx.storage.delete()` should be called in upsert when logo changes
   - Recommendation: Yes -- delete old `logoStorageId` in upsert mutation when it changes. Prevents storage bloat. This is Claude's discretion per CONTEXT.md.

2. **businessSettings.get roles**
   - What we know: Business Settings page is admin-only, but invoice createDraft (Phase 58) needs to read settings for manager role too
   - What's unclear: Whether to set `roles: ["admin"]` or `roles: ["admin", "manager"]` now
   - Recommendation: Set `roles: ["admin", "manager"]` now. The query is read-only and the data is not sensitive. Mutations remain admin-only. This avoids a role-widening change in Phase 58.

## Sources

### Primary (HIGH confidence)
- `docs/superpowers/specs/2026-03-16-invoice-generation-design.md` -- authoritative design spec with exact field lists, validators, indexes, API signatures
- `convex/schema.ts` -- current schema (65 tables, verified)
- `convex/lib/functions.ts` -- protectedMutation/protectedQuery implementation
- `convex/lib/counter.ts` -- existing atomic counter pattern (reference for invoiceCounters)
- `convex/lib/periodRange.ts` -- WIB timezone helpers (getWibComponents)
- `convex/expenses/mutations.ts` -- generateUploadUrl pattern
- `src/components/expenses/ReceiptUpload.tsx` -- complete file upload flow (frontend)
- `src/lib/types.ts` -- ROLE_PERMISSIONS definition
- `src/components/layout/Header.tsx` -- nav structure, dropdown groups
- `src/App.tsx` -- routing patterns, lazy loading, ProtectedRoute usage

### Secondary (MEDIUM confidence)
- `57-CONTEXT.md` -- user decisions and scope boundary
- `convex/bankAccounts/queries.ts` -- bank account query pattern and role restrictions
- `src/hooks/convex/createMutationHook.ts` -- mutation hook factory implementation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already in use, no new dependencies
- Architecture: HIGH - follows established patterns exactly, design spec provides field-level detail
- Pitfalls: HIGH - based on direct codebase inspection of existing patterns and known Convex behaviors

**Research date:** 2026-03-16
**Valid until:** 2026-04-16 (stable project, no framework changes expected)
