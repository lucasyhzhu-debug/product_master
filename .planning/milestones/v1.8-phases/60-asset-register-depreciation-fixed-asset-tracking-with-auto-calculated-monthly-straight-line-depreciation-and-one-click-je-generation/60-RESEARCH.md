# Phase 60: Asset Register & Depreciation - Research

**Researched:** 2026-03-18
**Domain:** Fixed asset management, PSAK-compliant depreciation, journal entry generation
**Confidence:** HIGH

## Summary

This phase adds a fixed asset register with PSAK-aligned categories, straight-line depreciation calculation, batch JE generation ("Catch Up to Now"), per-asset disposal workflow, and a depreciation reminder on the Income Statement page. The implementation builds entirely on existing infrastructure: `journalEngine.ts` for JE creation, `counter.ts` for sequential numbering, `periodRange.ts` for WIB month boundaries, `protectedMutation`/`protectedQuery` for auth, and `ctx.storage.generateUploadUrl()` for file attachments.

The key technical challenge is the "Catch Up to Now" batch flow: iterating all active assets, computing missing depreciation months since each asset's last depreciation, generating a preview summary, then creating one JE per asset per month in a single mutation. The `journalEntries.sourceType` union must be extended with `"depreciation"` and `"depreciation_void"`, which requires synchronized updates to the schema, `journalEngine.ts` type definitions, and the reversal validation logic.

**Primary recommendation:** Extend the existing journal engine with two new source types, add a `fixedAssets` table with denormalized `accumulatedDepreciation` and `lastDepreciationMonth` fields, and reuse the `counter.ts` pattern with category-prefixed asset numbers (e.g., `FA-KIT-0318-001`). The batch depreciation flow should be a single mutation that creates all JEs atomically.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Asset number format: `FA-{CATEGORY}-YYMM-NNN` via `getNextNumber` with category-aware prefix
- Category abbreviations: KIT (kitchen/production), OFF (office), VEH (vehicles), FUR (furniture), BLD (buildings), TLS (tools), LHI (leasehold improvements)
- Status lifecycle: `active` -> `fully_depreciated` -> `disposed`
- Accumulated depreciation denormalized on asset record, updated each time depreciation JE is posted
- Location stored as simple string field, not linked to storageLocations table
- Flexible key-value characteristics: array of `{key, value}` pairs per asset
- CSV paste support for characteristics
- Photo + document attachments via existing `generateUploadUrl` pattern
- PSAK-aligned fixed category list (8 categories, Tanah not depreciable)
- Straight-line only depreciation method
- Full month proration from acquisition month
- Salvage value auto-populated from PSAK defaults, overridable per asset
- "Catch Up to Now" button: auto-detects missing months, preview before posting
- One JE per asset per month, sourceId = asset ID
- Duplicate prevention via `lastDepreciationMonth` per asset
- GL accounts: DR 6300 Depreciation Expense, CR per-category accumulated depreciation contra-asset accounts
- sourceType: `"depreciation"` and `"depreciation_void"` added to journalEntries union
- Void entire batch: one-click reverse all JEs from a specific month's run
- Page under Financials dropdown in nav
- Access: Manager + Admin can view/create; only Admin can dispose and run depreciation
- List view: toggle between table and card view
- Disposal workflow: sold/scrapped/written_off with gain/loss JE
- Depreciation reminder on Income Statement: both banner and inline note

### Claude's Discretion
- Exact PSAK salvage value defaults per category (researched below)
- Internal function organization for depreciation calculation
- Exact table/card toggle UI implementation
- Photo gallery layout on asset detail page
- CSV paste parser implementation details
- Disposal JE account mapping (gain -> 7xxx Other Income, loss -> 7xxx Other Expense)
- Whether to add depreciation schedule/projection view per asset (nice-to-have)
- Depreciation batch run confirmation dialog design
- Asset form field ordering and section grouping

