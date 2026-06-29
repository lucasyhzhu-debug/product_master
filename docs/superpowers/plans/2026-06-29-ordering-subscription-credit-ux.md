# Ordering Subscription-Credit UX (Slices 1–3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a B2B cafe's subscription obvious at customer-select time on the ordering sheet, let its credit fund the order, let staff reduce an undelivered day's order, and let "add more" create a new credit-funded order.

**Architecture:** Backend = Convex queries/mutations (`protectedQuery`/`protectedMutation`, session auth, role-gated). Frontend = React 19 + the existing `OrderCreate.tsx` ordering sheet, `CustomerSearch` dropdown, and `SubscriptionCreditBanner`. Slices 2–3 reuse shipped machinery (`itemCrud` mutations, `resyncWeekPlanFromOrders`, `createCreditFundedOrder`). The credit-reservation model (`orders.subscriptionCreditApplied`, drawn at delivery) is the load-bearing invariant.

**Tech Stack:** Convex, React 19, TypeScript, Vitest + convex-test, shadcn/ui, Tailwind.

**Source of truth:** `docs/superpowers/specs/2026-06-29-ordering-subscription-credit-ux-SPEC.md` (read it). Spec staffreview: `docs/reviews/staffreview-spec-ordering-subscription-credit-ux-2026-06-29.md`.

## Global Constraints

