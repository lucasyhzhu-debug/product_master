# Phase D — CRM Surface (customer dashboard + activity timeline + agreements) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the manager+admin `/crm` surface that makes the merged Phase-A/B subscription + credit backend visible and reachable — customer dashboard, agreements, a per-customer activity timeline, credit-ledger statement, drawdown/gauge visuals — as additive code over existing tables (NO schema change).

**Architecture:** New `convex/crm/` backend module (queries/mutations + pure helpers) over existing tables; new `src/pages/crm/` + `src/components/crm/` React surface gated by `<ProtectedRoute requiredPermission="canAccessCrm">`. Read-only over the credit invariant (reads the derived `pool` from `getWeekPool`/`deriveCreditPool`, never re-keys totals). The timeline is a union of **derived** events (projected from orders/invoices/ledger/subscriptions/agreements at read time) and **logged** `customerActivity` rows. Activity visuals use a **two-level** taxonomy: a specific `customerActivity.type`/derived event maps TO a coarse `ActivityType` visual category.

**Tech Stack:** Convex (serverless DB + reactive queries), React 19 + TypeScript, Vite, shadcn/ui + Tailwind CSS 4, Recharts (drawdown chart — already a project dep via analytics), Vitest + convex-test, Playwright/`/browse` (UX-UAT).

## Global Constraints

