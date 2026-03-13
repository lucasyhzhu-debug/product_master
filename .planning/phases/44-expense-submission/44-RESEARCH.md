# Phase 44: Expense Submission - Research

**Researched:** 2026-03-13
**Domain:** Expense submission workflow (Convex backend + React frontend)
**Confidence:** HIGH

## Summary

Phase 44 builds the expense submission workflow: backend mutations/queries for expense CRUD with fraud detection, a hook layer, and two frontend pages (ExpenseSubmit form and MyExpenses list). The schema tables (`expenses`, `expenseStatusHistory`) and counter helper (`getNextNumber`) already exist from Phase 41. The accounts queries/hooks will be available from Phase 43 (dependency).

The implementation is well-bounded: only Draft and Submitted statuses are in scope. Approval, void, and reimbursement are deferred to later phases. The main technical challenges are (1) Convex file storage integration with client-side SHA-256 hashing for receipt deduplication, and (2) choosing the correct auth pattern for "all roles can submit."

**Primary recommendation:** Follow the `protectedMutation` / `protectedQuery` pattern from `convex/lib/functions.ts` with `roles: ["kitchen", "order_staff", "manager", "admin"]` for all-role access. Use the existing `generateUploadUrl` + `fetch(uploadUrl, { body: file })` pattern from `feedback/mutations.ts` for receipt upload. Extract pure helpers for duplicate detection and late submission checking to enable unit testing.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- All roles can submit expenses -- use `requireAuth` (any authenticated user), not `requireRole`
- `submittedBy` derived from auth context (current user)
- Draft -> Submitted is the ONLY transition in Phase 44
- Approval, rejection, void deferred to Phase 45
- Receipt upload uses Convex file storage (`generateUploadUrl` action + `ctx.storage.store()`)
- SHA-256 hash computed client-side, sent as `receiptImageHash` field
- Receipt required for expenses > Rp 50,000 (backend enforced), optional for <= Rp 50,000
- Expense numbers generated on creation (not on submit) via `getNextNumber(ctx, "EXP")`
- Format: EXP-MMDD-NNN
- FRAUD-01: Soft duplicate warning (same employee + amount + date within 7 days) -- sets `duplicateWarning` field, does NOT block
- FRAUD-02: Hard block if receipt SHA-256 hash matches existing expense -- uses `by_receipt_hash` index
- FRAUD-03: Auto-set `lateSubmission=true` when `expenseDate` + 14 days < submission timestamp
- `previousExpenseId` links resubmissions
- GL category dropdown uses `useAccounts(activeOnly: true)` from Phase 43
- My Expenses page follows OrderManager.tsx pattern
- `protectedMutation` from `convex/lib/functions.ts`
- Lazy import in `src/App.tsx`, `ProtectedRoute` for route registration

### Claude's Discretion
- Component decomposition within ExpenseSubmit form
- Specific tab labels and filter UX for MyExpenses
- Error message wording for fraud blocks
- Loading/empty state designs
- Form validation UX (inline vs. toast)

### Deferred Ideas (OUT OF SCOPE)
- Approval queue UI (Phase 45)
- Journal entry creation on approval (Phase 45)
- Void functionality (Phase 45)
- Reimbursement tracking (Phase 46)
- Admin "all expenses" view (Phase 48)
- Expense analytics (Phase 50)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| EXP-01 | Any authenticated user can create and save expense drafts with description, amount, GL category, date, payment method, vendor, and optional receipt | `protectedMutation` with all 4 roles; `expenses` table schema already defined; `getNextNumber(ctx, "EXP")` for numbering |
| EXP-02 | User can submit a draft expense for approval, triggering routing to eligible approvers | `submitExpense` mutation: validate status=draft, enforce receipt rule, check hash duplicate, compute late flag, update status to submitted, write audit trail |
| EXP-03 | Receipt image upload is required for expenses > Rp 50,000 and optional for <= Rp 50,000 | Backend validation in `submitExpense`; frontend warning UX; existing `generateUploadUrl` pattern from `feedback/mutations.ts` |
| EXP-04 | Receipt images stored via Convex file storage with client-side SHA-256 hash for deduplication | `ctx.storage.generateUploadUrl()` pattern exists; Web Crypto API `crypto.subtle.digest("SHA-256", arrayBuffer)` for client-side hash; `by_receipt_hash` index for server-side lookup |
| EXP-05 | User can view their own expense history with status filters and timeline tracker | `listMyExpenses` query using `by_submitter_status` index; tab-filtered list page following OrderManager pattern |
| EXP-18 | Every status transition recorded in immutable audit trail (expenseStatusHistory) | `expenseStatusHistory` table with `by_expense` index; helper function writes audit row on every status change |
</phase_requirements>

