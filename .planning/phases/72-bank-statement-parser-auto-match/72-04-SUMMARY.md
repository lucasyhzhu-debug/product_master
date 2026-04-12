---
phase: 72
plan: 04
subsystem: bank-reconciliation-convex-api
tags: [convex, mutations, queries, admin-gate, dedup, reconciliation, seed]
requires:
  - "Plan 01: bankKeywordRules + bankStatements + bankStatementLines schema, 20 account refs in CoA"
  - "Plan 02: ParsedStatement contract from frontend parser + fileHash"
  - "Plan 03: classifyLine + findLinkedRecord + computeConfidence in matchEngine.ts"
provides:
  - "bankKeywordRules:seedDefaults — idempotent upsert of 26 canonical rules"
  - "bankKeywordRules:{create,update,deactivate} — admin-only CRUD"
  - "bankKeywordRules:{list,getById} — admin-only queries"
  - "bankStatements:createFromParsedStatement — atomic ingest + dedup + match-engine wiring"
  - "bankStatements:{listStatements,getStatement,listLines} — admin-only queries"
  - "convex/lib/auth.ts resolveSeederUserId — shared helper for future system seeds"
affects: []
tech-stack:
  added: []
  patterns:
    - "Upsert-by-ruleCode idempotency (mirrors accounts:seedDefaults pattern)"
    - "Fail-loud account ref resolution BEFORE any insert — zero partial-seed risk"
    - "Dual dedup (fileHash primary + accountNumber+period secondary) with PII masking on secondary error"
    - "Server-side reconciliation re-validation — untrusted client, T-72-19 mitigation"
    - "Inline match-engine execution per line + header matchedCount patch at end"
    - "WIB month derivation via getWibComponents — timezone-correct analytics buckets"
key-files:
  created:
    - convex/bankKeywordRules/defaultRules.ts
    - convex/bankKeywordRules/mutations.ts
    - convex/bankKeywordRules/queries.ts
    - convex/bankKeywordRules/__tests__/seed.test.ts
    - convex/bankStatements/mutations.ts
    - convex/bankStatements/queries.ts
    - convex/bankStatements/__tests__/mutations.test.ts
    - .planning/phases/72-bank-statement-parser-auto-match/72-04-SUMMARY.md
  modified:
    - convex/lib/auth.ts
decisions:
  - "resolveSeederUserId lives in convex/lib/auth.ts (shared helper) — reusable by future system-level seeds"
  - "seedDefaults remains a plain mutation (dashboard-callable) with optional token; CRUD uses protectedMutation"
  - "Server-side reconciliation re-validation runs BEFORE dedup-header-insert to guarantee atomicity on T-72-19"
  - "Secondary-dedup error masks accountNumber to last 4 digits only (PII protection)"
  - "WIB month derivation uses getWibComponents from periodRange.ts (no UTC-midnight misbucketing)"
  - "DEFAULT_RULES inlined as a TypeScript const (not JSON import) — type narrowing + IDE navigation + no resolveJsonModule tweak outside convex/"
  - "R01 pinned as the sole catch-all via data-integrity test (regression guard for T-72-14)"
metrics:
  completed: 2026-04-13
  tasks: 2
  files_modified: 1
  files_created: 7
---

# Phase 72 Plan 04: Convex API (rules seed + statement ingest) Summary

## One-liner

Shipped the admin-gated Convex surface for Phase 72 — 26-rule seed (idempotent, fail-loud on unresolved account refs), full CRUD for rules, and the atomic bank-statement ingest mutation that dedups (file-hash + period), re-validates reconciliation server-side (T-72-19), runs the Layer A + Layer B match engine inline per line, and persists full classification + proposal-JE fields without posting any journal entries (D-20). 75 green tests across seed / match engine / mutations.

## Commits

| # | Hash | Task | Message |
|---|------|------|---------|
| 1 | `703ebda5` | Task 1 | `feat(72-04): bankKeywordRules seed + CRUD (26 rules, admin-gated)` |
| 2 | `6b1eefe0` | Task 2 | `feat(72-04): bankStatements ingest + admin-gated queries (no JE posting)` |

## Public Exports — 10 functions across 4 API files

### `convex/bankKeywordRules/mutations.ts`

| Function | Auth | Purpose |
|---|---|---|
| `seedDefaults` | admin (optional token) | Upsert all 26 default rules; idempotent; fail-loud on unresolved account refs |
| `create` | admin (protectedMutation) | Insert a new rule; validates ruleCode against `/^[A-Z]\d{2}$/`; rejects duplicates |
| `update` | admin (protectedMutation) | Patch any field except `ruleCode` |
| `deactivate` | admin (protectedMutation) | Soft-delete: sets `isActive: false` |

### `convex/bankKeywordRules/queries.ts`

