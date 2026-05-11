# Cost & Revenue Aggregation

The vocabulary used across cost calculation, revenue rollups, and P&L reporting.
Covers the path from raw ingredient prices → product COGS → period P&L per channel.

## Language

### Cost (inputs)

**Ingredient unit cost**:
IDR per base unit (g, ml, cm, pcs, sheets) of a raw ingredient or material.
_Avoid_: "unit cost" alone (ambiguous — see Component unit cost), "price per gram".
_Code_: output of `calculateCostPerBaseUnit` in `convex/lib/costCalculator.ts`.

**Recipe line cost**:
IDR for one ingredient line inside a recipe (quantity × Ingredient unit cost).
_Code_: output of `calculateLineCost`.

**Component unit cost**:
IDR per one finished component piece (one Big Ball, one Small Box, one Sticker).
_Avoid_: "unit cost" alone, "ball cost" (only valid for production category).
_Code_: stored as `componentTypes.unitCostIdr`.

### COGS (sellable goods)

**Product COGS**:
IDR per one menu product, broken down as `{ production, packaging, total }`.
Honors `menuProducts.cogsOverrideIdr` when set (override replaces BOM aggregation).
_Avoid_: "product cost", "unit COGS".
_Code_: output of `calculateMenuProductCOGS` and `buildProductCOGSMap`.

**Period COGS**:
IDR aggregated across order items in a time window, rolled up per channel and total.
Computed during P&L assembly by multiplying Product COGS by item quantity.
_Avoid_: "channel cost", "weekly COGS" (period may be week or month).
_Code_: produced inside `aggregateWeek` in `convex/reports/incomeStatement.ts`.

### Aggregation operations

**Revenue rollup**:
Pure function that turns pre-fetched `externalRevenue` records into a per-channel revenue summary (gross, net, commission, promo, transactions). Stops at net revenue — no COGS, no opex.
_Avoid_: "revenue summary" (too generic), "channel breakdown" (ambiguous with channel taxonomy).
_Code_: `aggregatePeriodRevenue` in `convex/externalData/helpers/dashboardHelpers.ts`. Consumed by the dashboard hero card.

**Period P&L**:
Pure function that produces a full income statement for one period: per-channel revenue + Period COGS + opex + depreciation/amortization + capex → gross profit, EBIT, EBITDA, net income, free cash flow.
_Avoid_: "weekly P&L" (period may be week or month), "income aggregation".
_Code_: `aggregateWeek` in `convex/reports/incomeStatement.ts`. The "Week" in the function name is a legacy artifact — the function serves both weekly and monthly P&L.

**P&L comparison**:
Orchestrator that fetches all data, runs **Period P&L** twice (current + previous), and computes deltas.
_Avoid_: "fetch and aggregate" (the name is opaque about what it returns).
_Code_: `fetchAndAggregate` in `convex/reports/incomeStatement.ts`.

### Confidence

**Confidence**:
A 4-level enum describing how trustworthy a numeric figure is — applied to revenue, COGS, and rolled-up channel rows on the Period P&L. Worse-of combination via `worstConfidence`.
_Levels (best → worst)_:
- **`exact`** — the value is what a counterparty actually reported (Shopee API gross, internal `orders.finalTotal`, GoFood commission). No estimation.
- **`calculated`** — derived from primary data via a deterministic model (Product COGS via BOM × quantity). Not reported, but mechanically reproducible from authoritative inputs.
- **`inferred`** — derived from less authoritative inputs (e.g., K3Mart sales reconstructed from delivery counts × price, with no transactional record from the platform).
- **`missing`** — no resolution at all (e.g., a product line with no BOM mapping → COGS unknown).
_Code_: `Confidence` type and `worstConfidence` in `convex/lib/confidence.ts`.

**Revenue confidence**:
The Confidence assigned to a channel's revenue figures, fixed by Source identity. Set per-Source as a hardcoded rule, not derived from the data.
_Current rules_: `internal`, `gobiz`, `shopee`, `tiktok`, `grabfood`, `consignment` → `exact`; `k3mart` → `inferred`; unknown/`bigseller` → `inferred` (default).
_Code_: `getChannelRevenueConfidence` in `convex/reports/incomeStatement.ts`.