## Standard Stack

### Core (Already in Project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Convex | ^1.31.7 | Backend mutations/queries + file storage | Project backend; `ctx.storage` API for receipt uploads |
| convex-helpers | (installed) | `protectedMutation`/`protectedQuery` wrappers, `SessionIdArg` | Auth pattern used by all protected endpoints |
| React 19 | ^19.2.0 | UI framework | Project frontend |
| React Router 7 | ^7.13.0 | Client-side routing | Lazy page imports + ProtectedRoute guards |
| Tailwind CSS 4 + shadcn/ui | ^4.1.18 | Styling + accessible components | Project UI standard |
| Sonner | (installed) | Toast notifications | Error/success feedback |
| Lucide React | (installed) | Icons | Project icon library |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Web Crypto API | Browser built-in | SHA-256 hashing of receipt files | Client-side hash before upload |
| Vitest | ^4.0.18 | Unit tests for pure helpers | Testing duplicate detection, late submission logic |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `protectedMutation` (all 4 roles) | New `authenticatedMutation` wrapper | Unnecessary abstraction -- all 4 roles is explicit and matches existing patterns |
| Client-side SHA-256 | Server-side hashing | Server-side would require reading the blob from storage, adding latency; client-side is immediate and the hash is just a fingerprint |

## Architecture Patterns

### Recommended Project Structure
```
convex/
  expenses/
    queries.ts          # listMyExpenses, getById, getStatusHistory
    mutations.ts        # createDraft, updateDraft, submitExpense, generateUploadUrl
    helpers.ts          # Pure functions: checkDuplicate, isLateSubmission, validateExpenseForSubmission
    __tests__/
      helpers.test.ts   # Unit tests for pure helper functions
src/
  hooks/convex/
    useExpenses.ts      # Query + mutation hooks
  pages/
    ExpenseSubmit.tsx   # Create/edit expense form with receipt upload
    MyExpenses.tsx      # Personal expense list with status tabs
  components/
    expenses/
      StatusBadge.tsx   # Expense status badge with color coding
      ReceiptUpload.tsx # File input + SHA-256 hash + upload flow
      ExpenseCard.tsx   # Expense list card for MyExpenses
```

### Pattern 1: Auth for All Roles (protectedMutation)
**What:** Use `protectedMutation` from `convex/lib/functions.ts` with all four roles explicitly listed.
**When to use:** All expense mutations and queries that need auth but no role restriction.
**Why not a new wrapper:** The codebase has no `requireAuth` function. The `protectedMutation` wrapper takes a `roles` array and there are only 4 roles. Listing all 4 is explicit and follows existing patterns (see OrderDetail route which lists all 4 roles).

```typescript
// Source: convex/lib/functions.ts pattern
import { protectedMutation, protectedQuery } from "../lib/functions";

const ALL_ROLES = ["kitchen", "order_staff", "manager", "admin"] as const;

export const createDraft = protectedMutation({
  roles: [...ALL_ROLES],
  args: { /* ... */ },
  handler: async (ctx, args) => {
    // ctx.user is Doc<"users"> -- use ctx.user._id as submittedBy
  },
});
```

### Pattern 2: Convex File Storage Upload (Receipt)
**What:** Generate upload URL on server, upload file via fetch on client, store storageId in record.
**When to use:** Receipt image upload flow.
**Existing examples:** `feedback/mutations.ts` (`generateUploadUrl`), `grabfoodMenu/mutations.ts`, `src/components/grabfoodMenu/PhotoUpload.tsx`.