- **NO schema change.** `customerActivity` (+ `by_customer_at`), `invoices.customerId`/`by_customer`/`by_subscriptionWeek`/`by_kind_paymentStatus`, `orders.by_subscription`/`by_subscriptionWeek`, `creditLedger.by_invoice`, `crmActivityTaxonomy.ts` all already exist (Phase B foundational PR). Any need for a new field/index → STOP and flag, do not add.
- **Access:** every new CRM `protectedQuery`/`protectedMutation` uses `roles: ["manager","admin"]` (superset of `canAccessCrm` — Pitfall #19; a manager mounting any CRM hook must never throw `Unauthorized`). Auth via `protectedQuery`/`protectedMutation` from `convex/lib/functions.ts` — `ctx.user` is injected, `SessionIdArg` auto-handled, **NO `token` arg**.
- **Money:** integer IDR everywhere; read the derived `pool` (`deriveCreditPool` via `getWeekPool`), never re-key a total. Week-scoped `balanceAfter` is NOT a subscription-lifetime balance.
- **WIB:** dates via `convex/lib/periodRange.ts` (backend) / `src/lib/dateUtils.ts` (frontend) only. No banned Phase-81 imports (Pitfall #18). `weekStart`/`weekEnd`/`deliveryDate` are absolute epoch ms — compare directly to `Date.now()`.
- **Dual surface (Pitfall #20):** any order-surface change lands in BOTH `OrderSlideOver.tsx` AND `OrderDetail.tsx` (and the kanban board).
- **Ship-dark:** `/crm` is m+a-gated from the first commit; nav links gated m+a (Header `configItems` + `MobileBottomNav moreItems`, Phase-85 pattern).
- **Codegen:** Phase D adds no index, but `npx convex codegen` MUST run after backend tasks so `convex/_generated/api.d.ts` reflects new functions; commit it (Phase-76/81 lesson).
- **Slice-0 ordering:** cut the feature branch off `main` AFTER Slice 0 (backend consolidation) merges — clean base, no functional dependency (CRM is m+a so nothing is stripped within it).

---

## Task List

Complete, flat index of every task. Detail sections below use these IDs. The Execution Strategy groups them into waves.

| ID | Title | Files (primary) | Wave | Depends-on |
|----|-------|-----------------|------|------------|
| T1 | Extend `crmActivityTaxonomy` + `getActivityVisual` + `eventType→ActivityType` mapper | `src/lib/crmActivityTaxonomy.ts` | 1 | — |
| T2 | `contactLinks` pure URL builder | `src/lib/contactLinks.ts` | 1 | — |
| T3 | `resolveCurrentWeek` backend helper | `convex/crm/helpers/currentWeek.ts` | 1 | — |
| T4 | `buildLedgerStatement` pure fn | `convex/crm/helpers/ledgerStatement.ts` | 1 | — |
| T5 | `updateCustomerCrmFields` mutation | `convex/crm/customers.ts` | 1 | — |
| T6 | `getCustomerRecord` + `getCrmHomeActiveSubscriptions` queries | `convex/crm/customers.ts` | 1 | T3 |
| T7 | Agreements backend (6 fns) | `convex/crm/agreements.ts` | 1 | — |
| T8 | `getCreditLedgerStatement` + `getWeekBackReferences` queries | `convex/crm/ledger.ts` | 1 | T4 |
| T9 | Codegen + API_REFERENCE stub (W1 backend barrier) | `convex/_generated/*` | 1 | T5,T6,T7,T8 |
| T10 | `Breadcrumbs.tsx` + `LinkableObject.tsx` (coming-in-Dx state) | `src/components/crm/` | 1 | — |
| T11 | `ContactLinks.tsx` | `src/components/crm/ContactLinks.tsx` | 1 | T2 |
| T12 | Nav wiring (Header + MobileBottomNav, m+a) + `/crm` route shell | `src/components/layout/*`, `src/App.tsx` | 1 | — |
| T13 | `CrmHome.tsx` (funding reuse + active-subs overview) | `src/pages/crm/CrmHome.tsx`, `src/App.tsx` | 1 | T6,T10,T12 |
| T14 | `CustomerDashboard.tsx` (two-pane) + CRM-fields edit form | `src/pages/crm/CustomerDashboard.tsx`, `src/App.tsx` | 1 | T6,T5,T10,T11 |
| T15 | `AgreementPage.tsx` + `AgreementUpload.tsx` | `src/pages/crm/AgreementPage.tsx`, `src/components/crm/AgreementUpload.tsx`, `src/App.tsx` | 1 | T7,T10 |
| T16 | `SubscriptionPage.tsx` (read-only, links parent) + `CreditLedgerStatement.tsx` | `src/pages/crm/SubscriptionPage.tsx`, `src/components/crm/CreditLedgerStatement.tsx`, `src/App.tsx` | 1 | T8,T10 |
| T17 | `WeekBackReferences.tsx` on B-built week/invoice page | `src/components/crm/WeekBackReferences.tsx`, `src/pages/crm/SubscriptionSchedulePage.tsx` | 1 | T8,T10 |
| T18 | Customer-name link on order surfaces (dual surface + kanban) | `src/components/orders/OrderSlideOver.tsx`, `src/pages/OrderDetail.tsx`, kanban | 1 | T10,T12 |
| T18b | Phase B UAT UX nits — U1 lock confirmed week · U3 suppress edit affordances on read-only sub orders · U4 dayOfWeek doc | `SubscriptionSchedulePage.tsx`, `OrderDetail.tsx`, `OrderSlideOver.tsx`, `convex/subscriptions/weeks.ts`/template validator | 1 | T17,T18 |
| T19 | `logCustomerInteraction` mutation | `convex/crm/timeline.ts` | 2 | T9 |
| T20 | `buildCustomerTimeline` pure fn + taxonomy coverage test | `convex/crm/helpers/timelineMerge.ts` | 2 | T1 |
| T21 | `getCustomerTimeline` query (derived source map + actor Map) | `convex/crm/timeline.ts` | 2 | T19,T20,T3 |
| T22 | `CustomerActivityPage.tsx` + `ActivityTimeline.tsx` + `TimelineItem.tsx` | `src/pages/crm/CustomerActivityPage.tsx`, `src/components/crm/*`, `src/App.tsx` | 2 | T21,T1,T10 |
| T23 | `DraftWhatsAppButton.tsx` (wa.me + log) on unpaid invoices (home + record) | `src/components/crm/DraftWhatsAppButton.tsx`, `CrmHome.tsx`, `CustomerDashboard.tsx` | 2 | T19,T2 |
| T24 | `buildDrawdownSeries` pure fn | `convex/crm/helpers/drawdownSeries.ts` | 2 | — |
| T25 | `getCustomerDrawdown` query | `convex/crm/drawdown.ts` | 2 | T24,T3,T9 |
| T26 | `CreditGauge.tsx` (reads derived pool) | `src/components/crm/CreditGauge.tsx`, `CustomerDashboard.tsx` | 2 | T6 |
| T27 | `DrawdownChart.tsx` + `SubscriptionSelector.tsx` | `src/components/crm/*`, `CustomerDashboard.tsx` | 2 | T25,T26 |
| T28 | Codegen + verification: type-check/build/test, code-auditor role grep, dual-surface | repo-wide | 3 | all W2 |
| T29 | Docs: CHANGELOG + API_REFERENCE + FILE_MAP | `docs/*` | 3 | T28 |
| T30 | Automated UX-UAT `/browse` pass → findings file (needs live env) | `docs/reviews/uat-phase-d-ux-findings-2026-06-24.md` | 3 | T28 |

---

## Execution Strategy — multi-agent, wave-gated

**Assumed executor:** `superpowers:subagent-driven-development` — one fresh subagent per task, two-stage review between tasks. Parallelize *within* a wave; **hard barrier between waves**.

### Wave dispatch map
- **Wave 1 (D1 scaffold) — up to ~6-wide.** Backend (T3,T4,T5,T6,T7,T8) and pure frontend libs (T1,T2,T10,T11) are mutually independent → dispatch in parallel. **T9 is the W1-backend barrier** (codegen on the merged backend tree) — runs solo AFTER T5–T8 land. Frontend pages T12–T18 depend on the backend functions existing in `api` (so on T9) + the scaffold components (T10,T11) → run after T9 + their listed deps; among themselves they parallelize EXCEPT for the shared `src/App.tsx` and the nav files (see serialization).
- **Wave 2 (D2 timeline + D3 visuals) — up to ~5-wide.** Pure fns T20,T24 first (no deps); mutations/queries T19,T21,T25 next; UI T22,T23,T26,T27 after their query deps. D2 and D3 are independent of each other and run concurrently. Re-run codegen once at the end of the W2 backend (folded into T28).
- **Wave 3 (verification) — sequential.** T28 (codegen + type-check + build + test + code-auditor) → T29 (docs) → T30 (UX-UAT, live env). The close-out `/triple-review` → `/simplify xhigh` runs in the MAIN session after T30, never a background agent.

### Shared / generated-file serialization (collision hazards)
- `convex/_generated/api.d.ts` — generated, NEVER hand-edited. Regen ONCE per wave on the merged tree (T9 for W1, inside T28 for W2). No two tasks regen in parallel.
- `src/App.tsx` — route registration is touched by T12,T13,T14,T15,T16,T22. **Serialize:** T12 lands the `/crm` route shell + a single lazy-import block; subsequent page tasks append their `<Route>` to it **sequentially** (one App.tsx writer at a time within the wave). Alternatively a dedicated routing sub-step per task runs serially after the page component is created.
- `src/components/layout/Header.tsx` + `MobileBottomNav.tsx` — nav entries owned solely by T12. No other task edits them.
- `src/pages/crm/CustomerDashboard.tsx` — created by T14, then EXTENDED by T23 (DraftWhatsApp), T26 (gauge), T27 (chart). These run sequentially (W1 then W2) so no parallel write; within W2, T26→T27 serialize, T23 independent region.
- `src/lib/crmActivityTaxonomy.ts` — extended once by T1 (W1); T20/T22 import it read-only.
- No `convex/schema.ts` edits anywhere (no schema change) → zero schema contention.

### Critical path (sets minimum wall-clock)
`T3 → T6 → T9 → T14 → (W2 barrier) → T21 → T22 → T28 → T29 → T30 → /triple-review → /simplify`. The backend-codegen barrier (T9) and the W1→W2 barrier are the two serialization points; everything else fans out around them.

### What can't be done headless (flag "pending", do NOT claim passed)
- **T30 UX-UAT** needs a LIVE env: `npx convex dev` + `npm run dev` + a manager PIN + the seed (T30 step 1 runs/extends `convex/subscriptions/_devSeed.ts`). The executor marks it "completed — findings captured" only after the findings file exists, non-empty, covering all screens; if no live env is available it is reported "pending: needs live env," not passed.
- Real-wallet/QRIS or external creds: N/A for Phase D.

### Close-out (MAIN session only)
After T30: `/triple-review` (address every Critical + Improvement) → `/simplify xhigh` (apply reuse/simplification cleanups) → re-run `npm run type-check && npm run build && npm run test && npx convex codegen` → only then is Phase D done.

---

## File Structure

**Backend (`convex/crm/`):**
- `customers.ts` — `updateCustomerCrmFields`, `getCustomerRecord`, `getCrmHomeActiveSubscriptions`
- `agreements.ts` — `generateAgreementUploadUrl`, `createSupplyAgreement`, `addAgreementVersion`, `linkAgreementToSubscription`, `getAgreement`, `listAgreementsByCustomer`
- `ledger.ts` — `getCreditLedgerStatement`, `getWeekBackReferences`
- `timeline.ts` — `logCustomerInteraction`, `getCustomerTimeline`
- `drawdown.ts` — `getCustomerDrawdown`
- `helpers/currentWeek.ts` — `resolveCurrentWeek` (ctx helper)
- `helpers/ledgerStatement.ts` — `buildLedgerStatement` (pure)
- `helpers/timelineMerge.ts` — `buildCustomerTimeline` (pure) + `TimelineItem` type + `eventTypeToCategory`
- `helpers/drawdownSeries.ts` — `buildDrawdownSeries` (pure)

**Frontend (`src/`):**
- `lib/crmActivityTaxonomy.ts` (extend) — `getActivityVisual`, `eventTypeToCategory`
- `lib/contactLinks.ts` (new pure) — `buildWaMeUrl`, `buildMailto`, `buildInstagramUrl`, `buildSocialUrl`
- `pages/crm/` — `CrmHome.tsx`, `CustomerDashboard.tsx`, `CustomerActivityPage.tsx`, `SubscriptionPage.tsx`, `AgreementPage.tsx`
- `components/crm/` — `Breadcrumbs.tsx`, `LinkableObject.tsx`, `ContactLinks.tsx`, `CreditLedgerStatement.tsx`, `WeekBackReferences.tsx`, `ActivityTimeline.tsx`, `TimelineItem.tsx`, `DraftWhatsAppButton.tsx`, `AgreementUpload.tsx`, `CreditGauge.tsx`, `DrawdownChart.tsx`, `SubscriptionSelector.tsx`
- `App.tsx` (routes), `components/layout/Header.tsx` + `MobileBottomNav.tsx` (nav)
- `components/orders/OrderSlideOver.tsx` + `pages/OrderDetail.tsx` + kanban (customer-name link)

**Tests:** co-located `__tests__/` per project convention (`convex/crm/helpers/__tests__/*.test.ts`, `src/components/crm/__tests__/*.test.tsx`).

---

## WAVE 1 — D1 scaffold

### Task T1: Extend `crmActivityTaxonomy` + `getActivityVisual` + `eventType→ActivityType` mapper

**Files:**
- Create: `convex/lib/activityEvents.ts` (the pure mapper — **must live in convex** so the backend timeline-merge (T20/T21) can import it; convex CANNOT import from `src/` — staffreview C1)
- Modify: `src/lib/crmActivityTaxonomy.ts` (visuals only; imports the category type from the convex module — Vite bundles plain TS from `convex/`)
- Test: `convex/lib/__tests__/activityEvents.test.ts` + `src/lib/__tests__/crmActivityTaxonomy.test.ts`

**Interfaces:**
- `convex/lib/activityEvents.ts` produces: `ActivityCategory = "order"|"finance"|"message"|"document"|"schedule"|"milestone"`; `EVENT_TYPES`/`EventType` (every specific event the timeline can emit); `eventTypeToCategory(eventType: EventType): ActivityCategory`. **Pure, no convex/server imports** so both runtimes can use it.
- `src/lib/crmActivityTaxonomy.ts` produces: `getActivityVisual(category: ActivityCategory, subtype?: string): ActivityVisual` over the existing `ACTIVITY_TAXONOMY`; re-exports `ActivityCategory` as `ActivityType`. These are the authoritative two-level model (spec AC17).

- [ ] **Step 1: Write the failing test**
```ts
import { describe, it, expect } from "vitest";
import { getActivityVisual, eventTypeToCategory, EVENT_TYPES } from "../crmActivityTaxonomy";

describe("crmActivityTaxonomy two-level model", () => {
  it("getActivityVisual returns the category visual, applying subtype override", () => {
    expect(getActivityVisual("finance").icon).toBe("💳");
    expect(getActivityVisual("finance", "funded").icon).toBe("✓"); // subtype override
  });
  it("every EventType maps to a real ActivityType category", () => {
    for (const et of EVENT_TYPES) {
      const cat = eventTypeToCategory(et);
      expect(getActivityVisual(cat)).toBeDefined();
    }
  });
});
```

- [ ] **Step 2: Run test, verify it fails** — `npx vitest run src/lib/__tests__/crmActivityTaxonomy.test.ts` → FAIL (`getActivityVisual` not exported).

- [ ] **Step 3a: Implement the pure mapper in `convex/lib/activityEvents.ts`** (convex-importable, no server imports)
```ts
export type ActivityCategory = "order" | "finance" | "message" | "document" | "schedule" | "milestone";
export const EVENT_TYPES = [
  // derived
  "order_placed", "order_delivered", "invoice_sent", "payment_funded",
  "topup", "week_reconciled", "schedule_changed",
  "subscription_started", "subscription_ended", "subscription_terminated",
  "agreement_uploaded", "agreement_signed", "customer_onboarded",
  // logged (customerActivity.type)
  "whatsapp_drafted", "note", "manual_milestone",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];
const EVENT_CATEGORY: Record<EventType, ActivityCategory> = {
  order_placed: "order", order_delivered: "order",
  invoice_sent: "finance", payment_funded: "finance", topup: "finance", week_reconciled: "finance",
  schedule_changed: "schedule",
  subscription_started: "milestone", subscription_ended: "milestone", subscription_terminated: "milestone",
  agreement_uploaded: "document", agreement_signed: "document",
  customer_onboarded: "milestone", manual_milestone: "milestone",
  whatsapp_drafted: "message", note: "message",
};
export function eventTypeToCategory(eventType: EventType): ActivityCategory {
  return EVENT_CATEGORY[eventType];
}
```

- [ ] **Step 3b: Extend `src/lib/crmActivityTaxonomy.ts`** (visuals only; import the category type from the convex module)
```ts
import { ActivityCategory } from "../../convex/lib/activityEvents";
export type ActivityType = ActivityCategory; // category IS the visual key
const SUBTYPE_ICON: Record<string, string> = { funded: "✓", reconcile: "⚖" };
export function getActivityVisual(category: ActivityType, subtype?: string): ActivityVisual {
  const base = ACTIVITY_TAXONOMY[category];
  if (subtype && SUBTYPE_ICON[subtype]) return { ...base, icon: SUBTYPE_ICON[subtype] };
  return base;
}
```
> Add a parity test: assert `ACTIVITY_TAXONOMY` has a key for every `ActivityCategory` the mapper can return (so the split stays consistent).

- [ ] **Step 4: Run test, verify PASS.**
- [ ] **Step 5: Commit** — `git commit -m "feat(crm): two-level activity taxonomy (getActivityVisual + eventType→category mapper)"`

---

### Task T2: `contactLinks` pure URL builder

**Files:** Create `src/lib/contactLinks.ts`; Test `src/lib/__tests__/contactLinks.test.ts`

**Interfaces:** Produces `buildWaMeUrl(phone)`, `buildMailto(email)`, `buildInstagramUrl(handle)`, `buildSocialUrl({platform,handle,url})` — all return `string | null` (null on empty).

- [ ] **Step 1: Failing test**
```ts
import { describe, it, expect } from "vitest";
import { buildWaMeUrl, buildMailto, buildInstagramUrl, buildSocialUrl } from "../contactLinks";
describe("contactLinks", () => {
  it("wa.me strips + and spaces", () => expect(buildWaMeUrl("+62 812-3456")).toBe("https://wa.me/628123456"));
  it("mailto", () => expect(buildMailto("a@b.com")).toBe("mailto:a@b.com"));
  it("instagram strips @", () => expect(buildInstagramUrl("@frollie")).toBe("https://instagram.com/frollie"));
  it("social prefers url", () => expect(buildSocialUrl({ platform: "tiktok", handle: "x", url: "https://t/x" })).toBe("https://t/x"));
  it("empty → null", () => expect(buildWaMeUrl("")).toBeNull());
});
```
- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Implement**
```ts
export function buildWaMeUrl(phone?: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^\d]/g, "");
  return digits ? `https://wa.me/${digits}` : null;
}
export function buildMailto(email?: string | null): string | null {
  return email ? `mailto:${email}` : null;
}
export function buildInstagramUrl(handle?: string | null): string | null {
  if (!handle) return null;
  return `https://instagram.com/${handle.replace(/^@/, "")}`;
}
export function buildSocialUrl(s?: { platform: string; handle: string; url?: string } | null): string | null {
  if (!s) return null;
  if (s.url) return s.url;
  return s.handle ? s.handle : null;
}
```
- [ ] **Step 4: Run, verify PASS.**
- [ ] **Step 5: Commit** — `git commit -m "feat(crm): contactLinks pure URL builder"`

---

### Task T3: `resolveCurrentWeek` backend helper

**Files:** Create `convex/crm/helpers/currentWeek.ts`; Test `convex/crm/helpers/__tests__/currentWeek.test.ts` (convex-test)

**Interfaces:** Produces `resolveCurrentWeek(ctx: QueryCtx, subscriptionId: Id<"subscriptions">, now?: number): Promise<Doc<"subscriptionWeeks"> | null>` — latest week with `weekStart ≤ now`; `null` if none started.

- [ ] **Step 1: Failing test** (convex-test) — seed two `subscriptionWeeks` (weekStart last-Monday and next-Monday); assert `resolveCurrentWeek` returns the last-Monday row given `now = today`.
```ts
import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "../../../schema";
import { resolveCurrentWeek } from "../currentWeek";
// seed sub + two weeks via t.run(async (ctx) => ctx.db.insert(...)); call resolveCurrentWeek in a t.run query ctx.
```
- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Implement**
```ts
import { QueryCtx } from "../../_generated/server";
import { Doc, Id } from "../../_generated/dataModel";
export async function resolveCurrentWeek(
  ctx: QueryCtx, subscriptionId: Id<"subscriptions">, now: number = Date.now(),
): Promise<Doc<"subscriptionWeeks"> | null> {
  return await ctx.db
    .query("subscriptionWeeks")
    .withIndex("by_subscription_weekStart", (q) =>
      q.eq("subscriptionId", subscriptionId).lte("weekStart", now))
    .order("desc")
    .first();
}
```
- [ ] **Step 4: Run, verify PASS.**
- [ ] **Step 5: Commit** — `git commit -m "feat(crm): resolveCurrentWeek helper (by_subscription_weekStart)"`

---

### Task T4: `buildLedgerStatement` pure fn

**Files:** Create `convex/crm/helpers/ledgerStatement.ts`; Test `convex/crm/helpers/__tests__/ledgerStatement.test.ts`

**Interfaces:** Produces `LedgerStatementRow = { type, signedAmount, balanceAfter, link: { kind: "order"|"invoice"|"week"|null, id: string|null }, createdBy, note?, at }` and `buildLedgerStatement(entries: Doc<"creditLedger">[]): { rows: LedgerStatementRow[] }`. `balanceAfter` is the stored week-scoped value (resets per week — do NOT recompute cross-week here).

- [ ] **Step 1: Failing test** — fixture: a `topup` (+100k), two `drawdown` (−30k each), a `rolloverFromWeekId` topup; assert each row's `signedAmount` mirrors stored `amount`, `balanceAfter` mirrors stored field, link resolves to orderId/invoiceId/rolloverFromWeekId.
- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Implement**
```ts
import { Doc } from "../../_generated/dataModel";
export type LedgerStatementRow = {
  type: Doc<"creditLedger">["type"];
  signedAmount: number;
  balanceAfter: number;
  link: { kind: "order" | "invoice" | "week" | null; id: string | null };
  createdBy: string;
  note?: string;
  at: number;
};
export function buildLedgerStatement(entries: Doc<"creditLedger">[]): { rows: LedgerStatementRow[] } {
  const rows = entries
    .slice()
    .sort((a, b) => a._creationTime - b._creationTime)
    .map((e) => ({
      type: e.type,
      signedAmount: e.amount, // already signed
      balanceAfter: e.balanceAfter, // week-scoped (resets per week — do NOT re-key)
      link: e.orderId ? { kind: "order" as const, id: e.orderId }
        : e.invoiceId ? { kind: "invoice" as const, id: e.invoiceId }
        : e.rolloverFromWeekId ? { kind: "week" as const, id: e.rolloverFromWeekId }
        : { kind: null, id: null },
      createdBy: e.createdBy,
      note: e.note,
      at: e._creationTime,
    }));
  return { rows };
}
```
- [ ] **Step 4: Run, verify PASS.**
- [ ] **Step 5: Commit** — `git commit -m "feat(crm): buildLedgerStatement pure fn (week-scoped balanceAfter)"`

---

### Task T5: `updateCustomerCrmFields` mutation

**Files:** Create `convex/crm/customers.ts`; Test `convex/crm/__tests__/customers.test.ts`

**Interfaces:** Produces `updateCustomerCrmFields({ customerId, keyContactName?, keyContactRole?, whatsapp?, email?, instagram?, otherSocials?, deliveryAddress?, storeAddress?, otherAddresses?, altPhone?, notes? }): Id<"customers">`. Patches only provided fields; does NOT widen legacy `customers.update`.

- [ ] **Step 1: Failing test** — m+a can patch `whatsapp`; non-provided fields untouched; `order_staff` token → `Unauthorized`.
- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Implement**
```ts
import { v } from "convex/values";
import { protectedMutation } from "../lib/functions";
export const updateCustomerCrmFields = protectedMutation({
  roles: ["manager", "admin"],
  args: {
    customerId: v.id("customers"),
    keyContactName: v.optional(v.string()),
    keyContactRole: v.optional(v.string()),
    whatsapp: v.optional(v.string()),
    email: v.optional(v.string()),
    instagram: v.optional(v.string()),
    otherSocials: v.optional(v.array(v.object({ platform: v.string(), handle: v.string(), url: v.optional(v.string()) }))),
    deliveryAddress: v.optional(v.string()),
    storeAddress: v.optional(v.string()),
    otherAddresses: v.optional(v.array(v.string())),
    altPhone: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { customerId, ...fields } = args;
    const patch = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
    await ctx.db.patch(customerId, patch);
    return customerId;
  },
});
```
- [ ] **Step 4: Run, verify PASS.**
- [ ] **Step 5: Commit** — `git commit -m "feat(crm): updateCustomerCrmFields mutation"`

---

### Task T6: `getCustomerRecord` + `getCrmHomeActiveSubscriptions` queries

**Files:** Modify `convex/crm/customers.ts`; Test `convex/crm/__tests__/customers.test.ts`

**Interfaces:**
- Consumes: `resolveCurrentWeek` (T3), `deriveCreditPool` (`convex/subscriptions/creditMath.ts`).
- Produces:
  - `getCustomerRecord({ customerId }): { customer, subscriptions: Doc<"subscriptions">[], agreements: Doc<"supplyAgreements">[], currentWeekPoolBySubscription: Record<Id<"subscriptions">, { week: Doc<"subscriptionWeeks">; pool: CreditPool } | null>, unpaidInvoices: Doc<"invoices">[] }`
  - `getCrmHomeActiveSubscriptions({}): { subscription, customerId, customerName, currentWeek }[]`

- [ ] **Step 1: Failing test** — seed customer + 2 subs + current weeks + ledger + 1 unpaid invoice; assert `currentWeekPoolBySubscription` has a pool per sub and `unpaidInvoices` excludes Paid.
- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Implement**
```ts
import { protectedQuery } from "../lib/functions";
import { resolveCurrentWeek } from "./helpers/currentWeek";
import { deriveCreditPool } from "../subscriptions/creditMath";

export const getCustomerRecord = protectedQuery({
  roles: ["manager", "admin"],
  args: { customerId: v.id("customers") },
  handler: async (ctx, args) => {
    const customer = await ctx.db.get(args.customerId);
    if (!customer) return null;
    const subscriptions = await ctx.db.query("subscriptions")
      .withIndex("by_customer", (q) => q.eq("customerId", args.customerId)).collect();
    const agreements = await ctx.db.query("supplyAgreements")
      .withIndex("by_customer", (q) => q.eq("customerId", args.customerId)).collect();
    const currentWeekPoolBySubscription: Record<string, { week: any; pool: any } | null> = {};
    for (const sub of subscriptions) { // bounded fan-out (few subs/customer)
      const week = await resolveCurrentWeek(ctx, sub._id);
      if (!week) { currentWeekPoolBySubscription[sub._id] = null; continue; }
      const entries = await ctx.db.query("creditLedger")
        .withIndex("by_subscriptionWeek", (q) => q.eq("subscriptionWeekId", week._id)).collect();
      currentWeekPoolBySubscription[sub._id] = { week, pool: deriveCreditPool(entries.map((e) => ({ type: e.type, amount: e.amount }))) };
    }
    const invoices = await ctx.db.query("invoices")
      .withIndex("by_customer", (q) => q.eq("customerId", args.customerId)).collect();
    const unpaidInvoices = invoices.filter((i) => i.paymentStatus !== "Paid");
    return { customer, subscriptions, agreements, currentWeekPoolBySubscription, unpaidInvoices };
  },
});

export const getCrmHomeActiveSubscriptions = protectedQuery({
  roles: ["manager", "admin"],
  args: {},
  handler: async (ctx) => {
    const subs = await ctx.db.query("subscriptions").collect();
    const active = subs.filter((s) => s.status === "active"); // confirm literal in schema
    const out = [];
    for (const s of active) {
      const customer = await ctx.db.get(s.customerId);
      const currentWeek = await resolveCurrentWeek(ctx, s._id);
      out.push({ subscription: s, customerId: s.customerId, customerName: customer?.name ?? null, currentWeek });
    }
    return out;
  },
});
```
> **Verified:** `subscriptions.status = draft|active|terminating|ended` (schema) — `s.status === "active"` is correct. Treat `terminating` as still-active-for-display if the UX wants in-flight terminations visible.
- [ ] **Step 4: Run, verify PASS.**
- [ ] **Step 5: Commit** — `git commit -m "feat(crm): getCustomerRecord + getCrmHomeActiveSubscriptions"`

---

### Task T7: Agreements backend (6 functions)

**Files:** Create `convex/crm/agreements.ts`; Test `convex/crm/__tests__/agreements.test.ts`

**Interfaces:** Produces:
- `generateAgreementUploadUrl({}): string` — **fresh** m+a wrapper over `ctx.storage.generateUploadUrl()` (NOT admin-only `businessSettings.generateUploadUrl`).
- `createSupplyAgreement({ customerId, subscriptionId?, fileStorageId, fileName, fileSize, status, signedDate?, governingLaw?, signatories?, keyTerms?, lang }): Id<"supplyAgreements">` — sets `uploadedBy = ctx.user._id`, `uploadedAt = Date.now()`; seeds `versions: [{ fileStorageId, fileName, uploadedAt, lang }]`.
- `addAgreementVersion({ agreementId, fileStorageId, fileName, lang }): Id<"supplyAgreements">` — appends to `versions[]`.
- `linkAgreementToSubscription({ agreementId, subscriptionId }): void` — writes BOTH `supplyAgreements.subscriptionId` AND `subscriptions.agreementId` atomically.
- `getAgreement({ agreementId }): Doc<"supplyAgreements"> | null`.
- `listAgreementsByCustomer({ customerId }): Doc<"supplyAgreements">[]` (via `by_customer`).

- [ ] **Step 1: Failing tests** — `generateAgreementUploadUrl` returns a string for manager (NOT throws); `createSupplyAgreement` sets uploadedBy + seeds versions; `linkAgreementToSubscription` patches both docs; `order_staff` → Unauthorized on each.
- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Implement** (key fns)
```ts
export const generateAgreementUploadUrl = protectedMutation({
  roles: ["manager", "admin"], args: {},
  handler: async (ctx) => await ctx.storage.generateUploadUrl(),
});
export const linkAgreementToSubscription = protectedMutation({
  roles: ["manager", "admin"],
  args: { agreementId: v.id("supplyAgreements"), subscriptionId: v.id("subscriptions") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.agreementId, { subscriptionId: args.subscriptionId });
    await ctx.db.patch(args.subscriptionId, { agreementId: args.agreementId });
  },
});
// createSupplyAgreement / addAgreementVersion / getAgreement / listAgreementsByCustomer per Interfaces above.
```
- [ ] **Step 4: Run, verify PASS.**
- [ ] **Step 5: Commit** — `git commit -m "feat(crm): supplyAgreements backend (upload url, create, version, link, get, list)"`

---

### Task T8: `getCreditLedgerStatement` + `getWeekBackReferences` queries

**Files:** Create `convex/crm/ledger.ts`; Test `convex/crm/__tests__/ledger.test.ts`

**Interfaces:**
- Consumes: `buildLedgerStatement` (T4).
- Produces:
  - `getCreditLedgerStatement({ subscriptionWeekId }): { rows: LedgerStatementRow[] }` — reads `creditLedger.by_subscriptionWeek`, pipes through `buildLedgerStatement`.
  - `getWeekBackReferences({ subscriptionWeekId }): { orders: Doc<"orders">[], ledgerEntries: Doc<"creditLedger">[], fundingInvoice: Doc<"invoices"> | null }` — orders via `orders.by_subscriptionWeek`; ledger via `by_subscriptionWeek`; fundingInvoice via the week's `weeklyInvoiceId`.

- [ ] **Step 1: Failing test** — seed week + ledger + orders + invoice; assert statement rows + back-ref sets.
- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Implement**
```ts
export const getCreditLedgerStatement = protectedQuery({
  roles: ["manager", "admin"], args: { subscriptionWeekId: v.id("subscriptionWeeks") },
  handler: async (ctx, args) => {
    const entries = await ctx.db.query("creditLedger")
      .withIndex("by_subscriptionWeek", (q) => q.eq("subscriptionWeekId", args.subscriptionWeekId)).collect();
    return buildLedgerStatement(entries);
  },
});
export const getWeekBackReferences = protectedQuery({
  roles: ["manager", "admin"], args: { subscriptionWeekId: v.id("subscriptionWeeks") },
  handler: async (ctx, args) => {
    const orders = await ctx.db.query("orders")
      .withIndex("by_subscriptionWeek", (q) => q.eq("subscriptionWeekId", args.subscriptionWeekId)).collect();
    const ledgerEntries = await ctx.db.query("creditLedger")
      .withIndex("by_subscriptionWeek", (q) => q.eq("subscriptionWeekId", args.subscriptionWeekId)).collect();
    const week = await ctx.db.get(args.subscriptionWeekId);
    const fundingInvoice = week?.weeklyInvoiceId ? await ctx.db.get(week.weeklyInvoiceId) : null;
    return { orders, ledgerEntries, fundingInvoice };
  },
});
```
- [ ] **Step 4: Run, verify PASS.**
- [ ] **Step 5: Commit** — `git commit -m "feat(crm): getCreditLedgerStatement + getWeekBackReferences"`

---

### Task T9: Codegen (W1 backend barrier)

**Files:** Modify `convex/_generated/*` (generated). No hand edits.

- [ ] **Step 1:** Run `npx convex codegen`.
- [ ] **Step 2:** Run `npm run type-check` — expect PASS (all new backend fns typecheck; `api.crm.*` resolves).
- [ ] **Step 3: Commit** — `git add convex/_generated && git commit -m "chore(crm): regen convex codegen after D1 backend"`

---

### Task T10: `Breadcrumbs.tsx` + `LinkableObject.tsx`

**Files:** Create `src/components/crm/Breadcrumbs.tsx`, `src/components/crm/LinkableObject.tsx`; Test `src/components/crm/__tests__/Breadcrumbs.test.tsx`

**Interfaces:** Produces `<Breadcrumbs trail={{ label, to? }[]} />` (chevron-separated, each segment a `<Link>` except the last); `<LinkableObject to={string|null} comingIn?={string} children />` — renders a `<Link>` when `to` is set, a muted "coming in {comingIn}" pill when `to` is null + `comingIn` set, plain text otherwise.

- [ ] **Step 1: Failing test** — trail of 3 renders 2 links + 1 current; `LinkableObject` with `to={null} comingIn="D2"` renders "coming in D2" (no anchor).
- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Implement** (shadcn/Tailwind; React Router `Link`; chevron `ChevronRight` from lucide-react). Render states per Interfaces.
- [ ] **Step 4: Run, verify PASS.**
- [ ] **Step 5: Commit** — `git commit -m "feat(crm): Breadcrumbs + LinkableObject (coming-in-Dx state)"`

---

### Task T11: `ContactLinks.tsx`

**Files:** Create `src/components/crm/ContactLinks.tsx`; Test `src/components/crm/__tests__/ContactLinks.test.tsx`

**Interfaces:** Consumes `contactLinks` (T2). Produces `<ContactLinks customer={Doc<"customers">} />` — renders phone/altPhone/whatsapp → wa.me, email → mailto, instagram → IG, `otherSocials[]` → their url; empty fields render gracefully (skipped).

- [ ] **Step 1: Failing test** — customer with whatsapp + email renders 2 anchors with correct hrefs; empty instagram → no anchor.
- [ ] **Step 2: Run, verify FAIL.** → **Step 3: Implement** → **Step 4: PASS** → **Step 5: Commit** `feat(crm): ContactLinks`

---

### Task T12: Nav wiring + `/crm` route shell

**Files:** Modify `src/components/layout/Header.tsx` (configItems), `src/components/layout/MobileBottomNav.tsx` (moreItems), `src/App.tsx` (lazy imports + `/crm` route group). Test: RTL smoke that a manager sees the CRM nav entry, order_staff does not.

**Interfaces:** Produces the `<Route path="/crm" ...>` group wrapped in `<ProtectedRoute requiredPermission="canAccessCrm">`; nav entries gated by `useAuth().user` permission (m+a).

- [ ] **Step 1: Failing test** — render Header as manager → "CRM" link present; as order_staff → absent.
- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Implement** — add `{ path: '/crm', label: 'CRM', icon: Contact, permission: 'canAccessCrm' }` (verified config shape, `Header.tsx:113`; import a lucide icon e.g. `Contact`/`Users`) to BOTH `Header.tsx` configItems AND `MobileBottomNav.tsx` moreItems; add the lazy route block in App.tsx (`CrmHome` registered here; page tasks append their routes serially).
- [ ] **Step 4: Run, verify PASS.** → **Step 5: Commit** `feat(crm): nav links (Header+MobileBottomNav, m+a) + /crm route shell`

---

### Task T13: `CrmHome.tsx`

**Files:** Create `src/pages/crm/CrmHome.tsx`; Modify `src/App.tsx` (route `/crm`). Test `src/pages/crm/__tests__/CrmHome.test.tsx`

**Interfaces:** Consumes `api.subscriptions.scheduling.queries.getFundingDashboard` (REUSE — do NOT rebuild), `api.crm.customers.getCrmHomeActiveSubscriptions`, `<Breadcrumbs>`, `<DraftWhatsAppButton>` (T23, wave 2 — until then the funding rows render without the button; T23 adds it). Two sections: "Needs funding" (from funding dashboard, each row links to the week + later a Draft-WhatsApp action) + "Active subscriptions" overview.

- [ ] **Step 1: Failing test** — renders both section headers; loading + empty states; a funding row links to `/crm/customers/:id/subscriptions/:subId/week`.
- [ ] **Step 2–4: TDD** (useSessionQuery hooks; `if (data === undefined) return <Loading/>`; empty states per D12).
- [ ] **Step 5: Commit** `feat(crm): CrmHome (funding reuse + active-subscriptions overview)`

---

### Task T14: `CustomerDashboard.tsx` (two-pane) + CRM-fields edit

**Files:** Create `src/pages/crm/CustomerDashboard.tsx`; Modify `src/App.tsx` (route `/crm/customers/:customerId`). Test `src/pages/crm/__tests__/CustomerDashboard.test.tsx`

**Interfaces:** Consumes `api.crm.customers.getCustomerRecord`, `api.crm.customers.updateCustomerCrmFields`, `<ContactLinks>`, `<Breadcrumbs>`, `<LinkableObject>`. Layout: LEFT pane = identity (contact via ContactLinks, addresses, notes, agreement link), RIGHT pane = financial story (gauge slot [T26], subscriptions list linking each to `/crm/customers/:id/subscriptions/:subId` , invoices & funding action, "View activity timeline →" link to `/crm/customers/:id/activity` rendered via `<LinkableObject comingIn="D2">` until T22 lands the route). Quick actions: Plan schedule (deep-link to B scheduler), Mark invoice paid → fund (deep-link), Settings (edit form). Timeline is NOT embedded.

- [ ] **Step 1: Failing test** — two panes render; contact links present; subscriptions list links resolve; edit form calls `updateCustomerCrmFields`; "View activity timeline →" present; empty states.
- [ ] **Step 2–4: TDD.**
- [ ] **Step 5: Commit** `feat(crm): CustomerDashboard two-pane + CRM-fields edit`

---

### Task T15: `AgreementPage.tsx` + `AgreementUpload.tsx`

**Files:** Create `src/pages/crm/AgreementPage.tsx`, `src/components/crm/AgreementUpload.tsx`; Modify `src/App.tsx` (route `/crm/customers/:customerId/agreements`). Test RTL.

**Interfaces:** Consumes `api.crm.agreements.*`. Upload flow: `generateAgreementUploadUrl` → POST file → `createSupplyAgreement`/`addAgreementVersion`. Page shows status, ID+EN `versions[]` (each openable via `useStorageUrl`/`getUrl`), last-uploaded date, "Linked subscriptions" section + link action. No auto-seeding.

- [ ] **Step 1: Failing test** — renders versions list + last-upload date; upload calls generate→create; linked-subscriptions section; empty state when unlinked.
- [ ] **Step 2–4: TDD.** → **Step 5: Commit** `feat(crm): AgreementPage + AgreementUpload (fresh m+a upload url, versions, linking)`

---

### Task T16: `SubscriptionPage.tsx` (read-only) + `CreditLedgerStatement.tsx`

**Files:** Create `src/pages/crm/SubscriptionPage.tsx`, `src/components/crm/CreditLedgerStatement.tsx`; Modify `src/App.tsx` (route `/crm/customers/:customerId/subscriptions/:subId`). Test RTL.

**Interfaces:** Consumes `api.subscriptions.queries.getSubscription`, `api.crm.ledger.getCreditLedgerStatement`, `<Breadcrumbs>`, `<LinkableObject>`. Page resolves + LINKS its parent customer (breadcrumb + link — audit #23, bidirectional). `CreditLedgerStatement` columns: type · signed amount · running week-scoped `balanceAfter` · per-entry link · createdBy · note. Week-scoped balance NOT presented as lifetime; if a cross-week cumulative is shown, compute it in the view layer from signed amounts.

- [ ] **Step 1: Failing test** — statement renders signed deltas + week-scoped running balance + per-entry anchors; parent-customer link present.
- [ ] **Step 2–4: TDD.** → **Step 5: Commit** `feat(crm): SubscriptionPage (read-only, links parent) + CreditLedgerStatement`

---

### Task T17: `WeekBackReferences.tsx` on B-built week/invoice page

**Files:** Create `src/components/crm/WeekBackReferences.tsx`; Modify `src/pages/crm/SubscriptionSchedulePage.tsx` (render the section). Test RTL.

**Interfaces:** Consumes `api.crm.ledger.getWeekBackReferences`. Renders three back-ref sections as navigable links: "orders that drew down this credit" (→ order detail), "ledger entries for this week" (→ statement rows), "invoice that funded this topup" (→ invoice page). Each object is a link.

- [ ] **Step 1: Failing test** — three sections render as anchor lists; empty states.
- [ ] **Step 2–4: TDD.** → **Step 5: Commit** `feat(crm): WeekBackReferences on week page (bidirectional links)`

---

### Task T18: Customer-name link on order surfaces (dual surface + kanban)

**Files:** Modify `src/components/orders/OrderSlideOver.tsx`, `src/pages/OrderDetail.tsx`, and the kanban board component (grep `customerName`/`customer_name`). Test RTL on both order surfaces.

**Interfaces:** Where each surface renders the customer name, wrap it in a `<Link to={`/crm/customers/${order.customerId}`}>` (only when `order.customerId` is set; guard nullable). Mirror the change in BOTH surfaces (Pitfall #20).

- [ ] **Step 1: Failing test** — OrderSlideOver renders customer name as anchor to `/crm/customers/:id`; OrderDetail same.
- [ ] **Step 2–4: TDD.** → **Step 5: Commit** `feat(crm): link customer name to /crm/customers/:id on order surfaces (dual surface)`

---

### Task T18b: Phase B UAT UX nits (U1 / U3 / U4)

Folds the three open Phase-B UAT findings that land on files this plan already edits (`docs/reviews/uat-subscription-phase-b-findings-2026-06-24.md`). The bigger findings U2 (operator "Mark delivered") and U5 (top-up/reconcile/out-of-credit UI) are a SEPARATE subsystem — own spec+plan pipeline, NOT here.

**Files:**
- Modify: `src/pages/crm/SubscriptionSchedulePage.tsx` (U1)
- Modify: `src/components/orders/OrderSlideOver.tsx` + `src/pages/OrderDetail.tsx` (U3, dual-surface — Pitfall #20)
- Modify: `convex/subscriptions/weeks.ts` + the schedule-template validator (U4 doc/validator comment)
- Test: RTL on the scheduler page + both order surfaces

**U1 — lock confirmed/invoiced weeks (🟡):** when `week.status` is not `planned` (i.e. `confirmed|invoiced|paid|delivering|reconciled|closed`), render the schedule grid truly read-only — disable quantity spinboxes, product dropdowns, Add/Remove-line buttons; show a "This week is confirmed — locked" banner. (Today the inputs stay interactive with no Save, so a non-tech user thinks edits stuck.)
- [ ] **Step 1: Failing test** — render `SubscriptionSchedulePage` with a `confirmed` week → quantity inputs are `disabled`, Remove button absent, locked banner present; a `planned` week stays editable.
- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Implement** — derive `const locked = week.status !== "planned"`; pass `disabled={locked}` to `DayPlanCell`/`ProductLineEditor`; gate Add/Remove on `!locked`; render the banner when `locked`.
- [ ] **Step 4: Run, verify PASS.**

**U3 — suppress edit affordances on read-only subscription orders (🔵):** on a subscription order (`order.subscriptionId` set) that the surface already declares read-only, hide the "Generate Invoice" action and the delivery-fee "Edit" on BOTH `OrderDetail` and `OrderSlideOver`.
- [ ] **Step 5: Failing test** — a subscription order in OrderDetail does NOT render "Generate Invoice" / fee "Edit"; a normal order still does. Mirror for OrderSlideOver.
- [ ] **Step 6: Run, verify FAIL.**
- [ ] **Step 7: Implement** — gate those affordances on `!isSubscriptionOrder(order)` (reuse the existing `isSubscriptionOrder`/`subscriptionId` check the strip seam uses); mirror in both files.
- [ ] **Step 8: Run, verify PASS.**

**U4 — document the `scheduleTemplate.dayOfWeek` 0=Monday convention (🟡):** add a one-line comment at the create/validate boundary (`createSubscription` / `validateScheduleTemplate`) and in `weeks.ts` stating `dayOfWeek` is 0-based-from-Monday (0=Mon…6=Sun), contradicting the JS Sun=0 convention used by `weekBounds.ts`. (No behavior change — comment only; the named-day picker is for the future create-subscription UI.)
- [ ] **Step 9: Implement** — add the comment; no test (doc-only).

- [ ] **Step 10: Commit** — `git commit -m "fix(subscriptions): Phase B UAT nits — lock confirmed week (U1), suppress read-only edit affordances (U3, dual surface), document dayOfWeek convention (U4)"`

---

## WAVE 2 — D2 timeline + D3 visuals

### Task T19: `logCustomerInteraction` mutation

**Files:** Create `convex/crm/timeline.ts`; Test `convex/crm/__tests__/timeline.test.ts`

**Interfaces:** Produces `logCustomerInteraction({ customerId, type, subtype?, note?, summary?, subscriptionId?, invoiceId?, orderId?, agreementId? }): Id<"customerActivity">` where `type ∈ customerActivity.type` stub (`whatsapp_drafted|note|manual_milestone`). Sets `at = Date.now()`, `actor = ctx.user._id`, `direction` from taxonomy.

> **Verify-first:** the stub `customerActivity.type` union (`whatsapp_drafted|note|manual_milestone`) covers all LOGGED events (whatsapp, notes, onboarded=manual_milestone subtype). Derived events are projected at read time, NOT stored — so NO schema change. Confirm before coding.

- [ ] **Step 1: Failing test** — manager logs `whatsapp_drafted` → row with actor + at; order_staff → Unauthorized.
- [ ] **Step 2–4: TDD.** → **Step 5: Commit** `feat(crm): logCustomerInteraction`

---

### Task T20: `buildCustomerTimeline` pure fn + taxonomy coverage test

**Files:** Create `convex/crm/helpers/timelineMerge.ts`; Test `convex/crm/helpers/__tests__/timelineMerge.test.ts`

**Interfaces:** Consumes `EventType`/`eventTypeToCategory` from `convex/lib/activityEvents` (T1 — convex-importable; resolved staffreview C1). Produces `TimelineItem = { id, eventType: EventType, at, actor?, title, detail, linkTo: { kind, id } }` and `buildCustomerTimeline(derived: TimelineItem[], logged: TimelineItem[], { sinceDays, types? }): { items: TimelineItem[] }` — desc by `at`, windowed at `sinceDays`, in-memory `types` (category) filter, stable tiebreaker `(at desc, id desc)`.

- [ ] **Step 1: Failing test** — fixture mixes orders+invoices+topups+milestones+logged whatsapp across the 14-day boundary: assert desc order, window cut, type filter, tiebreaker; AND assert every produced `eventType` resolves via `eventTypeToCategory` (coverage — a new event can't ship without a category).
- [ ] **Step 2–4: TDD.** → **Step 5: Commit** `feat(crm): buildCustomerTimeline pure merge + taxonomy coverage`

---

### Task T21: `getCustomerTimeline` query

**Files:** Modify `convex/crm/timeline.ts`; Test `convex/crm/__tests__/timeline.test.ts`

**Interfaces:** Consumes `buildCustomerTimeline` (T20), `resolveCurrentWeek` not needed here. Produces `getCustomerTimeline({ customerId, sinceDays?=14, types?, cursor? }): { items: TimelineItem[], nextCursor? }`. **Derived-event source map:** orders via `orders.by_customer`; invoices via `invoices.by_customer`; ledger topups/drawdowns via `subscriptions.by_customer` → per-sub `creditLedger.by_subscription` (bounded fan-out); milestones from `subscriptions` + `supplyAgreements`. Logged rows via `customerActivity.by_customer_at` (windowed). **Actor names:** collect distinct `createdBy`/`confirmedBy`/`uploadedBy`/`actor` ids → one `Map<Id<"users">,name>` (batch `ctx.db.get`), label rows from it (no per-row fetch). `types` filter is in-memory post-scan (documented, audit #7/B8).

- [ ] **Step 1: Failing test** — seed a customer with orders+invoices+ledger+agreement+logged rows; assert merged desc feed, 14-day window, actor names resolved, type filter.
- [ ] **Step 2–4: TDD.** → **Step 5: Commit** `feat(crm): getCustomerTimeline (derived source map + actor Map + in-memory type facet)`

---

### Task T22: `CustomerActivityPage.tsx` + `ActivityTimeline.tsx` + `TimelineItem.tsx`

**Files:** Create the three; Modify `src/App.tsx` (route `/crm/customers/:customerId/activity`). Test RTL.

**Interfaces:** Consumes `api.crm.timeline.getCustomerTimeline`, `getActivityVisual` (from `src/lib/crmActivityTaxonomy`), `eventTypeToCategory` (from `convex/lib/activityEvents`), `<Breadcrumbs>`. Use `useSessionQuery` for the read. Latest-on-top, default 14d, type-filter control, each row = icon disc (from `getActivityVisual(eventTypeToCategory(item.eventType), item.subtype)`) + title/detail, clickable into `item.linkTo`. "Load older" extends window via cursor.

- [ ] **Step 1: Failing test** — rows render desc with icon discs; filter toggles a type; a row links into its object; empty/loading states.
- [ ] **Step 2–4: TDD.** → **Step 5: Commit** `feat(crm): CustomerActivityPage + ActivityTimeline + TimelineItem`

---

### Task T23: `DraftWhatsAppButton.tsx`

**Files:** Create `src/components/crm/DraftWhatsAppButton.tsx`; Modify `CrmHome.tsx` + `CustomerDashboard.tsx` (render on unpaid invoice rows). Test RTL.

**Interfaces:** Consumes `buildWaMeUrl` (T2), `api.crm.timeline.logCustomerInteraction`. On click: open `wa.me` deep-link with a pre-filled dunning message AND call `logCustomerInteraction({ type: "whatsapp_drafted", customerId, invoiceId, summary })`. UI must NOT claim delivery — label "Draft WhatsApp reminder."

- [ ] **Step 1: Failing test** — click opens wa.me (mock `window.open`) and calls `logCustomerInteraction` with `whatsapp_drafted`.
- [ ] **Step 2–4: TDD.** → **Step 5: Commit** `feat(crm): DraftWhatsAppButton (wa.me + interaction log) on unpaid invoices`

---

### Task T24: `buildDrawdownSeries` pure fn

**Files:** Create `convex/crm/helpers/drawdownSeries.ts`; Test.

**Interfaces:** Produces `buildDrawdownSeries(deliveredByDay: {date,pcs}[], plannedDays: Doc<"subscriptionWeeks">["plannedDays"], poolTrajectory: {date,creditRemaining}[], today: number): { points: { date, deliveredPcs, plannedPcs, creditRemaining, isPast }[], leftoverFlag: boolean }` — solid (delivered, isPast) vs dashed (planned, future) partition at `today`; `leftoverFlag` true when projected `creditRemaining` > 0 at week end (Sunday). Single subscription only (no sum). Reuse the derived pool; never re-key.

- [ ] **Step 1: Failing test** — fixture across `today`: assert past/future partition + leftover flag fires only when end-of-week creditRemaining > 0.
- [ ] **Step 2–4: TDD.** → **Step 5: Commit** `feat(crm): buildDrawdownSeries pure fn (per-sub, today partition, leftover flag)`

---

### Task T25: `getCustomerDrawdown` query

**Files:** Create `convex/crm/drawdown.ts`; Test.

**Interfaces:** Consumes `resolveCurrentWeek` (T3), `buildDrawdownSeries` (T24), `deriveCreditPool`. Produces `getCustomerDrawdown({ subscriptionId, weekStart? }): { week, series }` — resolves the week (current if no weekStart), reads `plannedDays` + orders `by_subscription` filtered to the week (delivered partition by `deliveryDate`/status), builds the pool trajectory from `creditLedger.by_subscriptionWeek`, returns `buildDrawdownSeries(...)`. **One subscription** (no multi-sub sum, c4).

- [ ] **Step 1: Failing test** — seed week + plannedDays + delivered orders + ledger; assert series + leftover.
- [ ] **Step 2–4: TDD.** → **Step 5: Commit** `feat(crm): getCustomerDrawdown (per-subscription)`

---

### Task T26: `CreditGauge.tsx`

**Files:** Create `src/components/crm/CreditGauge.tsx`; Modify `CustomerDashboard.tsx` (render in right pane). Test RTL.

**Interfaces:** Consumes the `currentWeekPoolBySubscription` from `getCustomerRecord` (T6) — reads the derived `pool` (N1: `pool.creditRemaining`, not `week.creditRemaining`). Per-subscription gauge.

- [ ] **Step 1: Failing test** — renders `pool.creditRemaining` (not `week.creditRemaining`); empty state when pool null.
- [ ] **Step 2–4: TDD.** → **Step 5: Commit** `feat(crm): CreditGauge (reads derived pool)`

---

### Task T27: `DrawdownChart.tsx` + `SubscriptionSelector.tsx`

**Files:** Create both; Modify `CustomerDashboard.tsx`. Test RTL.

**Interfaces:** Consumes `api.crm.drawdown.getCustomerDrawdown`, `<SubscriptionSelector>`. Dual-axis (bars = pcs/day left, line = credit remaining right), solid=delivered + dashed/lighter=planned, "today" divider, leftover-credit flag. **One subscription at a time via the selector**; chart title names it; link to its page. NO summed roll-up (c4).

- [ ] **Step 1: Failing test** — selector switches subscription → chart refetches; title names the sub; solid/dashed partition present; leftover flag shows when set.
- [ ] **Step 2–4: TDD.** → **Step 5: Commit** `feat(crm): DrawdownChart + SubscriptionSelector (per-sub, no sum)`

---

## WAVE 3 — Verification

### Task T28: Codegen + verification gate

- [ ] `npx convex codegen` (W2 backend) + commit `_generated`.
- [ ] `npm run type-check` → PASS.
- [ ] `npm run build` → PASS (watch the vendor bundle cap — Pitfall #16; Recharts already chunked).
- [ ] `npm run test` → all green.
- [ ] **code-auditor agent:** grep every new `convex/crm/**` registration → assert `roles: ["manager","admin"]` (⊇ `canAccessCrm`, audit #19); confirm no `businessSettings.generateUploadUrl` reuse; confirm dual-surface customer-name link (T18) in BOTH order surfaces; no banned Phase-81 imports; WIB via `periodRange`.
- [ ] Commit any fixes; `git commit -m "chore(crm): verification gate (codegen, type-check, build, test, role audit)"`

### Task T29: Docs

- [ ] `docs/CHANGELOG.md` — Phase D CRM surface entry (always).
- [ ] `docs/API_REFERENCE.md` — new `convex/crm/*` queries/mutations.
- [ ] `docs/FILE_MAP.md` — CRM file area + permission rows (`/crm/*` → canAccessCrm).
- [ ] Commit `docs(crm): Phase D — CHANGELOG + API_REFERENCE + FILE_MAP`.

### Task T30: Automated UX-UAT `/browse` pass (needs live env)

- [ ] **Step 1 — seed:** run/extend `convex/subscriptions/_devSeed.ts` so a subscription customer has agreement (ID+EN), ≥2 subs, current week w/ plannedDays + ledger, ≥1 unpaid invoice, orders across statuses.
- [ ] **Step 2 — live env:** `npx convex dev` + `npm run dev`; log in with a manager PIN.
- [ ] **Step 3 — `/browse` walkthrough** role-playing a UX-demanding user: CRM home → customer dashboard → contact links → agreement upload+version+link → subscription page → ledger statement → week back-refs → activity timeline + filters → drawdown chart + selector → funding/mark-paid deep-links. Capture every nitpick/friction/confusing label/slow/empty/broken state.
- [ ] **Step 4 — write findings:** `docs/reviews/uat-phase-d-ux-findings-2026-06-24.md` — severity-tagged, screen-anchored, each with a suggested fix. This is a CAPTURE deliverable (backlog), not a fix pass. If no live env: report "pending: needs live env," do NOT claim passed.
- [ ] Commit `docs(crm): Phase D UX-UAT findings`.

### Close-out (MAIN session)
- [ ] `/triple-review` — address every Critical + Improvement.
- [ ] `/simplify xhigh` — apply cleanups.
- [ ] Re-run `npm run type-check && npm run build && npm run test && npx convex codegen`. Phase D done.

---

## Testing Summary
- **Pure fns (highest value):** `getActivityVisual`/`eventTypeToCategory` (T1), `contactLinks` (T2), `buildLedgerStatement` (T4), `buildCustomerTimeline` + taxonomy coverage (T20), `buildDrawdownSeries` (T24).
- **Backend (convex-test):** `resolveCurrentWeek` (T3), `updateCustomerCrmFields`+auth (T5), `getCustomerRecord`/active-subs (T6), agreements ×6 + auth (T7), ledger statement + back-refs (T8), `logCustomerInteraction`+auth (T19), `getCustomerTimeline` merge + actor names (T21), `getCustomerDrawdown` (T25). Every mutation tests an `order_staff` Unauthorized rejection.
- **RTL:** Breadcrumbs/LinkableObject, ContactLinks, CrmHome, CustomerDashboard (two-pane), AgreementPage, SubscriptionPage+statement, WeekBackReferences, order-surface customer link (dual), ActivityTimeline, DraftWhatsApp, CreditGauge, DrawdownChart+selector. Each asserts loading + empty states (D12).
- **UX-UAT:** T30 `/browse` (live env, findings file).

## Documentation Updates
- [ ] CHANGELOG.md (always)
- [ ] API_REFERENCE.md (new CRM backend)
- [ ] FILE_MAP.md (CRM file area + permissions)
- [ ] CLAUDE.md — add the activity-taxonomy two-level rule if it proves non-obvious

## Success Criteria
- [ ] `npm run type-check`, `npm run build`, `npm run test`, `npx convex codegen` (committed `_generated/`) all pass.
- [ ] All 17 ACs (AC1–AC17) in the spec satisfied; every new CRM `roles ⊇ canAccessCrm` (code-auditor grep).
- [ ] No schema change; revert = revert commits (`/gsd-undo`-friendly).
- [ ] UX-UAT findings file exists, non-empty, covers all screens.
- [ ] Close-out `/triple-review` + `/simplify xhigh` findings addressed.

## Git Workflow
**Branch:** `feature/subscription-phase-d-crm` — cut off **synced `main` AFTER Slice 0 merges**.
**Checkpoints:** commit per task (above); codegen barrier commits (T9, T28); squash-merge PR (spec + plan + both staffreviews) per repo convention.

## Rollback / Deployment
- Additive code only, no schema → revert commits to roll back.
- Deployment order: backend (W1/W2) → frontend; `npx convex codegen` committed; check `gh run list` after merge (split-brain guard, Pitfall — `lesson_convex_vercel_splitbrain`).
- Land after Slice 0 (clean base). No data backup needed (no migration).
