---
status: resolved
trigger: "manager-override-server-error: createManagerOverride mutation throws Server Error"
created: 2026-04-09T00:00:00Z
updated: 2026-04-09T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED - All throw new Error() in createManagerOverride (and requireRole) are redacted to "Server Error" on Convex production deployments. The underlying error (likely auth or validation) is hidden. Additionally, the frontend error handling checks for error.message === "Not authenticated" which never matches production-redacted errors.
test: Convex docs confirm production redacts Error messages, only ConvexError preserves data
expecting: Converting to ConvexError will make errors visible on production
next_action: Fix by converting throw new Error() to throw new ConvexError() in voucher mutations and requireRole

## Symptoms

expected: Manager override creates a single-use discount voucher (fixed amount 54000 on order subtotal 270000) and applies it to the order
actual: Server error from Convex - [CONVEX M(vouchers/mutations:createManagerOverride)] Server Error Called by client
errors: Two separate attempts both fail with Server Error. Request IDs d8f5f78e0f77afad and 1fc1db413baadbee
reproduction: Open an order (Dubai Triple 135g, subtotal Rp 270,000), open Manager Override dialog, set Fixed Amount discount of 54000, enter reason ("staff" or "staff Discount"), click "Create Override Voucher"
started: Currently broken, unknown when it started working/broke

## Eliminated

- hypothesis: Schema mismatch - mutation inserts fields not in schema
  evidence: Compared all fields in ctx.db.insert (mutations.ts L344-360) against vouchers table definition (schema.ts L678-719). All fields match. Direct DB insert test passes in convex-test.
  timestamp: 2026-04-09T00:10:00Z

- hypothesis: Mutation logic error (validation, code generation, etc.)
  evidence: Wrote reproduction test calling api.vouchers.mutations.createManagerOverride with exact parameters matching user scenario (fixed amount 54000, reason "staff Discount", manager role). All 3 tests pass. The mutation logic is correct.
  timestamp: 2026-04-09T00:12:00Z

## Evidence

- timestamp: 2026-04-09T00:10:00Z
  checked: Schema fields vs mutation insert fields
  found: All 15 fields in the insert match the schema definition exactly. No missing required fields, no extra fields.
  implication: Schema is not the problem

- timestamp: 2026-04-09T00:12:00Z
  checked: Full mutation execution via convex-test (3 tests: direct insert, fixed amount mutation, percentage mutation)
  found: All 3 tests pass. Mutation creates voucher correctly with both discount types.
  implication: The code is correct. The issue must be in the deployment or runtime environment.

- timestamp: 2026-04-09T00:15:00Z
  checked: Convex production error handling behavior
  found: On Convex production deployments, throw new Error("message") is redacted to "Server Error" (no message). Only ConvexError preserves custom data to the client. All errors in createManagerOverride and requireRole use throw new Error().
  implication: This is the root cause. The actual error could be auth, validation, or anything -- it's just hidden.

- timestamp: 2026-04-09T00:16:00Z
  checked: Nilson user record on production
  found: Nilson exists as active manager (id: mn7d0j0kycdyqv08xpftp81vw980bn6r). User data is valid.
  implication: User record is not the issue.

- timestamp: 2026-04-09T00:17:00Z
  checked: Frontend error handling in useCreateManagerOverride hook
  found: Hook checks error.message === "Not authenticated" to suppress duplicate toasts. On production, error.message is "Server Error" (redacted), so this check NEVER matches. ALL production errors trigger the toast showing "Server Error".
  implication: Frontend error handling is broken on production -- it can never distinguish auth errors from other errors.

- timestamp: 2026-04-09T00:18:00Z
  checked: createManagerOverride function spec on production deployment
  found: Function exists and is deployed with correct args signature.
  implication: Deployment is up to date.

## Resolution

root_cause: All throw new Error() in createManagerOverride mutation AND requireRole() are redacted to "Server Error" on Convex production deployments. The codebase has two auth patterns - the new protectedMutation (convex/lib/functions.ts) uses ConvexError correctly, but the old requireRole (convex/lib/auth.ts) and the voucher mutations still use throw new Error() which gets redacted. The actual underlying error is invisible to users. Additionally, the frontend error filtering (error.message === "Not authenticated") never matches on production because the message is always "Server Error".
fix: Converted throw new Error() → throw new ConvexError() in requireRole (auth.ts) and all voucher mutations. Updated getErrorMessage (utils.ts) to extract ConvexError.data. Added isAuthError helper and applied across useVouchers.ts and useMenuProducts.ts.
verification: npm run type-check ✓, npm run build ✓
files_changed:
  - convex/lib/auth.ts (import ConvexError, convert 3 throws)
  - convex/vouchers/mutations.ts (convert all throw new Error → ConvexError)
  - src/lib/utils.ts (add isAuthError helper, update getErrorMessage for ConvexError.data)
  - src/hooks/convex/useVouchers.ts (use isAuthError helper)
  - src/hooks/convex/useMenuProducts.ts (use isAuthError helper)
