# Subscription Backend Consolidation — Spec (Phase D · Slice 0)

**Date:** 2026-06-24
**Status:** Draft — ready to plan. Predecessor **Phase B merged** (PR #192, `main @ 6a6466c4`); CI/CD green.
**Phase framing:** This is **Slice 0 of Phase D** — the behavior-preserving backend consolidation of the Phase B subscription/credit code, landed *before* the Phase D CRM surface (the existing rev-4 spec `2026-06-23-subscription-credit-system-phase-d-spec.md` → sub-phases D1/D2/D3) so the CRM read queries + timeline consume clean seams rather than duplicated ones.
**Origin:** the 5 refactors deferred during the Phase B `/simplify` pass (altitudes #1/#2/#3/#5 + reuse #1), confirmed by the user 2026-06-24.

This is a SPEC (WHAT + acceptance), not a PLAN. No task-by-task steps.

> **Prime directive — BEHAVIOR-PRESERVING.** Every refactor here is a consolidation: identical observable behavior before and after, proven by the existing test suite staying green plus new tests that pin the shared seam. Any place where a refactor would *change* behavior (e.g. a price now stripped that wasn't, a query that now returns different rows, a ledger scan that now misses a type) is a **defect**, not an improvement, and must be called out and avoided. The win is fewer call sites and one source of truth — NOT new functionality.

---

## 1. WHAT this slice delivers

Five backend consolidations of the merged Phase B code, each eliminating a duplicated pattern in favor of one shared seam:

| # | Refactor | Altitude | Core file(s) | Risk |
|---|----------|----------|--------------|------|
| R1 | Centralize `recognizeSubscriptionDelivery` into a shared delivery-recognition seam | #1 | `convex/orders/mutations/*`, `convex/subscriptions/recognition.ts` | **Medium-High** (5 call sites, mutation side-effect, no existing hook) |
| R2 | Centralize the subscription price-strip into one `fetchOrdersStripped` wrapper | #2 | `convex/orders/queries.ts`, `convex/orders/helpers/stripSubscriptionPricing.ts` | **High** (8 query consumers, varied fetch shapes, confidential-data leak risk) |
| R3 | Add `creditLedger.by_type` index + switch the unbounded scans to it | #3 | `convex/schema.ts`, `convex/reports/incomeStatement.ts` | **Low-Medium** (index add + 2 scan call sites) |
| R4 | Extract one `buildInvoiceSnapshot` helper for weekly + top-up invoices | #5 | `convex/subscriptions/invoicing.ts` | **Low** (2 call sites, pure object construction) |
| R5 | Extract a shared `accumulateOrderCogs` helper (reuse #1) | reuse #1 | `convex/lib/costCalculator.ts`, `convex/reports/incomeStatement.ts` | **Low** (1 adoptable call site + future invoicing) |

**In scope:** the 5 refactors, their unit/integration tests, codegen regen, CHANGELOG/API_REFERENCE/FILE_MAP doc updates.

**Explicitly OUT (later Phase D slices / other phases):**
- The **CRM surface** — `/crm` customer dashboard, activity timeline, agreements, drawdown chart, breadcrumbs (existing rev-4 Phase D spec → D1/D2/D3). This slice only cleans the backend those pages will read.
- **Telegram reminders + rule enforcement** — Phase E.
- Any **new** ledger type, invoice kind, order status, or recognition trigger. No new behavior.
- Performance work beyond R3's index (no new caching, no denormalization).

---

## 2. Per-refactor specification

### R1 — Centralize delivery recognition (altitude #1)

**Current state (grounded):** `recognizeSubscriptionDelivery(ctx, orderId, createdBy?)` (`convex/subscriptions/recognition.ts:37`) is called from **5 sites**, with no shared seam between them:

| Site | file:line | Routes through a hook? | `createdBy` passed |
|------|-----------|------------------------|--------------------|
| `completeOrder` | `convex/orders/mutations/orderCrud.ts:441` | No — direct call after status patch | No (falls back to `order.createdByUserId`) |
| `completePackaging` | `convex/orders/mutations/packaging.ts:235` | No — direct call after status patch | No |
| `updateStatus` (deprecated) | `convex/orders/mutations/statusUpdates.ts:227` | Guarded `newStatus==="AwaitingDelivery" && old!==` | Yes (`args.userId`) |
| `moveForward` (primary) | `convex/orders/mutations/statusUpdates.ts:536` | Guarded `nextStatus==="AwaitingDelivery"` | Yes (resolved from token) |
| `forceComplete` | `convex/orders/mutations/statusUpdates.ts:759` | Intentional bypass (force-complete skips the normal edge) | Yes (`user._id`) |

**Finding:** there is **no existing "shared status-transition hook"** in `convex/orders`. `moveForward` is the de-facto primary handler; `completeOrder`/`completePackaging`/`forceComplete` bypass it. The recognition call + its idempotency are duplicated as bare calls at 5 sites; each site independently knows "transition-to-delivered → recognize."

**Decision (DD-R1) — RESOLVED (staffreview C1/QR1):** A thin rename that leaves 5 direct callers is a no-op, not centralization. R1's concrete, defensible win is **uniform author resolution**: today **2 of the 5 sites omit `createdBy`** (`completeOrder` `orderCrud.ts:441` and `completePackaging` `packaging.ts:235` call `recognizeSubscriptionDelivery(ctx, args.orderId)` with no author and lean on the in-function `order.createdByUserId` fallback), while the other 3 (`statusUpdates.ts:227/536/759`) pass the acting user. That inconsistency means delivery-recognition ledger entries are authored differently depending on which mutation fired.

R1 introduces `recognizeOnDelivery(ctx, orderId, { actingUserId })` in `recognition.ts` that **requires** an explicit `actingUserId` and is the **single** recognition entry point all 5 sites call. The win is: (1) one documented entry point, (2) every site now passes the acting user the same way (the 2 omitting sites resolve their session user and pass it), removing the silent author divergence. The seam does NOT absorb the per-mutation edge decision and does NOT duplicate the idempotency / non-subscription guards (those stay inside `recognizeSubscriptionDelivery`, which the seam calls).

**Explicitly rejected:** a heavier `applyForwardTransition` hook that all forward status mutations route through (so `completeOrder`/`completePackaging` stop hand-rolling their status patch). That is real centralization but a much larger blast radius (every forward transition, not just recognition) — out of scope for this behavior-preserving slice. If R1's author-resolution win is judged too thin to warrant a new function, the fallback is to keep `recognizeSubscriptionDelivery` and add a single AC that all callers pass `actingUserId` — but the new-function form is preferred for the documented single entry point.

**Acceptance:**
- AC-R1.1 Exactly one function (`recognizeOnDelivery`) is the recognition entry point; all 5 sites call it; `grep recognizeSubscriptionDelivery` shows it called ONLY from inside the seam.
- AC-R1.2 `forceComplete`'s intentional bypass semantics are preserved — it still recognizes orders that skip the BeingPrepared→AwaitingDelivery edge (the seam adds NO edge guard).
- AC-R1.3 Idempotency (one drawdown per order) and the IMP-5 under-funded-pool warn-not-drop behavior are byte-for-byte preserved.
- AC-R1.4 **All 5 sites now pass an explicit `actingUserId`** — `completeOrder` and `completePackaging` resolve their session user (matching how `moveForward` does) rather than relying on the `order.createdByUserId` fallback. The fallback stays inside `recognizeSubscriptionDelivery` as a defensive last resort but is no longer the normal path for those 2 sites. This is the one *intended* observable change (ledger author), and it is an improvement, not a regression — flag it in the CHANGELOG.
- AC-R1.5 Existing recognition tests pass; a new test asserts the seam no-ops for non-subscription orders and is idempotent.

### R2 — One `fetchOrdersStripped` wrapper (altitude #2)

**Current state (grounded):** `stripSubscriptionPricing(order, items, role)` (`convex/orders/helpers/stripSubscriptionPricing.ts`) is called inline in **8+ query functions** in `convex/orders/queries.ts` (`list`, `listPaginated`, `get`, `getByOrderNumber`, `getKitchenOrders`, `getByCustomer`, `getPackagingOrders`, `getCompletedToday`, `listForKanban`). Each repeats: fetch orders (by varied shape) → optionally fetch items → call strip → return. The strip nulls order-level (`totalAmount`, `finalTotal`, `totalMargin`, `totalCost`) and item-level (`unitPrice`, `lineTotal`, `lineMargin`, `lineCost`) money for non-managers on subscription orders only.

**Fetch-shape variance (why this is the hard one):** the 8 consumers use `withIndex("by_status")`, `.paginate()`, `withIndex("by_order_number")`, `withIndex("by_customer")`, `withIndex("by_kitchen_visible")`, batch helpers (`fetchOrdersWithItemsAndProduction`), and some skip items entirely. A single wrapper must NOT try to absorb all fetch strategies (that becomes a god-function).

**Decision (DD-R2) — RESOLVED (staffreview QR2):** the consolidation target is the **strip application + role gate**, NOT the fetch. Verified: all 10 strip calls live in `queries.ts` (`kanbanBuilders.ts` only references the helper in a comment), so the duplication is already single-file. Introduce a **post-fetch normalizer** the consumers funnel their already-fetched rows through — keeping the user's `fetchOrdersStripped` intent but scoped to stripping, not fetching:

```
stripOrders<O, I>(role, orders, itemsByOrder?) → { orders, itemsByOrder }   // batch form
stripOrder<O, I>(role, order, items?) → { order, items }                    // single form
```

It MUST stay **generic over item shape** (`<O, I>`) — verified the 10 sites pass three distinct item types: plain `items`, empty `[]`, production-enriched `itemsWithProduction` (`:399`), and menu-enriched `enrichedItems` (`:735`). `stripSubscriptionPricing` is already generic; the batch seam must preserve that or it rejects the enriched shapes. Each query keeps its own fetch (its index choice is intrinsic); the **strip is applied in exactly one shared place** that gates by role once and calls the existing `stripSubscriptionPricing` per row. This kills the 10× inline repetition + divergence risk without a fetch-shape mega-enum. **Rejected:** a fetch-owning `fetchOrdersStripped(ctx, {shape, role})` (agent-proposed enum dispatch) — higher risk, re-routes 8 queries through one polymorphic fetcher for no duplication win.

> **Behavior-preserving protocol (staffreview C2/QR5) — the refactor and any leak-fix are SEPARATE:**
> 1. The R2 **refactor is strictly behavior-preserving**: it reproduces *today's* stripping exactly, leak-for-leak. A **characterization test captures current behavior at all 10 call sites FIRST** (red→green), then the seam keeps it green. The refactor must NOT, on its own, change what any role sees.
> 2. If the refactor surfaces a genuine **confidential-pricing leak** (a surface that today fails to strip for a non-manager), fixing it is **in-bounds for this slice but is a DISTINCT task** — its own commit, its own test asserting the *new* stripped behavior, its own CHANGELOG line flagged as a **security fix**. It is NOT folded into the refactor's ACs. This keeps the refactor reviewable and surfaces the security change loudly.

**Acceptance:**
- AC-R2.1 Exactly one shared strip seam; all 10 call sites in `queries.ts` call it; no inline `stripSubscriptionPricing(...)` remains outside the seam (grep-enforced in the verification wave).
- AC-R2.2 **Behavior-preserving:** a characterization test pins TODAY's output (money fields nulled-or-not) at all 10 surfaces × {manager, non-manager} × {subscription, non-subscription}; the seam keeps every assertion green. The refactor changes no role's visible output.
- AC-R2.3 The seam is generic over item shape — plain, empty, production-enriched, and menu-enriched item arrays all pass through unchanged in their non-money fields.
- AC-R2.4 Paginated (`listPaginated`) and items-less (`getByCustomer`) shapes still work — the seam tolerates "no items."
- AC-R2.5 No change to which rows are returned, ordering, or any non-money field.
- AC-R2.6 (Conditional, only if a leak is found) Any leak-fix lands as a separate task/commit/test/CHANGELOG entry per the protocol above — never inside AC-R2.1–R2.5.

### R3 — `creditLedger.by_type` index (altitude #3)

**Current state (grounded):** `creditLedger` (`convex/schema.ts:2584`) has indexes `by_subscriptionWeek`, `by_subscription`, `by_order`, `by_invoice` — **no `by_type`**. `type ∈ {topup, drawdown, expiry, refund, adjustment}`. The costly scans are in `convex/reports/incomeStatement.ts:926-935`: two **unbounded full-table scans** —
```
db.query("creditLedger").filter(q => q.eq(q.field("type"), "drawdown")).collect()
db.query("creditLedger").filter(q => q.eq(q.field("type"), "expiry")).collect()
```
filtered by `type` with **no narrowing predicate** (across all subscriptions/weeks/time). All other `type` filters are per-week and already use `by_subscriptionWeek` then a cheap in-memory `.some/.filter` (recognition.ts:82, reconcile.ts:65) — those are NOT bottlenecks.

**Decision (DD-R3):** add `.index("by_type", ["type"])` and switch the two incomeStatement scans to `withIndex("by_type", q => q.eq("type", "drawdown"|"expiry"))`. Do **not** add a compound `by_subscriptionWeek_type` — the per-week loops are small and already indexed; adding an unused index is churn.

> **Caveat CR3 (RESOLVED — staffreview I1):** `by_type` removes the *full-table* scan but the income-statement query is still **unbounded over time** — it reads every drawdown/expiry row ever written, then filters by period in memory downstream. It is a strict improvement (index-range over a type partition vs whole-table scan) but NOT a period-bounded fetch. **Cardinality note:** `type` has only 5 values and `drawdown` is the dominant one, so the drawdown partition approaches table size over time — the real bound is "all-drawdowns-ever," fixable only by period-bounding the income-statement ledger query (out of scope; would change the query contract). **Do NOT** attempt a `_creationTime` range shortcut on the index: Convex appends `_creationTime` to every index, but recognition attributes revenue by the order's `deliveryDate`, NOT `_creationTime`, so a `_creationTime` range would silently drop or misattribute rows. The plan must state this is a scan-narrowing win only.

**Acceptance:**
- AC-R3.1 `creditLedger` has a `by_type` index; `npx convex codegen` regenerates cleanly.
- AC-R3.2 The two incomeStatement scans use `withIndex("by_type", ...)`; no remaining `.filter(q => q.eq(q.field("type"), ...))` post-scan on `creditLedger`.
- AC-R3.3 Income-statement output (B2B Wholesale revenue total) is **bit-identical** before/after — same rows, same numbers. Pinned by an existing or new incomeStatement test.
- AC-R3.4 No other `creditLedger` query is changed (the per-week `by_subscriptionWeek` scans stay as-is).

### R4 — `buildInvoiceSnapshot` helper (altitude #5)

**Current state (grounded):** `createSubscriptionWeeklyInvoice` (`invoicing.ts:72-105`) and `buildTopupInvoice` (`invoicing.ts:260-293`) construct **near-identical** invoice insert objects. The 14 snapshot fields (seller ×6, bank ×3, buyer ×5) + `status`/`orderDate`/`generatedAt`/`updatedAt`/`subtotal`/`finalTotal`/`paymentStatus` are identical; both fetch `businessSettings` + default `bankAccount` identically (lines 66-69 vs 254-257). They differ only in: `invoiceKind`, `orderNumber` prefix (`WEEK-` vs `TOPUP-`), `generatedBy` source, and the `items` origin.

**Decision (DD-R4) — RESOLVED (staffreview C3):** extract `buildInvoiceSnapshot(ctx, { week, sub, customer, invoiceKind, orderNumber, invoiceNumber, items, generatedBy })` returning the full invoice insert object (seller/bank/buyer snapshot + common fields + computed `subtotal`/`finalTotal`). **The caller allocates `invoiceNumber` via `getNextInvoiceNumber(ctx)` and passes it in** — the helper performs NO `ctx.db` *writes* and does not touch the sequential invoice counter, keeping it a pure-ish builder (it MAY read `businessSettings`/default `bankAccount`, which both callers do identically — dedupe those reads inside the helper). This preserves R4's "Low risk / pure construction" characterization and keeps counter-allocation + idempotency reasoning local to each caller. The helper does NOT insert and does NOT patch the week — callers keep their distinct post-insert steps (weekly patches `weeklyInvoiceId`+status; topup does not).

**Acceptance:**
- AC-R4.1 One helper produces the snapshot; both call sites use it; the 14 shared fields exist in exactly one place.
- AC-R4.2 `buildInvoiceSnapshot` performs **no `ctx.db` writes** and does not call `getNextInvoiceNumber` — the caller allocates `invoiceNumber` and passes it in.
- AC-R4.3 Resulting invoice docs are field-identical to today for both weekly and top-up (pinned by an invoicing test asserting the full inserted shape for each kind).
- AC-R4.4 Weekly still patches `week.weeklyInvoiceId` + `status:"invoiced"`; topup still changes no week status. Idempotency of `createSubscriptionWeeklyInvoice` (early return of existing `weeklyInvoiceId` BEFORE any snapshot build or invoice-number allocation) preserved.

### R5 — `accumulateOrderCogs` helper (reuse #1)

**Current state (grounded):** COGS for an order's items is resolved in two near-identical places in `convex/reports/incomeStatement.ts`: **Site A** `resolveItemsCOGS()` (lines 214-267, external-revenue items) and **Site B** the `resolveOrderCogs` lambda (lines 981-997, subscription B2B order items). Both loop items → `cogsMap.get(productId)` → accumulate `production/packaging/total` × `quantity`. Both build on `buildProductCOGSMap` (`convex/lib/costCalculator.ts:148`).

**Decision (DD-R5):** extract `accumulateOrderCogs(items, cogsMap)` into `convex/lib/costCalculator.ts` and adopt it **at Site B only**. **Site A CANNOT adopt it** — it additionally tracks unmapped products (gap analysis), builds `ProductDetail[]` structs, downgrades channel confidence, and reads `linkedMenuProductId` (not `menuProductId`). Forcing Site A through a shared helper would need a callback-heavy signature that fragments more than it unifies.

> **Honest-scope note NR5:** this is the narrowest refactor — it removes ONE duplicated lambda, not a sweeping dedupe. Worth doing (it's the canonical "resolve order COGS" computation, and future B2B invoicing COGS will reuse it), but the plan must not over-claim it unifies Site A.

**Acceptance:**
- AC-R5.1 `accumulateOrderCogs(items, cogsMap)` exists in `costCalculator.ts` with the exact Site-B semantics: skip `isCancelled`, skip missing `menuProductId`, skip rows with no `cogsMap` entry, accumulate `production/packaging/total` as integer IDR.
- AC-R5.2 Site B uses it; B2B Wholesale COGS in the income statement is bit-identical before/after.
- AC-R5.3 Site A is left untouched (documented why).
- AC-R5.4 A unit test pins `accumulateOrderCogs` (cancelled-skip, missing-product-skip, multi-item sum).

---

## 3. Cross-cutting constraints

- **C1 — Behavior-preserving:** full existing test suite (`npm run test`) green; new tests added per AC above. `npm run build` (tsc + vite) passes. **Test surfaces (staffreview I4):** all tests use `convex-test` + vitest. R2 extends the existing `convex/orders/helpers/__tests__/stripSubscriptionPricing.test.ts` plus per-query characterization tests; R1 extends the recognition test; R3 + R5 use a golden-value income-statement test asserting the B2B Wholesale total is bit-identical before/after; R4 asserts the full inserted invoice shape per kind.
- **C2 — Codegen:** R3 adds an index → `npx convex codegen` MUST run and `convex/_generated/api.d.ts` committed (recurring Phase-76/81 lesson: stale generated files = silent CI break).
- **C3 — No new wire data:** none of these refactors change what crosses the network except R2's *guarantee* that stripping is applied consistently (which can only ADD stripping where a leak existed — that's a fix, flag it if found).
- **C4 — Lint:** respect `no-restricted-imports` (Pitfall #18) — use canonical helpers; new helpers live beside their domain (`costCalculator.ts`, `recognition.ts`, `invoicing.ts`, `queries.ts`/`helpers/`).
- **C5 — Order dual-surface (Pitfall #20):** R2 touches order queries that feed BOTH `OrderSlideOver` and `OrderDetail`; verify both surfaces still render correctly for manager + non-manager.

---

## 4. Open questions — RESOLVED at spec staffreview (2026-06-24)

- **QR1 ✅** R1: thin seam vs heavy hook → **thin `recognizeOnDelivery` seam, win = uniform author resolution** (see DD-R1). Heavy `applyForwardTransition` hook explicitly rejected.
- **QR2 ✅** R2: centralize strip-application only (NOT fetch) → **confirmed** (DD-R2). Fetch-owning wrapper rejected.
- **QR3 ✅** R3: `by_type` simple index is enough; compound `by_subscriptionWeek_type` explicitly declined (per-week scans already cheap + indexed).
- **QR4 ✅** Sequencing: **R3 then R5 serialize on `incomeStatement.ts`** (disjoint regions ~928/933 vs ~981-997, but same file — same agent or strictly sequential, NO parallel writes; re-run `npx convex codegen` once after R3's index lands). R1 (order mutations) and R2 (order queries) are disjoint → parallelizable. R4 (`invoicing.ts`) independent. **Critical path = R3 → codegen → R5.** Plan's wave map must encode this.
- **QR5 ✅** R2 leak handling → **refactor is strictly behavior-preserving; any discovered leak ships as a SEPARATE task/commit/test/CHANGELOG flagged as a security fix** (DD-R2 protocol). The two are never conflated.

## 5. Success criteria

- [ ] All 5 refactors landed, each behavior-preserving per its ACs.
- [ ] `npm run type-check`, `npm run build`, `npm run test` all pass.
- [ ] `npx convex codegen` clean; `_generated` committed.
- [ ] No inline `stripSubscriptionPricing` outside the R2 seam; no post-scan `.filter` on `creditLedger.type`; one recognition entry point; one invoice-snapshot builder; one `accumulateOrderCogs`.
- [ ] CHANGELOG + API_REFERENCE + FILE_MAP updated at merge time.
- [ ] CRM surface (D1/D2/D3) explicitly deferred, not started.
