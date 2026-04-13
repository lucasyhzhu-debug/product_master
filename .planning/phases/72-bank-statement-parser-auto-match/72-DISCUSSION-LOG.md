# Phase 72: Bank Statement Parser & Auto-Match - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-12
**Phase:** 72 — Bank Statement Parser & Auto-Match
**Areas discussed:** Storage model, Match engine approach, Format detection & upload UX, Match targets & scope

---

## Gray Area Selection

| Option | Description | Selected |
|---|---|---|
| Storage model | Persist tables vs ephemeral | ✓ |
| Match engine approach | Rules vs fuzzy vs tiered confidence | ✓ |
| Format detection & upload UX | Auto-detect vs user pick; page location | ✓ |
| Match targets & scope | 4 target types, dedup, P72/P73 boundary | ✓ |

---

## Round 1: Storage Model (+ cross-cutting)

### Q1: Storage model — persist bank statements and lines to new tables?

| Option | Description | Selected |
|---|---|---|
| Two tables (bankStatements + bankStatementLines) | Mirrors journalEntries/Lines | ✓ (implicitly via user reframe) |
| Single flat table | statementImportId uuid grouping | |
| Reuse externalRevenue pattern | Generic transactions table | |

**User's choice:** Reframed the question — emphasised dual use case (1) easy batch expense upload from bank statement (2) reconciliation audit to find missing expense/revenue captures. Confirmed downstream that two-table model with full template fields is correct.

### Q2: Match linkage on each bank line?

| Option | Description | Selected |
|---|---|---|
| Polymorphic (`matchedType` + `matchedId`) | One query, one index | ✓ |
| Four optional FK fields | Type-safe but verbose | |
| Separate bankMatches table | Cleanest for 1-to-many matches | |

### Q3: Reconciliation status on which level?

| Option | Description | Selected |
|---|---|---|
| Line-level only | Header counts derived | ✓ |
| Both line + header | Denormalized header counts | |
| Header-only aggregate | Slowest per-line ops | |

### Q4: Duplicate statement handling on re-upload?

| Option | Description | Selected |
|---|---|---|
| Block on file hash | SHA-256 of CSV; reject dup | ✓ |
| Line-level dedup | Composite (date+amount+desc) | |
| Warn but allow | User confirms overlap | |

**Notes from user:** "there are two use cases... firstly it's for expenses only — for me to easily upload historical expenses from a batch expenses table; secondly, this is meant to be a way to CHECK if all our expenses and revenues have been captured through the system... expenses checks will mean reviewing the transaction descriptions, values, dates... revenue should be more an aggregate count based on matching it to the channel/source — we want to see what revenue we missed... we know there WILL be missing because we're not pulling all the revenue in (like GrabFood)."

---

## Round 2: Use case split (Claude follow-up for reframe)

### Q5: Expense flow — what happens to unmatched bank debit lines?

| Option | Description | Selected |
|---|---|---|
| Inline convert to expense | Per-line action in P73 | ✓ |
| Separate 'Bulk import from bank' action | Multi-select → Bulk Import page | |
| Both | Single-line inline + bulk-select | |

### Q6: Revenue matching granularity — how aggregate?

| Option | Description | Selected |
|---|---|---|
| By channel × statement period | Keyword-classified credits summed per source | ✓ (with caveats) |
| By channel × month | Monthly buckets regardless of statement | |
| By channel × day | Most granular | |

**Notes from user:** "option 1 but we need to be flexible here because every platform has their own reimbursement methodology and timing, like some are daily net revenue less discounts — it really should be channel by channel matching because it will be difficult to match across all channels immediately — let's do one channel at a time — if you're not sure of any revenue attribution please ask in the review so we can allocate properly."

Captured as D-23/D-24 (per-channel rollout, uncertain-attribution flagged for review).

### Q7: Revenue channel classification — how to identify source from description?

| Option | Description | Selected |
|---|---|---|
| Configurable keyword rules | Admin-editable map | ✓ (combined) |
| Hardcoded constant | Dev-managed | |
| Per-line manual classification | User tags each line | ✓ (combined — fallback) |

**Notes from user:** "1 and 3 then we save the rules in a smart way (should we employ AI or how do we best manage this?)"

