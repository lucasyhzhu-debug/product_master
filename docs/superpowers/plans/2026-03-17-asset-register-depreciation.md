# Asset Register & Depreciation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a PSAK-compliant fixed asset register with straight-line depreciation, "Catch Up to Now" batch JE posting, disposal with gain/loss, and Income Statement depreciation reminders.

**Architecture:** New `fixedAssets` table with denormalized depreciation tracking. Stateless engine — no batch tracking table. Extends existing journal engine with `depreciation`/`asset_disposal` source types. Category constants drive defaults, numbering, and GL account mapping.

**Tech Stack:** Convex (backend), React 19, TypeScript, shadcn/ui, Tailwind CSS, Sonner (toasts)

**Spec:** `docs/superpowers/specs/2026-03-17-asset-register-depreciation-design.md`

---

## Git Workflow
**Branch:** `feature/60-asset-register-depreciation`
**Checkpoints:** After each wave

## Implementation Waves
### Wave 1: Backend Foundation [SEQUENTIAL]
| Agent | Task | Files |
|-------|------|-------|
| convex-backend | Schema + categories + date helpers + asset helpers + journal engine + GL seeds | `convex/schema.ts`, `convex/fixedAssets/categories.ts`, `convex/fixedAssets/dateHelpers.ts`, `convex/fixedAssets/helpers.ts`, `convex/lib/journalEngine.ts`, `convex/accounts/mutations.ts` |

### Wave 2: Backend CRUD + Engine [SEQUENTIAL, after Wave 1]
| Agent | Task | Files |
|-------|------|-------|
| convex-backend | Queries + mutations (CRUD, depreciation, void, disposal) | `convex/fixedAssets/queries.ts`, `convex/fixedAssets/mutations.ts` |

### Wave 3: Frontend Foundation [PARALLEL, after Wave 2]
| Agent | Task | Files |
|-------|------|-------|
| react-ui-builder | Hooks, permissions, routes, AssetRegister page | `src/hooks/convex/useFixedAssets.ts`, `src/lib/types.ts`, `src/components/layout/Header.tsx`, `src/App.tsx`, `src/pages/AssetRegister.tsx`, `src/components/assets/` |

### Wave 4: Frontend Detail + Income Statement [PARALLEL, after Wave 3]
| Agent | Task | Files |
|-------|------|-------|
| react-ui-builder | AssetDetail, Form, Disposal, Income Statement reminder | `src/pages/AssetDetail.tsx`, `src/components/assets/AssetForm.tsx`, `src/components/assets/DisposalDialog.tsx`, `src/pages/FinancialStatement.tsx` |

### Wave 5: Verification [SEQUENTIAL]
| Agent | Task |
|-------|------|
| code-auditor | Type check + pattern compliance |
| Bash | `npm run build` |

---

## Chunk 1: Backend Foundation (Schema, Categories, Helpers, Journal Engine Extension)

### Task 1: Schema — Add `fixedAssets` table and extend `journalEntries.sourceType`

**Files:**
- Modify: `convex/schema.ts`

- [ ] **Step 1: Add `fixedAssets` table to schema**

In `convex/schema.ts`, add the `fixedAssets` table definition after the last `defineTable`. Follow the exact field definitions from spec Section 2.1:

```typescript
// Fixed asset register — PSAK-compliant with straight-line depreciation
fixedAssets: defineTable({
  assetNumber: v.string(),
  name: v.string(),
  category: v.string(),
  acquisitionDate: v.number(),
  acquisitionCost: v.number(),
  usefulLifeMonths: v.number(),
  salvageValue: v.number(),
  monthlyDepreciation: v.number(),
  accumulatedDepreciation: v.number(),
  lastDepreciationMonth: v.optional(v.string()),
  status: v.union(
    v.literal("active"),
    v.literal("fully_depreciated"),
    v.literal("disposed")
  ),
  location: v.optional(v.string()),
  characteristics: v.array(v.object({
    key: v.string(),
    value: v.string(),
  })),
  attachments: v.array(v.object({
    storageId: v.id("_storage"),
    fileName: v.string(),
    fileType: v.string(),
  })),
  depreciationAccountId: v.id("accounts"),
  disposalDate: v.optional(v.number()),
  disposalType: v.optional(v.union(
    v.literal("sold"),
    v.literal("scrapped"),
    v.literal("written_off")
  )),
  saleProceeds: v.optional(v.number()),
  disposalJournalEntryId: v.optional(v.id("journalEntries")),
  createdBy: v.id("users"),
  createdAt: v.number(),
})
  .index("by_status", ["status"])
  .index("by_category", ["category"])
  .index("by_category_status", ["category", "status"])
  .index("by_asset_number", ["assetNumber"]),
```

- [ ] **Step 2: Extend `journalEntries.sourceType` union**

In the `journalEntries` table definition, add 4 new literals to the `sourceType` union, before `v.literal("manual")`:

```typescript
v.literal("depreciation"),
v.literal("depreciation_void"),
v.literal("asset_disposal"),
v.literal("asset_disposal_void"),
```

- [ ] **Step 3: Verify schema compiles**

Run: `npx tsc --noEmit --project convex/tsconfig.json`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add convex/schema.ts
git commit -m "feat(60): add fixedAssets table and extend journalEntries sourceType"
```

---

### Task 2: PSAK Category Constants

**Files:**
- Create: `convex/fixedAssets/categories.ts`

- [ ] **Step 1: Create categories constant file**

```typescript
/**
 * PSAK-aligned fixed asset categories.
 *
 * Single constant map driving: category labels, numbering prefixes,
 * useful life defaults, salvage value defaults, and GL contra-account mapping.
 */

export const ASSET_CATEGORIES = {
  land: {
    label: "Tanah",
    prefix: "LND",
    usefulLifeMonths: null as number | null,
    salvagePercent: 0,
    depreciable: false,
    contraAccountCode: null as string | null,
  },
  buildings: {
    label: "Bangunan",
    prefix: "BLD",
    usefulLifeMonths: 240,
    salvagePercent: 5,
    depreciable: true,
    contraAccountCode: "1610",
  },
  vehicles: {
    label: "Kendaraan",
    prefix: "VEH",
    usefulLifeMonths: 96,
    salvagePercent: 10,
    depreciable: true,
    contraAccountCode: "1620",
  },
  office_equipment: {
    label: "Peralatan Kantor",
    prefix: "OFF",
    usefulLifeMonths: 48,
    salvagePercent: 0,
    depreciable: true,
    contraAccountCode: "1630",
  },
  kitchen_equipment: {
    label: "Mesin & Peralatan Produksi",
    prefix: "KIT",
    usefulLifeMonths: 96,
    salvagePercent: 0,
    depreciable: true,
    contraAccountCode: "1640",
  },
  furniture: {
    label: "Mebelair & Perabot",
    prefix: "FUR",
    usefulLifeMonths: 48,
    salvagePercent: 0,
    depreciable: true,
    contraAccountCode: "1650",
  },
  tools: {
    label: "Peralatan & Perkakas",
    prefix: "TLS",
    usefulLifeMonths: 48,
    salvagePercent: 0,
    depreciable: true,
    contraAccountCode: "1660",
  },
  leasehold: {
    label: "Perbaikan Sewa",
    prefix: "LHI",
    usefulLifeMonths: 48,
    salvagePercent: 0,
    depreciable: true,
    contraAccountCode: "1670",
  },
} as const;

