# Feature Research

**Domain:** Expense Management & Accounting for SME Food Production (Indonesian FMCG)
**Milestone:** v1.7 -- Expense & Accounting
**Researched:** 2026-03-12
**Confidence:** HIGH -- Design spec already validated by CFO/CPA advisory; domain patterns well-established in industry; existing system architecture deeply understood.

---

## Scope

This document covers the feature landscape for v1.7 Expense & Accounting:

- **Chart of Accounts** -- PSAK-aligned CoA backbone (36 accounts, 1xxx-7xxx)
- **Expense Management** -- Submission, approval, fraud detection, receipt handling
- **Reimbursement Batching** -- Bank transfer tracking with BCA workflow
- **Payroll Tracking** -- Simple payroll journal entry recording (admin-only)
- **P&L Extension** -- Extend existing income statement below Gross Profit to Net Income
- **Expense Analytics** -- Spend-by-category dashboards, trend analysis, fraud flags

**Already built (do not re-architect):**
- Weekly income statement with per-channel P&L (Revenue through Gross Profit) -- v1.5
- Recharts 3.7 charting for Sales Analytics -- existing
- PIN-based auth with 4 roles (kitchen, order_staff, manager, admin) -- existing
- Convex file storage pattern for images (`_storage` table, `ctx.storage.getUrl()`) -- existing
- 8-channel unified sales analytics with `externalRevenue` bridge -- v1.4
- Full BOM COGS resolution via `buildProductCOGSMap` -- v1.5
- Confidence classification system (exact/calculated/inferred/missing) -- v1.5
- `ROLE_PERMISSIONS` object in `src/lib/types.ts` with 14 permission flags -- existing
- `ProtectedRoute` component with `requiredPermission` prop -- existing

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features that are non-negotiable for a working expense system. Missing any of these makes the system unusable for its intended purpose.

#### Chart of Accounts Backbone

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Pre-seeded PSAK-aligned account list (36 accounts) | Users should not have to manually create accounting categories; standard accounts must exist on first use | LOW | Follow existing `tags:seedDefaults` pattern. Use `accounts:seedDefaults` mutation. System accounts (`isSystem: true`) are undeletable. |
| Account activation/deactivation toggle | Admins need to hide irrelevant categories (e.g., 6350 Travel & Visa may not apply initially) without losing data integrity | LOW | `isActive` boolean; inactive accounts hidden from expense submission dropdowns but shown in reports for historical data |
| Virtual accounts for Revenue/COGS (4xxx-5xxx) | Revenue and COGS already flow from `externalRevenue` + BOM; duplicating data into journal entries would create sync risk | LOW | CoA entries exist for classification/display in P&L but their values come from real-time aggregation, not journal entries. Design spec Section 2 confirms this. |
| Account type classification (asset/liability/equity/revenue/cogs/opex/other) | P&L grouping, Balance Sheet readiness, and query performance all depend on typed accounts | LOW | 7-way union type. `by_type` and `by_active_type` indexes. |

#### Expense Submission & Lifecycle

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Expense submission form (amount, category, date, vendor, description, receipt) | Core input mechanism; without it there is no expense system | MEDIUM | Map to `expenses` table. Amount in IDR (integer, no decimals needed). `accountId` links to GL account. Expense date cannot be future. |
| Receipt photo upload | Physical receipts are the Indonesian tax/audit standard; employees expect to photograph receipts on their phone | LOW | Convex `_storage` with `ctx.storage.getUrl()`. Existing pattern from feedback/grabfoodMenu modules. SHA-256 hash computed client-side via Web Crypto API. |
| Receipt requirement threshold (> Rp 50,000) | Small purchases like Rp 10K ojek rides should not be blocked for missing receipts; anything material needs proof | LOW | Hard backend enforcement for > Rp 50K. UI shows "Receipt recommended" for amounts at or below threshold. Draft save always allowed without receipt. |
| Draft save before submitting | Employees interrupted mid-entry need to save progress without triggering approval routing | LOW | `status: "draft"` skips all validation and routing. Only `submit` action validates and routes. |
| Status lifecycle (Draft -> Submitted -> Approved -> AwaitingPayment -> Reimbursed) | Users need to know where their expense is in the process at all times | MEDIUM | 7-status model per design spec Section 4. Company card expenses skip AwaitingPayment (direct to Approved terminal). Immutable after approval. |
| My Expenses list with status filters | Employees must see their own submission history and current status of each claim | LOW | Query `expenses` by `submittedBy` with status filter. Timeline tracker showing each status transition from `expenseStatusHistory`. |
| Expense number generation (EXP-MMDD-NNN) | Unique reference needed for bank transfer notes and verbal communication (e.g., "EXP-0312-003") | LOW | Follow existing order number pattern. `counters` table with atomic increment. Convex mutation serialization prevents races. |

