# Staff Review: Phase 27.1 — GrabFood Webhooks & Partner Configuration

**Date:** 2026-02-26
**Plans:**
- `27.1-01-PLAN.md` — 6 webhook endpoints + HMAC + syncLog
- `27.1-02-PLAN.md` — Webhooks tab UI + Settings enhancement
**Reviewers:** Staff Developer (Implementation) + Principal Developer (Architecture)

---

## 0. Plan Structure Validation

### Plan 01 (Backend Webhooks)

| Requirement | Status |
|-------------|--------|
| Git Workflow section | ❌ **Missing** — no branch name, no checkpoint strategy |
| Implementation Waves | ⚠️ Implicit — 2 tasks but no PARALLEL/SEQUENTIAL/agent table |
| Documentation Updates | ❌ **Missing** — no CHANGELOG checkbox |
| Success Criteria | ✅ Present — clear and measurable |

### Plan 02 (Frontend UI)

| Requirement | Status |
|-------------|--------|
| Git Workflow section | ❌ **Missing** |
| Implementation Waves | ⚠️ Implicit — 2 tasks but no wave table |
| Documentation Updates | ❌ **Missing** |
| Success Criteria | ✅ Present |

### Plan Structure Additions (Auto-filled)

Both plans are in GSD `execute` format (task XML, not CLAUDE.md wave tables). This is acceptable for the GSD executor but lacks the 4 mandatory sections from CLAUDE.md. The following should be added as a preamble or metadata:

```markdown
## Git Workflow
**Branch:** `feature/27.1-grabfood-webhooks`
**Checkpoints:** After Task 1 (schema + HMAC), After Task 2 (all 6 handlers)

## Documentation Updates
- [ ] CHANGELOG.md
- [ ] SCHEMA.md (new fields on platformCredentials, externalProductMappings, syncType)
- [ ] API_REFERENCE.md (6 new HTTP endpoints)
```

---

## 1. Summary

**Overall Assessment:** Revise (minor issues)

The plans are well-scoped and follow established project patterns. Plan 01 correctly implements DB-sourced HMAC (replacing the broken `process.env` approach) and the passive webhook strategy (log-only, no order lifecycle). Plan 02 adds sensible admin UI. However, there are **3 critical issues** around schema validation, the `saveHmacSecret` mutation inserting incomplete records, and the `createSyncLog` validator mismatch with the schema `syncType` union. Several improvements around code reuse and the menu JSON builder would make implementation cleaner.

---

## 2. Critical Issues (Must Fix)

| # | Issue | Category | Location in Plan |
|---|-------|----------|------------------|
| 1 | `saveHmacSecret` inserts incomplete `platformCredentials` record | Schema | Plan 01, Task 1 |
| 2 | Schema `syncType` union vs `createSyncLog` validator mismatch | Schema | Plan 01, Task 1 |
| 3 | `listProductMappingsInternal` doesn't return `grabfoodPrice` / `isAvailable` | Logic | Plan 01, Task 2 |

**Details:**

### Issue 1: `saveHmacSecret` inserts incomplete `platformCredentials` record

The `saveHmacSecret` mutation's `insert` fallback path creates a record with only `{ platformId, hmacSecret, updatedBy, updatedAt }`. But `platformCredentials` schema requires `updatedBy: v.string()` and `updatedAt: v.number()` — which the plan includes — but it also has no `email` or `password`. While those are `v.optional()` so the insert will succeed, the **real problem** is:

1. The `updatedBy` is hardcoded to `"admin"` string instead of the authenticated user's name. Every other mutation in `platformCredentials/mutations.ts` uses `user.name` from `requireRole()`. The plan uses `await requireRole(ctx, args.token, ["admin"])` but doesn't capture the return value.

**Recommendation:**
```typescript
const user = await requireRole(ctx, args.token, ["admin"]);
// ... later:
updatedBy: user.name,
```

### Issue 2: Schema `syncType` union vs `createSyncLog` validator mismatch

