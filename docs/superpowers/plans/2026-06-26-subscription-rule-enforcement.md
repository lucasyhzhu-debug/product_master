# Subscription Phase E Slice-2 — Rule-Enforcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce supply-agreement clauses 3/4/5/10 on the merged subscription backend — per-day 13:00 cutoff lock (warn+flag), above-baseline supplier-confirmation flag (warn-only), effective-dated permanent baseline change (+14d), effective-dated termination (+30d, stop future weeks) — plus minimal scheduler/settings UI, and a verify-only confidential-price-strip audit.

**Architecture:** 2 additive optional schema fields (`plannedDays[].needsSupplierConfirmation`, `subscriptions.pendingBaselineChange`); a new `convex/subscriptions/enforcement/` module of pure predicates + 2 idempotent internal-mutation crons; guard edits inside Phase B's `seedWeek`/`confirmWeek`; 2 manager+admin trigger mutations; FE flag-surfacing in `DayPlanCell`/grid/schedule page + a subscription-scoped settings dialog in `CustomerDashboard`. No money/credit/ledger math is touched.

**Tech Stack:** Convex (serverless TS) + React 19 + TypeScript + Vitest/convex-test. WIB math via `convex/lib/periodRange.ts`.

**Spec:** `docs/superpowers/specs/2026-06-26-subscription-rule-enforcement-design.md` (rev-2).
**Spec staffreview:** `docs/reviews/staffreview-subscription-rule-enforcement-spec-2026-06-26.md`.

## Global Constraints