| Function | Auth | Purpose |
|---|---|---|
| `list` | admin (requireRole) | Return active rules sorted by priority DESC, ruleCode ASC (`includeInactive` optional) |
| `getById` | admin (requireRole) | Single-rule fetch |

### `convex/bankStatements/mutations.ts`

| Function | Auth | Purpose |
|---|---|---|
| `createFromParsedStatement` | admin (requireRole) | Atomic ingest of header + N lines with inline match-engine execution |

### `convex/bankStatements/queries.ts`

| Function | Auth | Purpose |
|---|---|---|
| `listStatements` | admin (requireRole) | 50 most-recent uploads, desc by createdAt |
| `getStatement` | admin (requireRole) | Single-header fetch |
| `listLines` | admin (requireRole) | All lines for a statement, optional status filter |

## How to run the seed from the Convex dashboard

1. First, ensure the CoA is seeded. If not already done:
   ```
   Dashboard → Functions → accounts:seedDefaults (no args)
   ```
2. Then run the bank rules seed:
   ```
   Dashboard → Functions → bankKeywordRules:seedDefaults (no args)
   ```

The seed is idempotent — subsequent runs patch existing rows with the current
`defaultRules.ts` values and never create duplicates. If any of the 20
expected `accounts.name` entries is missing, the mutation throws a
`ConvexError` listing the unresolved refs and aborts with zero inserts.

## Classification pipeline (per line, inside `createFromParsedStatement`)

```
  ParsedLine
    → classifyLine(line, activeRules)   // Layer A — pure
    → findLinkedRecord(ctx, line)       // Layer B — ctx-dependent
    → computeConfidence(rule, hintHit, linkage)
    → insert bankStatementLines with:
        - originalCategory / subCategory / plSection      (from rule)
        - matchedRuleId                                   (from rule)
        - jeDebitAccountId / jeCreditAccountId            (PROPOSALS only — D-20)
        - updatedCategoryAccountId                        (from rule)
        - linkedChannel                                   (from rule)
        - matchedType / matchedId                         (from Layer B)
        - confidence                                      (merged)
        - status / isAutoMatched                          (hasMatch ? auto_matched : unmatched)
        - matchMethod                                     (keyword | linked_to_record | unmatched)
        - month                                           (YYYY-MM in WIB)
        - flags                                           (from rule)
```

At the end of the loop the header is patched with the final `matchedCount`.

## Threat Model — mitigation evidence

| Threat ID | Mitigation applied in this plan |
|---|---|
| T-72-18 (Spoofing) | `requireRole(ctx, token, ["admin"])` on createFromParsedStatement + all 3 queries; CRUD uses `protectedMutation({ roles: ["admin"] })`. |
| T-72-19 (Tampering) | Mutation re-computes `sum(debit lines)` vs `reportedDebitTotal` + symmetric credit; throws ConvexError before any insert on mismatch. Two tests prove zero persistence after reject. |
| T-72-20 (Repudiation) | `uploadedBy = user._id` from verified token; `createdAt = Date.now()`; header immutable after insert (D-01). |
| T-72-21 (Info disclosure) | Secondary-dedup error masks accountNumber to last 4 (`.replace(/.(?=.{4})/g, "*")`). Test asserts full number does NOT appear in the thrown message. |
| T-72-22 (Info disclosure) | All 3 bankStatements queries + both bankKeywordRules queries gated on admin role. Kitchen-role token test rejected. |
| T-72-23 (Premature JE posting) | Zero imports of the journal-entry creator in mutations.ts (grep returns 0). Dedicated test confirms zero journalEntries rows after ingest. |
| T-72-24 (DoS) | `MAX_LINES = 5000` guard; test confirms ConvexError for 5001-line payload. |

## `resolveSeederUserId` — added helper

Added to `convex/lib/auth.ts` to unify the seeder-user-id resolution pattern
across system seeds:

```typescript
export async function resolveSeederUserId(
  ctx: MutationCtx,
  token?: string,
): Promise<Id<"users">>
```

- If `token` supplied → calls `requireRole(["admin"])` and returns that user's `_id`.
- If no token (dashboard path) → falls back to the first admin user (via `by_role` index).
- Throws `ConvexError` when neither path yields a user.

Reusable by any future system seed that needs to record `createdBy` / `updatedBy`
under both authenticated and dashboard invocations.

## Deviations from Plan

None — plan executed exactly as written. All acceptance greps and test counts matched.

## Known Stubs

None. Every function is a complete real implementation.

## Authentication Gates

None during implementation. Admin-gate enforcement is part of the feature itself
(exercised in tests with `createTestSession`-style helpers seeded in each test).

## Test counts

| Suite | Tests | Status |
|---|---|---|
| `convex/bankKeywordRules/__tests__/seed.test.ts` | 15 | PASS |
| `convex/bankStatements/__tests__/matchEngine.test.ts` (from Plan 03, still green) | 48 | PASS |
| `convex/bankStatements/__tests__/mutations.test.ts` | 12 | PASS |
| **Total for Phase 72 so far** | **75** | **PASS** |