The plan adds `v.literal("webhook")` to the `createSyncLog` mutation args. But `createSyncLog` is an `internalMutation` — its args validator is **independent** of the schema definition. The plan correctly updates both, but there's a subtle issue: the `externalSyncLogs` schema `syncType` is defined inline (not via a shared validator). If you update `createSyncLog` args but forget the schema, Convex will reject inserts.

The plan says "Add `v.literal("webhook")` to the `syncType` union in the `externalSyncLogs` table" — good. But verify the plan implementer adds it to **both** places:
1. `convex/schema.ts` → `externalSyncLogs.syncType`
2. `convex/externalData/mutations.ts` → `createSyncLog` args

Additionally, the `SyncLogEntry` type in `platformCredentials/queries.ts:164` has a hardcoded `syncType` union: `"manual" | "cron" | "token_refresh"`. This needs updating to include `"webhook"` or the health query will silently drop webhook sync logs from `syncHistory` arrays.

**Recommendation:** Create a shared `syncTypeValidator` in `schema.ts` (like `externalSource`) so all consumers stay in sync:
```typescript
export const syncType = v.union(
  v.literal("manual"), v.literal("cron"),
  v.literal("token_refresh"), v.literal("webhook")
);
```

### Issue 3: `listProductMappingsInternal` doesn't return new fields

The GET menu handler calls `listProductMappingsInternal` and expects `grabfoodPrice` and `isAvailable` on each mapping. But the query just spreads the raw document (`{ ...m, menuProduct }`). Since these fields will be added to the schema, they **will** appear on the document object. So this is actually fine — Convex automatically returns all document fields.

**However**, the plan does NOT mention verifying that `listProductMappingsInternal`'s return type (inferred by Convex codegen) includes the new fields. After schema change, run `npx convex dev` once to regenerate types, then verify the webhook handler can access `mapping.grabfoodPrice` without TypeScript errors.

**Downgraded to Improvement** — the data will be there, but type inference should be verified.

---

## 3. Improvements (Recommended)

| # | Improvement | Impact | Effort |
|---|-------------|--------|--------|
| 1 | Extract shared webhook handler pattern | High | Low |
| 2 | Add shared `syncTypeValidator` to schema.ts | Medium | Low |
| 3 | Validate HMAC on GET menu with query string | Medium | Low |
| 4 | Use `actionToast` not `toast.success` in Plan 02 | Low | Low |
| 5 | `resolveHmacSecret` typing | Low | Low |

**Details:**

### Improvement 1: Extract shared webhook handler pattern

Handlers 2-6 all follow the same pattern: read body → HMAC validate → parse JSON → log to syncLog → return 200. This should be a shared helper:

```typescript
async function handleWebhookCommon(
  ctx: ActionCtx,
  request: Request,
  eventType: string,
  processPayload: (ctx: ActionCtx, payload: any) => Promise<void>
): Promise<Response> {
  const body = await request.text();
  const sig = request.headers.get("X-Grab-Signature");
  const secret = await resolveHmacSecret(ctx);
  const hmac = await validateHmacSignature(body, sig, secret);

  if (!hmac.valid && hmac.reason !== "no_secret") {
    await logWebhookEvent(ctx, eventType, "error", `HMAC failed: ${hmac.reason}`);
    return new Response("OK", { status: 200 });
  }

  let payload: any;
  try { payload = JSON.parse(body); } catch {
    return new Response("OK", { status: 200 });
  }

  await processPayload(ctx, payload);
  await logWebhookEvent(ctx, eventType, "success");
  return new Response("OK", { status: 200 });
}
```

This eliminates ~80 lines of duplication across the 5 POST handlers.

### Improvement 2: Shared `syncTypeValidator`

See Critical Issue 2. Extract to `schema.ts`:
```typescript
export const syncType = v.union(
  v.literal("manual"), v.literal("cron"),
  v.literal("token_refresh"), v.literal("webhook")
);
```

Then use in both schema definition and `createSyncLog` args.

### Improvement 3: HMAC on GET menu