#### Approval Workflow

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Approval queue for eligible approvers | Approvers need a single place to see what needs their attention | MEDIUM | Query pending expenses filtered by DoA eligibility (amount threshold + role). Expandable cards showing receipt, GL mapping, fraud flags. |
| Delegation of Authority (DoA) by amount | Industry standard: low-value expenses approved by managers, high-value by admin only | LOW | Threshold at Rp 500,000. Backend enforcement via `requireRole` + amount check. Design spec Section 4 details. |
| Self-approval block | Most fundamental internal control; without it the system has zero fraud prevention value | LOW | Backend rejects `approvedBy === submittedBy` regardless of role or frontend guards. |
| Broadcast routing (first-to-act wins) | 5-10 person team does not need sequential approval chains; broadcast is simpler and faster | LOW | All eligible approvers see pending expenses. Real-time Convex updates remove approved/rejected items from other queues instantly. |
| Rejection with mandatory reason | Submitters need to know WHY their expense was rejected to correct and resubmit | LOW | `rejectionReason` required on reject mutation. Design spec mandates comment for all approvals >= Rp 500K too. |
| Resubmission chain after rejection | Rejected expenses must be correctable; approvers need to see the history of prior rejections | LOW | New expense with `previousExpenseId` link to rejected original. Approver view shows full chain with reasons and rejection count badge. |
| Concurrency guard (double-approve prevention) | Two managers clicking "approve" simultaneously must not create duplicate journal entries | LOW | Check `expense.status === "submitted"` inside mutation. Convex OCC ensures atomicity. Second click gets "Expense already processed" error. |

#### Auto-Generated Journal Entries

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Journal entry on expense approval | The whole point of "hybrid CoA + smart defaults" is that users never manually post entries; the system generates correct double-entry accounting behind the scenes | MEDIUM | DR [OpEx GL], CR 2200 (reimbursable) or CR 1100 (company card). Entry number JE-MMDD-NNN. Immutable after creation. |
| Journal entry on reimbursement confirmation | Paying the employee is a separate accounting event that must be recorded | LOW | DR 2200, CR 1100. Source: `reimbursement`. Links to batch ID. |
| Reversing entry on void | Voiding must create a proper accounting reversal, not delete the original entry (audit trail integrity) | MEDIUM | New JE with swapped DR/CR. Original marked `isReversed: true` with `reversedByEntryId` link. Source: `expense_void` or `reimbursement_void`. |
| Journal entry on payroll | Payroll is a direct expense (no approval flow) but must create the same accounting entries for P&L consistency | LOW | DR 6100, CR 1100. Source: `payroll`. Admin-only. |
| Debit = Credit validation | Fundamental double-entry integrity; every journal entry must balance | LOW | Backend validation: sum(debitAmount) === sum(creditAmount) on creation. Reject unbalanced entries. |
| Immutable journal entries | Once created, entries cannot be edited -- only reversed with a new entry. This is a legal accounting requirement. | LOW | No update mutation exists for `journalEntries` or `journalEntryLines`. Void creates new reversal entry. |

#### Reimbursement Batching

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Group approved expenses by employee | Admin needs to see "pay Employee X a total of Rp Y" not a flat list of individual claims | MEDIUM | Query approved expenses with `paymentMethod` in ("personal_cash", "personal_transfer"), grouped by `submittedBy`. Show employee bank details + running total. |
| One-click batch creation per employee | Manual grouping is error-prone; system should auto-generate RMB-MMDD-NNN batch with correct total | LOW | `reimbursementBatches` + `reimbursementBatchItems` tables. Batch total = sum of linked expenses. Cannot mix employees. |
| BCA transfer confirmation with reference | Indonesian BCA mobile banking is the standard SME payment method; admin transfers then records reference in system | LOW | Fields: `bankReference` (BCA transaction ID), `transferDate`, `bankAccountId` (source bank). BCA reference is paste-from-app workflow. |
| Batch void with reason and reversal | Failed bank transfers happen; admin must be able to undo a batch and re-queue the expenses | MEDIUM | Void generates reversing JE. Linked expenses return to AwaitingPayment status. Requires reason. Cannot void already-voided batch. |
| Batch history searchable by RMB code or BCA reference | Admin needs to find past batches for reconciliation or dispute resolution | LOW | Index on `by_batch_number`. Text search on `bankReference`. |