```typescript
// Backend: convex/expenses/mutations.ts
export const generateUploadUrl = protectedMutation({
  roles: [...ALL_ROLES],
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

// Frontend: Receipt upload helper
async function uploadReceipt(
  generateUploadUrl: () => Promise<string>,
  file: File
): Promise<{ storageId: Id<"_storage">; hash: string }> {
  // Step 1: Compute SHA-256 hash client-side
  const arrayBuffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hash = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

  // Step 2: Get upload URL
  const uploadUrl = await generateUploadUrl();

  // Step 3: Upload file
  const response = await fetch(uploadUrl, {
    method: "POST",
    body: file,
    headers: { "Content-Type": file.type },
  });
  if (!response.ok) throw new Error("Upload failed");
  const { storageId } = await response.json();

  return { storageId, hash };
}
```

### Pattern 3: Immutable Audit Trail (Status History)
**What:** Every status transition writes to `expenseStatusHistory` table. Records are never updated or deleted.
**When to use:** Any mutation that changes expense status.

```typescript
// Source: expenses table schema (lines 1681-1690)
async function recordStatusChange(
  ctx: MutationCtx,
  expenseId: Id<"expenses">,
  fromStatus: string | undefined,
  toStatus: string,
  changedBy: Id<"users">,
  comment?: string
) {
  await ctx.db.insert("expenseStatusHistory", {
    expenseId,
    fromStatus,
    toStatus,
    changedBy,
    changedAt: Date.now(),
    comment,
  });
}
```

### Pattern 4: Hook Layer (createMutationHook + custom)
**What:** Use `createMutationHook` factory for simple mutations, custom hooks for complex flows (upload).
**When to use:** All frontend mutation/query hooks.

```typescript
// Source: src/hooks/convex/createMutationHook.ts pattern
import { createMutationHook } from "./createMutationHook";

export const useCreateExpenseDraft = createMutationHook(
  api.expenses.mutations.createDraft,
  { successMessage: "Draft saved", errorMessage: "Failed to save draft" }
);
```

### Pattern 5: Tab-Filtered List Page (MyExpenses)
**What:** List page with status filter tabs, following OrderManager.tsx / other list pages.
**When to use:** MyExpenses page.

The MyExpenses page should show tabs like: All | Draft | Submitted | Approved | Rejected
Each tab filters the query by status. Use `by_submitter_status` index for efficient queries.

### Anti-Patterns to Avoid
- **Do NOT create a new auth wrapper (e.g., `authenticatedMutation`):** The existing `protectedMutation` with all 4 roles works. Adding a new wrapper creates divergent patterns for no benefit.
- **Do NOT hash receipt server-side:** The `by_receipt_hash` index enables O(1) lookups. Computing the hash client-side before upload allows blocking before the upload completes.
- **Do NOT allow editing submitted expenses:** Once status is "submitted", the expense is immutable (only void + resubmit, in Phase 45).
- **Do NOT use `requireRole` directly:** Use `protectedMutation` wrapper which provides `ctx.user` automatically. The older `requireRole(ctx, args.token, roles)` pattern requires manual token handling.
- **Do NOT use `useMutation` directly for protected endpoints:** Use `createMutationHook` (which internally uses `useSessionMutation`) to ensure session ID is injected automatically.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| File upload URL generation | Custom upload endpoint | `ctx.storage.generateUploadUrl()` | Convex handles signed URLs, storage lifecycle, and cleanup |
| SHA-256 hashing | Custom hash function | `crypto.subtle.digest("SHA-256", buffer)` | Browser built-in, secure, fast, no dependencies |
| Expense number generation | Manual counter tracking | `getNextNumber(ctx, "EXP")` from `convex/lib/counter.ts` | Atomic via OCC, handles WIB timezone, already tested |
| Session management | Manual token passing | `protectedMutation` + `createMutationHook` | Session auto-injected via `SessionProvider` + `useSessionMutation` |
| Toast notifications | Custom error handling | `createMutationHook` with `successMessage`/`errorMessage` | Handles try/catch + toast in one place |
| Form validation | Custom validation logic | Form state + backend validation | Backend is the authority; frontend validation is UX-only |

**Key insight:** Every infrastructure piece needed for Phase 44 already exists in the codebase. The implementation is purely assembling existing patterns into new files.

## Common Pitfalls