The plan says "Validate HMAC on empty string `""` (GET has no body)". GrabFood's actual spec sends the HMAC signature over the query string parameters, not the body. Verify against the GrabFood App Simulator docs whether GET requests include `X-Grab-Signature` header at all. If not, skip HMAC validation for GET entirely to avoid false rejections.

### Improvement 4: Use `actionToast` pattern in Plan 02

Per `CODE_STYLE.md`, success feedback should use `actionToast()`, not `toast.success()`. Plan 02 mentions "Show sonner toast 'HMAC secret saved'" and "sonner toast 'Copied!'". These should be `actionToast("HMAC secret saved", event)` and `actionToast("Copied!", event)` respectively, threading the click event through.

### Improvement 5: `resolveHmacSecret` typing

The plan uses `ctx: any` for the `resolveHmacSecret` helper. This should be properly typed:
```typescript
import type { ActionCtx } from "../_generated/server";
async function resolveHmacSecret(ctx: ActionCtx): Promise<string | undefined> { ... }
```

---

## 4. Refinements (Minor Suggestions)

- Plan 01 says "keep the existing `validateHmacSignature` function as-is (it works)" — the constant-time comparison comment says "best effort in JS". This is fine for now but consider using `crypto.timingSafeEqual` if available in the Convex runtime.
- The GET menu handler builds a complex JSON structure inline. Consider extracting a `buildGrabFoodMenuPayload(mappings, merchantID)` pure function for testability.
- Plan 02 webhook URLs section: `VITE_CONVEX_URL?.replace(".cloud", ".site")` is fragile. If the deployment URL format changes, this breaks silently. Add a fallback or validation: `if (!CONVEX_SITE_URL) show "Configure VITE_CONVEX_URL" message`.
- Plan 02: The "Sync Error Banner" queries the latest syncLog — but there's no query for this yet. Plan 02 should specify whether to use an existing query or create a new one. Currently `getLatestSyncTimestamp` only filters by `status: "success"`. A new query or filter adjustment is needed.

---

## 5. Duplication Analysis

### Existing Code to Leverage

| Existing Code | Location | How to Use |
|---------------|----------|------------|
| `validateHmacSignature()` | `convex/integrations/grabfood/webhooks.ts:16` | Already planned — keep as-is |
| `listProductMappingsInternal` | `convex/externalData/queries.ts:287` | Already planned — joins menuProduct data |
| `createSyncLog` | `convex/externalData/mutations.ts:105` | Already planned — add "webhook" syncType |
| `saveCredentials` pattern | `convex/platformCredentials/mutations.ts:15` | Reuse upsert pattern for `saveHmacSecret` |
| `formatCurrencyIDR` | `src/pages/GrabFoodManager.tsx:80` | Already exists in the page — use for price display |
| `useProtectedMutation` | `src/hooks/convex/useProtectedMutation.ts` | Use for `saveHmacSecret` call in frontend |

### Potential Duplication Risks

- **`saveHmacSecret` vs `saveCredentials`**: Both are admin-only upserts on `platformCredentials`. Consider whether `saveHmacSecret` should be a separate mutation or whether `saveCredentials` should be extended to accept optional `hmacSecret`. Separate mutation is cleaner since they serve different purposes (GoBiz credentials vs GrabFood webhook secret).
- **Webhook HMAC + syncLog pattern**: If BigSeller or future platforms also receive webhooks, the `handleWebhookCommon` helper (Improvement 1) becomes critical for avoiding duplication.

---

## 6. Phase/Wave Accuracy

| Phase/Task | Assessment | Notes |
|------------|------------|-------|
| Plan 01 Task 1: Schema + HMAC | ✅ Good | Clean separation, all schema changes in one task |
| Plan 01 Task 2: Webhooks + routes | ✅ Good | Depends correctly on Task 1 |
| Plan 02 Task 1: Backend mutation | ✅ Good | Small, isolated change |
| Plan 02 Task 2: UI changes | ⚠️ Needs detail | Missing query for sync error banner |