- **Counting unit = scheduled product pieces** (`orderItems.quantity` / `weeklyQty`), NOT BOM balls. (Business Rule #13 is sales/production volume, not the cafe quota.)
- **Credit remaining = the derived pool** `deriveCreditPool(weekLedger)` / `computeWeekAvailableCredit` — never re-key a denormalised total (CRM C10).
- **Roles ⊇ route permission:** `/orders/new` is `canAccessOrders` → reachable by `order_staff`, `manager`, `admin` (`src/lib/types.ts:774`). Any `protectedQuery`/`protectedMutation` a reachable component mounts MUST include `order_staff`, or it throws and the page crashes (CLAUDE.md Pitfall #19).
- **`customerType` is optional** — treat `undefined` as not-B2B.
- **Order features are dual-surface** — wire BOTH `OrderSlideOver.tsx` and `OrderDetail.tsx` (Pitfall #20).
- **Reservation invariant (Pitfall #23):** recognition draws `subscriptionCreditApplied ?? totalAmount` (`convex/subscriptions/recognition.ts:73`); `computeWeekAvailableCredit` nets `Σ subscriptionCreditApplied` over un-recognized orders. Any edit to a credit-funded order MUST keep `subscriptionCreditApplied` consistent with the new total.
- **TDD** (failing test first). **`npm run build` MUST pass before merge.** Triple-review Slices 2 & 3 (money path). CHANGELOG after each merge. Feature branch per slice. Convex auto-deploys on merge (marker-tag drift).

---

## Task List

| ID | Title | Files | Agent | Wave | Depends-on |
|----|-------|-------|-------|------|------------|
| **T1** | `listActiveSubscriptionsForCustomer` query (current-week credit) | `convex/subscriptions/queries.ts` | `convex-backend` | S1-A | — |
| **T2** | Customer-specific normalized search (name+companyName + digit phone/whatsapp/altPhone) | `convex/customers/queries.ts`, `convex/lib/phone.ts` (new) | `convex-backend` | S1-A | — |
| **T3** | Dedup-on-create across phone/whatsapp/altPhone (normalized) | `convex/crm/customers.ts` | `convex-backend` | S1-A | T2 (helper) |
| **T4** | `useActiveSubscriptionsForCustomer` hook | `src/hooks/useActiveSubscriptionsForCustomer.ts` (new) | `frontend-integrator` | S1-B | T1 |
| **T5** | `CustomerSearch` — `[B2B]` prefix + companyName render + widened types | `src/components/orders/CustomerSearch.tsx` | `react-ui-builder` | S1-B | T2 |
| **T6** | `OrderCreate` — subscription selector under Customer card, auto-select sole sub (fixes live bug) | `src/pages/OrderCreate.tsx`, `src/components/orders/SubscriptionSelector.tsx` (new) | `react-ui-builder` | S1-B | T4 |
| **T7** | Mirror `[B2B]`+companyName render into OrderForm + OrderFormPOS | `src/components/orders/OrderForm.tsx`, `src/components/orders/OrderFormPOS.tsx` | `react-ui-builder` | S1-B | T5 |
| **T8** | `editUndeliveredSubscriptionOrder` orchestrator (reduce items + re-derive reservation + resync) | `convex/subscriptions/editOrder.ts` (new) | `convex-backend` | S2-A | — |
| **T9** | Widen `resyncWeekPlanFromOrders` roles to match T8 | `convex/subscriptions/resyncPlan.ts` | `convex-backend` | S2-A | T8 (role decision) |
| **T10** | Edit-undelivered UI in `OrderSlideOver` | `src/components/orders/OrderSlideOver.tsx` | `react-ui-builder` | S2-B | T8 |
| **T11** | Edit-undelivered UI in `OrderDetail` (mirror) | `src/pages/OrderDetail.tsx` | `react-ui-builder` | S2-B | T8 |
| **T12** | "Add more" → credit-funded new order via existing mutation | `src/pages/OrderCreate.tsx` | `react-ui-builder` | S3 | T6 |
| **V1** | Type + pattern audit gate (per slice) | — | `code-auditor` | gate | per-slice |

---

## Execution Strategy — multi-agent, wave-gated

**One feature branch per slice** (`feature/sub-credit-ux-slice1`, `…-slice2`, `…-slice3`), each cut fresh off synced `main`, merged before the next starts (CLAUDE.md branch-per-phase). Within a slice, dispatch a wave in parallel, **barrier**, then the next.

**Wave dispatch map:**
- **Slice 1 / Wave S1-A (parallel, 3 agents):** T1, T2, T3. All different files. T3 imports the phone-normalize helper T2 creates (`convex/lib/phone.ts`) — so **T2 must land the helper before T3's dedup edit**; run T2→T3 sequentially OR have T2 commit `phone.ts` first. **Barrier:** run `npx convex dev --once` (codegen) on the merged tree so `_generated/api.d.ts` reflects the new query before frontend.
- **Slice 1 / Wave S1-B (parallel, 3 agents after barrier):** T4 (hook), T5 (CustomerSearch), T7 (mirror). Then **T6** depends on T4's hook — run T6 after T4. T5 and T7 are independent render-only edits.
- **Gate V1:** `code-auditor` + `npm run build`. Merge Slice 1.
- **Slice 2 / Wave S2-A:** T8 (the money-path orchestrator) solo on the critical path; T9 follows once T8's role set is decided. Codegen barrier.
- **Slice 2 / Wave S2-B (parallel, 2 agents):** T10, T11 (different files — the two order surfaces). Gate V1 + **triple-review (money path)**. Merge Slice 2.
- **Slice 3:** T12 solo (reuses Slice 1 selector + existing `createCreditFundedOrder`). Gate V1 + **triple-review (money path)**. Merge Slice 3.

**Shared / generated-file serialization:**
- `convex/_generated/api.d.ts` — codegen artifact; regenerate once per backend wave on the merged tree, never per-task in parallel.
- `convex/lib/phone.ts` — created by T2, consumed by T3: order T2→T3.
- `src/pages/OrderCreate.tsx` — touched by T6 (Slice 1) and T12 (Slice 3), but in **different slices/branches** → no intra-wave collision.
- No two tasks within one wave write the same file.

**Critical path (sets min wall-clock):** T2 → T6 → (merge S1) → T8 → T10/T11 → (merge S2) → T12. Slice 2's T8 is the longest single task (money-path mutation + tests).

**What can't be done headless:** the final `/persona-uat` gate needs a live env (`npx convex dev` + `npm run dev` + manager-PIN login) to drive the real ordering sheet (select a B2B customer → see selector → fund order → reduce a day). If the executor can't bring a live env up headless, flag persona-UAT `pending: needs live env` — do NOT claim done.

**Close-out runs in the main session** (never a background agent), per slice: `/triple-review` → `/simplify xhigh` → (Slices touching FE journeys) `/persona-uat`. This plan touches FE journeys → persona-UAT applies.

**Best-fit agents:** see the Agent column. `convex-backend` for all `convex/` work (project-primed); `react-ui-builder` for UI; `frontend-integrator` for the hook wiring; `code-auditor` for the between-wave gate; `tdd-test-architect` may author the convex-test files if a backend agent prefers to delegate tests.

**Recommended new agents:** none. The existing roster covers every task; no recurring gap justifies building one for this slice.

---

## File Structure

**New files:**
- `convex/lib/phone.ts` — `normalizePhone(s): string` (digits-only, Indonesian leading `0`/`+62`/`62` collapsed) + `phoneMatches(query, candidate): boolean`. One responsibility: phone-identity normalization, reused by search (T2) and dedup (T3).
- `src/hooks/useActiveSubscriptionsForCustomer.ts` — thin `useSessionQuery` wrapper over T1.
- `src/components/orders/SubscriptionSelector.tsx` — presentational selector (radio/auto-select) for the Customer card.
- `convex/subscriptions/editOrder.ts` — `editUndeliveredSubscriptionOrder` orchestrator (T8).

**Modified files:** `convex/subscriptions/queries.ts`, `convex/customers/queries.ts`, `convex/crm/customers.ts`, `convex/subscriptions/resyncPlan.ts`, `src/components/orders/CustomerSearch.tsx`, `src/pages/OrderCreate.tsx`, `src/components/orders/OrderForm.tsx`, `src/components/orders/OrderFormPOS.tsx`, `src/components/orders/OrderSlideOver.tsx`, `src/pages/OrderDetail.tsx`.

---

## SLICE 1 — branch `feature/sub-credit-ux-slice1`

### Task T1: `listActiveSubscriptionsForCustomer` query

**Files:**
- Modify: `convex/subscriptions/queries.ts` (add export)
- Test: `convex/subscriptions/__tests__/listActiveSubscriptionsForCustomer.test.ts` (new)

**Interfaces:**
- Produces: `api.subscriptions.queries.listActiveSubscriptionsForCustomer({ customerId }) → Array<{ subscriptionId: Id<"subscriptions">, label: string, creditRemaining: number | null }>`
- Consumes: `computeWeekAvailableCredit(ctx, weekId)` from `convex/subscriptions/creditReservation.ts`; `getWibDateStr` from `convex/lib/periodRange.ts`.

- [ ] **Step 1: Write the failing test**

```ts
// convex/subscriptions/__tests__/listActiveSubscriptionsForCustomer.test.ts
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "../../schema";
import { api } from "../../_generated/api";
import { modules } from "../../test.setup"; // existing helper pattern in this dir

test("returns active subs only, with current-week creditRemaining", async () => {
  const t = convexTest(schema, modules);
  // seed: a customer, one active + one ended subscription, a paid current week with credit.
  // (mirror seeding in creditContext.test.ts)
  const { customerId, activeSubId, sessionId } = await seedActiveSubWithWeek(t);
  const out = await t.query(api.subscriptions.queries.listActiveSubscriptionsForCustomer, {
    sessionId, customerId,
  });
  expect(out).toHaveLength(1);
  expect(out[0].subscriptionId).toBe(activeSubId);
  expect(out[0].creditRemaining).toBeGreaterThan(0);
});

test("order_staff is authorized; kitchen is rejected", async () => {
  const t = convexTest(schema, modules);
  const { customerId, sessionStaff, sessionKitchen } = await seedRoles(t);
  await expect(
    t.query(api.subscriptions.queries.listActiveSubscriptionsForCustomer, { sessionId: sessionStaff, customerId }),
  ).resolves.toBeDefined();
  await expect(
    t.query(api.subscriptions.queries.listActiveSubscriptionsForCustomer, { sessionId: sessionKitchen, customerId }),
  ).rejects.toThrow(/not in/);
});
```

- [ ] **Step 2: Run test — expect FAIL** (`npx vitest run convex/subscriptions/__tests__/listActiveSubscriptionsForCustomer.test.ts`) — fails: query not defined.

- [ ] **Step 3: Implement the query**

```ts
// append to convex/subscriptions/queries.ts
import { computeWeekAvailableCredit } from "./creditReservation";
// getWibDateStr already imported

export const listActiveSubscriptionsForCustomer = protectedQuery({
  roles: ["order_staff", "manager", "admin"], // Pitfall #19: route is canAccessOrders
  args: { customerId: v.id("customers") },
  handler: async (ctx, args) => {
    const subs = (
      await ctx.db
        .query("subscriptions")
        .withIndex("by_customer", (q) => q.eq("customerId", args.customerId))
        .collect()
    ).filter((s) => s.status === "active");

    const todayMs = Date.now(); // read-only query: drift-free is not required for "current week"
    const out: Array<{
      subscriptionId: Id<"subscriptions">;
      label: string;
      creditRemaining: number | null;
    }> = [];

    for (const sub of subs) {
      // Resolve the current open funded week (today within [weekStart, weekEnd], paid/delivering).
      const weeks = await ctx.db
        .query("subscriptionWeeks")
        .withIndex("by_subscription_weekStart", (q) => q.eq("subscriptionId", sub._id))
        .collect();
      const week =
        weeks.find(
          (w) =>
            w.weekStart <= todayMs &&
            todayMs <= w.weekEnd &&
            (w.status === "paid" || w.status === "delivering"),
        ) ?? null;
      let creditRemaining: number | null = null;
      if (week) {
        ({ availableCredit: creditRemaining } = await computeWeekAvailableCredit(ctx, week._id));
      }
      // NOTE: do NOT return unitPrice (confidential partner price, CRM D11).
      out.push({ subscriptionId: sub._id, label: sub.label, creditRemaining });
    }
    return out;
  },
});
```

- [ ] **Step 4: Run test — expect PASS.**
- [ ] **Step 5: Commit** — `git commit -m "feat(subscriptions): listActiveSubscriptionsForCustomer query for order-sheet selector"`

> Verify-first: `by_subscription_weekStart` index exists (used in `getSubscriptionCreditContext`); week `status` literals include `paid`/`delivering`.

---

### Task T2: Customer-specific normalized search

**Files:**
- Create: `convex/lib/phone.ts`
- Modify: `convex/customers/queries.ts:30-38` (replace the generic `textSearch` call in `search`)
- Test: `convex/customers/__tests__/search.test.ts` (new)

**Interfaces:**
- Produces: `normalizePhone(raw: string): string`, `phoneMatches(query: string, candidate?: string | null): boolean`. `api.customers.queries.search` unchanged signature (`{ query, limit? }`) but now matches name + companyName + normalized phone/whatsapp/altPhone, still returns full `Doc<"customers">[]`.

- [ ] **Step 1: Write the failing test**

```ts
// convex/customers/__tests__/search.test.ts
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "../../schema";
import { api } from "../../_generated/api";
import { modules } from "../../test.setup";

test("matches a number stored in whatsapp, not phone", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("customers", { name: "Cafe A", whatsapp: "0812-3456-7890", createdBy: "x" });
  });
  const r = await t.query(api.customers.queries.search, { query: "081234567890" });
  expect(r.map((c) => c.name)).toContain("Cafe A");
});

test("normalizes +62 vs 0 prefix to one identity", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("customers", { name: "Cafe B", phone: "+6281122334455", createdBy: "x" });
  });
  const r = await t.query(api.customers.queries.search, { query: "081122334455" });
  expect(r.map((c) => c.name)).toContain("Cafe B");
});

test("still matches name and companyName substrings", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("customers", { name: "Marchella", companyName: "Amsterdam Thin Co", createdBy: "x" });
  });
  expect((await t.query(api.customers.queries.search, { query: "amsterdam" })).length).toBe(1);
});
```

- [ ] **Step 2: Run test — expect FAIL** (whatsapp/normalization not matched).

- [ ] **Step 3: Implement `phone.ts` + rewrite `search`**

```ts
// convex/lib/phone.ts
/** Digits-only, with Indonesian country-code collapsed to a national form.
 *  "+62 812-3456" -> "812345..."  "0812 3456" -> "812345..."  so the two are equal. */
export function normalizePhone(raw: string): string {
  let d = (raw ?? "").replace(/\D/g, "");
  if (d.startsWith("62")) d = d.slice(2);
  if (d.startsWith("0")) d = d.replace(/^0+/, "");
  return d;
}
/** True if `query` (when it looks like a number) matches `candidate` as one phone identity. */
export function phoneMatches(query: string, candidate?: string | null): boolean {
  if (!candidate) return false;
  const q = normalizePhone(query);
  if (q.length < 4) return false; // too short to be a meaningful phone match
  return normalizePhone(candidate).includes(q);
}
```

```ts
// convex/customers/queries.ts — replace the search handler body
import { normalizePhone, phoneMatches } from "../lib/phone";

export const search = query({
  args: { query: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const q = args.query.trim();
    const lower = q.toLowerCase();
    const looksNumeric = normalizePhone(q).length >= 4;
    const all = await ctx.db.query("customers").collect(); // same full-scan cost as textSearch
    return all
      .filter((c) => {
        if (c.name?.toLowerCase().includes(lower)) return true;
        if (c.companyName?.toLowerCase().includes(lower)) return true;
        if (looksNumeric) {
          return (
            phoneMatches(q, c.phone) ||
            phoneMatches(q, c.whatsapp) ||
            phoneMatches(q, c.altPhone)
          );
        }
        return false;
      })
      .slice(0, args.limit ?? 20);
  },
});
```

- [ ] **Step 4: Run test — expect PASS.**
- [ ] **Step 5: Commit** — `git commit -m "feat(customers): search matches normalized phone/whatsapp/altPhone + companyName"`

---

### Task T3: Dedup-on-create across phone/whatsapp/altPhone

**Files:**
- Modify: `convex/crm/customers.ts:99-` (the dedup block in `createCustomer`)
- Test: `convex/crm/__tests__/createCustomer.dedup.test.ts` (new)

**Interfaces:**
- Consumes: `normalizePhone`/`phoneMatches` from `convex/lib/phone.ts` (T2).

- [ ] **Step 1: Write the failing test**

```ts
test("creating with a whatsapp matching an existing phone dedups (no 2nd row)", async () => {
  const t = convexTest(schema, modules);
  const { sessionMgr } = await seedManager(t);
  await t.run(async (ctx) => {
    await ctx.db.insert("customers", { name: "Cafe C", phone: "081200001111", createdBy: "x" });
  });
  await t.mutation(api.crm.customers.createCustomer, {
    sessionId: sessionMgr, name: "Cafe C (wa)", whatsapp: "+62 812 0000 1111",
  });
  const rows = await t.run((ctx) => ctx.db.query("customers").collect());
  expect(rows).toHaveLength(1); // deduped onto the existing row
});
```

- [ ] **Step 2: Run test — expect FAIL** (exact `by_phone` match misses whatsapp/normalization → 2 rows).

- [ ] **Step 3: Implement** — before the insert, after the existing exact-`by_phone` check, add a normalized fallback scan across `phone`/`whatsapp`/`altPhone` for any of the new customer's numbers; on hit, gap-fill enrich the existing row (same pattern as the current exact-match branch) and return its id instead of inserting.

```ts
// in createCustomer, replace the phone-only dedup with a normalized multi-field check:
const candidateNumbers = [args.phone, args.whatsapp, args.altPhone].filter(Boolean) as string[];
if (candidateNumbers.length > 0) {
  const all = await ctx.db.query("customers").collect();
  const existing = all.find((c) =>
    candidateNumbers.some(
      (n) => phoneMatches(n, c.phone) || phoneMatches(n, c.whatsapp) || phoneMatches(n, c.altPhone),
    ),
  );
  if (existing) {
    /* ...existing gap-fill enrich branch, return existing._id... */
  }
}
```

- [ ] **Step 4: Run test — expect PASS.** Re-run existing `createCustomer` tests (no regression).
- [ ] **Step 5: Commit** — `git commit -m "fix(crm): dedup customers across normalized phone/whatsapp/altPhone"`

> NOTE: the full-scan replaces the indexed `by_phone` lookup. Acceptable at current customer-table size (matches the search-scan pattern). The concurrent-same-phone race (#211) remains out of scope (no unique constraint).

---

### Task T4: `useActiveSubscriptionsForCustomer` hook

**Files:**
- Create: `src/hooks/useActiveSubscriptionsForCustomer.ts`

**Interfaces:**
- Consumes: `api.subscriptions.queries.listActiveSubscriptionsForCustomer` (T1).
- Produces: `useActiveSubscriptionsForCustomer(customerId: Id<"customers"> | null) → { subs, isLoading }` where `subs: Array<{subscriptionId, label, creditRemaining}> | null`.

- [ ] **Step 1: Implement** (mirror `useSubscriptionCreditContext.ts` shape — `useSessionQuery`, `"skip"` when `customerId` null).

```ts
import { useSessionQuery } from "convex-helpers/react/sessions";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

export function useActiveSubscriptionsForCustomer(customerId: Id<"customers"> | null) {
  const subs = useSessionQuery(
    api.subscriptions.queries.listActiveSubscriptionsForCustomer,
    customerId ? { customerId } : "skip",
  );
  return { subs: subs ?? null, isLoading: customerId != null && subs === undefined };
}
```

- [ ] **Step 2: Commit** — `git commit -m "feat(hooks): useActiveSubscriptionsForCustomer"` (type-check only; behavior covered by T6).

---

### Task T5: `CustomerSearch` — `[B2B]` prefix + companyName

**Files:**
- Modify: `src/components/orders/CustomerSearch.tsx` (props/handler types lines 9-11, 44; dropdown render lines 152-163; selected display lines 84-95)

**Interfaces:**
- Consumes: `Doc<"customers">` fields `customerType`, `companyName` (already returned by `search`).
- Produces: dropdown rows showing `[B2B] <name> — <companyName>` for `customerType === "b2b_wholesale"`.

- [ ] **Step 1: Write a component test** (`src/components/orders/__tests__/CustomerSearch.test.tsx`) — render with a mocked `useCustomerSearch` returning a `b2b_wholesale` customer with `companyName`; assert the row text contains `[B2B]` and the companyName; a `direct_b2c` customer shows no `[B2B]`.
- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement** — widen the local customer type in props/handler to include `customerType?: "direct_b2c" | "b2b_wholesale" | null` and `companyName?: string | null`; in the dropdown `<div className="font-medium">` render a `[B2B]` badge/prefix when B2B and append `— {companyName}` when present (treat `undefined` as not-B2B). Mirror in the selected-state display (lines 84-95).
- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** — `git commit -m "feat(orders): [B2B] flag + companyName in customer dropdown"`

---

### Task T6: `OrderCreate` — subscription selector under Customer card (fixes the live bug)

**Files:**
- Create: `src/components/orders/SubscriptionSelector.tsx`
- Modify: `src/pages/OrderCreate.tsx` (Customer card lines 711-733; uses `selectedSubId`/`setSelectedSubId` at 114)

**Interfaces:**
- Consumes: `useActiveSubscriptionsForCustomer` (T4); existing `selectedSubId` state.
- Produces: a selector rendered inside the Customer card whenever the selected customer has ≥1 active sub; sets `selectedSubId`. **Auto-selects the sole sub when exactly one** (fixes live-bug Facet B).

- [ ] **Step 1: Write a component test** for `SubscriptionSelector` — (a) one sub → renders a control AND fires `onSelect(theOnlySubId)` on mount (auto-select); (b) two subs → renders a radio group, no auto-select; (c) zero subs → renders nothing.
- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement `SubscriptionSelector.tsx`**

```tsx
import { useEffect } from "react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/utils";
import type { Id } from "../../../convex/_generated/dataModel";

interface SubOption { subscriptionId: Id<"subscriptions">; label: string; creditRemaining: number | null; }
interface Props {
  subs: SubOption[] | null;
  selectedSubId: Id<"subscriptions"> | null;
  onSelect: (id: Id<"subscriptions">) => void;
}
export function SubscriptionSelector({ subs, selectedSubId, onSelect }: Props) {
  // Auto-select the sole subscription (live-bug Facet B fix).
  useEffect(() => {
    if (subs && subs.length === 1 && selectedSubId !== subs[0].subscriptionId) {
      onSelect(subs[0].subscriptionId);
    }
  }, [subs, selectedSubId, onSelect]);

  if (!subs || subs.length === 0) return null;
  return (
    <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-950">
      <p className="mb-1 text-xs font-semibold text-blue-800 dark:text-blue-200">Subscription</p>
      <RadioGroup value={selectedSubId ?? ""} onValueChange={(v) => onSelect(v as Id<"subscriptions">)} className="gap-1">
        {subs.map((s) => (
          <div key={s.subscriptionId} className="flex items-center gap-2">
            <RadioGroupItem value={s.subscriptionId} id={`sel-${s.subscriptionId}`} />
            <Label htmlFor={`sel-${s.subscriptionId}`} className="cursor-pointer text-sm text-blue-800 dark:text-blue-200">
              {s.label}
              {s.creditRemaining != null && (
                <span className="ml-1 text-muted-foreground">({formatCurrency(s.creditRemaining)} left this week)</span>
              )}
            </Label>
          </div>
        ))}
      </RadioGroup>
    </div>
  );
}
```

- [ ] **Step 4: Wire into `OrderCreate.tsx`** — inside the Customer card (after `<CustomerSearch />`, line ~732), add:

```tsx
const { subs: activeSubs } = useActiveSubscriptionsForCustomer(customerId);
// ...in the Customer card, regardless of items/dueDate/role:
<SubscriptionSelector subs={activeSubs} selectedSubId={selectedSubId} onSelect={setSelectedSubId} />
```

The existing `SubscriptionCreditBanner` (line 902) stays for the per-line split detail once items+dueDate exist; remove its role-gated radio dependency on first selection by keeping `selectedSubId` driven from the new selector. The Fulfil button still requires items + due date (`handleFulfilWithCredit`, line 419) — unchanged.

- [ ] **Step 5: Run component + `npm run build` — expect PASS.**
- [ ] **Step 6: Commit** — `git commit -m "feat(orders): subscription selector under customer name; auto-select sole sub (fixes live credit bug)"`

> Verify-first: `selectedSubId`/`setSelectedSubId` at `OrderCreate.tsx:114`; Customer card at 711-733.

---

### Task T7: Mirror `[B2B]`+companyName into OrderForm + OrderFormPOS

**Files:** Modify `src/components/orders/OrderForm.tsx`, `src/components/orders/OrderFormPOS.tsx` (their customer-dropdown render).

- [ ] **Step 1:** locate each file's `useCustomerSearch` result render; apply the same `[B2B]`+companyName render as T5 (render-only; the search-match fix is already shared via T2).
- [ ] **Step 2:** `npm run build`.
- [ ] **Step 3: Commit** — `git commit -m "feat(orders): mirror [B2B]+companyName dropdown render into OrderForm/OrderFormPOS (Pitfall #20)"`

> If either form does not render a custom customer dropdown (delegates to `CustomerSearch`), note that in the commit and skip — no silent half-fix.

### Slice 1 gate (V1)
- [ ] `code-auditor` (type + pattern compliance) on the slice diff.
- [ ] `npm run build` PASS. Merge `feature/sub-credit-ux-slice1`. CHANGELOG entry.

---

## SLICE 2 — branch `feature/sub-credit-ux-slice2` (money path → triple-review)

### Task T8: `editUndeliveredSubscriptionOrder` orchestrator

**Files:**
- Create: `convex/subscriptions/editOrder.ts`
- Test: `convex/subscriptions/__tests__/editOrder.test.ts` (new)

**Interfaces:**
- Produces: `api.subscriptions.editOrder.editUndeliveredSubscriptionOrder({ orderId, lines: Array<{ itemId: Id<"orderItems">, newQty: number }> }) → { ok: true }`. `newQty === 0` removes the line.
- Consumes: the item-edit logic from `convex/orders/mutations/itemCrud.ts` (reductions update `orderItems` + `orderItemProduction` + totals); `resyncWeekPlanFromOrders` (T9); `computeWeekAvailableCredit`.

**Role decision (per IMP-2):** make this `protectedMutation` with `roles: ["order_staff","manager","admin"]` (order staff edit daily orders). Therefore **T9 widens `resyncWeekPlanFromOrders` to the same set.**

- [ ] **Step 1: Write the failing tests**

```ts
test("reducing a credit-funded order lowers subscriptionCreditApplied and frees pool credit", async () => {
  const t = convexTest(schema, modules);
  const { sessionStaff, orderId, weekId, itemId } = await seedCreditFundedUndeliveredOrder(t, { qty: 10, unitPrice: 29000 });
  const before = await t.run((ctx) => computeWeekAvailableCredit(ctx, weekId));
  await t.mutation(api.subscriptions.editOrder.editUndeliveredSubscriptionOrder, {
    sessionId: sessionStaff, orderId, lines: [{ itemId, newQty: 6 }],
  });
  const order = await t.run((ctx) => ctx.db.get(orderId));
  expect(order!.subscriptionCreditApplied).toBe(6 * 29000); // re-derived, not stale 10*29000
  const after = await t.run((ctx) => computeWeekAvailableCredit(ctx, weekId));
  expect(after.availableCredit).toBe(before.availableCredit + 4 * 29000); // freed
});

test("rejects editing a delivered/recognized order", async () => {
  const t = convexTest(schema, modules);
  const { sessionStaff, orderId, itemId } = await seedRecognizedOrder(t);
  await expect(
    t.mutation(api.subscriptions.editOrder.editUndeliveredSubscriptionOrder, {
      sessionId: sessionStaff, orderId, lines: [{ itemId, newQty: 1 }],
    }),
  ).rejects.toThrow(/delivered|recognized|undelivered/i);
});

test("non-credit-funded subscription order edits items without touching reservation", async () => {
  const t = convexTest(schema, modules);
  const { sessionStaff, orderId, itemId } = await seedPlainSubscriptionOrder(t, { qty: 8 });
  await t.mutation(api.subscriptions.editOrder.editUndeliveredSubscriptionOrder, {
    sessionId: sessionStaff, orderId, lines: [{ itemId, newQty: 5 }],
  });
  const order = await t.run((ctx) => ctx.db.get(orderId));
  expect(order!.subscriptionCreditApplied ?? 0).toBe(0);
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement the orchestrator**

```ts
// convex/subscriptions/editOrder.ts
import { v, ConvexError } from "convex/values";
import { protectedMutation } from "../lib/functions";
import { computeWeekAvailableCredit } from "./creditReservation";
import { resyncWeekPlanFromOrders } from "./resyncPlan"; // call its handler logic, or inline a shared helper

const UNDELIVERED_OK = new Set(["Draft", "AwaitingPayment", "Confirmed", "InProduction", "Boxed", "Labeled"]);
// (Exclude AwaitingDelivery/Complete/legacy shipped/picked — those are dispatched/recognized.)

export const editUndeliveredSubscriptionOrder = protectedMutation({
  roles: ["order_staff", "manager", "admin"],
  args: {
    orderId: v.id("orders"),
    lines: v.array(v.object({ itemId: v.id("orderItems"), newQty: v.number() })),
  },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new ConvexError("Order not found");
    if (!order.subscriptionId || !order.subscriptionWeekId)
      throw new ConvexError("Not a subscription order");
    if (!UNDELIVERED_OK.has(order.status))
      throw new ConvexError(`Order is ${order.status} — only undelivered orders can be edited here`);
    // Guard: a recognized order (has by_order ledger row) is never editable here.
    const recognized = await ctx.db
      .query("creditLedger").withIndex("by_order", (q) => q.eq("orderId", order._id)).first();
    if (recognized) throw new ConvexError("Order already recognized — cannot edit");

    // Apply each line change (reuse the proven item-edit math; inline the same patches as
    // updateItemQuantity/removeItem so this stays one atomic mutation).
    for (const ln of args.lines) {
      const item = await ctx.db.get(ln.itemId);
      if (!item || item.orderId !== order._id) throw new ConvexError("Item not on this order");
      if (ln.newQty <= 0) {
        await removeItemInternal(ctx, ln.itemId);          // mirrors removeItem (totals + production + delete)
      } else if (ln.newQty < item.quantity) {
        await updateItemQtyInternal(ctx, ln.itemId, ln.newQty); // mirrors updateItemQuantity
      } else if (ln.newQty > item.quantity) {
        throw new ConvexError("Slice 2 only reduces; use 'add more' (new order) to increase");
      }
    }

    // Re-derive the reservation (CRITICAL — Pitfall #23). Cap to the new order total.
    const fresh = await ctx.db.get(args.orderId);
    if (fresh && (fresh.subscriptionCreditApplied ?? 0) > 0) {
      const newReservation = Math.min(fresh.subscriptionCreditApplied!, fresh.totalAmount);
      if (newReservation !== fresh.subscriptionCreditApplied)
        await ctx.db.patch(args.orderId, { subscriptionCreditApplied: newReservation });
    }

    // Resync the week's plannedDays from the now-authoritative orders.
    await resyncWeekPlanInline(ctx, order.subscriptionWeekId);
    return { ok: true as const };
  },
});
```

> Implementation notes for the executor: extract the body of `updateItemQuantity`/`removeItem`/`resyncWeekPlanFromOrders` into shared internal helpers (`updateItemQtyInternal`, `removeItemInternal`, `resyncWeekPlanInline`) so this orchestrator calls them in-process (Convex mutations can't call other mutations). Keep the existing public `mutation` exports delegating to the same helpers (DRY) — do NOT copy-paste the math. The reservation cap (`Math.min`) is correct because eligible lines are priced at the partner `unitPrice` at creation and reductions only lower the eligible total; full re-split is unnecessary for reduce-only.

- [ ] **Step 4: Run — expect PASS.** Re-run `creditContext`/`creditOrder`/`outOfCredit` tests (no regression).
- [ ] **Step 5: Commit** — `git commit -m "feat(subscriptions): edit undelivered subscription order; re-derive credit reservation (Pitfall #23)"`

---

### Task T9: Widen `resyncWeekPlanFromOrders` roles

**Files:** Modify `convex/subscriptions/resyncPlan.ts:22`.

- [ ] **Step 1:** change `roles: ["manager", "admin"]` → `roles: ["order_staff", "manager", "admin"]` (matches T8 so order staff editing doesn't crash; Pitfall #19). If T8 was instead scoped manager/admin, skip this task.
- [ ] **Step 2:** `npm run build`; re-run resync tests.
- [ ] **Step 3: Commit** — `git commit -m "chore(subscriptions): widen resyncWeekPlanFromOrders roles to order_staff (Pitfall #19)"`

---

### Task T10: Edit-undelivered UI in `OrderSlideOver`

**Files:** Modify `src/components/orders/OrderSlideOver.tsx` (Actions section).

- [ ] **Step 1:** add an "Edit order (reduce)" control, shown only for subscription orders in an undelivered status, that lets staff set a lower qty per line (or remove) and calls `useSessionMutation(api.subscriptions.editOrder.editUndeliveredSubscriptionOrder)`. Show loading + toast; disable for delivered/recognized orders.
- [ ] **Step 2:** `npm run build`. Manual smoke deferred to persona-UAT.
- [ ] **Step 3: Commit** — `git commit -m "feat(orders): reduce undelivered subscription order from OrderSlideOver"`

### Task T11: Mirror into `OrderDetail` (Pitfall #20)

**Files:** Modify `src/pages/OrderDetail.tsx` (Actions section).

- [ ] **Step 1:** add the identical control + mutation call to `OrderDetail.tsx` (the two surfaces do NOT share an Actions component).
- [ ] **Step 2:** `npm run build`.
- [ ] **Step 3: Commit** — `git commit -m "feat(orders): reduce undelivered subscription order from OrderDetail (Pitfall #20)"`

### Slice 2 gate
- [ ] `code-auditor` + `npm run build`.
- [ ] `/triple-review` (money path) — address Critical + Improvement.
- [ ] Merge. CHANGELOG + extend CLAUDE.md Pitfall #23 (reservation adjusted on edit).

---

## SLICE 3 — branch `feature/sub-credit-ux-slice3` (money path → triple-review)

### Task T12: "Add more" → credit-funded new order

**Files:** Modify `src/pages/OrderCreate.tsx`.

**Interfaces:**
- Consumes: Slice 1 selector + `selectedSubId`; existing `createCreditFundedOrder` (already wired at `OrderCreate.tsx:265`) + `getCreditOrderWhatsappDraft`.

- [ ] **Step 1: Write a component/integration test** — when a customer with an active subscription is selected on a fresh order, a prompt "This customer has an active subscription with credit — use it?" is shown; accepting routes the submit through `createCreditFundedOrder` (assert the credit mutation is called, not the plain create). (Mock the mutations.)
- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement** — when `activeSubs?.length` and no sub explicitly declined, surface the prompt near the selector; on accept, ensure submit uses the existing credit path (`handleFulfilWithCredit`) rather than the plain create. The draw-down itself is the already-shipped `createCreditFundedOrder` — no new backend.
- [ ] **Step 4: Run + `npm run build` — expect PASS.**
- [ ] **Step 5: Commit** — `git commit -m "feat(orders): prompt to fund a new order from subscription credit (add more)"`

### Slice 3 gate
- [ ] `code-auditor` + `npm run build` + `/triple-review` (money path). Merge. CHANGELOG.

---

## Testing summary

| Layer | What | Type | Task |
|-------|------|------|------|
| Backend | `listActiveSubscriptionsForCustomer` (active-only, creditRemaining, roles) | convex-test | T1 |
| Backend | normalized search (whatsapp/altPhone/+62) | convex-test | T2 |
| Backend | dedup across normalized numbers | convex-test | T3 |
| Backend | edit-order reservation re-derive + guards + non-credit case | convex-test | T8 |
| Frontend | dropdown `[B2B]`+companyName | component | T5 |
| Frontend | selector auto-select-when-one / radio-when-many / hide-when-none | component | T6 |
| Frontend | add-more prompt routes through credit path | component | T12 |
| Manual | live ordering-sheet flow end-to-end | persona-UAT | close-out |

## Documentation updates
- [ ] `docs/CHANGELOG.md` — after each slice merge.
- [ ] `docs/API_REFERENCE.md` — `listActiveSubscriptionsForCustomer`, `editUndeliveredSubscriptionOrder`.
- [ ] `CLAUDE.md` Pitfall #23 — note reservation is re-derived on undelivered-order edits.
- [ ] `docs/ROADMAP.md` — record at plan-land; remove on completion.

## Success criteria
- [ ] `npm run type-check` + `npm run build` pass.
- [ ] A `b2b_wholesale` customer shows `[B2B]` (+ companyName) in the dropdown.
- [ ] Selecting a customer with one active subscription auto-selects it and the Fulfil path works (live bug gone) — no "Select a subscription above first" dead-end.
- [ ] A customer searchable by a number stored only in `whatsapp`.
- [ ] An undelivered subscription order can be reduced from BOTH `OrderSlideOver` and `OrderDetail`; the week schedule resyncs; a credit-funded order's reservation drops and pool credit frees.
- [ ] "Add more" creates a new order that draws down the same subscription credit.

## Rollback
- Each slice is its own squash-merge PR → revert the merge commit to roll back a slice.
- Backend is additive (new query/mutation; widened roles; a rewritten `search`). The `search` rewrite is the only behavior change to an existing function — if it misbehaves, revert `convex/customers/queries.ts` + `convex/lib/phone.ts` (the dropdown falls back to name/phone matching). Convex auto-deploys on merge; a revert PR redeploys.
- No schema changes → no migration ordering.