Plan-04 specific breakdown:
- DEFAULT_RULES data integrity: 7 tests (count, catch-all uniqueness, code format, canonical codes, ref count, ref resolvability)
- seedDefaults integration: 5 tests (26-rule insert, idempotency, fail-loud, R02 resolution, non-admin reject)
- Rule CRUD: 3 tests (invalid ruleCode, duplicate ruleCode, happy-path create)
- createFromParsedStatement: 9 tests (happy path + R02 wiring, fileHash dedup, period dedup + mask, 5000 cap, non-admin reject, D-20 JE invariant, WIB boundary, debit recon mismatch, credit recon mismatch)
- Queries: 3 tests (list non-admin reject, list for admin, listLines status filter)

## Verification Evidence

- `npm run type-check` → **PASS** (clean)
- `npm run build` → **PASS** (clean)
- `npx vitest run convex/bankKeywordRules convex/bankStatements` → **PASS 75/75** in 1.72s

Acceptance greps (all satisfied):

| Check | Expected | Actual |
|---|---|---|
| `grep -c 'ruleCode: "R01"\|..."B02"' defaultRules.ts` | ≥6 | 6 |
| `grep -c "DEFAULT_ACCOUNT_REFS" defaultRules.ts` | ≥1 | 1 |
| `grep -c "unresolved" bankKeywordRules/mutations.ts` | ≥1 | 6 |
| `grep -c "resolveSeederUserId\|protectedMutation" bankKeywordRules/mutations.ts` | ≥4 | 9 |
| `grep -c "RULE_CODE_REGEX" bankKeywordRules/mutations.ts` | ≥1 | 2 |
| `grep -c "by_ruleCode" bankKeywordRules/mutations.ts` | ≥2 | 3 |
| `grep -c "requireRole" bankKeywordRules/queries.ts` | ≥2 | 4 |
| `grep -c "requireRole" bankStatements/mutations.ts` | ≥1 | 3 |
| `grep -c "requireRole" bankStatements/queries.ts` | ≥3 | 5 |
| `grep -c "by_fileHash" bankStatements/mutations.ts` | ≥1 | 2 |
| `grep -c "by_account_period" bankStatements/mutations.ts` | ≥1 | 1 |
| `grep -c "classifyLine" bankStatements/mutations.ts` | ≥1 | 2 |
| `grep -c "findLinkedRecord" bankStatements/mutations.ts` | ≥1 | 2 |
| `grep -c "5000\|MAX_LINES" bankStatements/mutations.ts` | ≥1 | 4 |
| `grep -c "reportedDebitTotal" bankStatements/mutations.ts` | ≥1 | 6 |
| `grep -c "createJournalEntryWithLines" bankStatements/mutations.ts` | **0 (strict)** | **0** |

## Schema additions beyond Plan 01

None. All required tables + indexes were provisioned in Plan 01. Notably:

- `bankKeywordRules.by_ruleCode` → used by seedDefaults upsert and create uniqueness check.
- `bankKeywordRules.by_active_priority` → used by `queries.list` and mutation's rule load.
- `bankStatements.by_fileHash` → primary dedup.
- `bankStatements.by_account_period` → secondary dedup.
- `bankStatements.by_createdAt` → queries.listStatements.
- `bankStatementLines.by_statement` + `.by_statement_status` → queries.listLines.

## Open Items for Plan 05

- UI wiring: upload page invokes `bankStatements:createFromParsedStatement` with the ParsedStatement produced by the plan-02 parser; surface the dedup + reconciliation errors cleanly in toast messages (both error categories contain specific marker strings like `"Already imported"`, `"already imported"`, and `"Reconciliation failed"` the UI can branch on).
- Rules admin page: wire `bankKeywordRules:list` + CRUD mutations; enforce the ruleCode regex client-side too for better UX.
- Plan 06 (journal posting): reads the `jeDebitAccountId` / `jeCreditAccountId` PROPOSALS and posts real journal entries on user confirmation.

## Self-Check: PASSED

**Files verified present:**
- `convex/bankKeywordRules/defaultRules.ts` — FOUND
- `convex/bankKeywordRules/mutations.ts` — FOUND
- `convex/bankKeywordRules/queries.ts` — FOUND
- `convex/bankKeywordRules/__tests__/seed.test.ts` — FOUND
- `convex/bankStatements/mutations.ts` — FOUND
- `convex/bankStatements/queries.ts` — FOUND
- `convex/bankStatements/__tests__/mutations.test.ts` — FOUND
- `convex/lib/auth.ts` — modified (resolveSeederUserId added)

**Commits verified in git log:**
- `703ebda5` (Task 1) — FOUND
- `6b1eefe0` (Task 2) — FOUND