**Ordering Issues:**
- Plan 02 depends on Plan 01 (`depends_on: ["27.1-01"]`) — correct.
- Within Plan 01, Task 2 depends on Task 1 (schema changes needed first) — correct.

**Missing Tasks:**
- Plan 02 needs a query for the sync error banner. Either add a new task to create `getLatestWebhookError` query, or specify which existing query to reuse/modify.

---

## 7. Specialist Agent Recommendations

| Phase | Recommended Agent | Rationale |
|-------|-------------------|-----------|
| Plan 01 Task 1 (Schema + HMAC) | `convex-backend` | Pure schema/mutation work |
| Plan 01 Task 2 (Webhooks) | `convex-backend` | HTTP handlers + internal queries |
| Plan 02 Task 1 (Backend mutation) | `convex-backend` | Simple mutation |
| Plan 02 Task 2 (UI) | `react-ui-builder` | Tab UI, forms, clipboard |
| Post-implementation | `code-auditor` | Type check + pattern compliance |

---

## 8. Git Workflow Assessment

### Branch Strategy

| Assessment | Status |
|------------|--------|
| Feature branch specified | ❌ Missing — must add `feature/27.1-grabfood-webhooks` |
| Branch naming convention | ❌ Missing |
| Merge strategy documented | ❌ Missing |

### Commit Strategy

| Phase | Expected Commits | Commit Type | Notes |
|-------|------------------|-------------|-------|
| Plan 01 Task 1 | 1 | feat | Schema + HMAC query/mutation |
| Plan 01 Task 2 | 1 | feat | All 6 webhook handlers + routes |
| Plan 02 Task 1 | 1 | feat | updateProductMappingFields mutation |
| Plan 02 Task 2 | 1 | feat | Webhooks tab + Settings enhancement |

### Recommended Commit Checkpoints

1. After schema + HMAC mutation → `feat(grabfood): add HMAC secret to platformCredentials and webhook syncType`
2. After all 6 handlers → `feat(grabfood): implement 6 inbound webhook handlers with DB-sourced HMAC`
3. After backend mutation → `feat(grabfood): add updateProductMappingFields mutation`
4. After UI → `feat(grabfood): add Webhooks tab and Settings price/availability controls`

### Pre-Push Verification

- [ ] Plan includes `npm run build` check — ✅ (in `<verify>` blocks)
- [ ] Plan includes `npm run type-check` verification — ✅
- [ ] Plan includes local testing before push — ⚠️ No manual test plan

### CI/CD Considerations

| Concern | Assessment |
|---------|------------|
| Rollback strategy | ❌ Missing — should note Convex revert procedure |
| Deployment order | ✅ Correct — backend first (Plan 01), then frontend (Plan 02) |
| Data backup needed | No — additive schema changes only |
| Migration safety | ✅ Safe — all new fields are `v.optional()` |

### Git Workflow Issues Found

- No branch creation step specified
- No merge-to-main instructions after phase completes
- Missing CHANGELOG.md update requirement

---

## 9. Documentation Checkpoints

| Phase | Documentation Update Required |
|-------|-------------------------------|
| Plan 01 | `docs/SCHEMA.md` (new fields), `docs/API_REFERENCE.md` (6 endpoints), `docs/CHANGELOG.md` |
| Plan 02 | `docs/CHANGELOG.md` |

### CHANGELOG.md Entry (Draft)

```markdown
## 2026-02-26 - GrabFood Webhooks & Partner Configuration (Phase 27.1)

**Inbound webhook endpoints and admin configuration UI for GrabFood integration.**

- Add 6 GrabFood webhook endpoints (GET menu, POST order/order-state/menu-sync/integration-status/menu-push)
- Implement DB-sourced HMAC-SHA256 validation (secret from platformCredentials, not env vars)
- Add Webhooks tab to GrabFood Manager with HMAC secret field and copyable webhook URLs
- Add per-product GrabFood price and availability toggle in Settings tab
- Webhook events logged to externalSyncLogs with syncType "webhook"
- Order webhook is passive (log-only, no grabfoodOrders writes)

**Files Modified:**
- convex/schema.ts, convex/integrations/grabfood/webhooks.ts, convex/http.ts
- convex/platformCredentials/queries.ts, convex/platformCredentials/mutations.ts
- convex/externalData/mutations.ts
- src/pages/GrabFoodManager.tsx
```

