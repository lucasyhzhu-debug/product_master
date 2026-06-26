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

This is a **frontend-only** slice — all backend mutations already exist (see §3). The one borderline-backend item (rich customer-create) is satisfied by composing two existing mutations; see §3.1.

**Out of scope:** subscription rule-enforcement (separate slice — Phase E Slice-2); editing the schedule of an *active* week (Phase B scheduler already owns that); customer/subscription deletion; bulk import.

---

## 2. WHAT this slice delivers

Three cohesive pieces of one onboarding journey, all on `canAccessCrm`-gated (manager+admin) routes.

### 2.1 New customer (CRM)
- A **"New customer"** affordance on `CrmHome` (`src/pages/crm/CrmHome.tsx`) — a button opening a dialog (`NewCustomerDialog.tsx`).
- Minimal-but-useful form: **name** (required), companyName, key contact (name/role), whatsapp, phone, email, billing/delivery/store addresses, notes.
- On submit: call `customers.create` (name + phone + notes + defaultAddress) → then `crm.customers.updateCustomerCrmFields` on the returned id for the rich fields (companyName via `customers.update`; keyContactName/keyContactRole/whatsapp/email/deliveryAddress/storeAddress via `updateCustomerCrmFields`). On success → navigate to the customer hub `/crm/customers/:id`.
- See §3.1 for the two-call composition and its partial-failure handling.

