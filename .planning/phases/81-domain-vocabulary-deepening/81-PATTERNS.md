# Phase 81: Domain Vocabulary Deepening - Pattern Map

**Mapped:** 2026-05-10
**Files analyzed:** 4 new + ~22 modified
**Analogs found:** 4 / 4 (every new file has a strong analog)

---

## File Classification

| New / Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `convex/reports/platform.ts` (NEW) | utility (literal-union + resolver) | transform | `convex/lib/externalSource.ts` (`EXTERNAL_SOURCES` + `isExternalSource` + `sourceToPlatform`) | exact (literal-union + helper + display-mapper in one module) |
| `convex/reports/__tests__/platform.test.ts` (NEW) | test (table-driven) | transform | `convex/externalData/__tests__/sourceToPlatform.test.ts` (`it.each` table) — extend with K3Mart-cascade harness shape from `convex/integrations/k3mart/__tests__/cascade.test.ts` for the BigSeller `linkedMenuProductId` fallback | exact |
| `convex/reports/__tests__/productionUnitHelpers.test.ts` (NEW) | test (table-driven) | transform | `convex/externalData/__tests__/lifetimeHelpers.test.ts` (componentTypes / BOM stub builders + `it.each`) | exact |
| `convex/lib/__tests__/periodRange.test.ts` (MODIFIED — add NaN-guard cases) | test | transform | `convex/staffAttendance/__tests__/flagEngine.test.ts` lines 40-64 (NaN/Infinity throw) — already an existing test in the same file pattern | exact |
| `convex/reports/productionUnitHelpers.ts` (MODIFIED — add `isProductionUnit`) | utility | transform | self — extend existing module (ctx-bearing helpers); new export is pure (no ctx) | n/a (in-place extension) |
| `convex/lib/periodRange.ts` (MODIFIED — promote NaN-guard) | utility | transform | self — collapse `toWibDateString` semantics into a new `getWibDateStr(ms): string` (YYYY-MM-DD); see "C3 Naming Collision" warning below | n/a (in-place extension) |
| `convex/lib/externalSource.ts` (MODIFIED — DELETE `sourceToPlatform`) | utility | transform | self — keeps `EXTERNAL_SOURCES`, `ExternalSource`, `isExternalSource` | n/a (in-place deletion) |
| `convex/reports/channelTaxonomy.ts` (DELETE entire file or strip exports) | utility | transform | n/a — file is purely the doomed mappers + `DisplayChannel` type | n/a (deletion) |
| `convex/lib/counter.ts` (MODIFIED — see C3 collision) | utility | transform | self — keep its MMDD-format helper but RENAME to disambiguate (see C3 Naming Collision) | n/a |
| C1 caller files (12) — see "C1 Caller Migration" table | various | transform | each callsite: swap `sourceToPlatform(src)` → `platformDisplay(resolvePlatform(row))` per the per-file diff hint table | role-match |
| C4 caller files (4) — see "C4 Caller Migration" table | various | transform | each: swap inline `ct.category === "production" && ...` filter for `isProductionUnit(ct)` | role-match |
| `eslint.config.js` (MODIFIED — add `no-restricted-imports`) | config | transform | n/a — the file currently has NO `no-restricted-imports` rule, so D-12 introduces the convention; recommended shape below | no analog (greenfield rule) |

---

## CRITICAL: C3 Naming Collision Warning

**The repo today has TWO functions both named `getWibDateStr` with DIFFERENT semantics — CONTEXT.md's D-07 promotes the YYYY-MM-DD shape but the existing `counter.ts` `getWibDateStr` returns MMDD.** Planner MUST handle this:

| Existing helper | File | Returns | Format | Used by |
|---|---|---|---|---|
| `getWibDateStr(utcMs)` | `convex/lib/counter.ts:45` | `string` | **MMDD** (e.g. `"0312"`) | `getNextNumber` (counter sequencing — `EXP-MMDD-NNN`); test `convex/lib/__tests__/counter.test.ts` |
| `utcToWibDateStr(utcMs)` | `convex/lib/periodRange.ts:221` | `string` | **YYYY-MM-DD** (e.g. `"2026-03-12"`) | timeSeries, financialExport, frontend `dateUtils.ts` (parallel impl) |
| `getWibDateString(timestampMs?)` | `convex/gofoodDepot/helpers.ts:52` | `string` | **YYYY-MM-DD** (sliced from ISO) | `gofoodDepot/queries.ts` |
| `getWibDateStringDaysAgo(daysAgo, fromMs?)` | `convex/gofoodDepot/helpers.ts:68` | `string` | YYYY-MM-DD | `gofoodDepot/queries.ts` |
| `toWibDateString(utcMs)` | `convex/staffAttendance/flagEngine.ts:31` | `string` | **YYYY-MM-DD** | `staffAttendance/mutations.ts` (4 sites), 4 test files (~30 call sites) |

**Recommended resolution (planner picks; surface as a deferred-decision note):**