---

## 10. Testing Plan Assessment

**Overall Testing Verdict:** Missing

### Planned Tests

| Layer | What's Tested | Test Type | Status |
|-------|---------------|-----------|--------|
| Backend | Webhook handlers | convex-test | ❌ Missing |
| Backend | HMAC validation | Unit test | ❌ Missing |
| Backend | saveHmacSecret mutation | convex-test | ❌ Missing |
| Backend | updateProductMappingFields | convex-test | ❌ Missing |
| Frontend | Webhooks tab render | Vitest + RTL | ❌ Missing |
| Integration | Full webhook → syncLog flow | Manual | ❌ Missing |

### Missing Test Coverage (Must Add)

| # | Missing Test | Why It Matters | Suggested Approach |
|---|--------------|----------------|-------------------|
| 1 | `validateHmacSignature` unit tests | Security-critical code — must verify correct/incorrect signatures | Pure function — test with known HMAC inputs |
| 2 | GET menu JSON structure | GrabFood has strict JSON format requirements | convex-test: seed mappings, call handler, validate JSON shape |
| 3 | `saveHmacSecret` auth + upsert | Admin-only mutation handling credentials | convex-test: verify non-admin rejection, create, update |
| 4 | `createSyncLog` with "webhook" syncType | New enum value must be accepted | convex-test: insert with "webhook" type |

### Test Execution Checkpoints

1. After Plan 01 Task 1: `npm run test` (existing tests still pass)
2. After Plan 01 Task 2: `npm run test` + manual curl to `/api/grabfood/menu`
3. After Plan 02: `npm run test && npm run build`

### Regression Risk

- `getHealthStatusAll` query has hardcoded `SyncLogEntry.syncType` type — webhook logs may cause TypeScript issues in health query
- Existing GrabFood adapter (`adapter.ts`) uses `listProductMappingsInternal` — new schema fields shouldn't break it (all optional) but verify

---

## 11. Edge Cases to Address

- [ ] What happens when HMAC secret is not yet configured but webhooks are hit? (Plan handles: skip validation with warning)
- [ ] What if `platformCredentials` record for "grabfood" doesn't exist when webhook fires? (Plan handles: `resolveHmacSecret` returns null → skip validation)
- [ ] GET menu with zero product mappings — should return valid empty menu JSON, not error
- [ ] GET menu with mappings that have no `menuProduct` linked — `grabfoodPrice` fallback to 0 is correct but may confuse GrabFood (consider filtering these out)
- [ ] Webhook body that exceeds Convex `text()` size limit — what's the max? (Convex http body limit is 20MB — unlikely to hit)
- [ ] `navigator.clipboard.writeText()` fails in non-HTTPS context — add try/catch with fallback
- [ ] Concurrent saves to HMAC secret — upsert pattern with `first()` has a TOCTOU race, but acceptable for admin-only operation

---

## 12. Approval Conditions

**For Approval, address:**
1. Fix `saveHmacSecret` to use `user.name` from `requireRole()` return value (Critical Issue 1)
2. Add `"webhook"` to `SyncLogEntry` type in `platformCredentials/queries.ts` (Critical Issue 2)
3. Specify or create query for sync error banner in Plan 02 (Section 6 missing task)

**Recommended before implementation:**
1. Extract shared webhook handler helper to reduce duplication (Improvement 1)
2. Create shared `syncType` validator in `schema.ts` (Improvement 2)
3. Use `actionToast()` instead of `toast.success()` (Improvement 4)
4. Add the missing Git Workflow and Documentation Update sections (Section 0)

---

*Generated by /staffreview skill*
*Staff Developer Review + Principal Developer Review*