#### Payroll Tracking

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Simple payroll entry form (admin-only) | SME payroll is a lump-sum affair; admin pays production staff weekly and records the total amount | LOW | No per-employee salary tracking. Fields: employee type (contractor/staff), frequency (weekly/monthly), amount, period, optional attachment. |
| Auto-generated journal entry (DR 6100, CR 1100) | Payroll must appear in P&L under Salaries & Wages without manual journal posting | LOW | Same JE generation pattern as expense approval. Source: `payroll`. |
| Payroll void with reversing entry | Corrections happen (wrong amount, wrong period); void + new entry is the accounting-correct pattern | LOW | Void generates CR 6100, DR 1100 reversal. Admin creates new entry with correct amount. |

#### P&L Extension

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Operating Expenses section below Gross Profit | The entire purpose of this milestone is to extend P&L from Gross Profit to Net Income | MEDIUM | Aggregate `journalEntryLines` by `accountId` (6xxx accounts) + `entryDate` for selected period. Use `entryDate` (business date), NOT `_creationTime`. Established lesson from v1.5. |
| EBIT (Operating Profit) line with margin % | Standard financial metric managers expect to see | LOW | EBIT = Gross Profit - Total OpEx. EBIT Margin = EBIT / Net Revenue. |
| Other Income/Expense section (7xxx) | Interest income/expense and non-operating items complete the P&L | LOW | Same aggregation pattern as OpEx. Separate section per design spec. |
| Net Income line with margin % | The bottom line -- the number managers actually care about | LOW | Net Income = EBIT + Other Income - Other Expense. Net Margin = Net Income / Net Revenue. |
| Week-over-week comparison for new sections | Existing P&L already shows prior week deltas; new sections must follow the same pattern | LOW | Same delta calculation (amount change + percentage change) applied to OpEx and Net Income rows. |
| Confidence level: `exact` for all OpEx entries | All expense data comes from approved claims or admin payroll entries; no estimation needed | LOW | All OpEx journal entries have known, verified amounts. Mark as `exact` confidence. |

#### Audit Trail & History

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Immutable status history per expense | Every status transition must record who, when, and optional comment for audit purposes | LOW | `expenseStatusHistory` table. One row per transition. Follows existing order audit trail pattern (`orderStatusHistory`). |
| Full expense detail view with timeline | Clicking an expense shows its complete history: submission, approval/rejection, reimbursement, void | LOW | Timeline component reading from `expenseStatusHistory`. Similar to order detail page pattern. |

---

### Differentiators (Competitive Advantage)