### Deferred Ideas (OUT OF SCOPE)
- Asset revaluation (PSAK 16 fair value model)
- Impairment testing (PSAK 48)
- Intangible asset amortization
- Asset transfers between locations with audit trail
- Depreciation schedule projection/forecast view (Claude's discretion -- recommend skipping for scope)
- Budget vs actual depreciation comparison
- Bulk asset import via CSV
- Asset barcode/QR code generation
</user_constraints>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Convex | ^1.31.7 | Backend: fixedAssets table, mutations, queries | Existing project backend |
| React | ^19.2.0 | Frontend: Asset Register page, forms, dialogs | Existing project frontend |
| TypeScript | ~5.9 | Type safety for asset/depreciation types | Existing project language |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| journalEngine.ts | internal | JE creation (createJournalEntryWithLines, createReversalEntry) | All depreciation and disposal JE creation |
| counter.ts | internal | Sequential numbering (getNextNumber) | Asset number generation (FA-KIT-YYMM-NNN) |
| periodRange.ts | internal | WIB month boundaries (getWibComponents, wibMidnightToUtc, calculateMonthRange) | Month detection for depreciation |
| protectedMutation/Query | internal | Auth wrappers with role checking | All mutations and queries |
| Lucide React | existing | Icons (Building2, Car, Monitor, Wrench, etc.) | Asset category icons |
| shadcn/ui | existing | Dialog, Table, Card, Tabs, Badge, Button | UI components |
| Framer Motion | existing | Page transitions, list animations | Consistent with project UX |
| Sonner | existing | Toast notifications | Success/error feedback |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Denormalized accumulatedDepreciation | Computed from JE lines on read | Denormalized is faster for list views, matches project convention (unitCost on menuProducts) |
| Single mutation for batch | One mutation per asset | Single atomic mutation is safer (all-or-nothing), Convex transactions guarantee consistency |
| Hardcoded categories | Categories table | Table adds complexity for 8 static items; hardcoded matches TEMPLATE_TYPES pattern from manualJournal |

**Installation:**
No new packages needed. All dependencies already in project.

## Architecture Patterns

### Recommended Project Structure
```
convex/
├── fixedAssets/
│   ├── mutations.ts          # CRUD, depreciation batch, disposal
│   ├── queries.ts            # List, getById, depreciation preview
│   └── helpers.ts            # Pure functions: depreciation calc, category config
src/
├── pages/
│   └── AssetRegister.tsx     # Main page (list + detail + forms)
├── hooks/convex/
│   └── useFixedAssets.ts     # Query/mutation hooks
├── components/assets/        # Asset-specific UI components (if needed)
```

### Pattern 1: Category Configuration as Constants
**What:** PSAK categories, abbreviations, useful life defaults, and GL account codes defined as a typed constant array (like `TEMPLATE_TYPES` in manualJournal).
**When to use:** Any reference to asset categories throughout the codebase.
**Example:**
```typescript
// convex/fixedAssets/helpers.ts
export const ASSET_CATEGORIES = [
  { key: "tanah", label: "Tanah (Land)", abbr: "LND", usefulLifeYears: null, salvagePercent: 0, glAccumCode: null, depreciable: false },
  { key: "bangunan", label: "Bangunan (Buildings)", abbr: "BLD", usefulLifeYears: 20, salvagePercent: 5, glAccumCode: "1610", depreciable: true },
  { key: "kendaraan", label: "Kendaraan (Vehicles)", abbr: "VEH", usefulLifeYears: 8, salvagePercent: 10, glAccumCode: "1620", depreciable: true },
  { key: "peralatan_kantor", label: "Peralatan Kantor (Office Equipment)", abbr: "OFF", usefulLifeYears: 4, salvagePercent: 5, glAccumCode: "1630", depreciable: true },
  { key: "mesin_produksi", label: "Mesin & Peralatan Produksi (Kitchen/Production)", abbr: "KIT", usefulLifeYears: 8, salvagePercent: 5, glAccumCode: "1640", depreciable: true },
  { key: "mebelair", label: "Mebelair & Perabot (Furniture)", abbr: "FUR", usefulLifeYears: 4, salvagePercent: 5, glAccumCode: "1650", depreciable: true },
  { key: "perkakas", label: "Peralatan & Perkakas (Tools)", abbr: "TLS", usefulLifeYears: 4, salvagePercent: 5, glAccumCode: "1660", depreciable: true },
  { key: "perbaikan_sewa", label: "Perbaikan Sewa (Leasehold Improvements)", abbr: "LHI", usefulLifeYears: 4, salvagePercent: 0, glAccumCode: "1670", depreciable: true },
] as const;

export type AssetCategoryKey = (typeof ASSET_CATEGORIES)[number]["key"];
```

### Pattern 2: Depreciation Calculation (Pure Function)
**What:** Monthly depreciation as a pure function, no ctx required.
**When to use:** Preview calculations, batch generation, per-asset display.
**Example:**
```typescript
// convex/fixedAssets/helpers.ts
export function calculateMonthlyDepreciation(
  cost: number,
  salvageValue: number,
  usefulLifeMonths: number
): number {
  if (usefulLifeMonths <= 0) return 0;
  const depreciableAmount = cost - salvageValue;
  if (depreciableAmount <= 0) return 0;
  // Round to nearest integer (IDR)
  return Math.round(depreciableAmount / usefulLifeMonths);
}
```

### Pattern 3: Batch JE Generation (Single Mutation)
**What:** "Catch Up to Now" runs as a single Convex mutation: fetch all active depreciable assets, compute missing months, create JEs, update denormalized fields.
**When to use:** The "Catch Up to Now" button flow.
**Key insight:** Convex mutations are atomic transactions. If any JE creation fails, the entire batch rolls back. This guarantees consistency between `lastDepreciationMonth`, `accumulatedDepreciation`, and the actual JE records.

### Pattern 4: Asset Number via Counter
**What:** Extend `getNextNumber` usage with category-prefixed counters.
**When to use:** When creating a new asset.
**Example:**
```typescript
// Use existing counter with compound prefix
const assetNumber = await getNextNumber(ctx, `FA-${categoryAbbr}`);
// Produces: FA-KIT-0318-001, FA-VEH-0318-001, etc.
```
**Note:** The counter uses MMDD format by default. The CONTEXT.md specifies YYMM format for asset numbers. The counter helper produces PREFIX-MMDD-NNN. For YYMM format, either: (a) create a custom `getNextAssetNumber` that uses YYMM, or (b) accept MMDD format. Recommend option (a) since asset numbering is different from daily transaction numbering — assets are numbered per category per month, and year matters for asset identification.

### Anti-Patterns to Avoid
- **Computing depreciation on read:** Don't calculate accumulated depreciation from JE lines in queries. Denormalize it on the asset record (updated atomically in the depreciation mutation).
- **Separate mutations for each JE in batch:** Don't create one API call per asset. Use a single mutation for atomicity.
- **Hardcoding GL account IDs:** Always look up accounts by code via `by_code` index. IDs are environment-specific.
- **Modifying JE lines directly:** All JE creation MUST go through `journalEngine.ts` (JE-06 rule).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JE creation | Custom db.insert on journalEntries | `createJournalEntryWithLines` from journalEngine.ts | JE-06 rule, balance validation, sequential numbering |
| JE reversal | Manual line-by-line reversal | `createReversalEntry` from journalEngine.ts | Handles isReversed flag, line swap, validation |
| Sequential numbering | Custom counter logic | `getNextNumber` from counter.ts (or variant) | OCC-safe, tested, existing pattern |
| WIB month boundaries | Manual UTC+7 date math | `getWibComponents`, `wibMidnightToUtc`, `calculateMonthRange` from periodRange.ts | Tested, handles edge cases |
| File upload | Custom upload handling | `ctx.storage.generateUploadUrl()` pattern from expenses/businessSettings | Existing, tested pattern |
| Auth protection | Manual token/role checking | `protectedMutation`/`protectedQuery` from lib/functions.ts | Session handling, role validation built-in |

## Common Pitfalls

### Pitfall 1: Journal Engine Type Sync
**What goes wrong:** Adding `"depreciation"` to schema `sourceType` union but forgetting to update `JournalSourceType` in journalEngine.ts, or forgetting to update `VoidSourceType`, `VALID_VOID_PAIRS`, and `ReversibleSourceType`.
**Why it happens:** The sourceType is defined in 3 places: schema.ts (validator), journalEngine.ts (TypeScript types + validation maps), and the actual usage site.
**How to avoid:** Update ALL THREE in a single commit:
1. `convex/schema.ts` — add `v.literal("depreciation")` and `v.literal("depreciation_void")` to sourceType union
2. `convex/lib/journalEngine.ts` — add to `JournalSourceType`, add `"depreciation"` to `ReversibleSourceType`, add `"depreciation_void"` to `VoidSourceType`, add `depreciation: "depreciation_void"` to `VALID_VOID_PAIRS`, add `"depreciation_void"` to `NON_REVERSIBLE_TYPES`
3. Usage sites — use the new source types
**Warning signs:** TypeScript errors on sourceType mismatch, runtime "Unknown source type" errors.

### Pitfall 2: Last Month Rounding Error
**What goes wrong:** Final depreciation month over-depreciates because `(cost - salvage) / months` doesn't divide evenly. Accumulated depreciation exceeds depreciable amount.
**Why it happens:** Integer rounding in monthly amounts. E.g., 10,000,000 / 48 months = 208,333.33 -> rounds to 208,333. After 48 months: 208,333 * 48 = 9,999,984 (undershoot of 16 IDR).
**How to avoid:** On the final month, compute remaining = depreciableAmount - accumulatedDepreciation instead of using the standard monthly amount. Cap at remaining depreciable amount.
**Warning signs:** `accumulatedDepreciation` exceeding `cost - salvageValue`, or not reaching it after full useful life.

### Pitfall 3: Counter Format Mismatch
**What goes wrong:** Asset numbers use MMDD format (from counter.ts) instead of the specified YYMM format.
**Why it happens:** `counter.ts` was designed for daily transaction numbering (MMDD). Asset numbers need YYMM for identification across years.
**How to avoid:** Create a custom `getNextAssetNumber` function that generates YYMM-based counters, reusing the counter table but with a YYMM date string instead of MMDD.
**Warning signs:** Asset numbers like `FA-KIT-0318-001` (March 18) instead of `FA-KIT-2603-001` (2026 March).

### Pitfall 4: Batch Mutation Size
**What goes wrong:** "Catch Up to Now" for many assets across many months creates too many JE inserts in a single mutation, hitting Convex transaction limits.
**Why it happens:** Each JE has 1 header + 2 lines = 3 inserts. 10 assets x 6 months = 60 JEs = 180 inserts.
**How to avoid:** Convex mutations support up to ~8,192 writes per transaction. 180 inserts is well within limits. But if the asset register grows to hundreds of assets with many catch-up months, consider chunking. For Frollie's scale (likely <50 assets), this is not a concern.
**Warning signs:** "Transaction too large" errors in production.

### Pitfall 5: WIB Month Boundary for "Current Month"
**What goes wrong:** Using `Date.now()` and naive month extraction gives UTC month, not WIB month. Asset acquired at 11 PM UTC on March 31 is actually April 1 WIB.
**Why it happens:** Server time is UTC; business operates in WIB (UTC+7).
**How to avoid:** Always use `getWibComponents(Date.now())` to determine current month. Use `wibMidnightToUtc` for month boundaries.

### Pitfall 6: Disposal After Partial Month
**What goes wrong:** Asset is disposed mid-month but depreciation for that partial month is not handled.
**Why it happens:** Full-month proration means depreciation runs from acquisition month. Disposal in the same month as depreciation creates ambiguity.
**How to avoid:** Per CONTEXT.md, depreciation uses full-month proration. On disposal: if current month's depreciation hasn't been posted, the "Catch Up" should include it before disposal. Disposal JE handles gain/loss based on NBV at disposal date (cost - accumulated depreciation at that point).

## Code Examples

### Schema Extension for fixedAssets Table
```typescript
// convex/schema.ts — new table
fixedAssets: defineTable({
  assetNumber: v.string(),          // FA-KIT-2603-001
  name: v.string(),
  category: v.string(),             // AssetCategoryKey
  acquisitionDate: v.number(),      // Epoch ms (business date)
  cost: v.number(),                 // IDR, integer
  salvageValue: v.number(),         // IDR, integer (from PSAK default or override)
  usefulLifeMonths: v.number(),     // Derived from years * 12
  location: v.optional(v.string()), // Simple string, not linked to storageLocations
  characteristics: v.array(v.object({ key: v.string(), value: v.string() })),
  attachmentIds: v.array(v.id("_storage")),   // Photo + document storage IDs
  status: v.union(v.literal("active"), v.literal("fully_depreciated"), v.literal("disposed")),
  // Denormalized depreciation tracking
  monthlyDepreciation: v.number(),    // Pre-computed: (cost - salvage) / usefulLifeMonths
  accumulatedDepreciation: v.number(), // Updated each time depreciation JE posted
  lastDepreciationMonth: v.optional(v.string()), // "YYYY-MM" format, null if never depreciated
  // Disposal fields
  disposalDate: v.optional(v.number()),
  disposalType: v.optional(v.union(v.literal("sold"), v.literal("scrapped"), v.literal("written_off"))),
  saleProceeds: v.optional(v.number()),
  disposalGainLoss: v.optional(v.number()), // Positive = gain, negative = loss
  disposalJournalEntryId: v.optional(v.id("journalEntries")),
  // Audit
  createdBy: v.id("users"),
  createdAt: v.number(),
})
  .index("by_status", ["status"])
  .index("by_category", ["category"])
  .index("by_asset_number", ["assetNumber"]),
```

### Schema Extension for journalEntries sourceType
```typescript
// convex/schema.ts — extend sourceType union
sourceType: v.union(
  v.literal("expense_approval"),
  v.literal("expense_void"),
  v.literal("reimbursement"),
  v.literal("reimbursement_void"),
  v.literal("payroll"),
  v.literal("payroll_void"),
  v.literal("manual"),
  v.literal("depreciation"),       // NEW
  v.literal("depreciation_void")   // NEW
),
```

### New GL Accounts to Seed
```typescript
// Add to DEFAULT_ACCOUNTS in convex/accounts/mutations.ts

// Depreciation Expense (OpEx)
{ code: "6350", name: "Depreciation Expense", ... }
// WAIT: 6350 is already "Travel & Visa". Use a different code.

// Actually, CONTEXT.md specifies DR 6300 for Depreciation Expense.
// But 6300 is already "Transportation (Local)".
// Resolution: The CONTEXT.md says "DR 6300 Depreciation Expense" as the account CODE.
// Since 6300 already exists as "Transportation (Local)", we need a new code.
// Use 6250 "Depreciation Expense" (between Rent 6200 and Transportation 6300).
// OR rename/repurpose. Recommend: use code "6150" for Depreciation Expense.
// IMPORTANT: Planner must decide exact code. Research finding: 6300 is TAKEN.

// Per-category Accumulated Depreciation contra-asset accounts (1xxx)
{ code: "1610", name: "Accum. Depr. - Buildings", type: "asset", category: "Assets" },
{ code: "1620", name: "Accum. Depr. - Vehicles", type: "asset", category: "Assets" },
{ code: "1630", name: "Accum. Depr. - Office Equipment", type: "asset", category: "Assets" },
{ code: "1640", name: "Accum. Depr. - Kitchen/Production", type: "asset", category: "Assets" },
{ code: "1650", name: "Accum. Depr. - Furniture", type: "asset", category: "Assets" },
{ code: "1660", name: "Accum. Depr. - Tools", type: "asset", category: "Assets" },
{ code: "1670", name: "Accum. Depr. - Leasehold Improvements", type: "asset", category: "Assets" },

// Disposal gain/loss (7xxx Other Income/Expense)
{ code: "7300", name: "Gain on Asset Disposal", type: "other", category: "Other Income/Expense" },
{ code: "7400", name: "Loss on Asset Disposal", type: "other", category: "Other Income/Expense" },
```

### PSAK Salvage Value Research Results
```
IMPORTANT: 6300 ("Depreciation Expense" per CONTEXT.md) is already
"Transportation (Local)" in the current Chart of Accounts.
The planner MUST resolve this code collision. Options:
  A) Use 6150 for Depreciation Expense (new code)
  B) Reassign 6300 to Depreciation and move Transportation to 6310
  C) Ask user to confirm intended code

Recommendation: Option A (6150) — least disruptive, no migration needed.
```

### Depreciation Preview Query Pattern
```typescript
// convex/fixedAssets/queries.ts
// Returns preview of what "Catch Up to Now" would generate
export const getDepreciationPreview = protectedQuery({
  roles: ["admin"],
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const { year, month } = getWibComponents(now);
    const currentYYYYMM = `${year}-${String(month + 1).padStart(2, "0")}`;

    const assets = await ctx.db
      .query("fixedAssets")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    const preview: Array<{
      assetId: string;
      assetNumber: string;
      name: string;
      missingMonths: string[];
      monthlyAmount: number;
      totalAmount: number;
    }> = [];

    for (const asset of assets) {
      // Skip non-depreciable (Tanah) or fully depreciated
      const category = ASSET_CATEGORIES.find(c => c.key === asset.category);
      if (!category?.depreciable) continue;

      const missingMonths = computeMissingMonths(
        asset.acquisitionDate,
        asset.lastDepreciationMonth,
        currentYYYYMM,
        asset.usefulLifeMonths,
        asset.accumulatedDepreciation,
        asset.cost - asset.salvageValue
      );

      if (missingMonths.length > 0) {
        preview.push({
          assetId: asset._id,
          assetNumber: asset.assetNumber,
          name: asset.name,
          missingMonths,
          monthlyAmount: asset.monthlyDepreciation,
          totalAmount: asset.monthlyDepreciation * missingMonths.length,
        });
      }
    }

    return { preview, currentMonth: currentYYYYMM };
  },
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| PMK 96/PMK.03/2009 depreciation groups | PMK 72/2023 (current regulation) | 2023 | Updated depreciation/amortization rules, same 4-group structure |
| PSAK 16 (2011 revision) | PSAK 16 (converged with IAS 16) | Ongoing IFRS convergence | Cost model or revaluation model; this phase uses cost model only |
| Single accumulated depreciation account | Per-category contra-asset accounts | Best practice | Better financial statement granularity |

**Deprecated/outdated:**
- PMK 96/PMK.03/2009: Replaced by PMK 72/2023. Same useful life groups (4/8/16/20 years) but updated asset classification details.

## PSAK Defaults Research

### Indonesian Tax Depreciation Groups (PMK 72/2023, from PWC Tax Summaries)

| Group | Useful Life | SL Rate | Example Assets |
|-------|-------------|---------|----------------|
| Group 1 | 4 years | 25% | Office equipment, computers, furniture, tools |
| Group 2 | 8 years | 12.5% | Vehicles, metal furniture, kitchen equipment, machinery |
| Group 3 | 16 years | 6.25% | Heavy machinery (not applicable for Frollie) |
| Group 4 | 20 years | 5% | Steam locomotives (not applicable for Frollie) |
| Buildings (Permanent) | 20 years | 5% | Permanent structures |
| Buildings (Non-permanent) | 10 years | 10% | Temporary/non-permanent structures |

### Recommended PSAK Defaults per Category

| Category | Key | Abbr | Useful Life | Salvage % | Rationale |
|----------|-----|------|-------------|-----------|-----------|
| Tanah (Land) | tanah | LND | N/A | N/A | Not depreciable (PSAK 16.61) |
| Bangunan (Buildings) | bangunan | BLD | 20 years | 5% | Group 4 / Permanent building rate |
| Kendaraan (Vehicles) | kendaraan | VEH | 8 years | 10% | Group 2; vehicles retain higher residual |
| Peralatan Kantor (Office) | peralatan_kantor | OFF | 4 years | 5% | Group 1; electronics depreciate fast |
| Mesin & Peralatan Produksi | mesin_produksi | KIT | 8 years | 5% | Group 2; production equipment |
| Mebelair & Perabot (Furniture) | mebelair | FUR | 4 years | 5% | Group 1; wooden/basic furniture |
| Peralatan & Perkakas (Tools) | perkakas | TLS | 4 years | 5% | Group 1; hand tools, instruments |
| Perbaikan Sewa (Leasehold) | perbaikan_sewa | LHI | 4 years* | 0% | Group 1; *or lease term if shorter; no residual for improvements |

**Salvage value rationale:** PSAK 16 does not prescribe fixed percentages. Indonesian tax law (PMK 72/2023) implicitly assumes 0% salvage for tax purposes (the SL rates = 100% / useful life). However, for PSAK accounting (book purposes), a small salvage value (5-10%) is common practice for assets with resale value. Land has no salvage (not depreciable). Leasehold improvements have 0% salvage (revert to landlord). Vehicles get 10% due to used vehicle market value. All others get 5% as a conservative default.

**Confidence: MEDIUM** — Salvage percentages are recommendations based on common Indonesian UMKM practice and PSAK guidance. They are overridable per asset, so defaults are starting points only.

### Disposal GL Account Mapping

| Disposal Result | DR Account | CR Account |
|-----------------|------------|------------|
| **Remove asset cost** | Accumulated Depreciation (per-category 16xx) | Fixed Assets (1500) |
| **Record sale proceeds** | Cash (1100) | — |
| **Gain on disposal** (proceeds > NBV) | — | 7300 Gain on Asset Disposal |
| **Loss on disposal** (proceeds < NBV) | 7400 Loss on Asset Disposal | — |
| **Write-off/scrap** (no proceeds) | 7400 Loss on Asset Disposal | — |

The disposal creates a compound JE:
- DR Accumulated Depreciation (full accumulated amount)
- DR Cash (sale proceeds, if sold)
- DR Loss on Disposal (if loss, = NBV - proceeds)
- CR Fixed Assets (original cost)
- CR Gain on Disposal (if gain, = proceeds - NBV)

## GL Account Code Collision Alert

**CRITICAL FINDING:** The CONTEXT.md specifies `6300` for Depreciation Expense, but code `6300` is already assigned to "Transportation (Local)" in the current Chart of Accounts.

| Code | Current Assignment | CONTEXT.md Intent |
|------|-------------------|-------------------|
| 6300 | Transportation (Local) | Depreciation Expense |
| 1600 | Accumulated Depreciation (single account) | Per-category accounts (1610-1670) |

**Recommendation for Depreciation Expense:**
- Use code **6150** "Depreciation Expense" (between Salaries 6100 and Rent 6200, available)
- This avoids any migration or renaming of existing accounts
- The single 6300 Depreciation Expense from CONTEXT.md maps to a single OpEx line regardless of code

**Recommendation for Accumulated Depreciation:**
- The existing `1600 Accumulated Depreciation` stays as-is (backward compatible)
- Add new sub-accounts 1610-1670 for per-category tracking
- The 1600 account can serve as a parent/summary or be left unused

**The planner MUST address this code collision before implementation.**

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^4.0.18 |
| Config file | vitest.config.ts |
| Quick run command | `npm run test -- --run` |
| Full suite command | `npm run test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DEPR-01 | Monthly depreciation calculation (straight-line) | unit | `npx vitest run convex/fixedAssets/helpers.test.ts -t "depreciation"` | Wave 0 |
| DEPR-02 | Missing months computation | unit | `npx vitest run convex/fixedAssets/helpers.test.ts -t "missing months"` | Wave 0 |
| DEPR-03 | Final month remainder handling | unit | `npx vitest run convex/fixedAssets/helpers.test.ts -t "final month"` | Wave 0 |
| DEPR-04 | Asset number YYMM format | unit | `npx vitest run convex/fixedAssets/helpers.test.ts -t "asset number"` | Wave 0 |
| DEPR-05 | Category config completeness | unit | `npx vitest run convex/fixedAssets/helpers.test.ts -t "categories"` | Wave 0 |
| DEPR-06 | Disposal gain/loss calculation | unit | `npx vitest run convex/fixedAssets/helpers.test.ts -t "disposal"` | Wave 0 |
| DEPR-07 | CSV characteristics parsing | unit | `npx vitest run convex/fixedAssets/helpers.test.ts -t "csv"` | Wave 0 |
| DEPR-08 | JE source type extension | unit | `npx vitest run convex/lib/journalEngine.test.ts` | Existing (extend) |

### Sampling Rate
- **Per task commit:** `npm run test -- --run`
- **Per wave merge:** `npm run test && npm run build`
- **Phase gate:** Full suite green + build passes before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `convex/fixedAssets/helpers.test.ts` — covers DEPR-01 through DEPR-07
- [ ] Extend `convex/lib/journalEngine.test.ts` — covers DEPR-08 (new source types in validation)

## Open Questions

1. **GL Code 6300 Collision**
   - What we know: CONTEXT.md says "DR 6300 Depreciation Expense" but 6300 is "Transportation (Local)"
   - What's unclear: Whether user intended to repurpose 6300 or just used it as a placeholder
   - Recommendation: Use 6150 (available code) and note the deviation from CONTEXT.md

2. **Depreciation Schedule Projection (Nice-to-Have)**
   - What we know: Deferred in CONTEXT.md but listed as Claude's discretion
   - What's unclear: Whether it adds enough value for Phase 60 scope
   - Recommendation: Skip for Phase 60. The batch preview already shows pending depreciation. A full schedule/projection can be a future enhancement.

3. **Batch Void Granularity**
   - What we know: CONTEXT.md says "one-click void reverses all JEs from a specific month's run"
   - What's unclear: How to identify "a month's run" — by matching sourceType=depreciation + date range, or by a batch tracking record
   - Recommendation: Query JEs by sourceType="depreciation" + date within month range + isReversed=false. No separate batch tracking table needed — the JE records themselves are the audit trail.

## Sources

### Primary (HIGH confidence)
- Existing codebase: `convex/lib/journalEngine.ts`, `convex/lib/counter.ts`, `convex/lib/periodRange.ts`, `convex/manualJournal/mutations.ts`, `convex/accounts/mutations.ts` — direct code reading
- `convex/schema.ts` — current schema (65 tables, sourceType union, accounts table)
- CONTEXT.md — user decisions and constraints

### Secondary (MEDIUM confidence)
- [PWC Indonesia Tax Summaries - Deductions](https://taxsummaries.pwc.com/indonesia/corporate/deductions) — depreciation group rates and useful life (verified, current)
- [Indonesia Ministerial Regulation PMK 72/2023](https://indonesia.acclime.com/insights/depreciation-amortisation-rules-regulation-update/) — current depreciation regulation replacing PMK 96/2009
- [PSAK 16 on Scribd](https://www.scribd.com/document/68748158/PSAK-16-English) — PSAK 16 standard text (land not depreciable, cost model)

### Tertiary (LOW confidence)
- Salvage value percentages (5-10%) — based on common Indonesian UMKM practice, not a specific PSAK mandate. PSAK 16 says "estimated by entity" for residual value. These are reasonable defaults that users can override.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all existing project infrastructure, no new packages
- Architecture: HIGH - follows established patterns (manualJournal, expenses, counter)
- Depreciation calc: HIGH - straight-line is straightforward math, verified with PSAK
- PSAK categories/useful life: HIGH - matches PMK 72/2023 tax groups exactly
- Salvage values: MEDIUM - common practice defaults, not PSAK-mandated percentages
- GL account codes: MEDIUM - 6300 collision needs resolution, 16xx sub-accounts are standard practice
- Disposal JE mapping: HIGH - standard accounting (derecognition per PSAK 16)
- Pitfalls: HIGH - based on direct code reading of existing patterns

**Research date:** 2026-03-18
**Valid until:** 2026-04-18 (stable domain, PSAK changes are infrequent)