### 2.2 New subscription — sectioned form
- An **"Add subscription"** button on the customer hub subscriptions section (`src/pages/crm/CustomerDashboard.tsx`), opening a new route `/crm/customers/:customerId/subscriptions/new` (page `NewSubscriptionPage.tsx`) rendering `SubscriptionForm.tsx`.
- **Sectioned single-page form** (not a wizard — user decision), grouped:
  - **Terms:** `label` (required), `unitPrice` (partner price, integer IDR) + `confidentialPrice` toggle, `baselineDailyQty`, `deliverByTime` (HH:MM WIB), `creditRolloverPolicy` (`expire` | `rollover`) → if `rollover`, `rolloverExpiryWeeks` (default 4; null = never), `cogsBasis` (integer IDR), `startDate`, `notes`.
  - **Schedule template** (`ScheduleTemplateEditor.tsx`): seven day-of-week rows (Mon–Sun; `dayOfWeek` **0=Mon … 6=Sun**, per `convex/subscriptions/mutations.ts:5` — NOT the JS Sun=0 convention), each holding zero-or-more product lines: a `menuProducts` dropdown + integer qty, with "+ add product". Reuses the `ProductLineEditor` interaction pattern (`src/components/crm/ProductLineEditor.tsx`) but carries only `{ menuProductId, qty }` (the template has no per-line price or date — `unitPrice` is the subscription's confidential price, applied later at `seedWeek`/`confirmWeek`).
  - **Live preview:** derived **weekly qty** (`deriveWeeklyQty(scheduleTemplate)` from `convex/subscriptions/creditMath.ts` — Σ of all line qtys across days) and a **weekly credit estimate** = weeklyQty × `unitPrice`, integer IDR. Recomputed on the client for display; the backend re-derives `weeklyQty` authoritatively (never re-keyed — `createSubscription` calls `deriveWeeklyQty` itself).
  - **Agreement (optional):** attach an existing uploaded agreement (`crm.agreements.listAgreementsByCustomer`) via a select, OR upload one inline reusing `AgreementUpload.tsx` (→ `generateAgreementUploadUrl` + `createSupplyAgreement`). Sets `agreementId`. **No auto-prefill** of terms (user decision — manual entry).
- On submit: `createSubscription(args)` (status defaults to `draft`) → navigate to `/crm/customers/:customerId/subscriptions/:subId` (`SubscriptionPage.tsx`).

### 2.3 Activate
- On `SubscriptionPage.tsx`, for a `draft` subscription, an **"Activate"** action → `updateSubscription({ subscriptionId, status: "active" })`. If an agreement was attached, also call `crm.agreements.linkAgreementToSubscription` to set the bi-directional link (design §4.6 / A4).
- **Activation guard:** block (disabled button + reason) if the schedule template is empty or any required term is missing — a `draft` may be incomplete, but an `active` subscription must be schedulable.
- Draft subscriptions get a **"Draft"** badge in the hub subscriptions list (`CustomerDashboard.tsx`) so an un-activated subscription is visibly distinct.

---

## 3. Data & flow

### 3.1 Consumes (all exist on `main` — verified at spec time)

| Mutation / query | Source | Use |
|---|---|---|
| `subscriptions.mutations.createSubscription` | `convex/subscriptions/mutations.ts:13` (`roles:["manager","admin"]`) | create the draft; args = `{ customerId, label, unitPrice, confidentialPrice, baselineDailyQty, deliverByTime, creditRolloverPolicy, rolloverExpiryWeeks?, cogsBasis, startDate, scheduleTemplate, agreementId?, notes? }`. Sets `status:"draft"`, `billingModel`, cutoff/notice defaults, `weeklyQty=deriveWeeklyQty(...)`, and patches `customer.customerType="b2b_wholesale"` if unset. |
| `subscriptions.mutations.updateSubscription` | `convex/subscriptions/mutations.ts:53` | Activate (`status:"active"`); re-derives `weeklyQty` if template re-sent. |
| `customers.mutations.create` | `convex/customers/mutations.ts:7` | base customer (name, phone, source, notes, defaultAddress). |
| `customers.mutations.update` | `convex/customers/mutations.ts` | companyName / npwp / billingAddress write-back. |
| `crm.customers.updateCustomerCrmFields` | `convex/crm/customers.ts:20` | rich CRM fields: keyContactName, keyContactRole, whatsapp, email, instagram, deliveryAddress, storeAddress, otherAddresses, altPhone, notes. |
| `crm.agreements.listAgreementsByCustomer` / `getAgreement` / `getFileUrl` | `convex/crm/agreements.ts:160/140/179` | list/attach an existing agreement. |
| `crm.agreements.generateAgreementUploadUrl` / `createSupplyAgreement` | `convex/crm/agreements.ts:22/32` | inline upload (via `AgreementUpload.tsx`). |
| `crm.agreements.linkAgreementToSubscription` | `convex/crm/agreements.ts:119` | bi-directional link on activate. |
| `menuProducts` query (existing dropdown source used by the scheduler) | `convex/menuProducts/*` | product dropdown in the schedule template. |
| `deriveWeeklyQty` | `convex/subscriptions/creditMath.ts` | client preview only (backend is source of truth). |

**Rich-customer-create composition (the one borderline-backend item):** `customers.create` accepts only `{name, phone, source, notes, defaultAddress}`; the rich CRM fields live behind `updateCustomerCrmFields` + `customers.update`. The form therefore submits **two-to-three sequential mutations**: `create` → (`update` for companyName/billing) → (`updateCustomerCrmFields` for contact/social/addresses). **Partial-failure handling:** await `create` first; if a later patch fails, the customer still exists with name+basics and the dialog surfaces an error + keeps the rich values so the manager can retry from the hub edit dialog (no orphan beyond a thinly-populated customer). **Alternative considered (flag for staffreview):** a thin backend `crm.customers.createCustomer` that does both in one transaction — cleaner (atomic, single round-trip) but adds a backend deliverable. Default = two-call frontend composition to stay frontend-only; staffreview/user may upgrade to the wrapper.

### 3.2 Adds (frontend)
- `src/components/crm/NewCustomerDialog.tsx` — new-customer form + submit composition.
- `src/pages/crm/NewSubscriptionPage.tsx` — route page hosting the form.
- `src/components/crm/SubscriptionForm.tsx` — sectioned terms + schedule + agreement form; create-draft submit.
- `src/components/crm/ScheduleTemplateEditor.tsx` — 7 day-of-week rows × product+qty lines; emits `scheduleTemplate`.
- Edits: `CrmHome.tsx` (New customer button + dialog), `CustomerDashboard.tsx` (Add subscription button + Draft badge), `SubscriptionPage.tsx` (Activate action + guard), `src/App.tsx` (lazy route for `/crm/customers/:customerId/subscriptions/new`).

### 3.3 Invariant
`schedule = invoice = credit` (master §3): the form never re-keys `weeklyQty` — it displays a client estimate but `createSubscription` derives the stored `weeklyQty` from `scheduleTemplate`. Money is integer IDR throughout (C10).

---

## 4. Acceptance criteria

- [ ] **AC1** A "New customer" affordance exists on `CrmHome`; submitting name (required) + optional fields creates a customer (`customers.create` + rich-field patches) and navigates to `/crm/customers/:id`. Empty name is blocked client-side.
- [ ] **AC2** Rich fields entered in the new-customer form (companyName, keyContact, whatsapp, email, delivery/store addresses, notes) are persisted (via `update` + `updateCustomerCrmFields`) and render on the hub identity card.
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
- [ ] **AC14** `npm run type-check`, `npm run lint`, `npx vitest run` (new component tests), and `npm run build` pass. `npx convex codegen` re-run + committed `_generated/` only if a backend wrapper is added (default: no backend change → no codegen delta beyond none).

---

## 5. Edge cases

- [ ] **EC1** Submit while a prior submit is in-flight → button disabled; no double-create.
- [ ] **EC2** `createSubscription` succeeds but navigation target not yet reactive → SubscriptionPage shows its loading state, then the draft (Convex reactivity), never a crash.
- [ ] **EC3** New-customer rich-field patch fails after `create` succeeds (§3.1) → customer exists with basics; dialog shows error, retains rich values, points the manager to the hub edit dialog. No uncaught throw.
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
- **T4** `NewCustomerDialog` (component) — name-required, two-call composition order (`create` then patches), partial-failure path (EC3), navigate on success.
- **T5** Activate guard (component) — disabled with empty template / missing terms (AC10); enabled when complete; calls `updateSubscription` + `linkAgreementToSubscription` when an agreement is attached.
- **Fixtures:** a customer with an existing agreement; a customer with none; a multi-product-day template; a single-day template.

> Unit/component tests run headless. The full create→activate→appears-on-kanban journey + live agreement upload needs a running app → **persona-UAT against a live env** at close-out (not headless-claimable).

## 7. Access control + rollback / ship-dark
- **Access:** all surfaces live under the existing `<ProtectedRoute requiredPermission="canAccessCrm">` (manager+admin). No new backend function in the default scope; the (optional) `createCustomer` wrapper, if adopted, is `roles:["manager","admin"]`. Confidential `unitPrice` is only on these gated surfaces (D11) — no client-only hiding.
- **Ship-dark:** purely additive frontend (new components + one lazy route + buttons). No schema, no behavior change to existing surfaces. A draft subscription generates nothing until activated and a week is seeded/confirmed (Phase B).
- **Rollback:** revert the commits. If the optional backend wrapper is adopted, it is additive + `convex codegen` only. Check `gh run list` after merge (split-brain guard, `lesson_convex_vercel_splitbrain`).

## 8. Dependencies on merged code (confirm at plan time)
- **(A/B)** `createSubscription`/`updateSubscription` signatures (`convex/subscriptions/mutations.ts`) — args as in §3.1.
- **(D)** `crm.customers.updateCustomerCrmFields` field set (`convex/crm/customers.ts:20`), `crm.agreements.*` (`convex/crm/agreements.ts`), `CustomerDashboard.tsx` hub structure + existing edit dialog field set (reuse), `SubscriptionPage.tsx` structure (where Activate lands), `ProductLineEditor.tsx` interaction pattern, `AgreementUpload.tsx`.
- **(D)** `canAccessCrm` permission + `/crm/...` route nesting (`src/App.tsx`), `menuProducts` dropdown query used by the existing scheduler (reuse the same query).

## 9. Open questions
- **Q1** Rich-customer-create: two-call frontend composition (default) vs a thin atomic backend `crm.customers.createCustomer` wrapper (§3.1). Recommend default; staffreview to confirm against partial-failure tolerance.
- **Q2** New-subscription host: dedicated route/page `/.../subscriptions/new` (default — deep-linkable, breadcrumbed per A2) vs a modal dialog on the hub. Recommend the route.
- **Q3** Should "New customer" also live on the global CRM nav (not only `CrmHome`)? Default: `CrmHome` only this slice; revisit if discoverability UAT flags it.

---

## Git Workflow
**Branch:** `plan/subscription-creation-ui` (planning artifacts) → implementation branch cut fresh off `main` at execution time.
**Checkpoints:** per wave in the plan.

## Implementation Waves (filled by writing-plans)
### Wave 1: Schedule template + form primitives [PARALLEL]
### Wave 2: New-customer + new-subscription pages + activate [after W1]
### Wave 3: Verification [SEQUENTIAL] — code-auditor (access + patterns), Bash `npm run build`, component tests

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