Features that set this apart from Indonesian SMEs using spreadsheets, Mekari Expense, or WhatsApp-based approval. These are in the design spec and add genuine value for a 5-10 person food production team.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Duplicate detection (same employee + amount + date within 7 days) | Catches accidental double-submissions that spreadsheet tracking misses; saves approver time | LOW | Query `expenses` with `by_amount_date_submitter` index. Warning to submitter + flag for approver. Submission still allowed (soft warning). |
| Receipt hash deduplication (SHA-256) | Hard block against submitting the same receipt photo twice -- catches intentional fraud that visual review misses | MEDIUM | Client-side SHA-256 via Web Crypto API. `by_receipt_hash` index on `expenses`. Hard block with reference to existing expense. Cross-employee: same image from different employee still blocks. |
| Split detection (same employee + same GL + 48hrs + sum > Rp 500K) | Catches employees splitting a Rp 600K purchase into 3x Rp 200K to stay under manager approval threshold | MEDIUM | Should-have per design spec. Query recent expenses on submit. Alert badge on approver view. |
| Late submission flag (> 14 days) | Stale expenses are harder to verify and more likely to be fabricated; visual flag prompts approver scrutiny | LOW | Soft flag, not hard block. `lateSubmission: boolean` on expense record. 14-day inclusive threshold. |
| Unfamiliar vendor flag | New vendor names that have not appeared in the system in 90 days get flagged for approver attention | LOW | Query distinct `vendorName` values from recent expenses. "New vendor" badge on approver card. |
| Approver concentration alert | Same approver handling > 80% of one employee's expenses in 30 days suggests collusion risk | LOW | Analytics dashboard metric. Rolling 30-day window. Alert, not block. |
| Company card vs personal expense distinction | Company card expenses skip reimbursement entirely (DR OpEx, CR Cash instead of CR 2200); prevents incorrect reimbursement queue entries | LOW | `paymentMethod` field drives both JE generation and reimbursement routing. Design spec Section 4 details. |
| Bank account management for reimbursement sources | Track which company bank account paid which batch; essential for BCA reconciliation | LOW | `bankAccounts` table (name, bank, account number, isActive). Linked to batches. |
| Expense analytics dashboard with spend-by-category | Visual OpEx breakdown by GL category (bar/pie chart) and employee, with monthly trend -- turns raw expense data into strategic insights | MEDIUM | Recharts (already installed v3.7). 6-month trend line. Spend by category + employee views. Average approval time metric. |
| Employee bank details on user profile | Admins need bank account info for BCA transfers without asking each time; employees self-manage their details | LOW | Add `bankAccountNumber` + `bankName` to `users` table. Self-service edit by employee. |

---

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems for a 5-10 person SME food production team. The design spec explicitly defers or excludes several of these.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Multi-level approval chains (employee -> supervisor -> director -> CFO) | "Enterprise best practice" for large companies | A 5-10 person team has 1-2 managers and 1 admin. Multi-level chains add latency (days) without adding control. Over-complicated approval processes are the most common expense management anti-pattern for small teams. | Single-level DoA: managers approve up to Rp 500K, admin approves everything. Broadcast routing -- first eligible approver acts. |
| OCR receipt extraction (auto-read amount from photo) | Sounds futuristic and convenient | Adds significant implementation complexity (ML/cloud service dependency), Indonesian receipt formats vary wildly (thermal paper, handwritten, mixed Bahasa/English), accuracy below 90% creates more correction work than manual entry. | Manual amount entry. Design for OCR later (receipt images are stored, extraction can be added without schema changes). |
| Monthly budget caps per GL category | "Control spending before it happens" | Requires a budget input system that does not exist yet. Budget management without historical baseline data is guesswork. Implementing caps before the system has 3-6 months of real expense data leads to arbitrary limits that frustrate users. | Track actuals first. Add budget comparison in v1.8+ after 3 months of data establish reasonable baselines. Design spec Section 9 confirms: "Add `budgets` table -- compare against `journalEntryLines` aggregation." |
| Per-employee salary tracking in payroll | Seems like a natural extension of payroll entries | Frollie has 5-10 employees; individual salary data is highly sensitive and adds privacy/security complexity disproportionate to the value. Admin already knows individual amounts when entering payroll. | Lump-sum payroll entries per payment period. Admin enters total amount with description (e.g., "March 2026 -- Production Staff"). No individual salary records in the system. |
| Bank statement import / auto-reconciliation | "Automatically match expenses to bank transactions" | Requires BCA bank statement CSV parser, fuzzy matching logic, and handling of unmatched transactions. Massive scope for a team processing 10-20 expenses per week. Manual BCA reference paste is sufficient at this scale. | Admin pastes BCA transaction reference when confirming reimbursement batch. Design spec Section 9 lists this as "designed for, not built." |
| Multi-currency expense support | Team members may travel and incur foreign currency expenses | All Frollie operations are IDR-based. Travel abroad is rare enough to handle with manual IDR conversion at submission time. Adding currency + exchange rate fields to every expense is over-engineering. | Submit all expenses in IDR. If foreign currency was involved, convert to IDR before submitting and note original currency in description. |
| Recurring expense auto-creation | "Set up monthly rent/subscription once, auto-create each month" | Only 2-3 expenses are truly recurring (rent, subscriptions). Auto-creation without verification creates phantom entries. A monthly reminder is simpler and safer. | Manual creation each month. Could add recurrence in future if expense volume grows. Design spec Section 9 lists this as future extension. |
| Full general ledger / trial balance report | "Need complete accounting books" | Frollie is a production management system with accounting features, not an accounting system. Full GL requires chart of accounts maintenance, adjusting entries, period closing, and audit support that is better handled by Mekari Jurnal or similar dedicated accounting software. | P&L extension (Revenue through Net Income) covers the primary need. Balance Sheet and Cash Flow Statement are "designed for, not built" per design spec. Export data for accountant. |
| Expense categories as free-text (user-defined) | "Let users type whatever category they want" | Defeats the purpose of GL-based categorization. Free-text categories cannot be aggregated for analytics, create duplicates ("Transport" vs "Transportation" vs "Transportasi"), and make P&L reporting impossible. | Fixed dropdown of active accounts from `accounts` table. Admin can add new GL accounts if needed. Deactivate unused ones. |
| Mobile-specific expense app | "Employees need a native app to submit expenses on the go" | The existing web app is responsive (Tailwind CSS + mobile nav). Building a separate mobile app doubles maintenance surface for 5-10 users. | Responsive web design. Receipt photo upload works from mobile browser. PWA-like add-to-homescreen if needed. |
| Approval delegation (manager assigns backup approver when on leave) | Enterprise feature for large teams | With 1-2 managers and 1 admin in a team of 5-10, there is always at least one eligible approver available. Formal delegation adds UI complexity for a problem that does not exist at this scale. | Broadcast routing already handles this -- if the manager is unavailable, admin can approve. |
| Real-time spending alerts / push notifications | "Notify me when someone submits an expense" | Convex real-time queries already update the approval queue live. Push notifications require service worker setup, notification permissions, and add infrastructure complexity. At 10-20 expenses per week, checking the queue once or twice daily is sufficient. | Real-time Convex query updates on the Expense Manager page. Approval queue badge count in navigation. |