- Rename `counter.ts`'s `getWibDateStr(utcMs): string /* MMDD */` to `getWibMonthDayStr(utcMs): string /* MMDD */` (in-scope rename — touches `counter.ts` + `convex/lib/__tests__/counter.test.ts` + 1 internal call). This frees the canonical name for D-07's YYYY-MM-DD helper at `periodRange.ts`.
- Then promote `getWibDateStr(ms: number): string /* YYYY-MM-DD */` into `periodRange.ts` with NaN-guard.
- Migrate call sites (~6 files, ~30 imports) from `toWibDateString` → `getWibDateStr` and `getWibDateString` / `getWibDateStringDaysAgo` → `getWibDateStr` / inline.
- Delete the 4 doomed helpers in same plan.

**Caller surface that CONTEXT.md under-counts:** ~6 production files + 5 test files (vs. CONTEXT.md's "~5 sites"). See full list in C3 Caller Migration table.

---

## Pattern Assignments

### `convex/reports/platform.ts` (NEW — literal union + resolver + display)

**Closest analog:** `D:\Claude\Product Manager\product_master\convex\lib\externalSource.ts`

This analog already combines all three things the new module needs: a frozen literal array (`EXTERNAL_SOURCES`), a derived literal-union type, a runtime narrowing guard (`isExternalSource`), and a switch-based mapper (`sourceToPlatform`). Mirror its shape.

**Imports + literal-union pattern** (from `convex/lib/externalSource.ts:10-26`):
```typescript
/**
 * Runtime type guard for the externalSource union type.
 *
 * IMPORTANT: This array MUST match the literals in `externalSource`
 * validator defined in convex/schema.ts (line 18).
 */
export const EXTERNAL_SOURCES = [
  "k3mart", "gobiz", "internal", "grabfood",
  "bigseller", "consignment", "shopee", "tiktok",
] as const;

export type ExternalSource = (typeof EXTERNAL_SOURCES)[number];

/** Narrows a string to ExternalSource if it matches a known platform. */
export function isExternalSource(s: string): s is ExternalSource {
  return (EXTERNAL_SOURCES as readonly string[]).includes(s);
}
```

**Switch-mapper pattern** (from `convex/lib/externalSource.ts:29-42` — the `sourceToPlatform` shape the planner must REPLACE):
```typescript
/** Map source to platform display name */
export function sourceToPlatform(source: string): string {
  switch (source) {
    case "gobiz": return "GoFood";
    case "k3mart": return "K3 Mart";
    case "internal": return "Direct";
    // ...
  }
}
```

**`platformDisplay` analog (none exists):** No `*Display` helper currently exists in the repo (grepped — `confidence.ts` has no `confidenceDisplay`, no `sourceDisplay`, etc.). RECOMMEND the simplest convention: `platformDisplay(p: Platform): string` returns `p` itself (since the `Platform` literals are already user-facing PascalCase strings per D-04). The existence of `platformDisplay` is forward-compatible: if a future locale layer needs to translate, it has one chokepoint.

**Worse-confidence wiring (D-03 BigSeller fallback):**
- `convex/lib/confidence.ts:6,8-13,16-18` exports `Confidence`, `CONFIDENCE_RANK`, `worstConfidence`.
- Existing call site to mirror: `convex/reports/incomeStatement.ts:17` (`import { type Confidence, worstConfidence } from "../lib/confidence";`) and `incomeStatement.ts:333-335`:
  ```typescript
  const channelConfidence: Confidence = hasAnyCogsMissing
    ? worstConfidence(revenueConfidence, "missing")
    : revenueConfidence;
  ```
- **Recommended wiring for `resolvePlatform`:** the BigSeller fallback path returns `{ platform: Platform; confidence: Confidence }` (or accepts an existing-confidence param and returns the worse of the two). Per the Discretion item, return the tuple shape so callers compose with `worstConfidence(rowConfidence, fallbackConfidence)` themselves — avoids double-downgrading rows already at `"inferred"`. Document this contract in the module JSDoc.

**Recommended location:** `convex/reports/platform.ts`. Evidence: the largest consumer (`convex/reports/unitEconomics.ts` lines 63-65) is in `reports/`; `convex/reports/incomeStatement.ts` consumes it; existing `convex/reports/channelTaxonomy.ts` (the doomed module) is in `reports/`. No circular-import risk visible — `reports/` already imports freely from `lib/` (e.g. `incomeStatement.ts:17,18`).

---

### `convex/reports/__tests__/platform.test.ts` (NEW — table-driven)

**Closest analog:** `D:\Claude\Product Manager\product_master\convex\externalData\__tests__\sourceToPlatform.test.ts`

This is the *exact* test file the planner is migrating from (per CONTEXT.md "Reusable Assets"). The new file should absorb its `it.each` cases (re-mapped to new Platform literals per D-02) AND extend with the `convexTest`-based harness from the K3Mart cascade test for the BigSeller `linkedMenuProductId` fallback path.

**Pure `it.each` table pattern** (from `convex/externalData/__tests__/sourceToPlatform.test.ts:1-25`):
```typescript
import { describe, expect, it } from "vitest";
import { sourceToPlatform } from "../../lib/externalSource";

describe("sourceToPlatform", () => {
  it.each([
    ["gobiz", "GoFood"],
    ["k3mart", "K3 Mart"],
    ["internal", "Direct"],
    ["grabfood", "GrabFood"],
    ["shopee", "Shopee"],
    ["tiktok", "Tokopedia"],
    ["consignment", "Consignment"],
    ["bigseller", "BigSeller"],
  ] as const)("maps %s → %s", (source, expected) => {
    expect(sourceToPlatform(source)).toBe(expected);
  });

  it("returns unknown source as-is (fallback)", () => {
    expect(sourceToPlatform("newplatform")).toBe("newplatform");
  });
});
```

**For BigSeller `linkedMenuProductId` fallback paths (D-05 BigSeller branch), use convexTest harness pattern** (from `convex/integrations/k3mart/__tests__/cascade.test.ts:14-43`):
```typescript
import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "../../schema";
import type { Id } from "../../_generated/dataModel";

type TestT = ReturnType<typeof convexTest>;

async function seedAdminToken(t: TestT): Promise<string> {
  const tok = `admin-${Date.now()}-${Math.random()}`;
  await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { /* ... */ } as never);
    await ctx.db.insert("sessions", { userId, token: tok, /* ... */ } as never);
  });
  return tok;
}
```

**After migrating cases — DELETE `convex/externalData/__tests__/sourceToPlatform.test.ts`** in the same plan (D-10: no shims).

---

### `convex/reports/__tests__/productionUnitHelpers.test.ts` (NEW — table-driven for `isProductionUnit`)

**Closest analog:** `D:\Claude\Product Manager\product_master\convex\externalData\__tests__\lifetimeHelpers.test.ts`

This test stubs `componentTypes` + `menuProductComponents` minimally and uses pure-function assertions. Same shape needed for `isProductionUnit`. No `convexTest` harness needed — `isProductionUnit` is a pure predicate over a single `componentTypes` row.

**Stub-builder pattern** (from `convex/externalData/__tests__/lifetimeHelpers.test.ts:32-40`):
```typescript
function makeComponentType(id: string, category: "production" | "packaging") {
  return {
    _id: id as any,
    _creationTime: 0,
    category,
    name: category === "production" ? "Ball" : "Box",
    code: category === "production" ? "BIG_BALL" : "SMALL_BOX",
  } as any;
}
```

**For exhaustive D-11 table** (production/packaging × pcs/g × gramsPerUnit defined/undefined), extend the stub builder with explicit `unit` and `gramsPerUnit` overrides. Use `it.each` for the matrix.

---

### `convex/lib/__tests__/periodRange.test.ts` (MODIFIED — add NaN-guard cases for new `getWibDateStr`)

**Closest analog (existing NaN-guard tests):** `D:\Claude\Product Manager\product_master\convex\staffAttendance\__tests__\flagEngine.test.ts:56-63`

The exact NaN/Infinity throw-pattern that needs to be lifted into the new tests:

```typescript
it("throws on NaN input (WR-02 regression)", () => {
  expect(() => toWibDateString(NaN)).toThrow(/non-finite/);
});

it("throws on Infinity input (WR-02 regression)", () => {
  expect(() => toWibDateString(Number.POSITIVE_INFINITY)).toThrow(/non-finite/);
  expect(() => toWibDateString(Number.NEGATIVE_INFINITY)).toThrow(/non-finite/);
});
```

**For 1:1 parity tests (D-11)** — re-point each existing `toWibDateString` test from `flagEngine.test.ts:40-64` to the canonical `getWibDateStr` import, then DELETE the originals in `flagEngine.test.ts`.

---

### `convex/reports/productionUnitHelpers.ts` (MODIFIED — add `isProductionUnit` predicate)

**Closest analog:** self — extend existing module style.

The module already has 3 ctx-bearing helpers (`getProductionUnitsPerProduct`, `getProductionUnitsByTypePerProduct`, `unitsForOrderItem`). Add a **pure** `isProductionUnit(ct: Doc<"componentTypes">): boolean` predicate alongside, with rule per D-01: `category === "production"` ALONE (no `unit === "pcs"` requirement).

**Existing in-line filter to LIFT** (from `convex/reports/productionUnitHelpers.ts:17-21`):
```typescript
for (const ct of allComponentTypes) {
  if (ct.category === "production" && ct.unit === "pcs") {
    productionTierOneIds.add(ct._id as string);
  }
}
```

**RECOMMENDED:** After introducing `isProductionUnit`, also refactor THIS file's three internal `category === "production" && unit === "pcs"` filters (lines 18, 46, and the corresponding spot in `unitEconomics.ts:458` which is one of the 4 C4 sites) to call `isProductionUnit(ct)`. This drops the `unit === "pcs"` clause per D-01 — flag in plan as a SEMANTIC change (not just rename) so reviewers grep for the dropped clause. Future BIG_BALL gram-denominated bulk variants will then auto-count.

**Type-import header** (from `convex/reports/productionUnitHelpers.ts:1-2`):
```typescript
import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
```

The new `isProductionUnit` accepts `Doc<"componentTypes">` (or a structural subset — recommend a minimal interface `Pick<Doc<"componentTypes">, "category">` to keep test stubs trivial).

---

### `convex/lib/periodRange.ts` (MODIFIED — add `getWibDateStr` with NaN-guard)

**Closest analog (NaN-guard semantic):** `D:\Claude\Product Manager\product_master\convex\staffAttendance\flagEngine.ts:31-36`

```typescript
export function toWibDateString(utcMs: number): string {
  if (!Number.isFinite(utcMs)) {
    throw new Error(`toWibDateString: non-finite input ${utcMs}`);
  }
  return new Date(utcMs + WIB_OFFSET_MS).toISOString().slice(0, 10);
}
```

**Existing structure to mirror** (from `convex/lib/periodRange.ts:218-223`):
```typescript
export const WIB_OFFSET_MS = WIB_OFFSET_HOURS * 60 * 60 * 1000;

/** Get WIB date string (YYYY-MM-DD) from UTC epoch ms */
export function utcToWibDateStr(utcMs: number): string {
  return new Date(utcMs + WIB_OFFSET_MS).toISOString().split("T")[0];
}
```

**Recommended new export** (lift NaN-guard into the new canonical):
```typescript
/**
 * Canonical WIB date helper. Returns YYYY-MM-DD for a UTC epoch ms.
 * Throws on non-finite input — fail-loud, no "Invalid Date" leakage.
 */
export function getWibDateStr(utcMs: number): string {
  if (!Number.isFinite(utcMs)) {
    throw new Error(`getWibDateStr: non-finite input ${utcMs}`);
  }
  return new Date(utcMs + WIB_OFFSET_MS).toISOString().slice(0, 10);
}
```

**NOTE for planner:** `utcToWibDateStr` (the old name on line 221) is currently used by ~30 call sites in `src/` (frontend) plus `convex/externalData/helpers/timeSeriesHelpers.ts:5` and `convex/reports/financialExport.ts:37`. CONTEXT.md says "delete `utcToWibDateStr` (collapsed)" — practical sequencing:
1. Add `getWibDateStr` with NaN-guard alongside `utcToWibDateStr`.
2. Re-point all backend imports.
3. Either DELETE `utcToWibDateStr` from `periodRange.ts` AND the parallel `src/lib/dateUtils.ts:60` impl (front+back-end alignment, big sweep), OR leave `utcToWibDateStr` as a 1-line re-export of `getWibDateStr` for the frontend's sake.
4. ESLint D-12 bans `getWibDateStr` import from `convex/lib/counter.ts` (after collision rename per "C3 Naming Collision" above).

---

### `convex/lib/externalSource.ts` (MODIFIED — DELETE `sourceToPlatform`)

**Current state to PRESERVE** (lines 1-26 — keep the runtime guard + literal):
```typescript
export const EXTERNAL_SOURCES = [
  "k3mart", "gobiz", "internal", "grabfood",
  "bigseller", "consignment", "shopee", "tiktok",
] as const;
export type ExternalSource = (typeof EXTERNAL_SOURCES)[number];
export function isExternalSource(s: string): s is ExternalSource {
  return (EXTERNAL_SOURCES as readonly string[]).includes(s);
}
```

**To DELETE** (lines 28-42 — the doomed `sourceToPlatform`):
```typescript
export function sourceToPlatform(source: string): string {
  switch (source) {
    case "gobiz": return "GoFood";
    case "k3mart": return "K3 Mart";          // ← D-02 rename target: "K3Mart"
    case "internal": return "Direct";
    case "grabfood": return "GrabFood";
    case "shopee": return "Shopee";
    case "tiktok": return "Tokopedia";        // ← D-02 rename target: "TikTok"
    case "consignment": return "Consignment";
    case "bigseller": return "BigSeller";
    default: return source;
  }
}
```

After deletion, ESLint guard (D-12) bans re-importing `sourceToPlatform` from this path with a directive pointing to `convex/reports/platform.ts`.

---

### `convex/reports/channelTaxonomy.ts` (MODIFIED — DELETE `toDisplayChannel`, `sourceToDisplayChannel`, `DisplayChannel` type, `DISPLAY_CHANNELS`)

**Current state — entire file is doomed.** Verified by reading 1-81: the file contains ONLY the 3 deletion targets + the `DISPLAY_CHANNELS` array. Recommend deleting the file outright.

**One frontend re-export to migrate** (`src/contexts/AnalyticsFilterContext.tsx:6-11`):
```typescript
import {
  DISPLAY_CHANNELS,
  type DisplayChannel,
} from "../../convex/reports/channelTaxonomy";

export { DISPLAY_CHANNELS, type DisplayChannel };
```
After C1, this should re-export `Platform` and `PLATFORMS` (if needed) from `convex/reports/platform.ts`. `src/components/analytics/AnalyticsFilterBar.tsx:7` also imports `type DisplayChannel` from this context.

---

## C1 Caller Migration Table (~12 production files)

Each cell in "Current call site" is the import line + a representative usage. Each callsite swaps `sourceToPlatform(src)` → `platformDisplay(resolvePlatform(row))` (or just `platformDisplay(p)` if a platform literal is already in scope). Where the row context is a bare `source: string`, the simplest form is `platformDisplay(resolvePlatform({ source }))`.

| File | Import line | Current call sites | Migration shape |
|---|---|---|---|
| `D:\Claude\Product Manager\product_master\convex\externalData\queries.ts` | line 9: `import { isExternalSource, sourceToPlatform } from "../lib/externalSource";` | 1502: `platform: sourceToPlatform(p),` and 1594: `platformName: sourceToPlatform(platform),` | swap to `platformDisplay(resolvePlatform({ source: p }))` (both sites already have a bare `source` string) |
| `D:\Claude\Product Manager\product_master\convex\externalData\helpers\dashboardHelpers.ts` | line 6: `import { sourceToPlatform } from "../../lib/externalSource";` | 95: `displayName: sourceToPlatform(source),` and 110: `displayName: sourceToPlatform("internal"),` | line 110 is hardcoded `"internal"` → `Platform = "Direct"` literal directly; line 95 follows queries.ts pattern |
| `D:\Claude\Product Manager\product_master\convex\reports\incomeStatement.ts` | line 18: `import { sourceToPlatform } from "../lib/externalSource";` | 339: `displayName: sourceToPlatform(source),`; 389: `displayName: sourceToPlatform("consignment"),`; 431: `displayName: sourceToPlatform(known.source),` | same as above; 389 → hardcoded `"Consignment"` literal |
| `D:\Claude\Product Manager\product_master\convex\reports\unitEconomics.ts` | lines 63-65: `import { toDisplayChannel, sourceToDisplayChannel, type DisplayChannel } from "./channelTaxonomy";` | 115 (`DisplayChannel` field type); 221, 243 (`sourceToDisplayChannel(r.source)`); 377, 386, 430 (`toDisplayChannel(o.channel)`); 628, 638, 703, 711, 1050, 1051 (DisplayChannel as Map key) | swap `DisplayChannel` → `Platform`; `sourceToDisplayChannel(s)` → `resolvePlatform({ source: s }).platform`; `toDisplayChannel(o.channel)` → for `orders.channel`, plan to add `resolveOrderChannelPlatform` OR fold into `resolvePlatform({ orderChannel: o.channel })` per D-05 internal-handling. **HIGHEST-RISK migration in C1.** |
| `D:\Claude\Product Manager\product_master\src\lib\platformColors.ts` | (no import — defines its own keyspace) | lines 19-37 PALETTE keys are mixed — lowercase source keys (gobiz, k3mart, ...) AND PascalCase display names ("Tokopedia", "K3Mart", "Direct", ...) | D-02 rename: change `"Tokopedia"` key (line 30) → `"TikTok"` (and consider deduping with the existing line-35 `TikTok` entry); `"K3Mart"` already correct (line 32). **Note:** keyspace ALREADY uses `"K3Mart"` (no space) — the rename is only on the SOURCE-MAPPER output side. Line 58's `buildChartColorMap(sourceToPlatform)` parameter is a function-typed param, not the deleted module — keep as is, but pass `(s) => platformDisplay(resolvePlatform({ source: s }))` from callers. |
| `D:\Claude\Product Manager\product_master\src\components\bankReconciliation\InlineRevenueDialog.tsx` | line 32: `sourceToPlatform,` (in import block 30-34: `EXTERNAL_SOURCES, sourceToPlatform, type ExternalSource`) | 134: `{sourceToPlatform(s)}{" "}` | swap import → `{ EXTERNAL_SOURCES, type ExternalSource } from "convex/lib/externalSource"` + `{ platformDisplay, resolvePlatform } from "convex/reports/platform"`; replace usage with `platformDisplay(resolvePlatform({ source: s }))` |
| `D:\Claude\Product Manager\product_master\src\components\channelIntegration\ChannelFlagRow.tsx` | line 23: `import { sourceToPlatform } from "../../../convex/lib/externalSource";` + line 24: `import type { ExternalSource } from ...` | 63: `const displayChannel = sourceToPlatform(source);` | same as above |
| `D:\Claude\Product Manager\product_master\src\components\channelIntegration\ResolutionPreviewPanel.tsx` | lines 20-24: import block with `EXTERNAL_SOURCES, sourceToPlatform, type ExternalSource` | 131: `{sourceToPlatform(s)}` | same as above |
| `D:\Claude\Product Manager\product_master\src\components\channelIntegration\SourceBadge.tsx` | lines 13-14: `import type { ExternalSource } ...; import { sourceToPlatform } ...;` | 32: `const displayLabel = label ?? sourceToPlatform(source);` | same as above |
| `D:\Claude\Product Manager\product_master\src\pages\ChannelRoutingManager.tsx` | lines 77-81: `import { EXTERNAL_SOURCES, sourceToPlatform, type ExternalSource } from "../../convex/lib/externalSource";` | 392, 401, 467, 633, 638 (5 usages — all `sourceToPlatform(r.source)` or `sourceToPlatform(s)`) | same as above; 5 sites in one file — careful |
| `D:\Claude\Product Manager\product_master\src\pages\ProductInventorySettings.tsx` | line 54: `import { sourceToPlatform } from "../../convex/lib/externalSource";` + line 55: `import type { ExternalSource } ...;` | 148, 327, 328, 333 (×4), 334, 369, 370 — **9 sites** | same as above; **highest call-site count of any C1 file** |
| `D:\Claude\Product Manager\product_master\src\contexts\AnalyticsFilterContext.tsx` | lines 6-9: `import { DISPLAY_CHANNELS, type DisplayChannel } from "../../convex/reports/channelTaxonomy";` + line 11: re-export | 16, 35, 55 (`DisplayChannel[]` field type + 2 cast sites) | swap to `Platform` from `convex/reports/platform.ts`; consumer `src/components/analytics/AnalyticsFilterBar.tsx:7,71` follows |

**Total:** 12 production files + 2 doomed test references (`convex/reports/__tests__/unitEconomics.test.ts:462` is a comment-only mention; `convex/externalData/__tests__/sourceToPlatform.test.ts` is a doomed-file delete target).

---

## C4 Caller Migration Table (4 sites + 1 self)

Each site has a slightly different inline filter today (per CONTEXT.md "Reality" — 3 different rule shapes). Document each EXACT current expression so the planner notes the SEMANTIC change (drop `unit === "pcs"`, drop `gramsPerUnit !== undefined`).

| File:line | Current filter expression | Source flag |
|---|---|---|
| `D:\Claude\Product Manager\product_master\convex\reports\unitEconomics.ts:458` | `.filter((ct) => ct.category === "production" && ct.unit === "pcs")` | drops `unit === "pcs"` |
| `D:\Claude\Product Manager\product_master\convex\externalData\helpers\lifetimeHelpers.ts:26` | `.filter((ct) => ct.category === "production")` | already-canonical (no change in BEHAVIOR, just mechanical swap to `isProductionUnit`) |
| `D:\Claude\Product Manager\product_master\convex\staffAttendance\aggregation.ts:186` | `.filter((c) => c.category === "production")` | already-canonical |
| `D:\Claude\Product Manager\product_master\convex\menuProducts\mutations.ts:52` | `.filter((c) => c.category === "production" && c.gramsPerUnit !== undefined)` | drops `gramsPerUnit !== undefined` (this filter is in a `totalGrams` reduce — VERIFY semantic safety: dropping the guard changes total to `0 * undefined = NaN`. Recommend KEEPING the guard at this callsite via `.filter(isProductionUnit).filter(c => c.gramsPerUnit !== undefined)` — semantic preservation; flag in plan.) |
| `D:\Claude\Product Manager\product_master\convex\reports\productionUnitHelpers.ts:18,46` | (self — internal — `ct.category === "production" && ct.unit === "pcs"`) | drops `unit === "pcs"` (intended per D-01) |

**Total:** 4 external sites + ~2 internal sites in the predicate's own home file.

---

## C3 Caller Migration Table (~6 production files + 5 test files)

| File:line | Current import | Current usage | Migration |
|---|---|---|---|
| `D:\Claude\Product Manager\product_master\convex\staffAttendance\mutations.ts:19` | `import { toWibDateString } from "./flagEngine";` | 47, 103, 162, 253 (4 sites: `toWibDateString(now)`, `toWibDateString(args.clockIn)`, etc.) | swap to `import { getWibDateStr } from "../lib/periodRange";` |
| `D:\Claude\Product Manager\product_master\convex\staffAttendance\flagEngine.ts:91` | (self — internal use) | `const todayWib = toWibDateString(now);` | swap to imported `getWibDateStr` after deleting local `toWibDateString` |
| `D:\Claude\Product Manager\product_master\convex\gofoodDepot\queries.ts:12-13,447,452,475` | `import { getWibDateString, getWibDateStringDaysAgo, ... } from "./helpers";` | 447: `getWibDateString(now)`; 452: `getWibDateStringDaysAgo(14, now)`; 475: `getWibDateString(rev.periodStart)` | swap `getWibDateString(t)` → `getWibDateStr(t)`; replace `getWibDateStringDaysAgo(n, t)` with inline `getWibDateStr(t - n*24*60*60*1000)` |
| `D:\Claude\Product Manager\product_master\convex\gofoodDepot\helpers.ts:52,68` | (self — defines doomed helpers) | — | DELETE `getWibDateString` and `getWibDateStringDaysAgo`; keep `computeRestockSuggestion` and `getWibDayOfWeek` |
| `D:\Claude\Product Manager\product_master\convex\kitchenShiftRecords\queries.ts:270-279` | (self — defines local `toWibDateString(date: Date)` helper inside the function) | 275, 279 | this is a Date-based shadow (different signature: `Date → string`); swap or wrap to call `getWibDateStr(date.getTime())` |
| `D:\Claude\Product Manager\product_master\convex\kitchenShiftRecords\__tests__\summary.test.ts:19` | `import { toWibDateString } from "../../staffAttendance/flagEngine";` | ~24 usages (lines 130, 169-170, 194-195, 213, 242, 249-250, 265, 307, 357-360, 403, 454, 518, 551-553, 571-572) | swap import → `getWibDateStr` from `convex/lib/periodRange` |
| `D:\Claude\Product Manager\product_master\convex\staffAttendance\__tests__\flagEngine.test.ts:6,40-64` | (self — tests doomed `toWibDateString`) | NaN-guard test cases | MIGRATE the 5 test cases (40-64) into `convex/lib/__tests__/periodRange.test.ts` (re-pointed import); DELETE from this file |
| `D:\Claude\Product Manager\product_master\convex\staffAttendance\__tests__\correctAttendance.test.ts:18,27,49,75,113,177,207,283,340` | `import { toWibDateString } from "../flagEngine";` | 9 sites of `toWibDateString(Date.now())` | swap import + name |
| `D:\Claude\Product Manager\product_master\convex\staffAttendance\__tests__\clockIn.test.ts:13,33,61,78,96` | `import { toWibDateString } from "../flagEngine";` | 5 sites | swap import + name |
| `D:\Claude\Product Manager\product_master\convex\staffAttendance\__tests__\clockOut.test.ts:13,21,48,68,89,105,125` | `import { toWibDateString } from "../flagEngine";` | 6 sites | swap import + name |
| `D:\Claude\Product Manager\product_master\convex\lib\counter.ts:45` | (self — defines `getWibDateStr(utcMs): string /* MMDD */`) | — | RENAME to `getWibMonthDayStr` (per "C3 Naming Collision" above); update the 1 internal call (line 68) and 1 test file |
| `D:\Claude\Product Manager\product_master\convex\lib\__tests__\counter.test.ts:2,30-66` | `import { ..., getWibDateStr } from "../counter";` | ~6 cases | swap to renamed `getWibMonthDayStr` |
| `D:\Claude\Product Manager\product_master\convex\fixedAssets\helpers.ts:286` | (comment-only reference) | `// IMPORTANT: Uses YYMM format (year-first), different from counter.ts getWibDateStr` | UPDATE the comment to point to the new name `getWibMonthDayStr` |

**Frontend `utcToWibDateStr` callers (~30 sites in `src/`)**: deferred — see "MODIFIED `convex/lib/periodRange.ts`" note above. Frontend has its own parallel `src/lib/dateUtils.ts:60` impl, so backend collapse can ship without touching frontend if the planner picks the "leave `utcToWibDateStr` as a 1-line re-export" path. Recommended: do NOT touch frontend in this phase — the seam is clean.

---

## Shared Patterns

### Confidence-downgrade integration

**Source:** `D:\Claude\Product Manager\product_master\convex\lib\confidence.ts`
**Apply to:** D-03 BigSeller fallback in `convex/reports/platform.ts`

```typescript
export type Confidence = "exact" | "calculated" | "inferred" | "missing";

export const CONFIDENCE_RANK: Record<Confidence, number> = {
  exact: 0, calculated: 1, inferred: 2, missing: 3,
};

/** Returns the worse (lowest-quality) confidence of two values. */
export function worstConfidence(a: Confidence, b: Confidence): Confidence {
  return CONFIDENCE_RANK[a] >= CONFIDENCE_RANK[b] ? a : b;
}
```

**Existing call site to mirror** (from `convex/reports/incomeStatement.ts:333-335`):
```typescript
const channelConfidence: Confidence = hasAnyCogsMissing
  ? worstConfidence(revenueConfidence, "missing")
  : revenueConfidence;
```

**Recommended `resolvePlatform` shape** (planner has discretion per CONTEXT.md):
```typescript
// Option A (composable — RECOMMENDED): caller composes worst()
export function resolvePlatform(row: {
  source: ExternalSource;
  underlyingSource?: ExternalSource;
  linkedMenuProductId?: Id<"menuProducts">;
  // ... or accept linked product's source pre-resolved
}): { platform: Platform; confidence: Confidence } {
  // ...
  // BigSeller fallback path returns { platform: "BigSeller", confidence: "inferred" }
  // Caller does: rowConfidence = worstConfidence(rowConfidence, result.confidence);
}
```
This avoids double-downgrading rows already at `"inferred"` per the Discretion note.

### Schema literal fidelity

**Source:** Phase 41 lesson (MEMORY.md → `feedback_prd_fidelity.md`)
**Apply to:** all C1 files

The `Platform` literal union must match downstream consumer types EXACTLY. After defining:
```typescript
export const PLATFORMS = [
  "Direct", "GoFood", "GrabFood", "Shopee",
  "TikTok", "K3Mart", "Consignment", "BigSeller",
] as const;
export type Platform = (typeof PLATFORMS)[number];
```
Type-check after each callsite migration. Exhaustive switch on `Platform` should be `never`-defaulted so a future literal addition fails compile.

### Pure function extraction

**Source:** CLAUDE.md / MEMORY.md "Established Patterns"
**Apply to:** `convex/reports/platform.ts`

Keep Convex registrations (queries, mutations, actions) in their original files. The new `platform.ts` is pure — no `query()`, `mutation()`, no ctx. Callers in `convex/reports/incomeStatement.ts`, `convex/reports/unitEconomics.ts`, `convex/externalData/queries.ts` keep their shape and just change imports.

---

## ESLint `no-restricted-imports` Recommendation (D-12)

**Current state:** `D:\Claude\Product Manager\product_master\eslint.config.js` has NO `no-restricted-imports` rule. The file is short (30 lines, flat-config format). D-12 introduces the convention.

**Recommended shape** (add as a new rule block in the `defineConfig([...])` array, after the shadcn-overrides block):

```javascript
{
  files: ['**/*.{ts,tsx}'],
  rules: {
    'no-restricted-imports': ['error', {
      paths: [
        {
          name: 'convex/lib/externalSource',
          importNames: ['sourceToPlatform'],
          message: 'sourceToPlatform was deleted in Phase 81. Use platformDisplay(resolvePlatform(row)) from convex/reports/platform instead.',
        },
        {
          name: 'convex/reports/channelTaxonomy',
          message: 'channelTaxonomy was deleted in Phase 81. Use Platform / resolvePlatform / platformDisplay from convex/reports/platform instead.',
        },
        {
          name: 'convex/staffAttendance/flagEngine',
          importNames: ['toWibDateString'],
          message: 'toWibDateString was consolidated in Phase 81. Use getWibDateStr from convex/lib/periodRange instead.',
        },
        {
          name: 'convex/gofoodDepot/helpers',
          importNames: ['getWibDateString', 'getWibDateStringDaysAgo'],
          message: 'These helpers were consolidated in Phase 81. Use getWibDateStr from convex/lib/periodRange instead.',
        },
        {
          name: 'convex/lib/counter',
          importNames: ['getWibDateStr'],
          message: 'counter.ts no longer exports getWibDateStr (renamed to getWibMonthDayStr — returns MMDD, not YYYY-MM-DD). Use getWibDateStr from convex/lib/periodRange for YYYY-MM-DD.',
        },
      ],
      patterns: [
        // Path-based variants (since callers use various relative paths)
        {
          group: ['**/convex/lib/externalSource', '**/convex/reports/channelTaxonomy'],
          importNames: ['sourceToPlatform', 'sourceToDisplayChannel', 'toDisplayChannel', 'DisplayChannel', 'DISPLAY_CHANNELS'],
          message: 'See Phase 81: use Platform / resolvePlatform / platformDisplay from convex/reports/platform.',
        },
      ],
    }],
  },
},
```

**NOTE:** `no-restricted-imports` `paths[].name` is matched against the literal import string, so the `patterns` block (with `**/` glob) is needed because callers in `src/` use `../../convex/lib/externalSource` while callers in `convex/` use `./lib/externalSource`. Test the rule against both forms during plan-phase.

---

## No Analog Found

| File | Reason |
|---|---|
| `eslint.config.js` (modification) | Repo currently has NO `no-restricted-imports` rule — D-12 establishes the convention. RECOMMENDED shape provided above (modeled after standard ESLint flat-config docs). |
| `platformDisplay` helper | No `*Display(literal): string` precedent in repo (no `confidenceDisplay`, `sourceDisplay`, etc.). Recommend simplest convention: identity function on the Platform literal (since Platform literals are already user-facing). |

---

## Color-map alignment (`src/lib/platformColors.ts`)

**Current keyspace — verified by reading lines 19-37:**

Lowercase **source** keys (rows 20-27):
- `gobiz`, `k3mart`, `internal`, `grabfood`, `shopee`, `tiktok`, `consignment`, `bigseller`

PascalCase **display** keys (rows 29-36 — comment "Display-channel aggregates used by AnalyticsDashboard"):
- `Shopee`, `Tokopedia`, `GoFood`, `K3Mart`, `Direct`, `Consignment`, `TikTok`, `Other`

**D-02 rename diffs the planner must spec precisely:**

1. **`"Tokopedia"` → `"TikTok"`:** Line 30 currently maps `"Tokopedia"` to RED hex `#ef4444`. Line 35 already has `"TikTok"` mapped to VIOLET `#8b5cf6`. **Resolve the duplicate:** drop line 30 entirely (Platform `"TikTok"` is canonical, color `#8b5cf6` is its established color from the source-key `"tiktok"` row 25). PM-visible: TikTok-Shop traffic which previously rendered RED will now render VIOLET — matches the existing `tiktok` source-key palette. Document in CHANGELOG under "Changed" per CONTEXT.md specifics.

2. **`"K3 Mart"` → `"K3Mart"`:** No diff needed — line 32 already uses `"K3Mart"` (no space). The space exists ONLY in `sourceToPlatform("k3mart") → "K3 Mart"` (the doomed mapper, `convex/lib/externalSource.ts:32`). Once `sourceToPlatform` is deleted, the space disappears organically.

3. **`"Other"` removal (D-04):** Line 36 currently has an `"Other"` palette. Per D-04 there is no `"Other"` Platform literal. Plan to delete line 36 — but verify no remaining caller passes `"Other"` after the channelTaxonomy file is deleted. If `getPlatformPalette("Other")` is called by any chart legend, it will fall through to `FALLBACK` (gray) — acceptable.

4. **`buildChartColorMap(sourceToPlatform: ...)` (line 58):** This is a function-typed parameter, NOT an import of the deleted module. Keep. Callers (grep `buildChartColorMap`) must pass the equivalent: `(s) => platformDisplay(resolvePlatform({ source: s }))`.

---

## Metadata

**Analog search scope:** `convex/lib/`, `convex/reports/`, `convex/externalData/`, `convex/staffAttendance/`, `convex/gofoodDepot/`, `convex/integrations/`, `convex/**/__tests__/`, `src/lib/`, `src/components/`, `src/contexts/`, `src/pages/`, `eslint.config.js`
**Files scanned:** ~40
**Pattern extraction date:** 2026-05-10
**Author:** gsd-pattern-mapper