### Pitfall 1: Auth Pattern Confusion
**What goes wrong:** Using `requireRole` with `token: v.string()` instead of `protectedMutation` wrapper, or vice versa -- mixing the two patterns in the same module.
**Why it happens:** The codebase has evolved from manual `requireRole` to `protectedMutation` wrapper. Both exist.
**How to avoid:** Use `protectedMutation` / `protectedQuery` exclusively for expenses. These wrappers auto-inject `ctx.user` and handle session validation. The `generateUploadUrl` mutation uses `protectedMutation` with the `roles` parameter.
**Warning signs:** Seeing `token: v.string()` in mutation args, or `requireRole(ctx, args.token, ...)` calls.

### Pitfall 2: Missing Audit Trail on Status Change
**What goes wrong:** Changing expense status without writing to `expenseStatusHistory`.
**Why it happens:** Forgetting to call the audit helper in `submitExpense`, or adding status changes in future phases without the pattern.
**How to avoid:** Extract a helper function that both patches the expense status AND writes the audit row. Never patch `status` without calling this helper.
**Warning signs:** Expense status changes visible in DB but no corresponding `expenseStatusHistory` records.

### Pitfall 3: Receipt Hash Lookup Returns Optional Field Matches
**What goes wrong:** The `by_receipt_hash` index on `receiptImageHash` includes expenses that have NO hash (field is optional). A query on this index without a hash value could match expenses with `undefined` hash.
**Why it happens:** Convex indexes include documents where the indexed field is `undefined`.
**How to avoid:** When checking for duplicate hash, ONLY query when the hash is non-empty. Guard: `if (!hash) return null;` before querying the index. The index query `q.eq("receiptImageHash", hash)` with a non-empty string will never match `undefined` values -- but be explicit about the guard.
**Warning signs:** False duplicate detections on expenses without receipts.

### Pitfall 4: Frontend Hook Pattern Mismatch
**What goes wrong:** Using `useMutation` directly instead of `useSessionMutation` (via `createMutationHook`), causing session ID not to be injected for `protectedMutation` endpoints.
**Why it happens:** The `feedback` module uses raw `useMutation` because its endpoints use old `mutation` + `requireRole` pattern (pre-wrapper era). New code should use the wrapper pattern.
**How to avoid:** Use `createMutationHook` for all expense mutations. For `generateUploadUrl`, which needs a raw function call (not a hook return), use `useSessionMutation` directly from convex-helpers.
**Warning signs:** "Unauthorized: no session token provided" errors at runtime.

### Pitfall 5: Draft Edit After Submit
**What goes wrong:** Allowing `updateDraft` to modify a submitted expense.
**Why it happens:** Missing status guard in the mutation.
**How to avoid:** `updateDraft` must check `expense.status === "draft"` and throw if not. This is a backend invariant.
**Warning signs:** Submitted expenses showing up with modified fields.

### Pitfall 6: Expense Amount as Float
**What goes wrong:** Storing amounts as floating-point numbers, causing rounding issues in IDR (which has no fractional component).
**Why it happens:** JavaScript `number` type is always float; user might type "50000.5".
**How to avoid:** Validate that amount is a positive integer in the backend mutation: `if (!Number.isInteger(args.amount) || args.amount <= 0)`. This matches the journal engine's integer check pattern.
**Warning signs:** Non-integer amounts in the expenses table.

### Pitfall 7: Duplicate Detection Window Calculation
**What goes wrong:** Incorrectly computing the 7-day window for FRAUD-01 soft duplicate detection.
**Why it happens:** `expenseDate` is stored as epoch milliseconds. The 7-day window must compare expense dates, not creation times.
**How to avoid:** Pure function: `isWithinDuplicateWindow(existingDate: number, newDate: number, windowDays: number = 7): boolean` -- compare absolute difference against `windowDays * 24 * 60 * 60 * 1000`.
**Warning signs:** Duplicates not detected when dates are close, or false positives when dates are far apart.

## Code Examples

Verified patterns from the existing codebase:

### Convex File Storage Upload (Existing Pattern)
```typescript
// Source: convex/feedback/mutations.ts (lines 12-17)
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

// Source: src/components/grabfoodMenu/PhotoUpload.tsx (lines 48-63)
// Step 1: Get upload URL from Convex
const uploadUrl = await generateUploadUrl({ token });
// Step 2: Upload file to Convex storage
const response = await fetch(uploadUrl, {
  method: "POST",
  body: file,
  headers: { "Content-Type": file.type },
});
if (!response.ok) throw new Error("Upload failed");
const { storageId } = await response.json();
```

### Counter Number Generation (Existing Pattern)
```typescript
// Source: convex/lib/counter.ts (lines 63-89)
import { getNextNumber } from "./counter";

// Inside mutation handler:
const expenseNumber = await getNextNumber(ctx, "EXP");
// Returns: "EXP-0313-001", "EXP-0313-002", etc.
```

### protectedMutation Wrapper (Existing Pattern)
```typescript
// Source: convex/lib/functions.ts (lines 44-73)
export const create = protectedMutation({
  roles: ["manager", "admin"],
  args: { name: v.string() },
  handler: async (ctx, args) => {
    // ctx.user is Doc<"users"> -- automatically validated
    return await ctx.db.insert("table", { ...args, createdBy: ctx.user.name });
  },
});
```

### createMutationHook Factory (Existing Pattern)
```typescript
// Source: src/hooks/convex/createMutationHook.ts
export const useCreateIngredient = createMutationHook(
  api.ingredients.mutations.create,
  { successMessage: "Ingredient created", errorMessage: "Failed to create ingredient" }
);
// Returns: { mutate, mutateAsync } -- auto-injects session, auto-toasts
```

### Client-Side SHA-256 (Web Crypto API)
```typescript
// Source: Browser Web Crypto API (standard, no library needed)
async function computeSha256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}
```

### Route Registration (Existing Pattern)
```typescript
// Source: src/App.tsx (lines 23-85)
// Step 1: Lazy import with named export pattern
const ExpenseSubmit = lazyWithPreload(() =>
  import('./pages/ExpenseSubmit').then(m => ({ default: m.ExpenseSubmit }))
);
const MyExpenses = lazyWithPreload(() =>
  import('./pages/MyExpenses').then(m => ({ default: m.MyExpenses }))
);

// Step 2: Route registration -- all roles can access (no requiredPermission, no allowedRoles)
// For "all authenticated users" routes, use ProtectedRoute without permission/role constraints
<Route
  path="expenses/new"
  element={
    <ProtectedRoute>
      <ExpenseSubmit />
    </ProtectedRoute>
  }
/>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `requireRole(ctx, args.token, roles)` | `protectedMutation({ roles, args, handler })` | Phase 35+ | New code uses wrapper; `ctx.user` auto-populated |
| `useMutation` + manual token | `createMutationHook` + `useSessionMutation` | Phase 35+ | Session auto-injected; toast auto-handled |
| `useProtectedMutation(api.x)` | `createMutationHook(api.x, config)` | Phase 35+ | Factory pattern replaces manual hook wrapping |

**Deprecated/outdated:**
- `requireRole` with `token: v.string()` arg: Still works but should not be used in new code. Use `protectedMutation` wrapper.
- `useProtectedMutation`: Low-level hook that requires manual toast handling. Prefer `createMutationHook` factory.
- `useMutation` for protected endpoints: Does not inject session ID. Use `createMutationHook` or `useSessionMutation`.

## Open Questions

1. **Phase 43 Dependency**
   - What we know: Phase 43 (Chart of Accounts Management) creates `convex/accounts/queries.ts` with `list(activeOnly?)` and `src/hooks/convex/useAccounts.ts`. The plan exists but has not been executed.
   - What's unclear: Whether Phase 43 will be implemented before or concurrently with Phase 44.
   - Recommendation: Phase 44 plan should assume Phase 43 is complete. If not, the GL category dropdown can use a stub query that reads accounts directly. The `accounts` table is already seeded with 39 default accounts.

2. **ProtectedRoute for All Roles**
   - What we know: `ProtectedRoute` accepts `requiredPermission` or `allowedRoles` props. Using neither means "any authenticated user" -- the component just checks `isAuthenticated`.
   - What's unclear: Whether a new permission like `canSubmitExpenses` should be added to `ROLE_PERMISSIONS`.
   - Recommendation: Use bare `<ProtectedRoute>` without any permission/role prop for Phase 44 pages, since PERM-01 explicitly states "all roles can submit expenses." Adding a permission constant is Phase 48's concern.

3. **Receipt File Size Limit**
   - What we know: The GrabFood PhotoUpload component uses a 5MB limit.
   - What's unclear: Whether receipt photos need a different size limit.
   - Recommendation: Use the same 5MB limit. Receipt photos are typically smaller than product photos.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^4.0.18 |
| Config file | vitest.config.ts |
| Quick run command | `npm run test -- --run` |
| Full suite command | `npm run test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EXP-01 | createDraft validates required fields and generates expense number | unit | `npx vitest run convex/expenses/__tests__/helpers.test.ts -t "createDraft"` | Wave 0 |
| EXP-02 | submitExpense enforces receipt rule, checks hash, computes late flag | unit | `npx vitest run convex/expenses/__tests__/helpers.test.ts -t "submit"` | Wave 0 |
| EXP-03 | Receipt required for amounts > 50000, optional for <= 50000 | unit | `npx vitest run convex/expenses/__tests__/helpers.test.ts -t "receipt"` | Wave 0 |
| EXP-04 | SHA-256 hash duplicate detection hard-blocks submission | unit | `npx vitest run convex/expenses/__tests__/helpers.test.ts -t "duplicate hash"` | Wave 0 |
| EXP-05 | listMyExpenses returns only current user's expenses | unit (ctx-dependent, deferred) | manual-only | N/A |
| EXP-18 | Status transition writes audit trail record | unit | `npx vitest run convex/expenses/__tests__/helpers.test.ts -t "audit"` | Wave 0 |
| FRAUD-01 | Soft duplicate warning within 7-day window | unit | `npx vitest run convex/expenses/__tests__/helpers.test.ts -t "soft duplicate"` | Wave 0 |
| FRAUD-02 | Hard block on matching receipt hash | unit | `npx vitest run convex/expenses/__tests__/helpers.test.ts -t "hash block"` | Wave 0 |
| FRAUD-03 | Late submission flag when expenseDate + 14 days < now | unit | `npx vitest run convex/expenses/__tests__/helpers.test.ts -t "late submission"` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run convex/expenses/__tests__/helpers.test.ts`
- **Per wave merge:** `npm run test -- --run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `convex/expenses/__tests__/helpers.test.ts` -- covers EXP-01 through EXP-04, EXP-18, FRAUD-01 through FRAUD-03
- [ ] `convex/expenses/helpers.ts` -- pure functions to be tested (must exist before tests)

