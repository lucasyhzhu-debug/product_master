---
phase: quick-7
verified: 2026-02-17T00:00:00Z
status: human_needed
score: 3/4 must-haves verified (1 requires human action)
re_verification: false
human_verification:
  - test: "Run seedGoBizOutlets from Convex dashboard Functions tab"
    expected: "Return value shows { created: ['Legato Goldfinch (G293156297)', 'GoFood Crystal (G347061572)', 'Legato Tamtem (G958262444)'], skipped: [] } on first run (or all 3 in skipped if already seeded)"
    why_human: "Cannot inspect live database records from code. The mutation code is verified correct, but actual DB state requires dashboard invocation."
  - test: "Navigate to /dispatch-planner in the running app"
    expected: "GoFood channel section shows 3 outlet rows: Legato Goldfinch, GoFood Crystal, Legato Tamtem. Future day cells are editable (click opens number input)."
    why_human: "Depends on DB records existing (Truth 1). The query wiring is verified correct, but visual rendering requires a running app with seeded data."
---

# Quick Task 7: Verify and Seed GoBiz External Outlets — Verification Report

**Task Goal:** Convert seedGoBizOutlets from internalMutation to public mutation with admin auth so it can be called from Convex dashboard to seed 3 gobiz externalOutlets records.
**Verified:** 2026-02-17
**Status:** human_needed — automated code checks pass; DB seeding and UI rendering require human action.
**Re-verification:** No — initial verification.

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | "The externalOutlets table contains 3 records with source='gobiz': Legato Goldfinch (G293156297), GoFood Crystal (G347061572), Legato Tamtem (G958262444)" | ? HUMAN NEEDED | Cannot inspect live DB from code. Mutation code is correct and will create these records when run. |
| 2 | "The seedGoBizOutlets function is callable from the Convex dashboard (not an internalMutation)" | VERIFIED | `convex/integrations/gobiz/mutations.ts` line 14: `export const seedGoBizOutlets = mutation({` — not internalMutation. Commit `65a7d60`. |
| 3 | "Running seedGoBizOutlets a second time is safe (idempotent — skips existing outlets)" | VERIFIED | Handler queries `by_source_external_id` index before inserting. Pushes to `skipped[]` array if record exists, continues without insert. |
| 4 | "The GoFood channel section in Dispatch Planner at /dispatch-planner shows all 3 gobiz outlet rows" | ? HUMAN NEEDED | Query wiring verified: `assembleGofoodChannel` queries `externalOutlets` with `by_source` index and `q.eq("source", "gobiz")`. Actual rendering depends on DB records existing (Truth 1). |

**Score:** 2/4 truths fully verified by code inspection. 2/4 require human verification (both blocked on DB state). Code infrastructure supporting all 4 truths is verified correct.

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `convex/integrations/gobiz/mutations.ts` | Public mutation for seeding gobiz outlets, callable from Convex dashboard; exports `seedGoBizOutlets` | VERIFIED | Exists, 51 lines, non-stub. Uses `mutation({` (line 14). Imports: `mutation` (line 1), `v` (line 2), `requireRole` (line 3), `GOBIZ_OUTLET_SEED` (line 4). Has `token: v.string()` arg, admin auth guard, idempotent loop over all 3 outlets, returns `{ created, skipped }`. |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `convex/integrations/gobiz/mutations.ts` | `convex/integrations/gobiz/config.ts` | `GOBIZ_OUTLET_SEED` import — iterates all 3 outlets | VERIFIED | Line 4: `import { GOBIZ_OUTLET_SEED } from "./config"`. Lines 22-22: `for (const outlet of GOBIZ_OUTLET_SEED)`. config.ts exports `GOBIZ_OUTLET_SEED` array with all 3 outlets (G293156297, G347061572, G958262444). |
| `convex/dispatchPlanner/queries.ts` | `convex/schema.ts externalOutlets` | `assembleGofoodChannel` queries `externalOutlets` by `by_source` index with `source='gobiz'` | VERIFIED | Line 406-408: `.query("externalOutlets").withIndex("by_source", (q) => q.eq("source", "gobiz"))`. Schema line 1076: `.index("by_source", ["source"])` on externalOutlets table. |

---

### Schema Index Verification

| Index | Table | Status | Details |
|-------|-------|--------|---------|
| `by_source_external_id` | `externalOutlets` | VERIFIED | Schema line 1077: `.index("by_source_external_id", ["source", "externalId"])` — used by mutation for idempotency check. |
| `by_source` | `externalOutlets` | VERIFIED | Schema line 1076: `.index("by_source", ["source"])` — used by `assembleGofoodChannel` to fetch gobiz outlets. |

---

### Anti-Patterns Found

No anti-patterns detected.

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | — | — | No issues |

The implementation is substantive (not a stub). The handler:
- Guards with real admin auth (`requireRole`)
- Queries DB for existing records before inserting (idempotent)
- Inserts real records with all required fields (`source`, `externalId`, `name`, `isActive`, `createdBy`, `createdAt`)
- Returns structured result (`{ created, skipped }`)

---

### Human Verification Required

#### 1. Seed the Database

**Test:** Deploy updated code, open Convex dashboard Functions tab, find `integrations/gobiz/mutations` > `seedGoBizOutlets`, run with args `{ "token": "<your-admin-token>" }`.
**Expected:** Return value `{ "created": ["Legato Goldfinch (G293156297)", "GoFood Crystal (G347061572)", "Legato Tamtem (G958262444)"], "skipped": [] }` on first run. If outlets already exist, all 3 appear in `skipped` — also acceptable.
**Why human:** Live database state cannot be inspected from code. The mutation implementation is verified correct; only the actual DB insertion is unverified.

#### 2. Verify GoFood Channel in Dispatch Planner

**Test:** After seeding, navigate to `/dispatch-planner` in the app.
**Expected:** GoFood channel section shows 3 outlet rows: Legato Goldfinch, GoFood Crystal, Legato Tamtem. Clicking a future day cell opens a number input (editable).
**Why human:** Visual rendering and interactivity require a running app with seeded DB data. Query wiring is verified correct in code.

---

### Gaps Summary

No code gaps. The automated portion of the task is fully complete and correct:

- `convex/integrations/gobiz/mutations.ts` is a proper public `mutation` with admin auth (not `internalMutation`)
- All 3 outlet seed records are defined in `GOBIZ_OUTLET_SEED` and will be created when the mutation runs
- The idempotency logic is correct (skips existing records by `by_source_external_id` index)
- The `assembleGofoodChannel` query wiring in dispatch planner is correctly set up to read gobiz outlets

The only remaining work is the human action: running `seedGoBizOutlets` from the Convex dashboard to actually insert the 3 records into the live database. This was always the intended human-action checkpoint (Task 2 in the plan).

---

_Verified: 2026-02-17_
_Verifier: Claude (gsd-verifier)_