---

## Feature Dependencies

```
accounts:seedDefaults (CoA seeding)
    |-- required by --> Expense submission (accountId FK)
    |-- required by --> Journal entry lines (accountId FK)
    |-- required by --> P&L extension (account aggregation)

Expense submission + lifecycle
    |-- required by --> Approval workflow
    |-- required by --> Fraud detection (duplicate, hash, split)
    |-- required by --> Reimbursement batching

Approval workflow
    |-- required by --> Auto-generated journal entries (approval triggers JE)
    |-- required by --> Reimbursement queue (only approved expenses)

Auto-generated journal entries
    |-- required by --> P&L extension (OpEx from journalEntryLines)
    |-- required by --> Expense analytics (spend aggregation)

Reimbursement batching
    |-- requires --> Bank accounts table (source bank for transfers)
    |-- requires --> Employee bank details on users table

Payroll entries
    |-- requires --> accounts:seedDefaults (account 6100 exists)
    |-- required by --> P&L extension (payroll JE lines in OpEx)

P&L extension
    |-- requires --> All JE-generating features (expenses, payroll)
    |-- requires --> Existing income statement (v1.5) for Revenue + COGS sections
    |-- enhances --> Financial Statement page (/financials)

Expense analytics
    |-- requires --> Journal entry data (sufficient volume)
    |-- requires --> Recharts (already installed v3.7)
    |-- enhances --> Financial Statement page (links to drill-down)

Receipt upload
    |-- requires --> Convex file storage (already exists)
    |-- enhances --> Expense submission (required for > Rp 50K)

Employee bank details (users table)
    |-- enhances --> Reimbursement batching (shows bank info in queue)
```

### Dependency Notes

- **CoA seeding MUST happen before any other feature can work:** Every expense, journal entry, and P&L query references `accountId`. Without seeded accounts, nothing functions. This is Phase 1.
- **Expense submission before approval:** Obvious but critical -- the approval queue has nothing to show until expenses exist.
- **Approval before reimbursement:** Only approved expenses can be batched. The reimbursement page is empty without approved claims.
- **Journal entries before P&L extension:** The P&L OpEx section reads from `journalEntryLines`. Without journal entries, OpEx shows Rp 0. Build JE generation with expense approval, then extend P&L.
- **Payroll entries are independent of expense workflow:** Payroll does not go through approval. It can be built in parallel with expense approval as long as CoA exists.
- **Analytics requires data volume:** Building the analytics dashboard before there is real expense data produces empty charts. Build last or alongside P&L extension.

