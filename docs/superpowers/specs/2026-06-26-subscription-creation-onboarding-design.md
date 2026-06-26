# Subscription Creation & Onboarding UI — Design Spec

**Date:** 2026-06-26
**Status:** Draft → spec→plan pipeline (2 review gates)
**Depends on:** Phase A (`22b628f7`), Phase B merged (`6a6466c4`), Phase D Slice 0 (`4cd362fe`), Phase D CRM surface (#202 `f78c0037`), persona-UAT punch-list (#205 `02eb4925`) — all on `main`.
**Spec family:** master design `docs/superpowers/specs/2026-06-23-subscription-credit-system-design.md` (§4 data model, §5 CRM surface, §6 automated ordering schedule).
**Driving need:** Phase D shipped the *operate-and-read* CRM surface but there is **no UI to CREATE a subscription** — they exist only via the dev seed script. This is the single gap blocking real-world onboarding of a B2B customer.

---

## 1. Problem & Goal

The subscription-credit backend is complete and operate/read UI shipped, but a manager **cannot create a subscription from the app**. `createSubscription` / `updateSubscription` mutations exist (`convex/subscriptions/mutations.ts:13,53`, `roles:["manager","admin"]`) yet **nothing in `src/` calls them** — every subscription today is born from `convex/subscriptions/_devSeed.ts` / `scripts/seed-subscription-uat.mjs`.

**Goal:** A manager/admin onboards a B2B customer **end-to-end from `/crm`**:
1. Create a **customer** (new affordance in CRM — today `/crm` has no create-customer button; `customers.create` is only reachable inline from the orders flow).
2. Create a **subscription** (status `draft`) with terms + a weekly **schedule template** + an optional **agreement** link.
3. Review the draft, then **Activate** it (`status: draft → active`).

This is an **almost-entirely-frontend** slice: the subscription + agreement mutations all exist (see §3). The **single backend deliverable** is one additive mutation — `crm.customers.createCustomer` — needed because no existing mutation carries the full customer field union atomically (§3.1).

**Out of scope:** subscription rule-enforcement (separate slice — Phase E Slice-2); editing the schedule of an *active* week (Phase B scheduler already owns that); customer/subscription deletion; bulk import.

---

## 2. WHAT this slice delivers

Three cohesive pieces of one onboarding journey, all on `canAccessCrm`-gated (manager+admin) routes.

### 2.1 New customer (CRM)
- A **"New customer"** affordance on `CrmHome` (`src/pages/crm/CrmHome.tsx`) — a button opening a dialog (`NewCustomerDialog.tsx`).
- Minimal-but-useful form: **name** (required), companyName, key contact (name/role), whatsapp, phone, email, billing/delivery/store addresses, notes.
- On submit: call a new **atomic** `crm.customers.createCustomer` mutation (one transaction inserting the customer with all CRM fields). On success → navigate to the customer hub `/crm/customers/:id`.
- See §3.1 for why this is one mutation (the partial-write seam of the rejected multi-call path) — this is the slice's **single backend deliverable**.

### 2.2 New subscription — sectioned form
- An **"Add subscription"** button on the customer hub subscriptions section (`src/pages/crm/CustomerDashboard.tsx`), opening a new route `crm/customers/:customerId/subscriptions/new` (page `NewSubscriptionPage.tsx`) rendering `SubscriptionForm.tsx`. The route uses the existing `:customerId` param; `new` is a **static** segment that ranks above the sibling dynamic `:subId` route in React Router v6, so there is no match collision (confirm at plan time). Keep the param name `:subId` (not `:subscriptionId`) for consistency with the existing routes.
- **Sectioned single-page form** (not a wizard — user decision), grouped:
  - **Terms:** `label` (required), `unitPrice` (partner price, integer IDR) + `confidentialPrice` toggle (**default true** — a B2B partner price is confidential), `baselineDailyQty`, `deliverByTime` (HH:MM WIB), `creditRolloverPolicy` (`expire` | `rollover`) → if `rollover`, `rolloverExpiryWeeks` (default 4; null = never; switching back to `expire` clears it before submit), `cogsBasis` (integer IDR), `startDate` (**default: next Monday WIB** via `convex/lib/periodRange.ts` week helpers — weeks bill Monday-aligned), `notes`.
  - **Schedule template** (`ScheduleTemplateEditor.tsx`): seven day-of-week rows (Mon–Sun; `dayOfWeek` **0=Mon … 6=Sun**, per `convex/subscriptions/mutations.ts:5` — NOT the JS Sun=0 convention), each holding zero-or-more product lines: a product dropdown + integer qty, with "+ add product". Products come from `api.menuProducts.queries.list` with `{ activeOnly: true }` — a **public `query`** consumed via plain `useQuery` (NOT `useSessionQuery`; no `sessionId` arg), exactly as the scheduler does (`SubscriptionSchedulePage.tsx:122`). Build a **focused line** carrying only `{ menuProductId, qty }` (the template has no per-line price or date — `unitPrice` is the subscription's confidential price, applied later at `seedWeek`/`confirmWeek`); share only the product-dropdown primitive with `ProductLineEditor`, do NOT reuse that priced/locked line wholesale.
  - **Live preview:** derived **weekly qty** (`deriveWeeklyQty(scheduleTemplate)` from `convex/subscriptions/creditMath.ts` — Σ of all line qtys across days) and a **weekly credit estimate** = weeklyQty × `unitPrice`, integer IDR. Recomputed on the client for display; the backend re-derives `weeklyQty` authoritatively (never re-keyed — `createSubscription` calls `deriveWeeklyQty` itself).
  - **Agreement (optional):** attach an existing uploaded agreement (`crm.agreements.listAgreementsByCustomer`) via a select, OR upload one inline reusing `AgreementUpload.tsx` (→ `generateAgreementUploadUrl` + `createSupplyAgreement`). Sets `agreementId`. **No auto-prefill** of terms (user decision — manual entry).
- On submit: `createSubscription(args)` (status defaults to `draft`) → navigate to `/crm/customers/:customerId/subscriptions/:subId` (`SubscriptionPage.tsx`).

### 2.3 Activate
- On `SubscriptionPage.tsx`, for a `draft` subscription, an **"Activate"** action → `updateSubscription({ subscriptionId, status: "active" })`. If an agreement was attached, also call `crm.agreements.linkAgreementToSubscription` to set the bi-directional link (design §4.6 / A4).
- **Activation guard:** the Activate action is disabled (with a visible reason) unless ALL of: `label` non-empty, `unitPrice > 0`, `baselineDailyQty > 0`, `deliverByTime` valid HH:MM, `cogsBasis > 0`, `startDate` set, and **≥1 product line with qty > 0** across the schedule template. A `draft` may omit any of these; an `active` subscription may not (it must be schedulable). All-zero-qty lines count as empty.
- Draft subscriptions get a **"Draft"** badge in the hub subscriptions list (`CustomerDashboard.tsx`) so an un-activated subscription is visibly distinct.

---

## 3. Data & flow

### 3.1 Consumes (all exist on `main` — verified at spec time)

| Mutation / query | Source | Use |
|---|---|---|
| `subscriptions.mutations.createSubscription` | `convex/subscriptions/mutations.ts:13` (`roles:["manager","admin"]`) | create the draft; args = `{ customerId, label, unitPrice, confidentialPrice, baselineDailyQty, deliverByTime, creditRolloverPolicy, rolloverExpiryWeeks?, cogsBasis, startDate, scheduleTemplate, agreementId?, notes? }`. Sets `status:"draft"`, `billingModel`, cutoff/notice defaults, `weeklyQty=deriveWeeklyQty(...)`, and patches `customer.customerType="b2b_wholesale"` if unset. |
| `subscriptions.mutations.updateSubscription` | `convex/subscriptions/mutations.ts:53` | Activate (`status:"active"`); re-derives `weeklyQty` if template re-sent. |
| `crm.customers.createCustomer` (**NEW — single backend deliverable**) | `convex/crm/customers.ts` (add) | atomic create with all CRM fields in one `ctx.db.insert`. Mirrors the field union of `customers.create` (name/phone/notes/defaultAddress) + `customers.update` (companyName/npwp/billingAddress) + `updateCustomerCrmFields` (keyContact*/whatsapp/email/instagram/deliveryAddress/storeAddress/otherAddresses/altPhone). `roles:["manager","admin"]`. |
| `customers.mutations.create` / `update`, `crm.customers.updateCustomerCrmFields` | `convex/customers/mutations.ts:7`, `convex/crm/customers.ts:20` | existing; reused by the hub edit dialog. The new `createCustomer` exists because none of these three alone carries the full field union (verified: `updateCustomerCrmFields` lacks companyName/npwp/billing). |
| `crm.agreements.listAgreementsByCustomer` / `getAgreement` / `getFileUrl` | `convex/crm/agreements.ts:160/140/179` | list/attach an existing agreement. |
| `crm.agreements.generateAgreementUploadUrl` / `createSupplyAgreement` | `convex/crm/agreements.ts:22/32` | inline upload (via `AgreementUpload.tsx`). |
| `crm.agreements.linkAgreementToSubscription` | `convex/crm/agreements.ts:119` | bi-directional link on activate. |
| `menuProducts` query (existing dropdown source used by the scheduler) | `convex/menuProducts/*` | product dropdown in the schedule template. |
| `deriveWeeklyQty` | `convex/subscriptions/creditMath.ts` | client preview only (backend is source of truth). |

**Rich-customer-create — atomic wrapper (decided, staffreview I1):** `customers.create` accepts only `{name, phone, source, notes, defaultAddress}`; companyName/npwp/billing live on `customers.update`; the rest on `updateCustomerCrmFields`. No single existing mutation carries the full field union, so a multi-call create would have a partial-write seam (a failure after `create` leaves a thinly-populated customer). **Decision:** add ONE atomic `crm.customers.createCustomer` that inserts everything in a single transaction. This is the slice's **only backend change** (additive mutation + `convex codegen`). **Rejected alternative:** 3 sequential client mutations (`create`→`update`→`updateCustomerCrmFields`) — kept out for the partial-write window and the awkward multi-await in the dialog.

### 3.2 Adds
**Backend (single deliverable):**
- `crm.customers.createCustomer` mutation in `convex/crm/customers.ts` (`roles:["manager","admin"]`) — atomic insert of the full CRM field union; sets `createdBy`. `npx convex codegen` + commit `_generated/`.

**Frontend:**
- `src/components/crm/NewCustomerDialog.tsx` — new-customer form → `createCustomer`.
- `src/pages/crm/NewSubscriptionPage.tsx` — route page hosting the form.
- `src/components/crm/SubscriptionForm.tsx` — sectioned terms + schedule + agreement form; create-draft submit.
- `src/components/crm/ScheduleTemplateEditor.tsx` — 7 day-of-week rows × product+qty lines; emits `scheduleTemplate`.
- Edits: `CrmHome.tsx` (New customer button + dialog), `CustomerDashboard.tsx` (Add subscription button + Draft badge), `SubscriptionPage.tsx` (Activate action + guard), `src/App.tsx` (lazy route for `/crm/customers/:customerId/subscriptions/new`).

### 3.3 Invariant
`schedule = invoice = credit` (master §3): the form never re-keys `weeklyQty` — it displays a client estimate but `createSubscription` derives the stored `weeklyQty` from `scheduleTemplate`. Money is integer IDR throughout (C10).

---

## 4. Acceptance criteria

- [ ] **AC1** A "New customer" affordance exists on `CrmHome`; submitting name (required) + optional fields creates a customer via the atomic `crm.customers.createCustomer` and navigates to `/crm/customers/:id`. Empty name is blocked client-side.
- [ ] **AC2** Rich fields entered in the new-customer form (companyName, keyContact, whatsapp, email, delivery/store addresses, notes) are persisted in one transaction (`createCustomer`) and render on the hub identity card.
- [ ] **AC3** An "Add subscription" button on the customer hub opens the sectioned `SubscriptionForm` at `/crm/customers/:customerId/subscriptions/new`.
- [ ] **AC4** The form collects all `createSubscription` args; submitting creates a subscription with `status:"draft"` and navigates to its `SubscriptionPage`.
- [ ] **AC5** The schedule template editor produces a valid `scheduleTemplate` (`dayOfWeek` 0=Mon…6=Sun; `items:[{menuProductId, qty}]`); add/remove product and qty edits work; a day may have zero products.
- [ ] **AC6** Live preview shows derived weekly qty (= Σ line qtys, matching `deriveWeeklyQty`) and weekly credit estimate (= weeklyQty × unitPrice), integer IDR, updating as the template/price change.
- [ ] **AC7** Rollover policy: choosing `rollover` reveals `rolloverExpiryWeeks` (default 4; explicit "never" option → null); `expire` hides it and sends no expiry weeks.
- [ ] **AC8** Agreement (optional): the manager can attach an existing agreement (select from `listAgreementsByCustomer`) or upload inline (`AgreementUpload`); the chosen `agreementId` is passed to `createSubscription`.
- [ ] **AC9** Activate: a `draft` subscription shows an "Activate" action on `SubscriptionPage`; clicking it calls `updateSubscription({status:"active"})` and (if an agreement is attached) `linkAgreementToSubscription`. After activation the badge/state reflects `active`.
- [ ] **AC10** Activation guard: the Activate action is disabled (with a visible reason) when the schedule template is empty or a required term is missing.
- [ ] **AC11** A `draft` subscription is visually marked "Draft" in the hub subscriptions list.
- [ ] **AC12 (access, Pitfall #19):** every surface is reachable only under `canAccessCrm` (manager+admin); no new backend function is added with a narrower `roles` than the route. The confidential `unitPrice` field appears only on the manager+admin-gated form. code-auditor greps the new components for any `roles:["admin"]`-only call on a manager-reachable mount.
- [ ] **AC13** Designed empty/loading/error states on every new surface (D12): loading while customer/agreements resolve; error toast on mutation failure; the form disables submit while pending.
- [ ] **AC14** `npm run type-check`, `npm run lint`, `npx vitest run` (new component tests + the `createCustomer` mutation test), and `npm run build` pass. `npx convex codegen` re-run + committed `_generated/` (for the new `createCustomer` mutation ref).

---

## 5. Edge cases

- [ ] **EC1** Submit while a prior submit is in-flight → button disabled; no double-create.
- [ ] **EC2** `createSubscription` succeeds but navigation target not yet reactive → SubscriptionPage shows its loading state, then the draft (Convex reactivity), never a crash.
- [ ] **EC3** `createCustomer` fails (validation/network) → atomic, so NO partial customer is written; dialog shows an error toast and retains the entered values for retry. (The atomic wrapper removes the multi-call partial-write seam.)
- [ ] **EC4** Empty schedule template at create → allowed (draft); Activate blocked (AC10).
- [ ] **EC5** A product chosen in the template is later deleted from `menuProducts` → the dropdown shows live products only; an already-selected-but-now-missing product renders a ⚠️ marker (don't silently drop a line). (Mirrors the scheduler's deleted-product handling.)
- [ ] **EC6** `unitPrice`/`baselineDailyQty`/`cogsBasis` ≤ 0 or non-integer → client validation blocks submit with a field error (integer IDR, positive).
- [ ] **EC7** `deliverByTime` malformed (not HH:MM) → blocked client-side.
- [ ] **EC8** Customer with no agreements → the agreement select shows an empty state + the inline-upload path; attaching is never required.
- [ ] **EC9** Activating an already-`active` subscription (double-click / stale view) → idempotent / no-op message, not an error.

---

## 6. Testing focus

- **T1** `SubscriptionForm` (component) — required-field validation, integer/positive money validation (EC6/EC7), draft-submit calls `createSubscription` with correctly shaped args (incl. rollover branch AC7), navigates on success.
- **T2** `ScheduleTemplateEditor` (component) — add/remove product line, qty edit, day-of-week mapping (0=Mon), emits the exact `scheduleTemplate` shape; zero-product day allowed.
- **T3** Preview math — weekly qty equals `deriveWeeklyQty` over the same template; credit estimate = weeklyQty × unitPrice (integer).
- **T4** `NewCustomerDialog` (component) — name-required, calls `createCustomer` with the full field union, error path (EC3), navigate on success. Plus a backend `createCustomer` mutation test (valid insert; auth rejection for non-manager).
- **T5** Activate guard (component) — disabled with empty template / missing terms (AC10); enabled when complete; calls `updateSubscription` + `linkAgreementToSubscription` when an agreement is attached.
- **Fixtures:** a customer with an existing agreement; a customer with none; a multi-product-day template; a single-day template.

> Unit/component tests run headless. The full create→activate→appears-on-kanban journey + live agreement upload needs a running app → **persona-UAT against a live env** at close-out (not headless-claimable).

## 7. Access control + rollback / ship-dark
- **Access:** all surfaces live under the existing `<ProtectedRoute requiredPermission="canAccessCrm">` (manager+admin). The one new backend function (`crm.customers.createCustomer`) is `roles:["manager","admin"]`. Confidential `unitPrice` is only on these gated surfaces (D11) — no client-only hiding.
- **Ship-dark:** additive frontend (new components + one lazy route + buttons) + one additive backend mutation. No schema change, no behavior change to existing surfaces. A draft subscription generates nothing until activated and a week is seeded/confirmed (Phase B).
- **Rollback:** revert the commits; the new mutation is additive (+ `convex codegen`), no migration. Check `gh run list` after merge (split-brain guard, `lesson_convex_vercel_splitbrain`).

## 8. Dependencies on merged code (confirm at plan time)
- **(A/B)** `createSubscription`/`updateSubscription` signatures (`convex/subscriptions/mutations.ts`) — args as in §3.1.
- **(D)** `crm.customers.updateCustomerCrmFields` field set (`convex/crm/customers.ts:20`), `crm.agreements.*` (`convex/crm/agreements.ts`), `CustomerDashboard.tsx` hub structure + existing edit dialog field set (reuse), `SubscriptionPage.tsx` structure (where Activate lands), `ProductLineEditor.tsx` interaction pattern, `AgreementUpload.tsx`.
- **(D)** `canAccessCrm` permission + `/crm/...` route nesting (`src/App.tsx`), `menuProducts` dropdown query used by the existing scheduler (reuse the same query).

## 9. Open questions
- **Q1 → RESOLVED (staffreview I1):** atomic `crm.customers.createCustomer` (one backend mutation), not multi-call frontend composition — removes the partial-write seam.
- **Q2 → RESOLVED:** dedicated route/page `crm/customers/:customerId/subscriptions/new` (deep-linkable, breadcrumbed per A2), not a modal.
- **Q3** Should "New customer" also live on the global CRM nav (not only `CrmHome`)? Default: `CrmHome` only this slice; revisit if discoverability UAT flags it. (Non-blocking.)

---

## Git Workflow
**Branch:** `plan/subscription-creation-ui` (planning artifacts) → implementation branch cut fresh off `main` at execution time.
**Checkpoints:** per wave in the plan.

## Implementation Waves (filled by writing-plans)
### Wave 0: Backend `crm.customers.createCustomer` mutation + codegen [SOLO — touches `_generated/`]
### Wave 1: Schedule template editor + form primitives [PARALLEL, after W0]
### Wave 2: NewCustomerDialog + new-subscription page/form + Activate + route wiring [after W1]
### Wave 3: Verification [SEQUENTIAL] — code-auditor (access Pitfall #19 + patterns), component tests + mutation test, Bash `npm run build`

## Documentation Updates
- [ ] CHANGELOG.md (at execution/merge time)
- [ ] FILE_MAP.md (CRM creation surfaces + permission rows)
- [ ] ROADMAP.md (record this planned slice; remove on execution)

## Success Criteria
- [ ] `npm run type-check` passes
- [ ] `npm run build` succeeds
- [ ] A manager creates a customer, creates a subscription (draft), and activates it entirely from `/crm`.
- [ ] Weekly qty/credit preview matches the backend-derived `weeklyQty`.
- [ ] Activation is blocked until the schedule template + required terms are present.
- [ ] All surfaces manager+admin only; confidential price never leaves the gated route.