**Claude's recommendation applied:** Rules-only (no AI in P72), with learn-from-override in P73. Deferred AI to post-plateau revisit. Captured as D-27 + Deferred Idea.

### Q8: Scope boundary — what's in Phase 72 vs Phase 73?

| Option | Description | Selected |
|---|---|---|
| P72 = upload+parse+auto-match+persist; P73 = review UI + manual actions | Cleanest split | ✓ (via Claude's call) |
| P72 includes basic review table; P73 adds advanced actions | | |
| P72 = upload+parse+preview only (no persistence); P73 = everything else | | |

**Notes from user:** "whatever's the most elegant and least complex planning required to do this — think like a principle engineer and plan these two phases will rely on you to decide what's the optimal split."

Claude decision: P72 = full pipeline + minimal read-only post-import view. P73 = split-view review + manual match/unmatch + inline JE/expense creation + revenue gap dashboard + rule-learning.

---

## Round 3: BCA template + engine confirmation

### Q9: Match engine — per-target-type rules with confidence tiers?

| Option | Description | Selected |
|---|---|---|
| Per-target deterministic rules with tiered confidence | No fuzzy in P72 | |
| Add fuzzy description matching | Levenshtein on description | ✓ |
| Simpler single-tier | matched/unmatched only | |

### Q10: Format detection — how to pick BCA vs Mandiri?

| Option | Description | Selected |
|---|---|---|
| Auto-detect from headers with manual fallback | Header signature sniff | |
| User picks bank before upload | Radio picker | |
| Single unified parser | Fragile | |

**Notes from user:** "we only have 1 bank - BCA - Please use a template like this for the upload [pasted full template with 17 columns covering source data + classification output + journaling suggestion fields]".

This became the canonical CSV shape for the phase. Captured as D-06, D-07, D-08, and `<specifics>` section of CONTEXT.md with example rules table extracted from the pasted rows.

### Q11: Upload page location?

| Option | Description | Selected |
|---|---|---|
| New dedicated /bank-reconciliation | Separate from /import | ✓ |
| Integrate into /import | Shared wizard, mixed concepts | |
| Modal from Expense Analytics / Dashboard | No dedicated home | |

### Q12: Statement period — derive from data or user-specified?

| Option | Description | Selected |
|---|---|---|
| Derive from lines | min/max of line dates | ✓ |
| User-specified before upload | Date range picker | |
| From CSV header metadata | Parse period row | |

---

## Round 4: Confirmation

### Q13: Does this scope split + data model match your vision?

| Option | Description | Selected |
|---|---|---|
| Yes, locked in | Proceed to write CONTEXT.md | ✓ |
| Revise scope split | | |
| Revise data model | | |
| Add something missing | | |

### Q14: JE creation timing & sourceType literal?

| Option | Description | Selected |
|---|---|---|
| P73 confirmation → JE | P72 only stores suggestions | ✓ |
| P72 auto-posts high-confidence JEs | Partial auto-post | |
| Only manual JE posting | | |

### Q15: Keyword rules — storage + editing scope for P72?

| Option | Description | Selected |
|---|---|---|
| Table + seed + admin CRUD page | Full admin UI in P72 | ✓ |
| Table + seed only, no admin UI | Edit via dashboard | |
| Config constant, no table | Dev-only edits | |

---

## Claude's Discretion

Left to planner / implementer:
- Levenshtein library choice (fastest-levenshtein vs hand-rolled)
- Confidence threshold tuning (0.8 fuzzy starting point)
- Read-only review table pagination/sort defaults
- BCA CSV column parsing details (BOM, encoding, date format `DD/MM/YYYY`)
- Account-ID resolution strategy in seed (by `code` vs `name`)
- Two-term keyword rule modelling (compound vs priority-split) — see `<specifics>` discussion

## Deferred Ideas

- AI/LLM classification
- Mandiri and other bank format support
- Multi-currency
- Batch historical recategorization tool
- Real revenue aggregation dashboard → Phase 73
- Learn-from-override rule auto-creation → Phase 73
- Long-import streaming / progress
- Automated BCA API pull (if exposed)