*(Pure helper functions are the primary testable surface. Mutation logic that requires ctx is validated via type-check + manual testing, consistent with Phase 42 decision.)*

## Sources

### Primary (HIGH confidence)
- `convex/schema.ts` lines 1634-1690 -- expenses + expenseStatusHistory table definitions
- `convex/lib/counter.ts` -- getNextNumber implementation (verified in codebase)
- `convex/lib/functions.ts` -- protectedMutation/protectedQuery wrappers (verified in codebase)
- `convex/lib/auth.ts` -- requireRole, getSessionUser (verified in codebase)
- `convex/feedback/mutations.ts` -- generateUploadUrl pattern (verified in codebase)
- `src/components/grabfoodMenu/PhotoUpload.tsx` -- file upload client pattern (verified in codebase)
- `src/hooks/convex/createMutationHook.ts` -- mutation hook factory (verified in codebase)
- `src/hooks/convex/useFeedback.ts` -- uploadScreenshot helper pattern (verified in codebase)
- `src/components/auth/ProtectedRoute.tsx` -- route guard (verified in codebase)
- `.planning/phases/43-chart-of-accounts-management/43-01-PLAN.md` -- accounts queries/hooks specification (verified in plan)

### Secondary (MEDIUM confidence)
- Web Crypto API `crypto.subtle.digest` -- browser standard, well-documented

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in project, patterns verified in codebase
- Architecture: HIGH -- follows established patterns (protectedMutation, createMutationHook, file upload)
- Pitfalls: HIGH -- identified from actual codebase patterns and schema constraints

**Research date:** 2026-03-13
**Valid until:** 2026-04-13 (stable -- all infrastructure already exists)
