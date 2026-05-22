# Phase 84: QRIS Payment Integration (Xendit) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-21
**Phase:** 84-qris-payment-integration
**Areas discussed:** Flag wiring, needsReview surfacing, QR dialog structure, Adapter file layout

> Mode: advisor (USER-PROFILE.md present, tier `standard`). Research-spawn step was skipped deliberately — the validated spike + SPEC.md (ambiguity 0.129) already supplied the external Xendit facts research would gather, and all four areas are codebase-internal architecture decisions grounded by direct scout. Comparison tables were synthesized from codebase scouting instead.

---

## Flag wiring (QRIS_ENABLED)

| Option | Description | Selected |
|--------|-------------|----------|
| A. Convex query reads env | Query reads `process.env.QRIS_ENABLED`, returns boolean reactively; create-action enforces same env. Go-live = env flip, no rebuild. SPEC-faithful. | ✓ |
| B. businessSettings DB flag | `qrisEnabled` in `businessSettings`, admin-UI toggle. Manager self-serve, reactive, but go-live becomes a DB edit. | |
| C. VITE build-time var | `VITE_QRIS_ENABLED`. Needs frontend rebuild to flip, not reactive, contradicts "no code change." (Presented in table, not offered as a pick.) | |

**User's choice:** A — Convex query reads env.
**Notes:** Matches SPEC req 6 wording ("going live = env change only"). Flip happens in the Convex dashboard. Server-side enforcement in the create-action is defense-in-depth, not just button-gating. Flag query roles must cover the `canAccessOrders` set (pitfall #19).

---

## needsReview surfacing

| Option | Description | Selected |
|--------|-------------|----------|
| A. Data-only, defer to Phase 77 | Set the field, no UI. Reconciliation lands in future Data Health Dashboard. SPEC-faithful (UI out of scope). | |
| B. Minimal badge on order detail | Small `needsReview` indicator on order detail now. Adds minimal scope; immediate back-office signal. | ✓ |

**User's choice:** B — minimal badge on order detail.
**Notes:** Captured explicitly as an INDICATOR ONLY (badge + reviewReason), not a reconciliation surface. Planner must not build list/filter/resolve flow. Full reconciliation tooling stays deferred to Phase 77. This is a deliberate, bounded extension beyond SPEC's "reconciliation UI out of scope."

---

## QR dialog structure

| Option | Description | Selected |
|--------|-------------|----------|
| A. Single QrisChargeDialog | One component, internal states (active+countdown / paid / expired-regenerate) driven by `getActiveQrisPayment` subscription. Button near `PaymentMethodButtons`. | ✓ |
| B. Split shell + per-state views | Separate QrisQrView/QrisPaidView/QrisExpiredView. More files, only cleaner if states grow. | |

**User's choice:** A — single QrisChargeDialog.
**Notes:** Three states are simple; one reactive subscription owns the paid flip (no manual refresh). Regenerate calls `createQrisInvoice` which supersedes the prior pending row.

---

## Adapter file layout

| Option | Description | Selected |
|--------|-------------|----------|
| A. Split mirroring grabfood | `integrations/qris/`: provider.ts + xendit.ts + webhooks.ts; table query/mutation/action in `convex/qrisPayments/`. Matches integration convention. | ✓ |
| B. Single index.ts | One file for interface+impl. Fewer files but mixes concerns, harder Midtrans swap. | |

**User's choice:** A — split mirroring grabfood.
**Notes:** Consistent with `convex/integrations/{platform}/` pattern; isolates Xendit HTTP behind the `QrisProvider` interface for a future Midtrans/InterActive swap. Webhook route registered in `convex/http.ts` alongside grabfood routes.

## Claude's Discretion

- Exact query/file names, countdown rendering details, badge placement at pixel level, and whether the create-action sits in `integrations/qris/actions.ts` vs `qrisPayments/actions.ts`.

## Deferred Ideas

- Full `needsReview` reconciliation surface (filter/resolve/dashboard) → Phase 77 (Data Health Dashboard).
- SPEC out-of-scope items: partial payments, MDR-fee accounting / settlement reconciliation, customer-facing pay page, cron status sweep, Midtrans/InterActive providers, refunds/voids, static QR, KYB live-key go-live.