- **COGS-rise alerting (clause 8) stays DROPPED** — do NOT add it (Lucas c12/c13).
- **No re-keying of derived totals** — never recompute money/credit; only metadata/flag/baseline/termination lifecycle writes.
- **Access:** new mutations `roles:["manager","admin"]`; crons `internalMutation` (no token, no public/staff surface). Pitfall #19 — no on-mount manager-only query on the staff-reachable `/crm` mount.
- **WIB math via `convex/lib/periodRange.ts` only** (Pitfall #18) — `getWibComponents`, `wibMidnightToUtc`. Never hand-roll `Date`.
- **Cutoff lock is date-relative** (lock any day with `cutoffMs(date) ≤ now`), NOT "tomorrow"-hardcoded (staffreview C1).
- **Additive schema only** — both new fields `v.optional(...)`; no migration; no new index. Run `npx convex codegen` and commit `_generated/` (Phase-76/81 lesson).
- **Cron minutes:** `flipDayLocksAtCutoff` = 05:25 UTC; `applyPendingBaselineChanges` = 04:10 UTC. No two primaries share a UTC minute. No watchdogs (idempotent internal mutations).
- **DayPlanCell:** the cutoff warning + supplier-confirmation badge use NEW props (`pastCutoff`, `needsSupplierConfirmation`) DISTINCT from the existing `locked` (grid edit-lock) prop. Editing stays allowed under the warning.

---

## Task List

| Task | Title | Files touched | Wave | Depends-on |
|------|-------|---------------|------|------------|
| T1 | Schema fields + `PlannedDay` type + codegen | `convex/schema.ts`, `convex/subscriptions/types.ts`, `convex/_generated/*` | 0 (SOLO) | — |
| T2 | `detectAboveBaseline` pure predicate + tests | `convex/subscriptions/enforcement/detectAboveBaseline.ts` (+test) | 1 | T1 |
| T3 | `effectiveDates` pure predicates + tests | `convex/subscriptions/enforcement/effectiveDates.ts` (+test) | 1 | T1 |
| T4 | `cutoffMath` pure WIB cutoff predicate + tests | `convex/subscriptions/enforcement/cutoffMath.ts` (+test) | 1 | T1 |
| T5 | `flipDayLocksAtCutoff` internal mutation + convex-test | `convex/subscriptions/enforcement/flipDayLocksAtCutoff.ts` (+test) | 2 | T4 |
| T6 | `applyPendingBaselineChanges` internal mutation + convex-test | `convex/subscriptions/enforcement/applyPendingBaselineChanges.ts` (+test) | 2 | T1 |
| T7 | `scheduleBaselineChange` + `giveTerminationNotice` mutations + tests | `convex/subscriptions/mutations.ts` (+test) | 2 | T3 |
| T8 | Termination guard in `seedWeek` + `confirmWeek` + tests | `convex/subscriptions/weeks.ts`, `convex/subscriptions/scheduling/confirmWeek.ts` (+test) | 2 | T1 |
| T9 | Above-baseline flag wiring at 3 write sites + tests | `convex/subscriptions/weeks.ts`, `convex/subscriptions/amend.ts` (+test) | 2 | T2, **T8** (weeks.ts serialize) |
| — | **BARRIER: `npx convex codegen` on merged tree** | `convex/_generated/*` | 2→3 | T5–T9 |
| T10 | `DayPlanCell` cutoff-warning + supplier badge props + tests | `src/components/crm/DayPlanCell.tsx` (+test) | 3 | T1 |
| T11 | `WeekCalendarGrid` + `SubscriptionSchedulePage` dayFlags wiring | `src/components/crm/WeekCalendarGrid.tsx`, `src/pages/crm/SubscriptionSchedulePage.tsx` | 3 | T10, T1 |
| T12 | Subscription-scoped settings dialog (baseline/termination) | `src/pages/crm/CustomerDashboard.tsx` (+test) | 3 | T7 |
| T13 | Register 2 crons + cron-minute uniqueness smoke test | `convex/crons.ts` (+test) | 3 | T5, T6 |
| T14 | AC11 confidential-price strip audit (VERIFY ONLY) | `docs/reviews/` audit note (+ assert existing tests) | 4 | — |
| T15 | Full verification + codegen commit + docs (CHANGELOG/SCHEMA) | `docs/CHANGELOG.md`, `docs/SCHEMA.md`, `convex/_generated/*` | 4 (SEQ) | all |

---

## Execution Strategy — multi-agent, wave-gated

**Dispatch model:** `superpowers:subagent-driven-development` — one fresh subagent per task, two-stage review between tasks. **Parallel within a wave; hard BARRIER between waves.**

### (a) Wave dispatch map
- **Wave 0 (SOLO):** T1. Schema + generated code — must land alone before anything else compiles against the new fields.
- **Wave 1 (PARALLEL):** T2, T3, T4 — three independent pure-function files, no shared files, no codegen dependency.
- **Wave 2 (PARALLEL, with one serialized pair):** T5, T6, T7, T8, then T9. T9 depends on T8 because **both write `convex/subscriptions/weeks.ts` (`seedWeek`)** — run T8 then T9 (or one agent owns both `weeks.ts` edits). T5/T6/T7 are independent.
- **BARRIER:** after Wave 2, re-run `npx convex codegen` once on the merged tree (T5/T6 register internal mutations, T7 registers public mutations → `internal.*`/`api.*` refs must regenerate before Wave 3 consumes hook types and before T13 references `internal.subscriptions.enforcement.*`).
- **Wave 3 (PARALLEL):** T10, then T11 (dep T10 for prop names); T12 (dep T7 mutation names); T13 (dep T5/T6 function refs). T11 and T12 touch different files; T13 touches `crons.ts` alone.
- **Wave 4 (SEQUENTIAL):** T14 (verify-only audit), then T15 (full verify + codegen commit + docs).

### (b) Shared / generated-file serialization
- **`convex/subscriptions/weeks.ts`** — written by **T8** (seedWeek guard) AND **T9** (seedWeek + saveWeekPlan flag). Serialize: T8 → T9 (T9 `depends-on` T8). Do NOT dispatch them in parallel.
- **`convex/_generated/api.d.ts` / `_generated/*`** — the codegen artifact. Regenerated by: T1 (Wave 0), the Wave 2→3 barrier, and T15 (final confirm). **Never hand-edit.** Each codegen run happens once, on the merged tree, by a single actor — not concurrently inside parallel tasks. Tasks that ADD Convex functions (T5/T6/T7) must NOT each run their own codegen+commit; the barrier owns it.
- **`convex/crons.ts`** — single writer (T13) — no contention.
- All other files are single-task-owned.

### (c) Critical path
T1 → T3 → T8 → T9 → (codegen barrier) → T11 → T15. (Parallel-equal: T1 → T4 → T5 → barrier → T13 → T15.) The T8→T9 serialization on `weeks.ts` is the only intra-wave bottleneck.

### (d) Headless-impossible steps (flag pending)
- **Live persona-UAT** of the two FE journeys (DayPlanCell cutoff warning + supplier badge; settings-dialog baseline/termination controls) requires a running env (`npx convex dev` + `npm run dev` + reseed). If no headless live env is available, mark **`pending: needs live env`** — do NOT claim the UAT gate passed. Component-level Vitest (T10, T12) covers render/interaction in isolation but does NOT substitute for the live journey.

### (e) Close-out (runs in the MAIN session, not a subagent)
After T15: `/triple-review` (address every Critical + Improvement) → `/simplify xhigh` → `/persona-uat` (live env; else flag pending) → re-run `npm run type-check` + `npx vitest run convex/subscriptions` + `npm run build` after any fix.

---

## Git Workflow
**Branch:** `feature/subscription-rule-enforcement` (cut fresh from synced `main`).
**Checkpoints:** one commit per task (TDD: test+impl together). Codegen commits at the Wave-0, Wave-2→3 barrier, and Wave-4 final. `npm run build` MUST pass before merge.

---

## Implementation Waves
### Wave 0: Schema [SOLO]
| Agent | Task | Files |
|-------|------|-------|
| convex-backend | T1 | `convex/schema.ts`, `convex/subscriptions/types.ts`, `_generated/*` |

### Wave 1: Pure helpers [PARALLEL]
| Agent | Task | Files |
|-------|------|-------|
| convex-backend | T2 | `enforcement/detectAboveBaseline.ts` |
| convex-backend | T3 | `enforcement/effectiveDates.ts` |
| convex-backend | T4 | `enforcement/cutoffMath.ts` |

### Wave 2: Backend logic [PARALLEL, T8→T9 serialized]
| Agent | Task | Files |
|-------|------|-------|
| convex-backend | T5 | `enforcement/flipDayLocksAtCutoff.ts` |
| convex-backend | T6 | `enforcement/applyPendingBaselineChanges.ts` |
| convex-backend | T7 | `subscriptions/mutations.ts` |
| convex-backend | T8 | `weeks.ts`, `scheduling/confirmWeek.ts` |
| convex-backend | T9 (after T8) | `weeks.ts`, `amend.ts` |

### Wave 3: Frontend + crons [PARALLEL]
| Agent | Task | Files |
|-------|------|-------|
| react-ui-builder | T10 | `DayPlanCell.tsx` |
| react-ui-builder | T11 (after T10) | `WeekCalendarGrid.tsx`, `SubscriptionSchedulePage.tsx` |
| react-ui-builder | T12 | `CustomerDashboard.tsx` |
| convex-backend | T13 | `crons.ts` |

### Wave 4: Verification [SEQUENTIAL]
| Agent | Task |
|-------|------|
| code-auditor | T14 (AC11 strip audit) + T15 type-check/pattern compliance |
| Bash | `npm run build`, `npx vitest run convex/subscriptions` |

## Documentation Updates
- [ ] `docs/CHANGELOG.md` (ALWAYS)
- [ ] `docs/SCHEMA.md` (2 new optional fields)
- [ ] `docs/ROADMAP.md` already updated in the planning PR

## Success Criteria
- [ ] `npm run type-check` passes
- [ ] `npx vitest run convex/subscriptions` passes
- [ ] `npm run build` succeeds
- [ ] All ACs (AC1–AC13) in the spec satisfied
- [ ] `_generated/` committed and current
- [ ] Live persona-UAT of the 2 FE journeys (or flagged `pending: needs live env`)

---

## Task Details

### Task 1: Schema fields + `PlannedDay` type + codegen

**Files:**
- Modify: `convex/schema.ts` (subscriptions block ~`:2506`; subscriptionWeeks `plannedDays[]` entry ~`:2557`)
- Modify: `convex/subscriptions/types.ts:11` (`PlannedDay`)
- Modify: `convex/_generated/*` (via codegen)

**Interfaces:**
- Produces: `plannedDays[].needsSupplierConfirmation?: boolean`, `subscriptions.pendingBaselineChange?: { newQty: number; effectiveDate: number }`.

- [ ] **Step 1: Add the `plannedDays[]` field.** In `convex/schema.ts`, inside the `subscriptionWeeks.plannedDays` object validator (after `locked: v.boolean(),`):

```ts
locked: v.boolean(),
needsSupplierConfirmation: v.optional(v.boolean()),
```

- [ ] **Step 2: Add the `subscriptions.pendingBaselineChange` field.** In the `subscriptions` table validator (after `endDate: v.optional(v.number()),`):

```ts
endDate: v.optional(v.number()),
pendingBaselineChange: v.optional(
  v.object({ newQty: v.number(), effectiveDate: v.number() }),
),
```

- [ ] **Step 3: Update the `PlannedDay` type.** In `convex/subscriptions/types.ts`:

```ts
export type PlannedDay = {
  date: number;
  deliverByTime: string;
  items: ScheduleLine[];
  locked: boolean;
  needsSupplierConfirmation?: boolean;
};
```

- [ ] **Step 4: Run codegen.** Run: `npx convex codegen`. Expected: `_generated/` updates with no errors.
- [ ] **Step 5: Type-check.** Run: `npm run type-check`. Expected: PASS (additive optional fields don't break existing code).
- [ ] **Step 6: Commit.**

```bash
git add convex/schema.ts convex/subscriptions/types.ts convex/_generated
git commit -m "feat(subscription): add needsSupplierConfirmation + pendingBaselineChange schema fields"
```

---

### Task 2: `detectAboveBaseline` pure predicate

**Files:**
- Create: `convex/subscriptions/enforcement/detectAboveBaseline.ts`
- Test: `convex/subscriptions/enforcement/__tests__/detectAboveBaseline.test.ts`

**Interfaces:**
- Produces: `detectAboveBaseline(dayItems: { qty: number }[], baselineDailyQty: number): boolean`.

- [ ] **Step 1: Write the failing test.**

```ts
import { describe, it, expect } from "vitest";
import { detectAboveBaseline } from "../detectAboveBaseline";

describe("detectAboveBaseline", () => {
  it("flags a day whose total qty exceeds baseline", () => {
    expect(detectAboveBaseline([{ qty: 3 }, { qty: 2 }], 4)).toBe(true);
  });
  it("does not flag a day equal to baseline", () => {
    expect(detectAboveBaseline([{ qty: 2 }, { qty: 2 }], 4)).toBe(false);
  });
  it("does not flag a day below baseline", () => {
    expect(detectAboveBaseline([{ qty: 1 }], 4)).toBe(false);
  });
  it("does not flag an empty day", () => {
    expect(detectAboveBaseline([], 4)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails.** Run: `npx vitest run convex/subscriptions/enforcement/__tests__/detectAboveBaseline.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3: Write minimal implementation.**

```ts
/** Pure: is the day's TOTAL qty across all products strictly above baseline? (clause 4, warn-only) */
export function detectAboveBaseline(
  dayItems: { qty: number }[],
  baselineDailyQty: number,
): boolean {
  const total = dayItems.reduce((s, it) => s + it.qty, 0);
  return total > baselineDailyQty;
}
```

- [ ] **Step 4: Run test to verify it passes.** Run the same command. Expected: PASS.
- [ ] **Step 5: Commit.**

```bash
git add convex/subscriptions/enforcement/detectAboveBaseline.ts convex/subscriptions/enforcement/__tests__/detectAboveBaseline.test.ts
git commit -m "feat(subscription): detectAboveBaseline pure predicate (clause 4)"
```

---

### Task 3: `effectiveDates` pure predicates

**Files:**
- Create: `convex/subscriptions/enforcement/effectiveDates.ts`
- Test: `convex/subscriptions/enforcement/__tests__/effectiveDates.test.ts`

**Interfaces:**
- Produces: `permanentChangeEffective(noticeDate: number, days: number, now: number): boolean`, `terminationEffective(noticeDate: number, days: number, now: number): boolean`, `DAY_MS` const, `effectiveDateOf(noticeDate: number, days: number): number`.

- [ ] **Step 1: Write the failing test.**

```ts
import { describe, it, expect } from "vitest";
import { permanentChangeEffective, terminationEffective, effectiveDateOf, DAY_MS } from "../effectiveDates";

const T = 1_000_000_000_000;

describe("effective-date predicates", () => {
  it("effectiveDateOf adds days", () => {
    expect(effectiveDateOf(T, 14)).toBe(T + 14 * DAY_MS);
  });
  it("permanentChangeEffective true at boundary", () => {
    expect(permanentChangeEffective(T, 14, T + 14 * DAY_MS)).toBe(true);
  });
  it("permanentChangeEffective false before", () => {
    expect(permanentChangeEffective(T, 14, T + 14 * DAY_MS - 1)).toBe(false);
  });
  it("terminationEffective true after", () => {
    expect(terminationEffective(T, 30, T + 31 * DAY_MS)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails.** Run: `npx vitest run convex/subscriptions/enforcement/__tests__/effectiveDates.test.ts`. Expected: FAIL.
- [ ] **Step 3: Write minimal implementation.**

```ts
export const DAY_MS = 86_400_000;

/** UTC epoch ms when a notice given at noticeDate becomes effective after `days`. */
export function effectiveDateOf(noticeDate: number, days: number): number {
  return noticeDate + days * DAY_MS;
}

/** True once a permanent baseline change has reached its effective date. */
export function permanentChangeEffective(noticeDate: number, days: number, now: number): boolean {
  return effectiveDateOf(noticeDate, days) <= now;
}

/** True once a termination notice has reached its end date. */
export function terminationEffective(noticeDate: number, days: number, now: number): boolean {
  return effectiveDateOf(noticeDate, days) <= now;
}
```

- [ ] **Step 4: Run test to verify it passes.** Expected: PASS.
- [ ] **Step 5: Commit.**

```bash
git add convex/subscriptions/enforcement/effectiveDates.ts convex/subscriptions/enforcement/__tests__/effectiveDates.test.ts
git commit -m "feat(subscription): effective-date predicates (clauses 5,10)"
```

---

### Task 4: `cutoffMath` pure WIB cutoff predicate

**Files:**
- Create: `convex/subscriptions/enforcement/cutoffMath.ts`
- Test: `convex/subscriptions/enforcement/__tests__/cutoffMath.test.ts`

**Interfaces:**
- Consumes: `getWibComponents`, `wibMidnightToUtc` from `convex/lib/periodRange.ts`.
- Produces: `cutoffMs(deliveryDateMs, changeCutoffDayOffset, changeCutoffHour): number`, `isPastCutoff(deliveryDateMs, changeCutoffDayOffset, changeCutoffHour, now): boolean`.

- [ ] **Step 1: Write the failing test.**

```ts
import { describe, it, expect } from "vitest";
import { cutoffMs, isPastCutoff } from "../cutoffMath";
import { wibMidnightToUtc } from "../../../lib/periodRange";

// WIB Wed 2026-06-24 midnight (delivery day)
const deliveryDay = wibMidnightToUtc(2026, 5, 24); // month 0-indexed: 5 = June

describe("cutoffMath (offset -1, hour 13 = prior-day 13:00 WIB)", () => {
  it("cutoff is the prior WIB day at 13:00", () => {
    // prior day = 2026-06-23 13:00 WIB = wibMidnight(23) + 13h
    const expected = wibMidnightToUtc(2026, 5, 23) + 13 * 3600_000;
    expect(cutoffMs(deliveryDay, -1, 13)).toBe(expected);
  });
  it("not past cutoff just before", () => {
    expect(isPastCutoff(deliveryDay, -1, 13, cutoffMs(deliveryDay, -1, 13) - 1)).toBe(false);
  });
  it("past cutoff at boundary", () => {
    expect(isPastCutoff(deliveryDay, -1, 13, cutoffMs(deliveryDay, -1, 13))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails.** Run: `npx vitest run convex/subscriptions/enforcement/__tests__/cutoffMath.test.ts`. Expected: FAIL.
- [ ] **Step 3: Write minimal implementation.**

```ts
import { getWibComponents, wibMidnightToUtc } from "../../lib/periodRange";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

/** UTC epoch ms of the change-cutoff for a delivery on deliveryDateMs.
 *  cutoff = WIB midnight of (deliveryDay + changeCutoffDayOffset) + changeCutoffHour hours. */
export function cutoffMs(
  deliveryDateMs: number,
  changeCutoffDayOffset: number,
  changeCutoffHour: number,
): number {
  const cutoffDay = deliveryDateMs + changeCutoffDayOffset * DAY_MS;
  const { year, month, day } = getWibComponents(cutoffDay);
  return wibMidnightToUtc(year, month, day) + changeCutoffHour * HOUR_MS;
}

/** Has the change-cutoff for this delivery day already passed as of `now`? */
export function isPastCutoff(
  deliveryDateMs: number,
  changeCutoffDayOffset: number,
  changeCutoffHour: number,
  now: number,
): boolean {
  return cutoffMs(deliveryDateMs, changeCutoffDayOffset, changeCutoffHour) <= now;
}
```

- [ ] **Step 4: Run test to verify it passes.** Expected: PASS.
- [ ] **Step 5: Commit.**

```bash
git add convex/subscriptions/enforcement/cutoffMath.ts convex/subscriptions/enforcement/__tests__/cutoffMath.test.ts
git commit -m "feat(subscription): cutoffMath WIB predicate (clause 3, date-relative)"
```

---

### Task 5: `flipDayLocksAtCutoff` internal mutation

**Files:**
- Create: `convex/subscriptions/enforcement/flipDayLocksAtCutoff.ts`
- Test: `convex/subscriptions/enforcement/__tests__/flipDayLocksAtCutoff.test.ts`

**Interfaces:**
- Consumes: `isPastCutoff` (T4); `internalMutation` from `convex/_generated/server`.
- Produces: `internal.subscriptions.enforcement.flipDayLocksAtCutoff.flipDayLocksAtCutoff` (no args).

- [ ] **Step 1: Write the failing test (convex-test).** Seed an active subscription (`changeCutoffHour:13`, `changeCutoffDayOffset:-1`) with a `planned` week containing two days: one whose cutoff has passed relative to a fixed `now`, one whose cutoff has not. Assert after running the mutation that the past-cutoff day's `locked` is `true`, the other `false`; items unchanged; a second run is a no-op. (Use `convexTest` + `t.run` to insert rows and to read back; pass `now` via a test-only optional arg OR stub `Date.now`. Prefer an internal arg `now?: number` defaulting to `Date.now()` for deterministic tests.)

```ts
import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "../../../schema";
import { internal } from "../../../_generated/api";
import { wibMidnightToUtc } from "../../../lib/periodRange";

describe("flipDayLocksAtCutoff", () => {
  it("locks only days whose cutoff has passed", async () => {
    const t = convexTest(schema);
    const dayPast = wibMidnightToUtc(2026, 5, 24);   // delivery Wed
    const dayFuture = wibMidnightToUtc(2026, 5, 27);  // delivery Sat
    // now = Thu 2026-06-25 12:00 WIB → cutoff(Wed)=Tue13:00 passed; cutoff(Sat)=Fri13:00 not.
    const now = wibMidnightToUtc(2026, 5, 25) + 12 * 3600_000;
    const subId = await t.run(async (ctx) =>
      ctx.db.insert("subscriptions", { /* minimal valid sub, status:"active", changeCutoffHour:13, changeCutoffDayOffset:-1, ... */ } as any),
    );
    const weekId = await t.run(async (ctx) =>
      ctx.db.insert("subscriptionWeeks", {
        subscriptionId: subId, weekStart: wibMidnightToUtc(2026, 5, 22), weekEnd: wibMidnightToUtc(2026, 5, 28),
        status: "planned",
        plannedDays: [
          { date: dayPast, deliverByTime: "09:00", items: [{ menuProductId: "x" as any, productName: "P", qty: 1, unitPrice: 1000, lineTotal: 1000 }], locked: false },
          { date: dayFuture, deliverByTime: "09:00", items: [], locked: false },
        ],
        creditIssued: 0, creditConsumed: 0, creditRemaining: 0, creditExpired: 0, shortfall: 0, shortfallFault: "none", refundDue: 0,
      } as any),
    );
    await t.mutation(internal.subscriptions.enforcement.flipDayLocksAtCutoff.flipDayLocksAtCutoff, { now });
    const week = await t.run((ctx) => ctx.db.get(weekId));
    expect(week!.plannedDays[0].locked).toBe(true);
    expect(week!.plannedDays[1].locked).toBe(false);
    expect(week!.plannedDays[0].items.length).toBe(1); // metadata only
  });
});
```

(Fill the minimal-valid `subscriptions` insert fields from `convex/schema.ts:2506` — all required fields present; `menuProductId` may be a dummy string cast since the lock path never dereferences it.)

- [ ] **Step 2: Run test to verify it fails.** Expected: FAIL (mutation missing).
- [ ] **Step 3: Write minimal implementation.**

```ts
import { v } from "convex/values";
import { internalMutation } from "../../_generated/server";
import { isPastCutoff } from "./cutoffMath";

/** Daily cron (05:25 UTC). Sets locked=true on every not-yet-locked day whose
 *  change-cutoff has passed, for active non-ended subs. Metadata-only, idempotent. */
export const flipDayLocksAtCutoff = internalMutation({
  args: { now: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();
    const subs = await ctx.db
      .query("subscriptions")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();
    // 'terminating' subs whose current week is in-flight are still lockable:
    const terminating = await ctx.db
      .query("subscriptions")
      .withIndex("by_status", (q) => q.eq("status", "terminating"))
      .collect();
    for (const sub of [...subs, ...terminating]) {
      const weeks = await ctx.db
        .query("subscriptionWeeks")
        .withIndex("by_subscription_weekStart", (q) => q.eq("subscriptionId", sub._id))
        .collect();
      for (const week of weeks) {
        if (week.status === "reconciled" || week.status === "closed") continue;
        let changed = false;
        const plannedDays = week.plannedDays.map((d) => {
          if (!d.locked && isPastCutoff(d.date, sub.changeCutoffDayOffset, sub.changeCutoffHour, now)) {
            changed = true;
            return { ...d, locked: true };
          }
          return d;
        });
        if (changed) await ctx.db.patch(week._id, { plannedDays });
      }
    }
  },
});
```

> Scan note (C9): subscription + non-terminal-week counts are tiny in cron context; this bounded scan is acceptable. Do NOT pre-optimize with a new index.

- [ ] **Step 4: Run test to verify it passes.** Expected: PASS.
- [ ] **Step 5: Run codegen** so `internal.*` resolves: `npx convex codegen`. (Final barrier codegen happens later; this lets the test import resolve.)
- [ ] **Step 6: Commit.**

```bash
git add convex/subscriptions/enforcement/flipDayLocksAtCutoff.ts convex/subscriptions/enforcement/__tests__/flipDayLocksAtCutoff.test.ts convex/_generated
git commit -m "feat(subscription): flipDayLocksAtCutoff internal mutation (clause 3)"
```

---

### Task 6: `applyPendingBaselineChanges` internal mutation

**Files:**
- Create: `convex/subscriptions/enforcement/applyPendingBaselineChanges.ts`
- Test: `convex/subscriptions/enforcement/__tests__/applyPendingBaselineChanges.test.ts`

**Interfaces:**
- Produces: `internal.subscriptions.enforcement.applyPendingBaselineChanges.applyPendingBaselineChanges` (args `{ now?: number }`).

- [ ] **Step 1: Write the failing test (convex-test).** Seed one sub with `pendingBaselineChange = { newQty: 12, effectiveDate: E }`. Run with `now = E - 1` → unchanged. Run with `now = E` → `baselineDailyQty === 12` and `pendingBaselineChange === undefined`. Second run idempotent.

```ts
import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "../../../schema";
import { internal } from "../../../_generated/api";

describe("applyPendingBaselineChanges", () => {
  it("applies at/after effectiveDate and clears the pending field", async () => {
    const t = convexTest(schema);
    const E = 2_000_000_000_000;
    const subId = await t.run((ctx) => ctx.db.insert("subscriptions", { /* required fields, baselineDailyQty: 8, status:"active", pendingBaselineChange: { newQty: 12, effectiveDate: E } */ } as any));
    await t.mutation(internal.subscriptions.enforcement.applyPendingBaselineChanges.applyPendingBaselineChanges, { now: E - 1 });
    let sub = await t.run((ctx) => ctx.db.get(subId));
    expect(sub!.baselineDailyQty).toBe(8);
    await t.mutation(internal.subscriptions.enforcement.applyPendingBaselineChanges.applyPendingBaselineChanges, { now: E });
    sub = await t.run((ctx) => ctx.db.get(subId));
    expect(sub!.baselineDailyQty).toBe(12);
    expect(sub!.pendingBaselineChange).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails.** Expected: FAIL.
- [ ] **Step 3: Write minimal implementation.**

```ts
import { v } from "convex/values";
import { internalMutation } from "../../_generated/server";

/** Daily cron (04:10 UTC). Applies any pendingBaselineChange whose effectiveDate
 *  has arrived; clears the pending field. Idempotent. Bounded full-scan (small table). */
export const applyPendingBaselineChanges = internalMutation({
  args: { now: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();
    const subs = await ctx.db.query("subscriptions").collect();
    for (const sub of subs) {
      const pending = sub.pendingBaselineChange;
      if (pending && pending.effectiveDate <= now) {
        await ctx.db.patch(sub._id, {
          baselineDailyQty: pending.newQty,
          pendingBaselineChange: undefined,
        });
      }
    }
  },
});
```

- [ ] **Step 4: Run test to verify it passes.** Expected: PASS.
- [ ] **Step 5: Codegen + Commit.**

```bash
npx convex codegen
git add convex/subscriptions/enforcement/applyPendingBaselineChanges.ts convex/subscriptions/enforcement/__tests__/applyPendingBaselineChanges.test.ts convex/_generated
git commit -m "feat(subscription): applyPendingBaselineChanges internal mutation (clause 5)"
```

---

### Task 7: `scheduleBaselineChange` + `giveTerminationNotice` mutations

**Files:**
- Modify: `convex/subscriptions/mutations.ts` (append after `updateSubscription`)
- Test: `convex/subscriptions/__tests__/baselineTermination.test.ts`

**Interfaces:**
- Consumes: `effectiveDateOf` (T3); `protectedMutation` from `../lib/functions`.
- Produces: `api.subscriptions.mutations.scheduleBaselineChange({ subscriptionId, newQty })`, `api.subscriptions.mutations.giveTerminationNotice({ subscriptionId })`. Both `roles:["manager","admin"]`.

- [ ] **Step 1: Write the failing test (convex-test).** `protectedMutation` resolves `ctx.user` from a **`sessionId` arg** (`convex/lib/functions.ts:44`, `args: SessionIdArg`), NOT from `ctx.auth`. There is **no** protected-handler auth harness in `convex/subscriptions/__tests__/` (those are pure-only). **Use the working pattern in `convex/bankStatements/__tests__/mutations.test.ts` + `reconcileHelpers.ts`** (`createSession(t, "manager", name)` → inserts a `users` row + `sessions` row, returns `{ token }`). Then call handlers with `sessionId: token`. Assert: `scheduleBaselineChange({ sessionId, subscriptionId, newQty })` stages `pendingBaselineChange = { newQty, effectiveDate: ~now + 14*DAY }`, rejects when sub is `ended`; `giveTerminationNotice({ sessionId, subscriptionId })` sets `terminationNoticeDate`, `endDate = ~now + 30*DAY`, `status="terminating"`, and rejects a second call; **auth-rejection: an `order_staff` session → ConvexError** (confirms `roles:["manager","admin"]`).

```ts
// harness shape (mirror convex/bankStatements/__tests__/reconcileHelpers.ts):
async function createSession(t, role: "manager" | "order_staff", name: string) {
  return t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { name, role, isActive: true, /* + required user fields */ } as any);
    const token = `sess_${name}`;
    await ctx.db.insert("sessions", { token, userId, /* + required session fields */ } as any);
    return { token, userId };
  });
}
// usage:
const { token } = await createSession(t, "manager", "mgr");
await t.mutation(api.subscriptions.mutations.scheduleBaselineChange, { sessionId: token, subscriptionId, newQty: 12 });
```

(Read `reconcileHelpers.ts` for the EXACT required `users`/`sessions` insert fields before writing — don't guess them.)

- [ ] **Step 2: Run test to verify it fails.** Expected: FAIL.
- [ ] **Step 3: Write minimal implementation.** Append to `convex/subscriptions/mutations.ts`:

```ts
import { effectiveDateOf } from "./enforcement/effectiveDates";

export const scheduleBaselineChange = protectedMutation({
  roles: ["manager", "admin"],
  args: { subscriptionId: v.id("subscriptions"), newQty: v.number() },
  handler: async (ctx, args) => {
    const sub = await ctx.db.get(args.subscriptionId);
    if (!sub) throw new ConvexError("Subscription not found");
    if (sub.status === "ended") throw new ConvexError("Subscription has ended; cannot schedule a baseline change");
    if (!Number.isInteger(args.newQty) || args.newQty <= 0) throw new ConvexError("newQty must be a positive integer");
    const effectiveDate = effectiveDateOf(Date.now(), sub.permanentChangeNoticeDays);
    await ctx.db.patch(args.subscriptionId, {
      pendingBaselineChange: { newQty: args.newQty, effectiveDate },
    });
    return { effectiveDate };
  },
});

export const giveTerminationNotice = protectedMutation({
  roles: ["manager", "admin"],
  args: { subscriptionId: v.id("subscriptions") },
  handler: async (ctx, args) => {
    const sub = await ctx.db.get(args.subscriptionId);
    if (!sub) throw new ConvexError("Subscription not found");
    if (sub.status === "terminating" || sub.status === "ended")
      throw new ConvexError(`Subscription is already ${sub.status}; cannot re-issue termination notice`);
    const noticeDate = Date.now();
    const endDate = effectiveDateOf(noticeDate, sub.terminationNoticeDays);
    await ctx.db.patch(args.subscriptionId, {
      terminationNoticeDate: noticeDate,
      endDate,
      status: "terminating",
    });
    return { terminationNoticeDate: noticeDate, endDate };
  },
});
```

- [ ] **Step 4: Run test to verify it passes.** Expected: PASS.
- [ ] **Step 5: Commit.**

```bash
git add convex/subscriptions/mutations.ts convex/subscriptions/__tests__/baselineTermination.test.ts
git commit -m "feat(subscription): scheduleBaselineChange + giveTerminationNotice mutations (clauses 5,10)"
```

---

### Task 8: Termination guard in `seedWeek` + `confirmWeek`

**Files:**
- Modify: `convex/subscriptions/weeks.ts` (`seedWeek` handler, after `const sub = await ctx.db.get(...)` ~`:65`)
- Modify: `convex/subscriptions/scheduling/confirmWeek.ts` (`confirmWeek` handler, after loading `week` + `sub` ~`:28`)
- Test: `convex/subscriptions/__tests__/terminationGuard.test.ts`

**Interfaces:**
- Consumes: existing `seedWeek`/`confirmWeek` signatures (no change).
- Produces: both refuse a week with `weekStart > sub.endDate` when `endDate` is set.

- [ ] **Step 1: Write the failing test (convex-test).** `seedWeek`/`confirmWeek` are `protectedMutation`s → call them with a manager `sessionId` (same `createSession` harness as T7, from `convex/bankStatements/__tests__/reconcileHelpers.ts`). Seed a `terminating` sub with `endDate = X`. Assert: `seedWeek({ sessionId, subscriptionId, weekStart })` with `weekStart > X` throws; with `weekStart ≤ X` succeeds; `confirmWeek({ sessionId, subscriptionWeekId })` on a future week (`weekStart > X`) throws; on the in-flight week (`weekStart ≤ X`) succeeds. With `endDate` undefined, both proceed.
- [ ] **Step 2: Run test to verify it fails.** Expected: FAIL.
- [ ] **Step 3: Add the guard to `seedWeek`.** In `convex/subscriptions/weeks.ts`, immediately after `if (!sub) throw new ConvexError("Subscription not found");`:

```ts
if (sub.endDate !== undefined && args.weekStart > sub.endDate) {
  throw new ConvexError(
    "Subscription has been terminated; cannot seed a week starting after the end date.",
  );
}
```

- [ ] **Step 4: Add the guard to `confirmWeek`.** In `convex/subscriptions/scheduling/confirmWeek.ts`, immediately after `if (!sub) throw new ConvexError("Subscription not found");`:

```ts
if (sub.endDate !== undefined && week.weekStart > sub.endDate) {
  throw new ConvexError(
    "Subscription has been terminated; cannot confirm a week starting after the end date.",
  );
}
```

- [ ] **Step 5: Run test to verify it passes.** Expected: PASS.
- [ ] **Step 6: Commit.**

```bash
git add convex/subscriptions/weeks.ts convex/subscriptions/scheduling/confirmWeek.ts convex/subscriptions/__tests__/terminationGuard.test.ts
git commit -m "feat(subscription): termination guard stops future weeks past endDate (clause 10)"
```

---

### Task 9: Above-baseline flag wiring at the 3 write sites

> **Runs AFTER Task 8** — both edit `convex/subscriptions/weeks.ts`. Pull T8's changes first.

**Files:**
- Modify: `convex/subscriptions/weeks.ts` (`buildPlannedDays` ~`:12`, `seedWeek` `previousWeek` branch, `saveWeekPlan` plannedDays build ~`:219`)
- Modify: `convex/subscriptions/amend.ts` (`amendConfirmedWeek` plannedDays build ~`:134`)
- Test: `convex/subscriptions/__tests__/aboveBaselineWiring.test.ts`

**Interfaces:**
- Consumes: `detectAboveBaseline` (T2), `sub.baselineDailyQty`.
- Produces: every written `plannedDays[]` entry carries `needsSupplierConfirmation = detectAboveBaseline(items, sub.baselineDailyQty)`.

- [ ] **Step 1: Write the failing test (convex-test).** All three are `protectedMutation`s → call with a manager `sessionId` (same `createSession` harness as T7). For each of `seedWeek` (template with an above-baseline day), `saveWeekPlan`, and `amendConfirmedWeek`: assert the resulting week's `plannedDays` have `needsSupplierConfirmation === true` on the over-baseline day and `false`/falsey on an at-or-below day.
- [ ] **Step 2: Run test to verify it fails.** Expected: FAIL.
- [ ] **Step 3a: Wire `buildPlannedDays`.** In `convex/subscriptions/weeks.ts`, add `baselineDailyQty` to the `buildPlannedDays` args and set the flag per day:

```ts
import { detectAboveBaseline } from "./enforcement/detectAboveBaseline";
// in buildPlannedDays args object: baselineDailyQty: number;
// in the .map((t) => ({ ... })) day object, after items:
//   needsSupplierConfirmation: detectAboveBaseline(t.items, args.baselineDailyQty),
```

**Caller fan-out (I2):** making `baselineDailyQty` a *required* `buildPlannedDays` arg forces every caller to compile. `buildPlannedDays` is called only by `seedFromTemplate` (`weeks.ts:48`) — add `baselineDailyQty: sub.baselineDailyQty` there. The `previousWeek` re-date branch in `seedWeek` does NOT go through `buildPlannedDays`, so set `needsSupplierConfirmation: detectAboveBaseline(d.items, sub.baselineDailyQty)` inline on each re-dated day object. Run `npm run type-check` to confirm no caller was missed.

- [ ] **Step 3b: Wire `saveWeekPlan`.** In the `plannedDays` map (`:219`), add to each returned day object:

```ts
needsSupplierConfirmation: detectAboveBaseline(d.items, sub.baselineDailyQty),
```

- [ ] **Step 3c: Wire `amendConfirmedWeek`.** In `convex/subscriptions/amend.ts`, import `detectAboveBaseline` and add to each `plannedDays` day object (`:139` area):

```ts
needsSupplierConfirmation: detectAboveBaseline(day.items, subscription.baselineDailyQty),
```

- [ ] **Step 4: Run test to verify it passes.** Expected: PASS.
- [ ] **Step 5: Commit.**

```bash
git add convex/subscriptions/weeks.ts convex/subscriptions/amend.ts convex/subscriptions/__tests__/aboveBaselineWiring.test.ts
git commit -m "feat(subscription): set needsSupplierConfirmation at plannedDays write sites (clause 4)"
```

---

> **BARRIER — codegen on merged tree.** After T5–T9 land, run `npx convex codegen` once and commit the regenerated `_generated/` (registers all new `internal.*`/`api.*` refs). Then proceed to Wave 3.

```bash
npx convex codegen
git add convex/_generated
git commit -m "chore(subscription): regenerate Convex API for Slice-2 backend"
```

---

### Task 10: `DayPlanCell` cutoff-warning + supplier badge props

**Files:**
- Modify: `src/components/crm/DayPlanCell.tsx`
- Test: `src/components/crm/__tests__/DayPlanCell.test.tsx`

**Interfaces:**
- Produces: `DayPlanCellProps` gains `pastCutoff?: boolean` and `needsSupplierConfirmation?: boolean` (both optional, default falsey). Both purely visual; neither disables inputs.

- [ ] **Step 1: Write the failing test.** Render `DayPlanCell` with `pastCutoff` true → asserts "past 13:00 cutoff" warning text present AND the "Add product" button is still enabled (not locked). Render with `needsSupplierConfirmation` true → asserts a "supplier confirmation" badge present. Render with both false → neither present.
- [ ] **Step 2: Run test to verify it fails.** Run: `npx vitest run src/components/crm/__tests__/DayPlanCell.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.** Add the two optional props to `DayPlanCellProps` and the destructure; render (inside `CardContent`, above the line items) a non-blocking warning + badge:

```tsx
{pastCutoff && (
  <p className="text-[10px] text-amber-600 flex items-center gap-1" role="status">
    <AlertTriangle className="h-3 w-3" aria-hidden="true" /> past 13:00 cutoff
  </p>
)}
{needsSupplierConfirmation && (
  <span className="text-[10px] font-medium text-orange-700 bg-orange-100 rounded px-1 py-0.5 w-fit">
    needs supplier confirmation
  </span>
)}
```

(Import `AlertTriangle` from `lucide-react`. Do NOT gate `addLine`/inputs on these props — they are warnings, not locks; the existing `locked` prop remains the only edit-disable.)

- [ ] **Step 4: Run test to verify it passes.** Expected: PASS.
- [ ] **Step 5: Commit.**

```bash
git add src/components/crm/DayPlanCell.tsx src/components/crm/__tests__/DayPlanCell.test.tsx
git commit -m "feat(crm): DayPlanCell cutoff warning + supplier-confirmation badge"
```

---

### Task 11: `WeekCalendarGrid` + `SubscriptionSchedulePage` dayFlags wiring

**Files:**
- Modify: `src/components/crm/WeekCalendarGrid.tsx`
- Modify: `src/pages/crm/SubscriptionSchedulePage.tsx`

**Interfaces:**
- Consumes: `DayPlanCell` props `pastCutoff`/`needsSupplierConfirmation` (T10).
- Produces: `WeekCalendarGridProps` gains `dayFlags?: { pastCutoff: boolean; needsSupplierConfirmation: boolean }[]` (index 0=Mon … 6=Sun).

- [ ] **Step 1: Wire the grid.** In `WeekCalendarGrid.tsx`, add `dayFlags?` to props and forward to each cell:

```tsx
pastCutoff={dayFlags?.[i]?.pastCutoff ?? false}
needsSupplierConfirmation={dayFlags?.[i]?.needsSupplierConfirmation ?? false}
```

- [ ] **Step 2: Derive `dayFlags` in `SubscriptionSchedulePage`.** Build a 7-element array keyed by weekday from `week.plannedDays` (key = `(d.date - weekStartMs) / DAY_MS`), reading `locked` → `pastCutoff` and `needsSupplierConfirmation`:

```ts
const dayFlags = Array.from({ length: 7 }, (_, i) => {
  const day = week?.plannedDays.find((d) => Math.round((d.date - weekStartMs) / DAY_MS) === i);
  return {
    pastCutoff: day?.locked ?? false,
    needsSupplierConfirmation: day?.needsSupplierConfirmation ?? false,
  };
});
```

Pass `dayFlags={dayFlags}` to `<WeekCalendarGrid>` (near `:506`). Leave `gridLocked` (the week-status edit-lock) untouched — the two are independent.

- [ ] **Step 3: Type-check.** Run: `npm run type-check`. Expected: PASS.
- [ ] **Step 4: Commit.**

```bash
git add src/components/crm/WeekCalendarGrid.tsx src/pages/crm/SubscriptionSchedulePage.tsx
git commit -m "feat(crm): surface per-day cutoff/supplier flags in the week calendar"
```

---

### Task 12: Subscription-scoped settings dialog (baseline / termination)

**Files:**
- Modify: `src/pages/crm/CustomerDashboard.tsx` (new dialog component + a trigger per subscription section)
- Test: `src/pages/crm/__tests__/SubscriptionSettingsDialog.test.tsx`

**Interfaces:**
- Consumes: `api.subscriptions.mutations.scheduleBaselineChange`, `api.subscriptions.mutations.giveTerminationNotice` (T7) via **`useSessionMutation`** from `convex-helpers/react/sessions` (the hook the file already imports at `:35`; the existing dialog uses `useSessionMutation(api.crm.customers.updateCustomerCrmFields)` at `:592` — mirror that). Do NOT use plain `useMutation`.

- [ ] **Step 1: Write the failing test.** Render the new dialog for a subscription; entering a baseline value and confirming calls `scheduleBaselineChange` with `{subscriptionId, newQty}`; clicking "Give 30-day termination notice" + confirm calls `giveTerminationNotice` with `{subscriptionId}`. Assert designed loading + error states render (D12). (Mock the mutation hooks per the existing CRM dialog test pattern — read `src/components/crm/ReconcileWeekDialog.test.tsx` for the harness.)
- [ ] **Step 2: Run test to verify it fails.** Expected: FAIL.
- [ ] **Step 3: Implement** a `SubscriptionSettingsDialog({ subscriptionId, label, baselineDailyQty, status, onClose })` mirroring the existing `CrmFieldsEditDialog` shape (Dialog/DialogContent/...), wiring the two mutations via `useSessionMutation` (sessionId is injected by the hook — do not pass it manually in the component), with: a numeric "New baseline daily qty" input + "Change baseline (effective in 14 days)" submit → `scheduleBaselineChange`; a "Give 30-day termination notice" button (disabled when `status` is `terminating`/`ended`) with a confirm step → `giveTerminationNotice`. Toast on success/error; loading state on submit. Add a "Manage subscription" trigger to each subscription section (near the per-subscription gauge/drawdown block). **No on-mount manager-only query** — the dialog only calls the two mutations on user action (Pitfall #19).
- [ ] **Step 4: Run test to verify it passes.** Expected: PASS.
- [ ] **Step 5: Commit.**

```bash
git add src/pages/crm/CustomerDashboard.tsx src/pages/crm/__tests__/SubscriptionSettingsDialog.test.tsx
git commit -m "feat(crm): subscription settings dialog — schedule baseline change + termination notice"
```

---

### Task 13: Register the 2 crons + uniqueness smoke test

**Files:**
- Modify: `convex/crons.ts` (append after the Slice-1 subscription block, before `export default crons;`)
- Test: `convex/__tests__/cronMinuteUniqueness.test.ts` (or extend an existing cron smoke test if present)

**Interfaces:**
- Consumes: `internal.subscriptions.enforcement.flipDayLocksAtCutoff.flipDayLocksAtCutoff`, `internal.subscriptions.enforcement.applyPendingBaselineChanges.applyPendingBaselineChanges`.

- [ ] **Step 1: Write/extend the failing smoke test.** Assert the two new cron names exist, are unique, and no two **primary** cron registrations share an exact UTC minute. (If no cron-introspection test exists, assert the two new names appear in `crons.ts` source and the chosen minutes `05:25`/`04:10` collide with no other fixed-minute primary — a string/AST check is acceptable; keep it simple.)
- [ ] **Step 2: Run test to verify it fails.** Expected: FAIL.
- [ ] **Step 3: Register the crons.** Append to `convex/crons.ts`:

```ts
// Enforcement (Slice 2) — idempotent internal mutations, NO watchdog.
// flipDayLocksAtCutoff: daily 12:25 WIB = 05:25 UTC (just before the 05:30 change-cutoff nudge).
crons.daily(
  "subscription flip day locks",
  { hourUTC: 5, minuteUTC: 25 },
  internal.subscriptions.enforcement.flipDayLocksAtCutoff.flipDayLocksAtCutoff,
  {},
);
// applyPendingBaselineChanges: daily 11:10 WIB = 04:10 UTC (unique minute).
crons.daily(
  "subscription apply baseline changes",
  { hourUTC: 4, minuteUTC: 10 },
  internal.subscriptions.enforcement.applyPendingBaselineChanges.applyPendingBaselineChanges,
  {},
);
```

- [ ] **Step 4: Run test to verify it passes.** Expected: PASS.
- [ ] **Step 5: Commit.**

```bash
git add convex/crons.ts convex/__tests__/cronMinuteUniqueness.test.ts
git commit -m "feat(subscription): register enforcement crons (05:25 + 04:10 UTC, no watchdog)"
```

---

### Task 14: AC11 confidential-price strip audit (VERIFY ONLY — build nothing)

**Files:**
- Create: `docs/reviews/ac11-price-strip-audit-2026-06-26.md`

**Interfaces:** none (audit only).

- [ ] **Step 1: Grep the strip helper coverage.** Confirm `convex/orders/helpers/stripSubscriptionPricing.ts` nulls item `unitPrice`/`lineTotal`/`lineMargin`/`lineCost` and order `totalAmount`/`finalTotal`/`totalMargin`/`totalCost`. Run: `git grep -n "stripOrder(" convex/orders/queries.ts convex/orders/kitchenQueries.ts`.
- [ ] **Step 2: Confirm all 10 staff-reachable order query sites apply `stripOrder`/`stripOrders`:** `list`, `listPaginated`, `get`, `getByOrderNumber`, `getKitchenOrders`, `getByCustomer`, `getPackagingOrders`, `getCompletedToday`, `listForKanban` (`queries.ts`) + `getKitchenPackingOrders` (`kitchenQueries.ts`). Tick each in the audit doc with its line number.
- [ ] **Step 3: Confirm tests exist** — `convex/orders/helpers/__tests__/stripSubscriptionPricing.test.ts` + `stripOrders.test.ts`. Run: `npx vitest run convex/orders/helpers`. Expected: PASS.
- [ ] **Step 4: Write the audit doc** with the checklist, line references, and verdict (PASS / gaps). If a gap is found, STOP and escalate (this slice is verify-only; building a fix is out of scope and needs a decision).
- [ ] **Step 5: Commit.**

```bash
git add docs/reviews/ac11-price-strip-audit-2026-06-26.md
git commit -m "docs(subscription): AC11 confidential-price strip coverage audit (verify-only)"
```

---

### Task 15: Full verification + codegen confirm + docs

**Files:**
- Modify: `docs/CHANGELOG.md`, `docs/SCHEMA.md`
- Modify: `convex/_generated/*` (confirm current)

- [ ] **Step 1: Codegen confirm.** Run: `npx convex codegen` then `git status` — `_generated/` must be clean (no diff). If dirty, commit it.
- [ ] **Step 2: Type-check.** Run: `npm run type-check`. Expected: PASS.
- [ ] **Step 3: Backend tests.** Run: `npx vitest run convex/subscriptions convex/orders/helpers`. Expected: PASS.
- [ ] **Step 4: Frontend tests.** Run: `npx vitest run src/components/crm src/pages/crm`. Expected: PASS.
- [ ] **Step 5: Build.** Run: `npm run build`. Expected: PASS (watch the vendor bundle cap — Pitfall #16; this slice adds no heavy dep).
- [ ] **Step 6: code-auditor pass.** Dispatch `code-auditor`: confirm new mutations are `roles:["manager","admin"]`, crons are `internalMutation`, no new `protectedQuery` on a staff mount (Pitfall #19), no banned imports (Pitfall #18), no hand-edited generated files.
- [ ] **Step 7: Docs.** Update `docs/CHANGELOG.md` (new entry) + `docs/SCHEMA.md` (2 new optional fields). Commit.

```bash
git add docs/CHANGELOG.md docs/SCHEMA.md convex/_generated
git commit -m "docs(subscription): CHANGELOG + SCHEMA for Slice-2 rule enforcement"
```

---

## Self-Review (writing-plans)

**Spec coverage:** AC1→T1; AC2/AC3→T5,T10,T11; AC4→T2,T9,T10; AC5/AC6→T6,T7; AC7/AC8→T7,T8; AC9→T12; AC10→T7,T13,T15; AC11→T14; AC12→T13; AC13→T15. All spec ACs mapped.
**Placeholder scan:** every code step shows real code/signatures; convex-test seeds reference the real schema validators (insert-field lists deferred to "read the schema/existing test harness" only where the boilerplate is large — flagged explicitly, not silent TODOs).
**Type consistency:** `detectAboveBaseline(dayItems, baselineDailyQty)`, `effectiveDateOf`/`permanentChangeEffective`/`terminationEffective(noticeDate, days, now)`, `cutoffMs`/`isPastCutoff(deliveryDateMs, offset, hour[, now])`, `pendingBaselineChange { newQty, effectiveDate }`, `dayFlags[{ pastCutoff, needsSupplierConfirmation }]` — names consistent across producing/consuming tasks.

---

*Plan for Phase E Slice-2 — rule enforcement. 15 tasks, 5 waves, subagent-driven. Date-relative cutoff lock (staffreview C1). COGS-rise alerting DROPPED. Live persona-UAT flagged pending if no headless env.*