---

## MVP Definition

### Launch With (v1.7 core)

- [x] Chart of Accounts with seed data (36 accounts, PSAK-aligned)
- [x] Expense submission form with receipt upload
- [x] Receipt requirement enforcement (> Rp 50K)
- [x] Draft save before submitting
- [x] Expense number generation (EXP-MMDD-NNN)
- [x] 7-status lifecycle (Draft -> Submitted -> Approved -> AwaitingPayment -> Reimbursed, plus Rejected and Voided)
- [x] My Expenses list with status filters
- [x] Approval queue with DoA (Rp 500K threshold)
- [x] Self-approval block (backend enforced)
- [x] Broadcast routing (first-to-act wins)
- [x] Rejection with reason + resubmission chain
- [x] Concurrency guard on approval
- [x] Auto-generated journal entries (approval, reimbursement, void, payroll)
- [x] Debit = Credit validation on all JEs
- [x] Journal entry immutability
- [x] Reimbursement batching by employee
- [x] BCA transfer confirmation with reference
- [x] Batch void with reversing JE
- [x] Payroll entry form (admin-only) with auto JE
- [x] P&L extension: OpEx breakdown, EBIT, Other Income/Expense, Net Income
- [x] Immutable audit trail (expenseStatusHistory)
- [x] Employee bank details on user profile
- [x] Bank accounts table for reimbursement sources
- [x] Duplicate detection (same employee + amount + date, 7 days)
- [x] Receipt hash deduplication (SHA-256 hard block)
- [x] Late submission flag (> 14 days)

### Add After Validation (v1.7.x)

- [ ] Split detection (same employee + GL + 48hrs + sum > Rp 500K) -- add after base approval works
- [ ] Approver concentration alert (80% rolling 30 days) -- add after sufficient approval data
- [ ] Unfamiliar vendor flag (90-day lookback) -- add after vendor name data accumulates
- [ ] Expense analytics dashboard (spend by category, employee, trend) -- add after 2-4 weeks of data
- [ ] Average approval time metric -- add after approval workflow is stable
- [ ] Budget vs Actual placeholder in analytics -- display "Coming in v1.8" placeholder

### Future Consideration (v1.8+)

- [ ] Monthly budget caps per GL category -- after 3-6 months of actuals data establishes baselines
- [ ] Balance Sheet view (1xxx-3xxx accounts) -- data model already supports it
- [ ] Cash Flow Statement (account 1100 entries) -- data model already supports it
- [ ] OCR receipt extraction -- receipt images already stored; add ML extraction step
- [ ] Bank statement import + reconciliation -- BCA CSV parser + fuzzy matching
- [ ] Recurring expense auto-creation -- for subscriptions and rent
- [ ] Multi-currency support -- if international travel increases
- [ ] Monthly/quarterly P&L period switching -- currently weekly only

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Chart of Accounts seeding | HIGH -- prerequisite for everything | LOW | P1 |
| Expense submission form + receipt upload | HIGH -- core user workflow | MEDIUM | P1 |
| Approval workflow with DoA | HIGH -- core governance | MEDIUM | P1 |
| Auto-generated journal entries | HIGH -- accounting backbone | MEDIUM | P1 |
| Reimbursement batching + BCA confirmation | HIGH -- employees need to be paid | MEDIUM | P1 |
| P&L extension (OpEx -> Net Income) | HIGH -- the business outcome | MEDIUM | P1 |
| Payroll entry with auto JE | HIGH -- salary is largest OpEx | LOW | P1 |
| Expense status lifecycle + audit trail | HIGH -- governance requirement | LOW | P1 |
| Duplicate detection (soft warning) | MEDIUM -- fraud prevention | LOW | P1 |
| Receipt hash dedup (hard block) | MEDIUM -- fraud prevention | MEDIUM | P1 |
| Late submission flag | MEDIUM -- approver awareness | LOW | P1 |
| Employee bank details on profile | MEDIUM -- reimbursement prerequisite | LOW | P1 |
| Bank accounts management | MEDIUM -- reimbursement prerequisite | LOW | P1 |
| Company card payment path | MEDIUM -- alternative to reimbursement | LOW | P1 |
| Split detection | MEDIUM -- advanced fraud flag | MEDIUM | P2 |
| Unfamiliar vendor flag | LOW -- nice approver hint | LOW | P2 |
| Approver concentration alert | LOW -- analytics insight | LOW | P2 |
| Expense analytics dashboard | MEDIUM -- strategic visibility | MEDIUM | P2 |
| Budget vs Actual comparison | LOW -- needs baseline data first | MEDIUM | P3 |
| Balance Sheet / Cash Flow views | LOW -- accountant export sufficient | HIGH | P3 |
| OCR receipt extraction | LOW -- manual entry is fast enough | HIGH | P3 |