**Item COGS confidence**:
The Confidence of one product line's COGS within an `externalRevenueItems` row. Today binary in practice: `calculated` when `linkedMenuProductId` resolves through the BOM, `missing` otherwise. `exact` is structurally unreachable today (no FIFO actual-cost path); reserved for future when production batches carry consumed-ingredient cost.
_Code_: assigned per item inside `resolveItemsCOGS` in `convex/reports/incomeStatement.ts`.

**Channel confidence**:
The Confidence emitted on a Period P&L channel row. Asymmetric rule: takes Revenue confidence as the baseline; downgrades to `missing` only if any item on the channel has `missing` Item COGS confidence. **Calculated COGS does not downgrade exact revenue** — the rule is intentional, since Confidence is a revenue-trust signal and BOM-derived COGS is the expected standard, not a quality penalty.
_Code_: combined in the channel loop of `aggregateWeek` in `convex/reports/incomeStatement.ts`.

### Channel taxonomy

The domain has **three distinct concepts** for "where a transaction came from". Earlier code used a fourth ("Display channel") which is being absorbed into Platform — see Flagged ambiguities.

**Source**:
The data pipeline a transaction was pulled from — i.e., which API/credential set produced the record. Stored on `externalRevenue.source`. **Does not directly imply a Platform** (a `bigseller` Source can carry Shopee or TikTok transactions; resolution requires Underlying source).
_Values_: `internal`, `gobiz`, `k3mart`, `grabfood`, `shopee`, `tiktok`, `consignment`, `bigseller`.
_Avoid_: "data source" (redundant), "channel" (collides with Order channel and Platform).
_Code_: `EXTERNAL_SOURCES` in `convex/lib/externalSource.ts`.

**Underlying source**:
For aggregator-pulled records (currently only `bigseller`), the Source the record *would* have had if pulled directly from the conversion platform's own API. Required to resolve a Platform for aggregator records.
_Values_: subset of Source — `shopee`, `tiktok` for BigSeller-fetched data.
_Code_: not yet a schema field; future addition on `externalRevenue` rows where `source = "bigseller"`.

**Order channel**:
Where the customer converted — the granular touchpoint within a Platform. Stored on `orders.channel` for orders Frollie creates a row for (currently Direct + consignment-mirrored). External-only platforms don't fill this.
_Values (target)_: `whatsapp`, `instagram`, `other` (all Direct), `gofood`, `grabfood`, `shopee`, `tiktok`, `k3mart_gf`, `legato_tamtem`, `legato_goldfinch`, `bazaar`.
_Avoid_: "channel" alone (ambiguous), "sales channel".
_Code_: `orders.channel` literal union in `convex/schema.ts:261`. **Pending migration** — see Flagged ambiguities.

**Platform**:
The semantic rollup — where the final conversion took place. Replaces the prior "Display channel" concept; absorbs the prior sparse "Platform" labeling. The canonical bucket every transaction belongs to, regardless of Source.
_Values_: `Direct`, `GoFood`, `GrabFood`, `Shopee`, `TikTok`, `K3Mart`, `Consignment`.
_Avoid_: "display channel" (deprecated), "Tokopedia" (folded into TikTok), "BigSeller" (a Source, not a Platform), "Other" (every transaction must fit a real Platform bucket).
_Code_: canonical resolver `resolvePlatform({source, underlyingSource?, orderChannel?}) → {platform, confidence}` exported from `convex/reports/platform.ts` (Phase 81 / D-04). Display strings produced by `platformDisplay(p: Platform)`. Replaces the deleted `sourceToPlatform`/`sourceToDisplayChannel`/`toDisplayChannel` mappers (`convex/reports/channelTaxonomy.ts` deleted entirely).

## Relationships

