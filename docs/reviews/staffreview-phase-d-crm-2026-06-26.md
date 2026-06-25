# Staff Review — Phase D CRM Surface

**Range:** `6168c016..ec4c0263` · **Date:** 2026-06-26 · **Reviewer:** staff/principal pass
**Scope:** plan-to-implementation fidelity, architecture, consistency, over/under-engineering, prod risk.

---

## Summary

Phase D delivers the manager+admin `/crm` surface (home, customer dashboard, subscription page, agreement page, activity timeline, credit-ledger statement, drawdown chart, week back-references) as additive code over existing tables, plus the three Phase-B UAT nits (U1/U3/U4). The build is green, tests are co-located and substantial (~12.3k LOC added, ~half tests), and the work is faithful to the plan's task list (T1–T30) and to the CRM Design Principles — windowed reads (C9), derived-pool money (C10), bidirectional links (A4), server-side type filter intent (B8), strip-don't-hide via m+a-only queries (D11), and designed empty/loading states (D12).

The two sanctioned deviations are both appropriate. The additive indexes (`orders.by_customer_orderDate`, `invoices.by_customer_generatedAt`, `creditLedger.by_subscription_creationTime`) are the correct response to the C9 review — they bound the timeline scans at the DB layer rather than collecting full history. They are purely additive, need no migration, and are documented in SCHEMA.md. `getFundingDashboard.customerPhone` is a clean additive field on an already-m+a query, enabling the wa.me dunning link without a leak.

No Critical issues. The substantive findings are a **timeline windowing-by-anchor-date correctness gap** (recent state-change events on older parent rows silently vanish), a **dead subtype-override path** (the `funded`/`reconcile` icon overrides never render), and **duplicated hand-maintained maps** (the backend `CATEGORY_DIRECTION` mirror and ~5 copies of `STATUS_BADGE`/`STATUS_LABEL`) that are drift risks. None block merge; all are worth a fast follow.

---

## Critical Issues