---

## Competitor Feature Analysis

This is an internal tool for a 5-10 person team. "Competitors" are the alternatives Frollie would use if not building this: spreadsheets, Mekari Expense, or WhatsApp-based approval.

| Feature | Excel/WhatsApp (current) | Mekari Expense | Our System (v1.7) |
|---------|-------------------------|----------------|-------------------|
| Expense submission | WhatsApp photo + manual spreadsheet entry | Mobile app + web form | Web form with receipt upload |
| Approval workflow | WhatsApp message "approved" | Configurable multi-level | Single-level DoA (Rp 500K threshold) |
| Receipt storage | WhatsApp chat history (easily lost) | Cloud storage with OCR | Convex `_storage` with SHA-256 dedup |
| Reimbursement tracking | Manual bank transfer + spreadsheet | Bank integration | BCA reference tracking with batch grouping |
| P&L integration | Separate spreadsheet entirely | Mekari Jurnal integration (separate product) | Same page, same system, real-time |
| Fraud detection | None | Policy engine + AI scanning | Duplicate detection + hash dedup + split detection + late flags |
| Payroll | Separate spreadsheet | Mekari Talenta (separate product) | Simple lump-sum entry with auto JE |
| COGS integration | None | None | Full BOM COGS + OpEx in same P&L |
| Cost per product | Not possible | Not possible | Revenue - COGS - allocated OpEx (future) |
| Monthly cost | Rp 0 (spreadsheet) | ~Rp 200K-2M/month per user | Rp 0 (built into existing Convex deployment) |

**Key advantage over Mekari Expense:** Unified production + financial view. Mekari Expense tracks spending but knows nothing about production volume, COGS per product, or revenue per channel. Our system shows "we spent Rp 15M on OpEx but made Rp 80M gross profit and our EBIT margin is 18%" in one view. No spreadsheet cross-referencing needed.

**Key advantage over spreadsheets:** Audit trail, receipt permanence, fraud detection, and real-time P&L that updates when expenses are approved. Spreadsheets cannot enforce self-approval blocks or detect duplicate receipts.

---

## Design Spec Validation

The design spec (2026-03-12) is comprehensive and well-structured. Validation findings:

### Completeness: GOOD

The spec covers all table stakes features identified in this research. No major gaps found.

### Potential Gaps Identified

| Gap | Severity | Recommendation |
|-----|----------|----------------|
| No mention of expense editing before submission | LOW | Drafts should be fully editable. Confirm `updateDraft` mutation exists in implementation plan. |
| No mention of expense list pagination | LOW | With 10-20 expenses per week, pagination may not be needed initially. But after 6 months = 400+ expenses. Add cursor pagination from the start following existing `orders` query pattern. |
| Counters table concurrency under load | LOW | Convex mutation serialization handles this. But if two expenses are submitted in the same second, the second mutation retries. This is fine for 5-10 users. |
| No mention of expense attachment for non-receipt files | LOW | Some expenses may have supporting documents (contracts, quotes). The current design only supports receipt images. Could add `attachmentFileId` in v1.7.x if needed. |
| Payroll period overlap detection | LOW | Nothing prevents creating two payroll entries for the same period. Add validation: warn if period overlaps existing entry for same employee type. |

### Over-Engineering Risk: LOW

The design spec stays appropriately scoped. The "designed for, not built" section (Balance Sheet, Cash Flow, OCR, Bank Import) correctly defers complex features while ensuring the data model supports them. The 10 new tables are justified and well-normalized.

### Indonesian Context Validation

