# Phase 70: Data Accuracy Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-09
**Phase:** 70-data-accuracy-foundation
**Areas discussed:** COGS override behavior, Employee profile fields, Revenue sync automation, Backfill distinguishability

---

## COGS Override Behavior

### Q1: What should the COGS override represent?

| Option | Description | Selected |
|--------|-------------|----------|
| Total COGS per unit sold | One flat number covering production + packaging cost per unit. Simple, matches how manager thinks about product cost. | :white_check_mark: |
| Production COGS only | Override only the production (ball) cost. Packaging COGS still from BOM. | |
| Separate production + packaging overrides | Two fields: one for production, one for packaging. | |

**User's choice:** Total COGS per unit sold (Recommended)
**Notes:** None

### Q2: Override vs BOM priority

| Option | Description | Selected |
|--------|-------------|----------|
| Override always wins | If cogsOverride is set, BOM calculation is ignored entirely. | :white_check_mark: |
| Override is fallback | BOM preferred when available, override only when BOM missing. | |

**User's choice:** Override always wins (Recommended)
**Notes:** None

### Q3: UI location for COGS override

| Option | Description | Selected |
|--------|-------------|----------|
| Inline on Menu Products table | Editable column on MenuProductsManager, same pattern as defaultPrice. | :white_check_mark: |
| In product detail/edit dialog | Override field inside product edit form. | |
| You decide | Claude picks best UX. | |

**User's choice:** Inline on Menu Products table (Recommended)
**Notes:** None

---

## Employee Profile Fields

### Q1: Base rate format

| Option | Description | Selected |
|--------|-------------|----------|
| Monthly salary | Single monthly amount in IDR. Standard for Indonesian employment. | :white_check_mark: |
| Daily rate | Per-day amount. Common for kitchen/production staff. | |
| Both monthly + daily | Store both for flexibility. | |

**User's choice:** Monthly salary (Recommended)
**Notes:** None

### Q2: Bank account holder name

| Option | Description | Selected |
|--------|-------------|----------|
| Separate field | bankAccountHolderName as its own field. Legal name differs from display name. | :white_check_mark: |
| Reuse user name | Use existing users.name field. | |

**User's choice:** Separate field (Recommended)
**Notes:** None

### Q3: UI location for employee fields

| Option | Description | Selected |
|--------|-------------|----------|
| Expand UsersManager edit dialog | Add 'Employment' section to existing user edit dialog. Admin-only. | :white_check_mark: |
| New Employee Profile page | Separate page for employment/financial details. | |

**User's choice:** Expand UsersManager edit dialog (Recommended)
**Notes:** None

---

## Revenue Sync Automation

### Q1: Sync trigger mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Cron job | Add to convex/crons.ts, run hourly. Same pattern as other syncs. | :white_check_mark: |
| On order status change | Trigger sync on revenue-countable status. Real-time but coupling risk. | |
| Keep manual only | Manager triggers from dashboard. | |

**User's choice:** Cron job every hour AND manual trigger from Sales Analytics
**Notes:** User wants both: hourly cron for automation + manual trigger button on Sales Analytics for on-demand sync.

### Q2: Revenue-countable statuses

| Option | Description | Selected |
|--------|-------------|----------|
| Keep current list | PaymentReceived, BeingPrepared, AwaitingDelivery, Complete. Conservative. | :white_check_mark: |
| Add Confirmed | Include Confirmed for earlier recognition. | |
| You decide | Claude investigates actual flow. | |

**User's choice:** Keep current list (Recommended)
**Notes:** None

---

## Backfill Distinguishability

### Q1: Tagging backfilled records

| Option | Description | Selected |
|--------|-------------|----------|
| Same records, no distinction | No special tagging. Revenue is revenue. Dedup by orderNumber. | :white_check_mark: |
| Tag with dataOrigin: 'backfill' | Mark backfilled records differently for auditing. | |
| Separate backfill action | Dedicated action for one-time use. | |

**User's choice:** Same records, no distinction (Recommended)
**Notes:** None

### Q2: Backfill trigger

| Option | Description | Selected |
|--------|-------------|----------|
| One-time manual action | Run syncInternalOrders once without sinceTimestamp. | :white_check_mark: |
| Auto-detect and backfill | First cron run detects missing history and auto-backfills. | |

**User's choice:** One-time manual action
**Notes:** User flagged a bug: Bali order 0330-002 is stuck at "Confirmed" when it should be "Complete". Order was edited multiple times. Needs investigation — how many "Confirmed" orders exist and what happened to their status transitions. User instructed to use /graphify knowledge graph for tracing.

---

## Claude's Discretion

- Field validation rules for hireDate, baseSalaryIdr
- COGS override display format in MenuProductsManager
- Error handling for sync failures

## Deferred Ideas

None — discussion stayed within phase scope