### Cost → COGS chain
- **Ingredient unit cost** × quantity = **Recipe line cost**
- A finished **Component** has a **Component unit cost** (derived from its recipe's line costs, or set directly)
- A **Product** is a BOM of components → sum of **Component unit cost** × quantity = **Product COGS**
- A **Period COGS** is the sum of **Product COGS** × item quantity across orders in the period
- **Production-component identification**: production components are filtered via the canonical predicate `isProductionUnit(componentType)` exported from `convex/reports/productionUnitHelpers.ts`. Rule: `category === "production"` alone (Phase 81 / D-01 — drops the historical `unit === "pcs"` and `gramsPerUnit !== undefined` clauses to future-proof gram-denominated production variants). Numeric-aggregation callsites that need a `gramsPerUnit` guard compose a secondary `.filter(c => c.gramsPerUnit !== undefined)` after the canonical predicate.

### Channel taxonomy
- A transaction has exactly one **Source** (which pipeline pulled it) and exactly one **Platform** (where the conversion happened).
- A transaction *may* have an **Order channel** (granular touchpoint), populated only when Frollie creates an `orders` row (Direct + consignment-mirrored).
- For non-aggregator Sources, **Platform** resolves directly from Source: `internal → Direct`, `gobiz → GoFood`, `grabfood → GrabFood`, `shopee → Shopee`, `tiktok → TikTok`, `k3mart → K3Mart`, `consignment → Consignment`.
- For aggregator Sources (`bigseller`), **Platform** resolves from **Underlying source**: `bigseller + underlying=shopee → Shopee`, `bigseller + underlying=tiktok → TikTok`.
- For Direct (`Source = internal`), **Order channel** disambiguates the touchpoint inside Direct (whatsapp / instagram / other), but does not change the Platform.
- For Consignment (`Source = consignment`), **Order channel** disambiguates the outlet (legato_tamtem / legato_goldfinch / bazaar), but does not change the Platform.

## Example dialogue

> **Dev:** "We have a TikTok transaction synced via BigSeller. What's its Source and Platform?"
> **Domain expert:** "**Source** is `bigseller` — that's the API we pulled it from. **Underlying source** is `tiktok`. **Platform** is `TikTok`. Since this didn't go through our `orders` table, there's no **Order channel** on it."

> **Dev:** "And a customer who DM'd us on Instagram and paid via bank transfer?"
> **Domain expert:** "**Source** is `internal` — our own adapter wrote the revenue record. **Order channel** is `instagram` — that's the touchpoint. **Platform** is `Direct` — the rollup."

## Flagged ambiguities

- **"unit cost"** is ambiguous: in code it appears as both `costPerUnit` (Ingredient unit cost, per g) and `unitCostIdr` (Component unit cost, per piece). Always qualify with "Ingredient" or "Component". Field rename is a future concern.
- **"COGS" vs "cost"** — COGS is reserved for sellable things (Product, Period). Inputs (ingredients, components) use "cost".
- ~~**"channel"** alone is overloaded across Source, Order channel, and Platform. Always qualify. The current `aggregatePeriodRevenue` return type has a field called `channels[]` whose entries are actually `{ source, displayName: Platform }` — misnamed; rename pending.~~ **Resolved Phase 81 (D-04 + D-05):** Platform vs Source vs Order channel are now mechanically distinct via `resolvePlatform()` in `convex/reports/platform.ts`. The 8-literal `Platform` union is exhaustive (no "Other" — D-04); resolution rules are codified in the resolver per D-05. The `aggregatePeriodRevenue` field-rename is tracked separately (out of scope; field still named `channels[]`).
- **"Display channel"** is deprecated as a domain concept. The 8-bucket `DisplayChannel` enum and `toDisplayChannel`/`sourceToDisplayChannel` functions in `convex/reports/channelTaxonomy.ts` will be replaced by a single Platform resolver. The `Other` bucket is dropped — every Source must resolve cleanly.
- ~~**`tiktok` Source labeled as "Tokopedia"** in `sourceToPlatform` (per the 2023 merger note) is reversed — TikTok is the canonical Platform name; Tokopedia is the legacy alias.~~ **Resolved Phase 81 (D-02):** `sourceToPlatform` deleted. `tiktok` source now resolves to `Platform = "TikTok"` via `resolvePlatform()`. Display palette (`src/lib/platformColors.ts`) no longer carries a Tokopedia entry — TikTok renders violet `#8b5cf6` (was red `#ef4444` under the legacy mapper). `K3 Mart` → `K3Mart` (no space) also rolled in same plan.
- **`tokopedia` Order channel literal** is deprecated. All historic Tokopedia orders are TikTok. Pending migration of `orders.channel = "tokopedia"` rows to `"tiktok"`.
- **`gofood` Order channel literal is missing** from `orders.channel` union. We sync GoFood data via `gobiz` Source but have no granular Order channel literal for GoFood touchpoints. Pending addition.
- ~~**`gobiz` and `grabfood` both feed food-delivery data, but represent different Platforms** (GoFood vs GrabFood — different companies, Gojek vs Grab). Current `sourceToDisplayChannel` collapses both to `GoFood`; that collapse is wrong. Each Source must resolve to its own Platform.~~ **Resolved Phase 81 (D-05):** `sourceToDisplayChannel` deleted along with `convex/reports/channelTaxonomy.ts`. `resolvePlatform({source: "gobiz"}).platform === "GoFood"` and `resolvePlatform({source: "grabfood"}).platform === "GrabFood"` — distinct Platforms. One stale integration test (`tests/convex/unitEconomics.test.ts:824`) was renamed `GoFood → GrabFood` to match. Note user-visible behavior change: analytics filter `?channels=GoFood` no longer includes `grabfood` rows.
- **`grabfood` Source has no live data today** — API access pending. The Source slot is reserved.
- ~~**`bigseller` records lack the Underlying source field today.** Until that's added, BigSeller-fetched rows can't be attributed to a Platform reliably (and `getChannelRevenueConfidence("bigseller")` defaults to "inferred").~~ **Resolved Phase 81 (D-03):** Forward-compatible resolver shipped. `resolvePlatform({source: "bigseller"})` returns `{platform: "BigSeller", confidence: "inferred"}` today (transitional Platform literal). When `externalRevenue.underlyingSource` schema field lands (deferred phase), the resolver tightens automatically: `bigseller + underlyingSource=tiktok → TikTok + inferred`, etc., without caller changes. The `BigSeller` literal will be removed from the Platform union once the schema field + backfill ship.

---

# Journal Entries & Double-Entry Bookkeeping

The vocabulary used across the general ledger: how transactions are posted, how reversals work, and how entries are numbered. Covers the path from business event (expense approval, payroll run, depreciation, bank-statement match) → balanced double-entry posting in the GL.

## Language

### Records

**Journal entry**:
The parent record of one balanced double-entry posting. Has a sequential **Entry number**, a business **date**, a **source type** discriminator, and ≥2 child **Journal entry lines** that sum to zero (debits = credits).
_Avoid_: "transaction" (collides with `bankStatementLines.transactionType` and the revenue rollup's transaction count), "posting" (not used elsewhere — adopting it would add a synonym), "JE" alone in prose (OK as a prefix in entry numbers and in invariant codes like JE-06).
_Code_: `journalEntries` table; created via `createJournalEntryWithLines` in `convex/lib/journalEngine.ts`.

**Journal entry line**:
One debit-or-credit row inside a Journal entry. Hits exactly one **Account**. Carries `debitAmount` OR `creditAmount` (one is zero), never both. Inside an entry's context, "line" is acceptable shorthand.
_Avoid_: "leg" (not used in code), "split" (unrelated meaning).
_Code_: `journalEntryLines` table; `JournalLine` interface in `convex/lib/journalEngine.ts`.

### Reversal

**Reversal entry**:
A new Journal entry that backs out an original by swapping debit/credit on every line. Dated to the **original's** business date, not the moment of reversal — the accounting period must match the original (JE-03). Once an entry is reversed, the original is patched (`isReversed: true`, `reversedByEntryId` set) and cannot be reversed again.
_Avoid_: "void entry" in prose (the word "void" is reserved for the `sourceType` label — see below).
_Code_: `createReversalEntry` in `convex/lib/journalEngine.ts`. Lines built via `buildReversedLines` (pure swap).

**Void source type**:
A `sourceType` literal pattern (`expense_void`, `reimbursement_void`, `payroll_void`, `depreciation_void`) that tags a **Reversal entry** with the kind of original it backs out. Validated by `validateVoidPairing` against the original's `sourceType`. Bank-statement reversals are an exception: they use `bank_statement_reversal` and bypass the void-pair mechanism (see Flagged ambiguities).
_Avoid_: using "void" as a verb in prose ("voiding an entry" → say "reversing an entry"). "Void" is a tag on the resulting reversal entry, not the operation.
_Code_: `VoidSourceType` type in `convex/lib/journalEngine.ts`.

**Non-reversible source types**:
Source types that cannot be reversed by `createReversalEntry`. Corrections must come from a separate manual entry. Currently: `manual` (already a manual correction), all `_void` types (no double-reversal), `asset_acquisition` (CapEx requires manual correction), `bank_statement` (Phase 73 — has its own bypass path).
_Code_: `NON_REVERSIBLE_TYPES` in `convex/lib/journalEngine.ts`.

### Posting flow

**Source type**:
The discriminator on a Journal entry naming the business event that produced it. Drives downstream behavior: which `_void` type pairs with it, whether it can be reversed, and whether downstream systems (e.g., bank-statement matcher) treat it as the system-of-record. Current values: `expense_approval`, `expense_void`, `reimbursement`, `reimbursement_void`, `payroll`, `payroll_void`, `depreciation`, `depreciation_void`, `asset_acquisition`, `manual`, `bank_statement`, `bank_statement_reversal`.
_Avoid_: "type" alone, "category" (reserved for accounts/expenses).
_Code_: `JournalSourceType` in `convex/lib/journalEngine.ts`.

**Single entry point**:
The architectural rule that all `journalEntries`/`journalEntryLines` writes must go through `createJournalEntryWithLines`. No direct `ctx.db.insert` on either table is permitted from feature code. Reversal entries are no exception — `createReversalEntry` calls `createJournalEntryWithLines` internally.
_Code_: invariant JE-06. Only `journalEntries.isReversed`/`reversedByEntryId` may be patched directly (JE-02 carve-out).

### Amounts

**Debit / Credit**:
Standard double-entry accounting semantics. Debit is the left side of an Account; credit is the right. Whether a debit *increases* or *decreases* a balance is a function of the Account's normal-balance convention (Assets/Expenses normal-debit; Liabilities/Equity/Revenue normal-credit). Debit and credit do **not** map to "money in" vs "money out" — a cash expense debits an Expense account and credits Cash; both are part of "money leaving" but only one is a credit.
_Avoid_: "money in / money out" framing in code or docs ever — it loses information about which Account is being touched.

**Line amount rules** (enforced by `validateJournalLines`):
1. `debitAmount` and `creditAmount` are **non-negative integers** (IDR has no fractional component).
2. Exactly one of the two is non-zero per line — never both, never neither.
3. To reverse a posting, **swap debit and credit** (`buildReversedLines`); never store a negative debit.
4. Per entry: `sum(debitAmount) === sum(creditAmount)`. The integer-only rule guarantees exact equality is safe (no IEEE 754 drift).
5. Min 2 lines per entry.
_Avoid_: signed debit values, fractional rupiah, "negative line" — none exist in this system.
_Code_: `validateJournalLines` in `convex/lib/journalEngine.ts`.

### Identity & numbering

**Entry number**:
The canonical identifier for a Journal entry. Format **`JE-MMDD-NNN`** (e.g., `JE-0508-001`). The prefix `JE-` is part of the identity, not display formatting. Stored as a string on `journalEntries.entryNumber`. Sequential per **WIB business date**, gap-free within that day.
_Avoid_: "entry ID" (collides with the Convex `Id<"journalEntries">` document ID — those are different things, see below).
_Code_: minted by `getNextNumber(ctx, "JE")`; formatted by `formatCounterNumber`.

**Entry ID** (vs Entry number):
The Convex document ID — `Id<"journalEntries">`, opaque string. Used for foreign keys (`reversedByEntryId`, `journalEntryLines.journalEntryId`). Never shown to humans.
_Avoid_: confusing with Entry number. Rule of thumb: if it's in a URL, log line, or human-readable export, it's the **Entry number**; if it's a foreign key on another table, it's the **Entry ID**.

**Counter prefix**:
The namespace dimension on the `counters` table. Each prefix has its own per-day sequence, independent of every other prefix. Live prefixes today: `JE` (journal entries), `EXP` (expenses), `RMB` (reimbursement batches). Order numbers do **not** use this counter — they have their own minting path with no prefix (`MMDD-NNN`, e.g., `0129-001`, per CLAUDE.md rule 7).
_Code_: `counters` table; `getNextNumber` in `convex/lib/counter.ts`.

**WIB business date**:
The Asia/Jakarta-local date used to compute the `MMDD` segment. UTC+7, no DST. Computed via `getWibComponents` → `getWibDateStr`, NOT `new Date(now).toISOString().slice(...)` (which would use UTC and roll over the day 7 hours late for Indonesian users).
_Avoid_: "today" alone in code comments — qualify as "WIB today" when it matters.
_Code_: `getWibDateStr` in `convex/lib/periodRange.ts` (canonical helper for YYYY-MM-DD WIB dates with NaN-guard; Phase 81 / D-06 — relocated from `counter.ts` where the MMDD-format helper now lives as `getWibMonthDayStr`); UTC offset (`WIB_OFFSET_MS`) also lives in `convex/lib/periodRange.ts`.

### Double-entry integrity

The six structural / arithmetic rules `validateJournalLines` enforces. Each has a canonical name so phase plans, code reviews, and commit messages can refer to them precisely.

**Min-lines rule**: a Journal entry has ≥2 lines. _Throws_: `"Journal entry requires at least 2 lines"`.

**Non-negative rule**: `debitAmount >= 0 && creditAmount >= 0`. Checked **before** the Integer rule by design — a fractional negative like `-50000.5` should be reported as non-negative, not as fractional. _Throws_: `"amounts must be non-negative"`.

**Integer rule**: both `debitAmount` and `creditAmount` are whole numbers. IDR has no fractional component. This rule is what makes the Balance rule's `===` comparison safe — relaxing it would let IEEE 754 drift silently break balance. _Throws_: `"amounts must be whole numbers (IDR)"`.

**Exclusive-side rule**: a line has either a non-zero debit or a non-zero credit, never both. _Throws_: `"must have either debit or credit, not both"`.

**Non-zero rule**: a line has at least one non-zero side (no `0/0` lines). _Throws_: `"must have a non-zero debit or credit amount"`.

**Balance rule**: `sum(debitAmount) === sum(creditAmount)` across all lines. The double-entry invariant. _Throws_: `"Journal entry imbalanced: debits (X) != credits (Y)"`.

_Code_: all six in `validateJournalLines` in `convex/lib/journalEngine.ts`.

### Out of scope for `validateJournalLines`

What this validator does **not** check, and where (if anywhere) it lives instead. These are deliberate boundaries — surface them in design discussions before assuming integrity is end-to-end.

- **Account existence**: enforced by Convex's `v.id("accounts")` schema validator at insert time. A bogus `accountId` throws, but the message comes from Convex, not from journal-engine code. Account FK is *covered*, just not here.
- **Account `isActive` check**: **not enforced anywhere today.** A deactivated `accounts` row can still receive new postings. This is a known gap — when `accounts.isActive=false` is used as a soft-delete, posting code does not consult it. (Flagged ambiguity, below.)
- **Postable-vs-header distinction**: doesn't apply — the chart of accounts is flat. No `isPostable` / `isHeader` / `parentAccountId` field exists; every `accounts` row is postable.
- **Period validity**: doesn't apply — Frollie has no period-close concept. There's no `closedPeriod` / `fiscalYearEnd` / `lockedPeriod` field, and no validator. **A back-dated JE always succeeds**, including into prior years. This is the system-of-record design, not a bug — but downstream P&L recompute is the user's responsibility.
- **Authorization**: handled at the mutation boundary via `requireRole(ctx, token, [...])`. Validation in `validateJournalLines` runs only after permission has been granted.

## Flagged ambiguities (Journal Entries)

- **`_void` vs `_reversal` source-type suffixes drift.** `expense_void`/`payroll_void`/etc. coexist with `bank_statement_reversal`. Both name the same concept (a Reversal entry's source type), but Phase 73 chose `_reversal` deliberately to bypass the void-pair mechanism. Future sourceTypes should follow `_reversal`; renaming the existing `_void` literals is deferred (no domain need; pure naming polish).
- **Year-rollover in Entry numbers.** `JE-MMDD-NNN` carries no year. The counter row for `(JE, "0101")` continues incrementing across years rather than resetting, so two entries `JE-0101-042` and `JE-0101-043` may be a year apart. *Uniqueness is preserved* (each `JE-MMDD-NNN` is minted exactly once across all time), but readers must derive the year from the parent's `date` field. Cutover to `JE-YYYYMMDD-NNN` is a candidate future phase, not a current concern.
- **Posting to a deactivated account is silently allowed.** `accounts.isActive` is set by admin UI / seed data but is never consulted by `validateJournalLines` or `createJournalEntryWithLines`. If `isActive` is intended as a soft-delete, this is a real gap — the validator should either (a) reject postings to inactive accounts, or (b) the `isActive` flag should be renamed to something that makes its actual semantics explicit (e.g., "hide from picker UI but still allow posting").
- **No period close.** There is no concept of a closed accounting period anywhere in the codebase. P&L is always recomputed from raw lines. This is acceptable for a small ops team but won't survive an external audit if Frollie ever needs one — surface this when external accounting/audit requirements appear.
- **Manual entry semantics.** `sourceType: "manual"` is non-reversible by design (correction must come via another manual entry). This rule is unstated to users — admin UI should warn when posting a manual entry that the only correction path is another manual entry.