| Aspect | Design Spec Coverage | Assessment |
|--------|---------------------|------------|
| PSAK EMKM compliance | CoA follows PSAK numbering (1xxx-7xxx) | GOOD -- PSAK EMKM is the correct tier for SME/UMKM entities. Full PSAK (SAK) would be over-compliance for a company this size. |
| BCA transfer workflow | BCA reference + transfer date fields; manual confirmation | GOOD -- matches real BCA mobile banking workflow. Admin transfers via BCA app, then records reference in system. |
| IDR currency (no decimals) | Amount fields are `number` type | GOOD -- IDR has no decimal places. All amounts are whole numbers. |
| Receipt culture | Receipt required > Rp 50K, optional below | GOOD -- Indonesian small purchases often have no receipt (warung, ojek). Threshold is pragmatic. |
| Tax compliance | Account 2400 Tax Payable exists in CoA | GOOD -- designed for, not built. Tax calculation is accountant's domain. |

---

## Sources

- Design spec: `docs/superpowers/specs/2026-03-12-expense-accounting-system-design.md` (HIGH confidence -- primary reference)
- [Mekari Expense](https://expense.mekari.com/en/) -- Indonesian market leader for expense management (competitor analysis)
- [Mekari Jurnal](https://www.jurnal.id/en/features/) -- Indonesian accounting software features (competitor analysis)
- [PSAK Financial Reporting Standards](https://indonesia.acclime.com/guides/psak-financial-reporting-standards/) -- Indonesian accounting standards tiers (MEDIUM confidence)
- [SAK Indonesia Overview (KPMG)](https://assets.kpmg.com/content/dam/kpmg/id/pdf/2025/01/id-sak-indonesia-an-overview.pdf) -- PSAK EMKM for UMKM entities (MEDIUM confidence)
- [BCA myBCA Bisnis](https://www.bca.co.id/en/bisnis/layanan/e-banking-bisnis/mybca-bisnis) -- BCA business banking workflow (HIGH confidence)
- [Expense Approval Best Practices](https://www.apps365.com/blog/expense-approval-process/) -- Approval workflow design patterns
- [Expense Fraud Prevention (Ramp)](https://ramp.com/blog/what-is-expense-fraud) -- Fraud detection patterns
- [Expense Fraud Detection (Coupa)](https://www.coupa.com/blog/expense-fraud/) -- Split expense and duplicate detection
- [Expense Fraud Prevention (Expensify)](https://use.expensify.com/blog/preventing-expense-fraud) -- Surprise audit effectiveness
- [Food Manufacturing Operating Costs](https://businessplan-templates.com/blogs/running-costs/food-manufacturing) -- Typical FMCG expense categories
- [NetSuite Expense Management Guide](https://www.netsuite.com/portal/resource/articles/financial-management/expense-management-guide.shtml) -- Industry-standard workflow components
- [NetSuite Expense Management Workflows](https://www.netsuite.com/portal/resource/articles/financial-management/expense-management-workflow.shtml) -- Automation patterns
- [Expense Management Mistakes (TrackOlap)](https://trackolap.com/blog/common-expense-management-mistakes-businesses-must-avoid) -- Common SME pitfalls
- [Best Expense Management Software 2026 (G2)](https://www.g2.com/categories/expense-management/small-business) -- Market landscape

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Table stakes features | HIGH | Well-established domain; design spec is thorough; validated against industry patterns |
| Approval workflow design | HIGH | Single-level DoA is correct for team size; broadcast routing matches Convex real-time strengths |
| Fraud controls | HIGH | Duplicate detection, receipt hash, split detection are industry-standard patterns documented by Ramp, Coupa, Expensify |
| PSAK compliance | MEDIUM | PSAK EMKM tier confirmed as correct for UMKM; specific account numbering conventions may vary by auditor |
| BCA transfer workflow | HIGH | Manual transfer + reference paste is the standard Indonesian SME pattern; BCA is dominant business bank |
| Anti-feature classification | HIGH | Over-engineering risks clearly identified; design spec correctly defers complex features |
| P&L integration | HIGH | Extension of existing v1.5 income statement; `journalEntryLines` aggregation is standard pattern |
| Analytics dashboard | MEDIUM | Features are standard but optimal visualization choices depend on actual data patterns (unknown until live) |

---

*Feature research for: Frollie Recipe Master v1.7 -- Expense & Accounting*
*Researched: 2026-03-12*
*Previous v1.4 research (Sales & Channel Integration, 2026-02-25) archived -- no features carried forward.*