None. No auth gaps (every `convex/crm/**` registration is `roles: ["manager","admin"]`, superset of `canAccessCrm` — Pitfall #19 clean), no schema-data ordering hazards (additive-only), no unbounded `.collect()` on a hot path.

---

## Improvements

### I1 — Timeline anchors on the parent's creation/business date, not the event date (correctness gap)
`getCustomerTimeline` windows each source by the *parent row's* anchor date: orders by `orderDate ≥ cutoff`, invoices by `generatedAt ≥ cutoff`, ledger by `_creationTime ≥ cutoff`. But it then emits *state-change* events keyed on a different timestamp:
- `payment_funded` uses `inv.updatedAt`
- `order_delivered` uses `o.completedAt`
- `subscription_ended` uses `sub.endDate`

Consequence: an invoice **generated 20 days ago but paid today** is excluded by `generatedAt ≥ cutoff(14d)`, so its `payment_funded` event — which happened *today* — never appears in the feed. The activity timeline (B7 "what happened") is exactly where "paid today" must show. The code comments acknowledge this for `order_delivered` ("acceptable for the 14d default since orders reach terminal status within days"), which is defensible for orders, but payment lag on subscription invoices is normal and the omission is silent. This is the classic window-by-wrong-date bug. Options: widen the invoice/order fetch bound to also catch rows whose `updatedAt`/`completedAt` is in-window, or accept it and document the limit prominently in the UI ("shows events for items active in the last N days"). At minimum, flag for prod watch.

### I2 — Subtype icon override is dead on the timeline (plan under-delivery)
`crmActivityTaxonomy.getActivityVisual(category, subtype?)` and its `SUBTYPE_ICON` map (`funded → ✓`, `reconcile → ⚖`) exist and are unit-tested, and the plan (T22) specified `getActivityVisual(eventTypeToCategory(item.eventType), item.subtype)`. But the timeline never threads `subtype` through: the backend `TimelineItem` projection (timeline.ts) sets no `subtype`, `timelineMerge.TimelineItem` has no `subtype` field, and `TimelineItem.tsx:69` calls `getActivityVisual(category)` with no subtype. So `payment_funded`, `week_reconciled` etc. all render the generic category icon; the override branch is unreachable in production and only exercised by tests. Either thread `subtype` end-to-end (backend projection → TimelineItem type → component) or delete the override machinery as YAGNI. Right now it is tested dead code that gives false confidence the distinction ships.

### I3 — `CATEGORY_DIRECTION` (backend) duplicates `ACTIVITY_TAXONOMY.direction` (frontend) with no shared source or parity test
`convex/crm/timeline.ts` hand-maintains `CATEGORY_DIRECTION: Record<ActivityCategory, …>` to stamp `direction` onto each `customerActivity` row, while `src/lib/crmActivityTaxonomy.ts` independently carries `direction` inside `ACTIVITY_TAXONOMY`. They are identical today but are two hand-kept maps over the same category set with nothing pinning them together — the exact single-source discipline B6 was created to avoid. The shared module `convex/lib/activityEvents.ts` (already imported by both runtimes) is the natural home: add `CATEGORY_DIRECTION` there once and import it in both places. Worse, the stamped `direction` is **write-only for the timeline**: the read path (`TimelineItem.tsx`) re-derives the visual (and thus direction) from category via `getActivityVisual`, ignoring the stored field. So the backend map exists only to populate a column the timeline never reads. Consolidate into `activityEvents.ts`; drop the backend mirror.

### I4 — `STATUS_BADGE` / `STATUS_LABEL` re-declared across ~5 CRM pages
Week-status and subscription/payment-status → Tailwind-class maps are hand-rolled separately in `CrmHome.tsx`, `CrmFundingDashboardPage.tsx`, `SubscriptionPage.tsx`, `SubscriptionSchedulePage.tsx`, `SubscriptionWeeklyInvoicePage.tsx`, and `AgreementPage.tsx`. The week-status palette in particular is duplicated 4×. (Some predate Phase D, but the new pages re-copied rather than extracted.) A status recolor or a new week status must be updated in every copy or the surfaces diverge — the same failure mode B6 forbids for the activity taxonomy. Extract a `src/lib/crmStatusBadges.ts` (or co-locate with `orderConstants.ts`) exporting `weekStatusBadge`, `subscriptionStatusBadge`, `paymentStatusBadge` and consume everywhere.

---

## Refinements

### R1 — Dead `cursor` arg / misleading pagination contract on `getCustomerTimeline`
The query still declares `cursor: v.optional(v.string())` and the plan promised `{ items, nextCursor? }`, but the implementation pivoted to "Load older = bump `sinceDays`" (`CustomerActivityPage` increments window by 14d). `cursor` is never read, `nextCursor` is never returned. Remove the `cursor` arg — it advertises pagination that doesn't exist and will confuse the next caller. Note the consequence of the chosen model: each "Load older" re-collects the entire widening window from scratch (reactive re-scan), so on a high-history customer the read grows unboundedly as the user pages back. Acceptable for the 14d default; document the trade-off.

### R2 — Money is pre-formatted into `detail` strings backend-side
The timeline `detail` field bakes presentation (`${inv.finalTotal.toLocaleString("id-ID")} IDR`) into the data layer, so the frontend receives a string it can't reformat/localize. This is mild tension with C10 (money first-class/integer + traceable). There is prod precedent for `toLocaleString("id-ID")` on the Convex runtime (`convex/orders/whatsapp.ts`), so the **ICU concern is low** — it already runs in production (the Convex isolate may drop locale grouping but does not throw). Preference: return the integer amount + let the component format via the shared `formatCurrency`, keeping the backend a data source. Low priority.

### R3 — `CreditPoolShape` re-declared in `CreditGauge.tsx`
The gauge re-types the pool shape locally instead of reusing `ReturnType<typeof deriveCreditPool>` from `convex/subscriptions/creditMath.ts` (a plain TS module already importable from the frontend, same pattern as `activityEvents.ts`). If `deriveCreditPool` gains/renames a field the local type silently drifts. Import the source type.

### R4 — Dual-surface mirroring is now a 3-surface hand-copy
The customer-name link landed in `OrderSlideOver.tsx`, `OrderDetail.tsx`, **and** `KanbanCard.tsx`, plus the U3 affordance-suppression in both order surfaces. Hand-mirroring a one-line `<Link>` is tolerable, but Phase D pushes the count to three independent surfaces and adds conditional logic (U3). This reinforces the standing recommendation (Pitfall #20) to extract a shared order-customer / order-actions component; sustainable for now, overdue as a refactor.

### R5 — `getCrmHomeActiveSubscriptions` shows only `status === "active"`
Per the plan's own note, `terminating` subscriptions are still operationally live (deliveries in flight) but are excluded from the home feed. Confirm with ops whether in-flight terminations should remain visible on CRM home; if so, include `terminating`. Behaviorally minor, product call.

---

## Risk Register

| # | Risk | Likelihood | Impact | Watch / Mitigation |
|---|------|-----------|--------|--------------------|
| 1 | **I1** — recent event on an older parent (esp. `payment_funded` on an invoice generated >window ago) silently missing from the timeline | Medium | Medium (user trust in "what happened" feed) | Post-merge: spot-check a customer who paid a >14d-old invoice; confirm it shows. If not, widen the fetch bound or relabel the window in UI. |
| 2 | **I4/I3** — status/direction map drift as new statuses or recolors land in one copy only | Medium (over time) | Low-Med (visual inconsistency across CRM pages) | Consolidate to single modules before the next CRM phase touches statuses. |
| 3 | "Load older" unbounded re-scan on a high-history customer (R1) | Low | Low-Med (query latency on deep paging) | Monitor Convex query times on `getCustomerTimeline`; convert to true cursor pagination if any customer's window read gets large. |
| 4 | `invoices.by_customer_generatedAt` excludes invoices with unset `generatedAt` (manual/non-subscription invoices) from the timeline | Low | Low | Acceptable for subscription-focused CRM; note that manual invoices won't appear. |
| 5 | `getCustomerDrawdown` pool-trajectory attribution (the `dayBalances` + nearest-planned-day loop) is intricate; mis-attribution would mis-draw the credit line | Low | Low (visual only, never re-keys the pool — reads stored `balanceAfter`) | Covered by `drawdown.test.ts`; verify against a real multi-delivery week in UAT. |
| 6 | New indexes deploy-order (backend before frontend) | Low | Low | Additive; standard split-brain guard (`gh run list` after merge) per existing playbook. |

**Overall:** ship-ready. Address I1 (or explicitly document its limit in-UI) and clean up the dead subtype path (I2) and duplicated maps (I3/I4) as a fast follow before the next CRM phase builds on these surfaces.