export type AssetCategory = keyof typeof ASSET_CATEGORIES;

/** Get category config or throw if invalid */
export function getCategoryConfig(category: string) {
  const config = ASSET_CATEGORIES[category as AssetCategory];
  if (!config) {
    throw new Error(`Invalid asset category: ${category}. Valid: ${Object.keys(ASSET_CATEGORIES).join(", ")}`);
  }
  return config;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit --project convex/tsconfig.json`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add convex/fixedAssets/categories.ts
git commit -m "feat(60): add PSAK asset category constants"
```

---

### Task 3: Date/Month Helpers

**Files:**
- Create: `convex/fixedAssets/dateHelpers.ts`
- Create: `convex/fixedAssets/__tests__/dateHelpers.test.ts`

- [ ] **Step 1: Write failing tests for date helpers**

```typescript
import { describe, it, expect } from "vitest";
import {
  getCurrentWibMonth,
  toYearMonth,
  nextMonth,
  prevMonth,
  getMonthRange,
  lastDayOfMonth,
  firstDayOfMonth,
  formatMonth,
  getWibYearMonthStr,
} from "../dateHelpers";

describe("toYearMonth", () => {
  it("converts timestamp to YYYY-MM string", () => {
    // 2026-03-15 10:00:00 WIB = 2026-03-15 03:00:00 UTC
    const ts = Date.UTC(2026, 2, 15, 3, 0, 0);
    expect(toYearMonth(ts)).toBe("2026-03");
  });

  it("handles WIB day boundary (UTC evening = next WIB day)", () => {
    // 2026-03-31 20:00:00 UTC = 2026-04-01 03:00:00 WIB
    const ts = Date.UTC(2026, 2, 31, 20, 0, 0);
    expect(toYearMonth(ts)).toBe("2026-04");
  });
});

describe("nextMonth / prevMonth", () => {
  it("increments month", () => {
    expect(nextMonth("2026-03")).toBe("2026-04");
  });
  it("wraps year on December", () => {
    expect(nextMonth("2026-12")).toBe("2027-01");
  });
  it("decrements month", () => {
    expect(prevMonth("2026-03")).toBe("2026-02");
  });
  it("wraps year on January", () => {
    expect(prevMonth("2026-01")).toBe("2025-12");
  });
});

describe("getMonthRange", () => {
  it("returns inclusive range", () => {
    expect(getMonthRange("2026-01", "2026-03")).toEqual([
      "2026-01", "2026-02", "2026-03",
    ]);
  });
  it("returns single month when start equals end", () => {
    expect(getMonthRange("2026-03", "2026-03")).toEqual(["2026-03"]);
  });
  it("returns empty when start > end", () => {
    expect(getMonthRange("2026-04", "2026-03")).toEqual([]);
  });
  it("spans year boundary", () => {
    expect(getMonthRange("2025-11", "2026-02")).toEqual([
      "2025-11", "2025-12", "2026-01", "2026-02",
    ]);
  });
});

describe("firstDayOfMonth / lastDayOfMonth", () => {
  it("firstDayOfMonth returns WIB midnight as UTC", () => {
    const ts = firstDayOfMonth("2026-03");
    const d = new Date(ts);
    // WIB midnight = UTC 17:00 previous day
    expect(d.getUTCHours()).toBe(17);
    expect(d.getUTCDate()).toBe(28); // Feb 28 UTC for Mar 1 WIB
  });

  it("lastDayOfMonth returns WIB end-of-day as UTC", () => {
    const ts = lastDayOfMonth("2026-03");
    const d = new Date(ts);
    // WIB 23:59:59 Mar 31 = UTC 16:59:59 Mar 31
    expect(d.getUTCDate()).toBe(31);
    expect(d.getUTCHours()).toBe(16);
    expect(d.getUTCMinutes()).toBe(59);
    expect(d.getUTCSeconds()).toBe(59);
  });
});

describe("formatMonth", () => {
  it("formats YYYY-MM to human-readable", () => {
    expect(formatMonth("2026-03")).toBe("Mar 2026");
    expect(formatMonth("2026-12")).toBe("Dec 2026");
  });
});

describe("getWibYearMonthStr", () => {
  it("returns YYMM for counter use", () => {
    // 2026-03-15 10:00:00 WIB = 2026-03-15 03:00:00 UTC
    const ts = Date.UTC(2026, 2, 15, 3, 0, 0);
    expect(getWibYearMonthStr(ts)).toBe("2603");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run convex/fixedAssets/__tests__/dateHelpers.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement date helpers**

```typescript
/**
 * Date/month helpers for fixed asset depreciation.
 *
 * All functions use WIB (UTC+7) timezone, consistent with periodRange.ts.
 * Pure functions — no Convex context required.
 */

import { getWibComponents, wibMidnightToUtc } from "../lib/periodRange";

const WIB_OFFSET_HOURS = 7;

/** Get current WIB month as "YYYY-MM" */
export function getCurrentWibMonth(): string {
  return toYearMonth(Date.now());
}

/** Convert UTC timestamp to "YYYY-MM" in WIB timezone */
export function toYearMonth(utcMs: number): string {
  const { year, month } = getWibComponents(utcMs);
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

/** Get YYMM string for counter table (e.g., "2603" for March 2026) */
export function getWibYearMonthStr(utcMs: number): string {
  const { year, month } = getWibComponents(utcMs);
  return `${String(year % 100).padStart(2, "0")}${String(month + 1).padStart(2, "0")}`;
}

/** Parse "YYYY-MM" into year and 0-indexed month */
function parseYearMonth(ym: string): { year: number; month: number } {
  const [y, m] = ym.split("-").map(Number);
  return { year: y, month: m - 1 }; // 0-indexed month
}

/** Next month: "2026-03" → "2026-04", handles year wrap */
export function nextMonth(ym: string): string {
  const { year, month } = parseYearMonth(ym);
  if (month === 11) return `${year + 1}-01`;
  return `${year}-${String(month + 2).padStart(2, "0")}`;
}

/** Previous month: "2026-03" → "2026-02", handles year wrap */
export function prevMonth(ym: string): string {
  const { year, month } = parseYearMonth(ym);
  if (month === 0) return `${year - 1}-12`;
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** Inclusive month range: getMonthRange("2026-01", "2026-03") → ["2026-01", "2026-02", "2026-03"] */
export function getMonthRange(start: string, end: string): string[] {
  if (start > end) return [];
  const result: string[] = [];
  let current = start;
  while (current <= end) {
    result.push(current);
    current = nextMonth(current);
  }
  return result;
}

/** First day of month as WIB midnight → UTC timestamp */
export function firstDayOfMonth(ym: string): number {
  const { year, month } = parseYearMonth(ym);
  return wibMidnightToUtc(year, month, 1);
}

/** Last day of month as WIB 23:59:59 → UTC timestamp */
export function lastDayOfMonth(ym: string): number {
  const { year, month } = parseYearMonth(ym);
  // Day 0 of next month = last day of this month
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  // WIB 23:59:59 = UTC time minus 7 hours → day 23:59:59 WIB = day 16:59:59 UTC
  return Date.UTC(year, month, lastDay, 23 - WIB_OFFSET_HOURS, 59, 59, 0);
}

/** Format "YYYY-MM" → "Mar 2026" */
export function formatMonth(ym: string): string {
  const { year, month } = parseYearMonth(ym);
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${monthNames[month]} ${year}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run convex/fixedAssets/__tests__/dateHelpers.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add convex/fixedAssets/dateHelpers.ts convex/fixedAssets/__tests__/dateHelpers.test.ts
git commit -m "feat(60): add date/month helpers for depreciation with tests"
```

---

### Task 4: Asset Helpers (Numbering + Account Lookup)

**Files:**
- Create: `convex/fixedAssets/helpers.ts`
- Create: `convex/fixedAssets/__tests__/helpers.test.ts`

- [ ] **Step 1: Write failing test for `formatAssetNumber`**

```typescript
import { describe, it, expect } from "vitest";
import { formatAssetNumber } from "../helpers";

describe("formatAssetNumber", () => {
  it("formats FA-PREFIX-YYMM-NNN", () => {
    expect(formatAssetNumber("KIT", "2603", 1)).toBe("FA-KIT-2603-001");
    expect(formatAssetNumber("VEH", "2501", 42)).toBe("FA-VEH-2501-042");
    expect(formatAssetNumber("BLD", "2603", 1000)).toBe("FA-BLD-2603-1000");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run convex/fixedAssets/__tests__/helpers.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement helpers**

```typescript
/**
 * Fixed asset helpers — numbering and account lookup.
 */

import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { AssetCategory } from "./categories";
import { ASSET_CATEGORIES } from "./categories";
import { getWibYearMonthStr } from "./dateHelpers";

/**
 * Format asset number: FA-{PREFIX}-{YYMM}-{NNN}
 * Pure function, exported for testing.
 */
export function formatAssetNumber(
  prefix: string,
  dateStr: string,
  sequence: number,
): string {
  return `FA-${prefix}-${dateStr}-${String(sequence).padStart(3, "0")}`;
}

/**
 * Generate next asset number for a category.
 *
 * Uses YYMM format (not MMDD like getNextNumber).
 * Counter key: prefix="FA-{categoryPrefix}", date=YYMM.
 */
export async function getNextAssetNumber(
  ctx: MutationCtx,
  category: AssetCategory,
  now?: number,
): Promise<string> {
  const config = ASSET_CATEGORIES[category];
  const prefix = `FA-${config.prefix}`;
  const dateStr = getWibYearMonthStr(now ?? Date.now());

  const counter = await ctx.db
    .query("counters")
    .withIndex("by_prefix_date", (q) => q.eq("prefix", prefix).eq("date", dateStr))
    .unique();

  let sequence: number;
  if (counter) {
    sequence = counter.lastSequence + 1;
    await ctx.db.patch(counter._id, { lastSequence: sequence });
  } else {
    sequence = 1;
    await ctx.db.insert("counters", { prefix, date: dateStr, lastSequence: sequence });
  }

  return formatAssetNumber(config.prefix, dateStr, sequence);
}

/**
 * Look up a GL account by code. Throws if not found.
 */
export async function getAccountByCode(ctx: QueryCtx | MutationCtx, code: string) {
  const account = await ctx.db
    .query("accounts")
    .withIndex("by_code", (q) => q.eq("code", code))
    .first();
  if (!account) {
    throw new Error(`GL account ${code} not found. Run accounts:seedDefaults first.`);
  }
  return account;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run convex/fixedAssets/__tests__/helpers.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add convex/fixedAssets/helpers.ts convex/fixedAssets/__tests__/helpers.test.ts
git commit -m "feat(60): add asset numbering and account lookup helpers"
```

---

### Task 5: Extend Journal Engine Types + Void Pairs

**Files:**
- Modify: `convex/lib/journalEngine.ts`

- [ ] **Step 1: Add new source types to `JournalSourceType`**

Add `"depreciation"`, `"depreciation_void"`, `"asset_disposal"`, `"asset_disposal_void"` to the `JournalSourceType` union.

- [ ] **Step 2: Add to `VoidSourceType` and `ReversibleSourceType`**

Add `"depreciation_void"` and `"asset_disposal_void"` to `VoidSourceType`.
Add `"depreciation"` and `"asset_disposal"` to `ReversibleSourceType`.

- [ ] **Step 3: Add to `NON_REVERSIBLE_TYPES`**

Add `"depreciation_void"` and `"asset_disposal_void"` to the array.

- [ ] **Step 4: Add to `VALID_VOID_PAIRS`**

```typescript
depreciation: "depreciation_void",
asset_disposal: "asset_disposal_void",
```

- [ ] **Step 5: Run existing journal engine tests**

Run: `npx vitest run convex/lib/__tests__/journalEngine.test.ts`
Expected: All existing tests PASS

- [ ] **Step 6: Commit**

```bash
git add convex/lib/journalEngine.ts
git commit -m "feat(60): extend journal engine with depreciation and asset disposal source types"
```

---

### Task 6: Extend GL Account Seeds

**Files:**
- Modify: `convex/accounts/mutations.ts`

- [ ] **Step 1: Deactivate account 1600 in DEFAULT_ACCOUNTS**

Find the `1600` entry and set `isActive: false`:
```typescript
{ code: "1600", name: "Accumulated Depreciation", type: "asset" as const, category: "Assets", isSystem: true, isActive: false },
```

- [ ] **Step 2: Add new GL accounts to DEFAULT_ACCOUNTS**

After the 1600 entry, add:
```typescript
{ code: "1610", name: "Accum Depr — Buildings", type: "asset" as const, category: "Assets", isSystem: true, isActive: true },
{ code: "1620", name: "Accum Depr — Vehicles", type: "asset" as const, category: "Assets", isSystem: true, isActive: true },
{ code: "1630", name: "Accum Depr — Office Equipment", type: "asset" as const, category: "Assets", isSystem: true, isActive: true },
{ code: "1640", name: "Accum Depr — Kitchen Equipment", type: "asset" as const, category: "Assets", isSystem: true, isActive: true },
{ code: "1650", name: "Accum Depr — Furniture & Fixtures", type: "asset" as const, category: "Assets", isSystem: true, isActive: true },
{ code: "1660", name: "Accum Depr — Tools & Instruments", type: "asset" as const, category: "Assets", isSystem: true, isActive: true },
{ code: "1670", name: "Accum Depr — Leasehold Improvements", type: "asset" as const, category: "Assets", isSystem: true, isActive: true },
```

In the OpEx section (6xxx), add:
```typescript
{ code: "6150", name: "Depreciation Expense", type: "opex" as const, category: "Operating Expenses", isSystem: true, isActive: true },
```

In the Other section (7xxx), add:
```typescript
{ code: "7300", name: "Gain on Asset Disposal", type: "other" as const, category: "Other Income/Expense", isSystem: true, isActive: true },
{ code: "7400", name: "Loss on Asset Disposal", type: "other" as const, category: "Other Income/Expense", isSystem: true, isActive: true },
```

- [ ] **Step 3: Run seed tests**

Run: `npx vitest run convex/accounts/__tests__/seed.test.ts`
Expected: Update test assertions to account for new count (39 → 49 accounts). All PASS.

- [ ] **Step 4: Commit**

```bash
git add convex/accounts/mutations.ts convex/accounts/__tests__/seed.test.ts
git commit -m "feat(60): add depreciation GL accounts to seed defaults"
```

---

## Chunk 2: Backend CRUD + Depreciation Engine

### Task 7: Asset CRUD Queries

**Files:**
- Create: `convex/fixedAssets/queries.ts`

- [ ] **Step 1: Implement queries**

```typescript
/**
 * Fixed Asset Queries — list, detail, depreciation preview/status/history.
 */

import { v } from "convex/values";
import { query } from "../_generated/server";
import { protectedQuery } from "../lib/functions";
import { ASSET_CATEGORIES, type AssetCategory } from "./categories";
import { getCurrentWibMonth, toYearMonth, nextMonth, getMonthRange } from "./dateHelpers";

/** List all fixed assets with optional filters */
export const list = protectedQuery({
  roles: ["manager", "admin"],
  args: {
    category: v.optional(v.string()),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let assets;

    if (args.category && args.status) {
      assets = await ctx.db
        .query("fixedAssets")
        .withIndex("by_category_status", (q) =>
          q.eq("category", args.category!).eq("status", args.status as "active" | "fully_depreciated" | "disposed")
        )
        .collect();
    } else if (args.status) {
      assets = await ctx.db
        .query("fixedAssets")
        .withIndex("by_status", (q) => q.eq("status", args.status as "active" | "fully_depreciated" | "disposed"))
        .collect();
    } else if (args.category) {
      assets = await ctx.db
        .query("fixedAssets")
        .withIndex("by_category", (q) => q.eq("category", args.category!))
        .collect();
    } else {
      assets = await ctx.db.query("fixedAssets").collect();
    }

    return assets.sort((a, b) => a.assetNumber.localeCompare(b.assetNumber));
  },
});

/** Get a single asset by ID */
export const getById = protectedQuery({
  roles: ["manager", "admin"],
  args: { id: v.id("fixedAssets") },
  handler: async (ctx, args) => {
    const asset = await ctx.db.get(args.id);
    if (!asset) throw new Error("Asset not found");

    // Resolve attachment URLs
    const attachmentsWithUrls = await Promise.all(
      asset.attachments.map(async (att) => ({
        ...att,
        url: await ctx.storage.getUrl(att.storageId),
      }))
    );

    return { ...asset, attachments: attachmentsWithUrls };
  },
});

/** Depreciation preview — what would "Catch Up to Now" post? */
export const getDepreciationPreview = protectedQuery({
  roles: ["admin"],
  args: {},
  handler: async (ctx) => {
    const currentMonth = getCurrentWibMonth();
    const activeAssets = await ctx.db
      .query("fixedAssets")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    const preview = [];
    for (const asset of activeAssets) {
      const config = ASSET_CATEGORIES[asset.category as AssetCategory];
      if (!config || !config.depreciable) continue;

      const startMonth = toYearMonth(asset.acquisitionDate);
      const lastDone = asset.lastDepreciationMonth;
      const missingMonths = getMonthRange(
        lastDone ? nextMonth(lastDone) : startMonth,
        currentMonth
      );

      if (missingMonths.length === 0) continue;

      preview.push({
        assetId: asset._id,
        assetNumber: asset.assetNumber,
        name: asset.name,
        category: asset.category,
        missingMonths,
        amountPerMonth: asset.monthlyDepreciation,
        totalAmount: asset.monthlyDepreciation * missingMonths.length,
      });
    }

    return {
      currentMonth,
      assets: preview,
      totalEntries: preview.reduce((sum, a) => sum + a.missingMonths.length, 0),
      totalAmount: preview.reduce((sum, a) => sum + a.totalAmount, 0),
    };
  },
});

/** Check if depreciation is unposted (for Income Statement reminder) */
export const getDepreciationStatus = protectedQuery({
  roles: ["manager", "admin"],
  args: {},
  handler: async (ctx) => {
    const currentMonth = getCurrentWibMonth();
    const activeAssets = await ctx.db
      .query("fixedAssets")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    const unpostedCount = activeAssets.filter((a) => {
      const config = ASSET_CATEGORIES[a.category as AssetCategory];
      if (!config || !config.depreciable) return false;
      return !a.lastDepreciationMonth || a.lastDepreciationMonth < currentMonth;
    }).length;

    return { hasUnpostedMonths: unpostedCount > 0, currentMonth, unpostedCount };
  },
});

/** Get depreciation JE history for a single asset */
export const getDepreciationHistory = protectedQuery({
  roles: ["manager", "admin"],
  args: { assetId: v.id("fixedAssets") },
  handler: async (ctx, args) => {
    const asset = await ctx.db.get(args.assetId);
    if (!asset) throw new Error("Asset not found");

    // Find all JEs where sourceId = this asset (depreciation + disposal)
    const allEntries = await ctx.db
      .query("journalEntries")
      .withIndex("by_source", (q) => q.eq("sourceType", "depreciation").eq("sourceId", args.assetId))
      .collect();

    // Only non-reversed entries
    const activeEntries = allEntries.filter((e) => !e.isReversed);

    // Build history with running totals
    const sorted = activeEntries.sort((a, b) => a.date - b.date);
    let accumulated = 0;
    const history = sorted.map((entry) => {
      accumulated += asset.monthlyDepreciation;
      return {
        entryId: entry._id,
        entryNumber: entry.entryNumber,
        date: entry.date,
        amount: asset.monthlyDepreciation,
        accumulated,
        nbv: asset.acquisitionCost - accumulated,
      };
    });

    return history;
  },
});
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit --project convex/tsconfig.json`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add convex/fixedAssets/queries.ts
git commit -m "feat(60): add fixed asset queries (list, detail, preview, status, history)"
```

---

### Task 8: Asset CRUD Mutations

**Files:**
- Create: `convex/fixedAssets/mutations.ts`

- [ ] **Step 1: Implement mutations**

```typescript
/**
 * Fixed Asset Mutations — CRUD, depreciation run, void, disposal.
 */

import { v } from "convex/values";
import { protectedMutation } from "../lib/functions";
import { ASSET_CATEGORIES, getCategoryConfig, type AssetCategory } from "./categories";
import {
  getCurrentWibMonth,
  toYearMonth,
  nextMonth,
  prevMonth,
  getMonthRange,
  lastDayOfMonth,
  firstDayOfMonth,
  formatMonth,
} from "./dateHelpers";
import { getNextAssetNumber, getAccountByCode } from "./helpers";
import {
  createJournalEntryWithLines,
  createReversalEntry,
  buildDebitLine,
  buildCreditLine,
} from "../lib/journalEngine";
import type { Id } from "../_generated/dataModel";

/** Create a new fixed asset */
export const create = protectedMutation({
  roles: ["manager", "admin"],
  args: {
    name: v.string(),
    category: v.string(),
    acquisitionDate: v.number(),
    acquisitionCost: v.number(),
    usefulLifeMonths: v.number(),
    salvageValue: v.number(),
    location: v.optional(v.string()),
    characteristics: v.array(v.object({ key: v.string(), value: v.string() })),
  },
  handler: async (ctx, args) => {
    const config = getCategoryConfig(args.category);

    if (!args.name.trim()) throw new Error("Asset name is required");
    if (args.acquisitionCost <= 0) throw new Error("Acquisition cost must be positive");
    if (config.depreciable && args.usefulLifeMonths <= 0) {
      throw new Error("Useful life must be positive for depreciable assets");
    }
    if (args.salvageValue < 0) throw new Error("Salvage value cannot be negative");
    if (args.salvageValue >= args.acquisitionCost) {
      throw new Error("Salvage value must be less than acquisition cost");
    }

    // Resolve contra-asset account
    let depreciationAccountId: Id<"accounts">;
    if (config.depreciable && config.contraAccountCode) {
      const account = await getAccountByCode(ctx, config.contraAccountCode);
      depreciationAccountId = account._id;
    } else {
      // Non-depreciable (land) — use 1500 Fixed Assets as placeholder
      const account = await getAccountByCode(ctx, "1500");
      depreciationAccountId = account._id;
    }

    const monthlyDepreciation = config.depreciable
      ? Math.round((args.acquisitionCost - args.salvageValue) / args.usefulLifeMonths)
      : 0;

    const assetNumber = await getNextAssetNumber(ctx, args.category as AssetCategory);

    return await ctx.db.insert("fixedAssets", {
      assetNumber,
      name: args.name.trim(),
      category: args.category,
      acquisitionDate: args.acquisitionDate,
      acquisitionCost: args.acquisitionCost,
      usefulLifeMonths: args.usefulLifeMonths,
      salvageValue: args.salvageValue,
      monthlyDepreciation,
      accumulatedDepreciation: 0,
      status: "active",
      location: args.location,
      characteristics: args.characteristics,
      attachments: [],
      depreciationAccountId,
      createdBy: ctx.user._id,
      createdAt: Date.now(),
    });
  },
});

/** Update asset details (guards immutable fields after depreciation starts) */
export const update = protectedMutation({
  roles: ["manager", "admin"],
  args: {
    id: v.id("fixedAssets"),
    name: v.optional(v.string()),
    location: v.optional(v.string()),
    characteristics: v.optional(v.array(v.object({ key: v.string(), value: v.string() }))),
    // Only editable before depreciation starts:
    acquisitionCost: v.optional(v.number()),
    usefulLifeMonths: v.optional(v.number()),
    salvageValue: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const asset = await ctx.db.get(args.id);
    if (!asset) throw new Error("Asset not found");
    if (asset.status === "disposed") throw new Error("Cannot edit a disposed asset");

    const depreciationStarted = !!asset.lastDepreciationMonth;

    // Guard immutable fields
    if (depreciationStarted) {
      if (args.acquisitionCost !== undefined) throw new Error("Cannot change cost after depreciation started");
      if (args.usefulLifeMonths !== undefined) throw new Error("Cannot change useful life after depreciation started");
      if (args.salvageValue !== undefined) throw new Error("Cannot change salvage value after depreciation started");
    }

    const patch: Record<string, unknown> = {};
    if (args.name !== undefined) {
      if (!args.name.trim()) throw new Error("Asset name cannot be empty");
      patch.name = args.name.trim();
    }
    if (args.location !== undefined) patch.location = args.location;
    if (args.characteristics !== undefined) patch.characteristics = args.characteristics;

    // Recalculate if financial fields changed
    if (!depreciationStarted) {
      const cost = args.acquisitionCost ?? asset.acquisitionCost;
      const salvage = args.salvageValue ?? asset.salvageValue;
      const life = args.usefulLifeMonths ?? asset.usefulLifeMonths;

      if (args.acquisitionCost !== undefined) patch.acquisitionCost = cost;
      if (args.salvageValue !== undefined) patch.salvageValue = salvage;
      if (args.usefulLifeMonths !== undefined) patch.usefulLifeMonths = life;

      const config = getCategoryConfig(asset.category);
      if (config.depreciable && (args.acquisitionCost !== undefined || args.salvageValue !== undefined || args.usefulLifeMonths !== undefined)) {
        patch.monthlyDepreciation = Math.round((cost - salvage) / life);
      }
    }

    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(args.id, patch);
    }
  },
});

/** Add attachment to asset */
export const addAttachment = protectedMutation({
  roles: ["manager", "admin"],
  args: {
    assetId: v.id("fixedAssets"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    fileType: v.string(),
  },
  handler: async (ctx, args) => {
    const asset = await ctx.db.get(args.assetId);
    if (!asset) throw new Error("Asset not found");

    await ctx.db.patch(args.assetId, {
      attachments: [...asset.attachments, {
        storageId: args.storageId,
        fileName: args.fileName,
        fileType: args.fileType,
      }],
    });
  },
});

/** Remove attachment from asset */
export const removeAttachment = protectedMutation({
  roles: ["manager", "admin"],
  args: {
    assetId: v.id("fixedAssets"),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const asset = await ctx.db.get(args.assetId);
    if (!asset) throw new Error("Asset not found");

    await ctx.db.patch(args.assetId, {
      attachments: asset.attachments.filter((a) => a.storageId !== args.storageId),
    });

    // Delete file from storage
    await ctx.storage.delete(args.storageId);
  },
});

/** Generate upload URL for asset attachments */
export const generateUploadUrl = protectedMutation({
  roles: ["manager", "admin"],
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

/** Run depreciation — "Catch Up to Now" */
export const runDepreciation = protectedMutation({
  roles: ["admin"],
  args: {},
  handler: async (ctx) => {
    const userId = ctx.user._id;
    const currentMonth = getCurrentWibMonth();
    const expenseAccount = await getAccountByCode(ctx, "6150");
    const activeAssets = await ctx.db
      .query("fixedAssets")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    let assetsProcessed = 0;
    let monthsPosted = 0;
    let totalAmount = 0;

    for (const asset of activeAssets) {
      const config = ASSET_CATEGORIES[asset.category as AssetCategory];
      if (!config || !config.depreciable) continue;

      const startMonth = toYearMonth(asset.acquisitionDate);
      const lastDone = asset.lastDepreciationMonth;
      const missingMonths = getMonthRange(
        lastDone ? nextMonth(lastDone) : startMonth,
        currentMonth,
      );

      if (missingMonths.length === 0) continue;

      for (const month of missingMonths) {
        const entryDate = lastDayOfMonth(month);

        await createJournalEntryWithLines(ctx, {
          date: entryDate,
          description: `Depreciation ${formatMonth(month)}: ${asset.name} (${asset.assetNumber})`,
          sourceType: "depreciation",
          sourceId: asset._id,
          createdBy: userId,
          lines: [
            buildDebitLine(expenseAccount._id, asset.monthlyDepreciation),
            buildCreditLine(asset.depreciationAccountId, asset.monthlyDepreciation),
          ],
        });

        monthsPosted++;
        totalAmount += asset.monthlyDepreciation;
      }

      const newAccumulated = asset.accumulatedDepreciation + (asset.monthlyDepreciation * missingMonths.length);
      const depreciableAmount = asset.acquisitionCost - asset.salvageValue;
      const isFullyDepreciated = newAccumulated >= depreciableAmount;

      await ctx.db.patch(asset._id, {
        accumulatedDepreciation: isFullyDepreciated ? depreciableAmount : newAccumulated,
        lastDepreciationMonth: missingMonths[missingMonths.length - 1],
        ...(isFullyDepreciated ? { status: "fully_depreciated" as const } : {}),
      });

      assetsProcessed++;
    }

    return { assetsProcessed, monthsPosted, totalAmount };
  },
});

/** Void all depreciation JEs for a target month */
export const voidMonthDepreciation = protectedMutation({
  roles: ["admin"],
  args: { targetMonth: v.string() },
  handler: async (ctx, args) => {
    const userId = ctx.user._id;
    const monthStart = firstDayOfMonth(args.targetMonth);
    const monthEnd = lastDayOfMonth(args.targetMonth);

    const entries = await ctx.db
      .query("journalEntries")
      .withIndex("by_date", (q) => q.gte("date", monthStart).lte("date", monthEnd))
      .collect();

    const depEntries = entries.filter(
      (e) => e.sourceType === "depreciation" && !e.isReversed,
    );

    for (const entry of depEntries) {
      await createReversalEntry(ctx, entry._id, "depreciation_void", userId);

      if (entry.sourceId) {
        const asset = await ctx.db.get(entry.sourceId as Id<"fixedAssets">);
        if (asset) {
          const previousMonth = prevMonth(args.targetMonth);
          const startMonth = toYearMonth(asset.acquisitionDate);
          await ctx.db.patch(asset._id, {
            accumulatedDepreciation: Math.max(0, asset.accumulatedDepreciation - asset.monthlyDepreciation),
            lastDepreciationMonth: previousMonth < startMonth ? undefined : previousMonth,
            ...(asset.status === "fully_depreciated" ? { status: "active" as const } : {}),
          });
        }
      }
    }

    return { reversedCount: depEntries.length, month: args.targetMonth };
  },
});

/** Dispose an asset with gain/loss JE */
export const disposeAsset = protectedMutation({
  roles: ["admin"],
  args: {
    assetId: v.id("fixedAssets"),
    disposalType: v.union(v.literal("sold"), v.literal("scrapped"), v.literal("written_off")),
    disposalDate: v.number(),
    saleProceeds: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = ctx.user._id;
    const asset = await ctx.db.get(args.assetId);
    if (!asset) throw new Error("Asset not found");
    if (asset.status === "disposed") throw new Error("Asset already disposed");

    const proceeds = args.saleProceeds ?? 0;
    const nbv = asset.acquisitionCost - asset.accumulatedDepreciation;
    const gainLoss = proceeds - nbv;

    const fixedAssetAccount = await getAccountByCode(ctx, "1500");
    const cashAccount = await getAccountByCode(ctx, "1100");
    const gainAccount = await getAccountByCode(ctx, "7300");
    const lossAccount = await getAccountByCode(ctx, "7400");

    const lines = [];

    if (asset.accumulatedDepreciation > 0) {
      lines.push(buildDebitLine(asset.depreciationAccountId, asset.accumulatedDepreciation));
    }
    if (proceeds > 0) {
      lines.push(buildDebitLine(cashAccount._id, proceeds));
    }
    lines.push(buildCreditLine(fixedAssetAccount._id, asset.acquisitionCost));

    if (gainLoss > 0) {
      lines.push(buildCreditLine(gainAccount._id, gainLoss));
    } else if (gainLoss < 0) {
      lines.push(buildDebitLine(lossAccount._id, Math.abs(gainLoss)));
    }

    const jeId = await createJournalEntryWithLines(ctx, {
      date: args.disposalDate,
      description: `Asset disposal (${args.disposalType}): ${asset.name} (${asset.assetNumber})`,
      sourceType: "asset_disposal",
      sourceId: asset._id,
      createdBy: userId,
      lines,
    });

    await ctx.db.patch(args.assetId, {
      status: "disposed",
      disposalDate: args.disposalDate,
      disposalType: args.disposalType,
      saleProceeds: proceeds,
      disposalJournalEntryId: jeId,
    });

    return { assetNumber: asset.assetNumber, gainLoss, journalEntryId: jeId };
  },
});
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit --project convex/tsconfig.json`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add convex/fixedAssets/mutations.ts
git commit -m "feat(60): add fixed asset mutations (CRUD, depreciation, void, disposal)"
```

- [ ] **Step 4: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS (no regressions)

- [ ] **Step 5: Commit checkpoint**

```bash
git add convex/fixedAssets/queries.ts convex/fixedAssets/mutations.ts
git commit -m "checkpoint(60): backend foundation complete — schema, categories, helpers, queries, mutations"
```

---

## Chunk 3: Frontend — Hooks, Permissions, Routes, Asset Register Page

### Task 9: Frontend Hooks

**Files:**
- Create: `src/hooks/convex/useFixedAssets.ts`
- Modify: `src/hooks/convex/index.ts`

- [ ] **Step 1: Create hooks file**

Follow the pattern from `useBusinessSettings.ts`:

```typescript
/**
 * Fixed asset hooks for asset register.
 * Query hooks use useSessionQuery (protectedQuery endpoints).
 * Mutation hooks use createMutationHook factory.
 */
import { useSessionQuery, useSessionMutation } from "convex-helpers/react/sessions";
import { api } from "../../../convex/_generated/api";
import { createMutationHook } from "./createMutationHook";
import type { Id } from "../../../convex/_generated/dataModel";

// ============================================================================
// QUERY HOOKS
// ============================================================================

/** List all fixed assets with optional filters */
export function useFixedAssets(filters?: { category?: string; status?: string }) {
  return useSessionQuery(api.fixedAssets.queries.list, filters ?? {});
}

/** Get single asset by ID */
export function useFixedAsset(id: Id<"fixedAssets"> | undefined) {
  return useSessionQuery(api.fixedAssets.queries.getById, id ? { id } : "skip");
}

/** Get depreciation preview for "Catch Up to Now" */
export function useDepreciationPreview() {
  return useSessionQuery(api.fixedAssets.queries.getDepreciationPreview, {});
}

/** Check depreciation status (for Income Statement reminder) */
export function useDepreciationStatus() {
  return useSessionQuery(api.fixedAssets.queries.getDepreciationStatus, {});
}

/** Get depreciation history for a single asset */
export function useDepreciationHistory(assetId: Id<"fixedAssets"> | undefined) {
  return useSessionQuery(
    api.fixedAssets.queries.getDepreciationHistory,
    assetId ? { assetId } : "skip",
  );
}

// ============================================================================
// MUTATION HOOKS
// ============================================================================

export const useCreateAsset = createMutationHook(
  api.fixedAssets.mutations.create,
  { successMessage: "Asset created", errorMessage: "Failed to create asset" },
);

export const useUpdateAsset = createMutationHook(
  api.fixedAssets.mutations.update,
  { successMessage: "Asset updated", errorMessage: "Failed to update asset" },
);

export const useAddAttachment = createMutationHook(
  api.fixedAssets.mutations.addAttachment,
  { successMessage: "Attachment added", errorMessage: "Failed to add attachment" },
);

export const useRemoveAttachment = createMutationHook(
  api.fixedAssets.mutations.removeAttachment,
  { successMessage: "Attachment removed", errorMessage: "Failed to remove attachment" },
);

export const useRunDepreciation = createMutationHook(
  api.fixedAssets.mutations.runDepreciation,
  { successMessage: "Depreciation posted", errorMessage: "Failed to run depreciation" },
);

export const useVoidDepreciation = createMutationHook(
  api.fixedAssets.mutations.voidMonthDepreciation,
  { successMessage: "Depreciation voided", errorMessage: "Failed to void depreciation" },
);

export const useDisposeAsset = createMutationHook(
  api.fixedAssets.mutations.disposeAsset,
  { successMessage: "Asset disposed", errorMessage: "Failed to dispose asset" },
);

/** Raw upload URL mutation (no toast) */
export function useAssetUploadUrl() {
  return useSessionMutation(api.fixedAssets.mutations.generateUploadUrl);
}
```

- [ ] **Step 2: Add export to index.ts**

Add to `src/hooks/convex/index.ts`:
```typescript
export * from "./useFixedAssets";
```

- [ ] **Step 3: Commit**

```bash
git add src/hooks/convex/useFixedAssets.ts src/hooks/convex/index.ts
git commit -m "feat(60): add fixed asset hooks"
```

---

### Task 10: Add Permission + Nav + Routes

**Files:**
- Modify: `src/lib/types.ts` — add `canAccessAssets` permission
- Modify: `src/components/layout/Header.tsx` — add nav item
- Modify: `src/App.tsx` — add routes

- [ ] **Step 1: Add `canAccessAssets` to ROLE_PERMISSIONS**

In `src/lib/types.ts`, find the `ROLE_PERMISSIONS` object. Add `canAccessAssets: boolean` to the type. Set it to `false` for `kitchen` and `order_staff`, `true` for `manager` and `admin`.

- [ ] **Step 2: Add nav item to Header**

In `src/components/layout/Header.tsx`, import `Building2` (or similar) from `lucide-react`. Add to `financialItems` array:
```typescript
{ path: '/assets', label: 'Asset Register', icon: Building2, permission: 'canAccessAssets' },
```

- [ ] **Step 3: Add routes to App.tsx**

Add two routes:
```tsx
<Route path="assets" element={<ProtectedRoute permission="canAccessAssets"><AssetRegister /></ProtectedRoute>} />
<Route path="assets/:id" element={<ProtectedRoute permission="canAccessAssets"><AssetDetail /></ProtectedRoute>} />
```

Create placeholder pages (will be implemented in Tasks 11-12):
```tsx
// Temporary placeholders — replaced in next tasks
function AssetRegister() { return <div>Asset Register</div>; }
function AssetDetail() { return <div>Asset Detail</div>; }
```

- [ ] **Step 4: Verify build passes**

Run: `npm run build`
Expected: SUCCESS

- [ ] **Step 5: Commit**

```bash
git add src/lib/types.ts src/components/layout/Header.tsx src/App.tsx
git commit -m "feat(60): add canAccessAssets permission, nav item, and routes"
```

---

### Task 11: Asset Register Page (List with Table/Card Toggle)

**Files:**
- Create: `src/pages/AssetRegister.tsx`
- Create: `src/components/assets/AssetCard.tsx`
- Create: `src/components/assets/DepreciationPreviewDialog.tsx`

- [ ] **Step 1: Create AssetCard component**

Card view component showing: thumbnail photo (or Building2 icon placeholder), asset name + number, depreciation progress bar, NBV in IDR, status badge, location.

- [ ] **Step 2: Create DepreciationPreviewDialog**

Dialog triggered by "Catch Up to Now" button. Uses `useDepreciationPreview()` hook. Shows preview grouped by month with asset details. Confirm button calls `useRunDepreciation()`.

- [ ] **Step 3: Create AssetRegister page**

Full page with:
- PageHeader with "Asset Register" title
- "Catch Up to Now" button (admin only, opens DepreciationPreviewDialog)
- "+ Add Asset" button (links to modal or inline form)
- Table/Card toggle (local state, default table)
- Filters: category dropdown, status dropdown, search
- Table view: 9 columns per spec Section 6.2 (including Location)
- Card view: grid of AssetCard components
- Rows/cards link to `/assets/:id`

Use existing shadcn/ui components: `Button`, `Table`, `Badge`, `Select`, `Input`, `Dialog`.

- [ ] **Step 4: Replace placeholder in App.tsx**

Import the real `AssetRegister` component and replace the placeholder.

- [ ] **Step 5: Verify build passes**

Run: `npm run build`
Expected: SUCCESS

- [ ] **Step 6: Commit**

```bash
git add src/pages/AssetRegister.tsx src/components/assets/AssetCard.tsx src/components/assets/DepreciationPreviewDialog.tsx src/App.tsx
git commit -m "feat(60): add AssetRegister page with table/card toggle and depreciation preview"
```

---

## Chunk 4: Frontend — Asset Detail, Form, Disposal, Income Statement Reminder

### Task 12: Asset Create/Edit Form

**Files:**
- Create: `src/components/assets/AssetForm.tsx`
- Create: `src/components/assets/CharacteristicsEditor.tsx`

- [ ] **Step 1: Create CharacteristicsEditor**

Key-value pairs editor with:
- Table of existing key-value pairs (editable inline)
- "Add Field" button adds empty row
- "Paste CSV" button opens textarea, parses `key,value` lines on submit
- Delete button per row

- [ ] **Step 2: Create AssetForm**

Form component used for both create and edit:
- Name, Category dropdown (auto-fills defaults on selection), Acquisition Date, Acquisition Cost
- Useful Life (with PSAK tooltip), Salvage Value (with PSAK tooltip) — both auto-filled from category, editable
- Computed Monthly Depreciation display (read-only)
- Location text field
- CharacteristicsEditor
- File upload for attachments (uses `useAssetUploadUrl` hook)
- Fields disabled after depreciation starts (check `lastDepreciationMonth`)
- On submit: calls `useCreateAsset` or `useUpdateAsset`

- [ ] **Step 3: Commit**

```bash
git add src/components/assets/AssetForm.tsx src/components/assets/CharacteristicsEditor.tsx
git commit -m "feat(60): add AssetForm with PSAK defaults and CharacteristicsEditor"
```

---

### Task 13: Asset Detail Page

**Files:**
- Create: `src/pages/AssetDetail.tsx`
- Create: `src/components/assets/DepreciationHistory.tsx`
- Create: `src/components/assets/DisposalDialog.tsx`

- [ ] **Step 1: Create DepreciationHistory component**

Table with columns: Month, Depreciation, Accumulated, NBV, JE# (linked). Uses `useDepreciationHistory` hook. Shows full history sorted by date.

- [ ] **Step 2: Create DisposalDialog**

Dialog triggered by "Dispose" button (admin only). Fields: disposal type radio (Sold/Scrapped/Written Off), disposal date, sale proceeds (conditional on "Sold"). Shows computed preview: current NBV, proceeds, gain/loss. Confirm calls `useDisposeAsset`.

- [ ] **Step 3: Create AssetDetail page**

Full page with:
- Back link to `/assets`
- Header: asset number, name, status badge, Edit/Dispose buttons
- Asset Information section: category, dates, financial fields with PSAK tooltips
- Characteristics section (read-only display + edit via AssetForm modal)
- Attachments section (photo grid + upload)
- Depreciation History section
- Edit opens AssetForm in dialog
- Dispose opens DisposalDialog

- [ ] **Step 4: Replace placeholder in App.tsx**

Import the real `AssetDetail` component and replace the placeholder.

- [ ] **Step 5: Verify build passes**

Run: `npm run build`
Expected: SUCCESS

- [ ] **Step 6: Commit**

```bash
git add src/pages/AssetDetail.tsx src/components/assets/DepreciationHistory.tsx src/components/assets/DisposalDialog.tsx src/App.tsx
git commit -m "feat(60): add AssetDetail page with depreciation history and disposal workflow"
```

---

### Task 14: Income Statement Depreciation Reminder

**Files:**
- Modify: `src/pages/FinancialStatement.tsx`

- [ ] **Step 1: Add depreciation status query**

Import and call `useDepreciationStatus()` hook at the top of the component (before any conditional returns — React hooks order rule).

- [ ] **Step 2: Add top banner**

Below the page header, conditionally render a yellow info banner when `depreciationStatus?.hasUnpostedMonths`:
```tsx
<div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-center justify-between">
  <span className="text-yellow-800 text-sm">
    {formatMonth(depreciationStatus.currentMonth)} depreciation not yet posted for {depreciationStatus.unpostedCount} asset(s).
  </span>
  <Link to="/assets" className="text-yellow-700 underline text-sm">
    Run from Asset Register
  </Link>
</div>
```

Add dismissible state (local `useState`, session-only).

- [ ] **Step 3: Add inline note**

Find where 6150 Depreciation Expense row would appear in the OpEx section. If `hasUnpostedMonths`, append `(Month not posted)` in muted text after the amount.

- [ ] **Step 4: Verify build passes**

Run: `npm run build`
Expected: SUCCESS

- [ ] **Step 5: Commit**

```bash
git add src/pages/FinancialStatement.tsx
git commit -m "feat(60): add depreciation reminder to Income Statement (banner + inline)"
```

---

## Chunk 5: Final Verification

### Task 15: Type Check + Build + Full Test Suite

- [ ] **Step 1: Type check**

Run: `npm run type-check`
Expected: No errors

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: SUCCESS

- [ ] **Step 3: Run full test suite**

Run: `npm run test`
Expected: All tests PASS

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat(60): asset register & depreciation — phase complete"
```

---

## Documentation Updates

- [ ] `docs/CHANGELOG.md` — Add Phase 60 entry
- [ ] `docs/SCHEMA.md` — Add `fixedAssets` table documentation
- [ ] `docs/API_REFERENCE.md` — Add `convex/fixedAssets/` queries and mutations

## Success Criteria

- [ ] `npm run type-check` passes
- [ ] `npm run build` succeeds
- [ ] All tests pass (existing + new date helper tests)
- [ ] Asset Register page accessible under Financials dropdown
- [ ] Manager + Admin can view/create/edit assets
- [ ] Admin-only: run depreciation, void, dispose
- [ ] "Catch Up to Now" shows preview and posts JEs correctly
- [ ] Disposal creates correct gain/loss JE
- [ ] Income Statement shows depreciation reminder when unposted
- [ ] PSAK defaults auto-populate on category selection
