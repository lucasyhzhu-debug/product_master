# Manual Journal Entry Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a template-based manual journal entry page with 6 pre-wired transaction types, inline accordion forms, and a period-filtered recent entries table.

**Architecture:** Backend mutation resolves template type → account codes → account IDs, then delegates to the existing journal engine. Frontend is a single page with card picker, inline form, and period-filtered table. Hub navigation splits into Financials + Accounting sections.

**Tech Stack:** Convex (protectedMutation/query), React 19, TypeScript, shadcn/ui, Tailwind CSS, Lucide icons, Sonner toasts

**Spec:** `docs/superpowers/specs/2026-03-16-manual-journal-entry-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `convex/schema.ts` | Add `templateType` to journalEntries metadata |
| Modify | `convex/lib/journalEngine.ts` | Add `templateType` to CreateJournalEntryParams metadata type |
| Create | `convex/manualJournal/mutations.ts` | `create` mutation — template → JE creation |
| Create | `convex/manualJournal/queries.ts` | `listByPeriod` query — manual JEs with joins |
| Create | `convex/manualJournal/__tests__/mutations.test.ts` | Unit tests for template validation |
| Create | `src/hooks/convex/useManualJournal.ts` | Query + mutation hooks |
| Modify | `src/hooks/convex/index.ts` | Barrel export for new hooks |
| Create | `src/pages/ManualJournalEntry.tsx` | Page component (cards + form + table) |
| Modify | `src/App.tsx` | Add `/journal` route |
| Modify | `src/pages/HubPage.tsx` | Split Financials → Financials + Accounting |

---

## Chunk 1: Backend (Schema + Mutation + Query + Tests)

### Task 1: Schema & Journal Engine Type Update

**Files:**
- Modify: `convex/schema.ts` (journalEntries metadata object ~line 1750)
- Modify: `convex/lib/journalEngine.ts` (CreateJournalEntryParams ~line 55)

- [ ] **Step 1: Add `templateType` to schema metadata**

In `convex/schema.ts`, find the `journalEntries` table's `metadata` field and add `templateType`:

```typescript
metadata: v.optional(v.object({
  receiptUrl: v.optional(v.string()),
  templateType: v.optional(v.string()),
})),
```

- [ ] **Step 2: Update `CreateJournalEntryParams` metadata type**

In `convex/lib/journalEngine.ts`, update the `metadata` field on `CreateJournalEntryParams`:

```typescript
metadata?: { receiptUrl?: string; templateType?: string };
```

- [ ] **Step 3: Verify type-check passes**

Run: `npm run type-check`
Expected: PASS (no new errors — field is optional, backward compatible)

- [ ] **Step 4: Commit**

```bash
git add convex/schema.ts convex/lib/journalEngine.ts
git commit -m "feat(journal): add templateType to journalEntries metadata schema"
```

---

### Task 2: Create Mutation — `convex/manualJournal/mutations.ts`

**Files:**
- Create: `convex/manualJournal/mutations.ts`

- [ ] **Step 1: Write the mutation**

```typescript
/**
 * Manual Journal Entry mutations.
 *
 * Template-based JE creation for balance sheet transactions.
 * Each template maps to a pre-wired debit/credit account pair.
 * All JE creation goes through createJournalEntryWithLines (JE-06).
 */

import { v } from "convex/values";
import { protectedMutation } from "../lib/functions";
import { createJournalEntryWithLines } from "../lib/journalEngine";

// ---------------------------------------------------------------------------
// Template definitions — account code mappings
// ---------------------------------------------------------------------------

/** Valid template types for manual journal entries */
export const TEMPLATE_TYPES = [
  "equipment_purchase",
  "loan_repayment",
  "dividend_payment",
  "capital_injection",
  "receive_loan",
  "tax_payment",
] as const;

export type TemplateType = (typeof TEMPLATE_TYPES)[number];

/** Template → debit/credit account code mapping */
export const TEMPLATES: Record<TemplateType, { debit: string; credit: string; label: string }> = {
  equipment_purchase: { debit: "1500", credit: "1100", label: "Equipment Purchase" },
  loan_repayment:     { debit: "2500", credit: "1100", label: "Loan Repayment" },
  dividend_payment:   { debit: "3200", credit: "1100", label: "Dividend Payment" },
  capital_injection:  { debit: "1100", credit: "3100", label: "Capital Injection" },
  receive_loan:       { debit: "1100", credit: "2500", label: "Receive a Loan" },
  tax_payment:        { debit: "2400", credit: "1100", label: "Tax Payment" },
};

// ---------------------------------------------------------------------------
// Pure validation (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Validate template type is one of the 6 valid types.
 * @throws Error if invalid
 */
export function validateTemplateType(templateType: string): asserts templateType is TemplateType {
  if (!TEMPLATE_TYPES.includes(templateType as TemplateType)) {
    throw new Error(
      `Invalid template type "${templateType}". Valid types: ${TEMPLATE_TYPES.join(", ")}`
    );
  }
}

// ---------------------------------------------------------------------------
// Mutation
// ---------------------------------------------------------------------------

/**
 * Create a manual journal entry from a template.
 *
 * Resolves template → account codes → account IDs, then delegates to
 * createJournalEntryWithLines with sourceType "manual".
 */
export const create = protectedMutation({
  roles: ["manager", "admin"],
  args: {
    templateType: v.string(),
    date: v.number(),
    amount: v.number(),
    description: v.string(),
  },
  handler: async (ctx, args) => {
    // Validate template type
    validateTemplateType(args.templateType);

    // Validate amount
    if (args.amount <= 0) {
      throw new Error("Amount must be positive");
    }
    if (!Number.isInteger(args.amount)) {
      throw new Error("Amount must be a whole number (IDR)");
    }

    // Validate description
    if (!args.description.trim()) {
      throw new Error("Description is required");
    }

    // Resolve template to account codes
    const template = TEMPLATES[args.templateType];

    // Look up debit account by code
    const debitAccount = await ctx.db
      .query("accounts")
      .withIndex("by_code", (q) => q.eq("code", template.debit))
      .first();
    if (!debitAccount) {
      throw new Error(`System account ${template.debit} not found. Run accounts:seedDefaults.`);
    }

    // Look up credit account by code
    const creditAccount = await ctx.db
      .query("accounts")
      .withIndex("by_code", (q) => q.eq("code", template.credit))
      .first();
    if (!creditAccount) {
      throw new Error(`System account ${template.credit} not found. Run accounts:seedDefaults.`);
    }

    // Create journal entry via engine (JE-06)
    return await createJournalEntryWithLines(ctx, {
      date: args.date,
      description: args.description.trim(),
      sourceType: "manual",
      createdBy: ctx.user._id,
      metadata: { templateType: args.templateType },
      lines: [
        { accountId: debitAccount._id, debitAmount: args.amount, creditAmount: 0 },
        { accountId: creditAccount._id, debitAmount: 0, creditAmount: args.amount },
      ],
    });
  },
});
```

- [ ] **Step 2: Verify type-check passes**

Run: `npm run type-check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add convex/manualJournal/mutations.ts
git commit -m "feat(journal): add manual journal entry create mutation with 6 templates"
```

---

### Task 3: Unit Tests for Mutation Validation

**Files:**
- Create: `convex/manualJournal/__tests__/mutations.test.ts`

- [ ] **Step 1: Write validation tests**

```typescript
import { describe, it, expect } from "vitest";
import { validateTemplateType, TEMPLATES, TEMPLATE_TYPES } from "../mutations";

describe("validateTemplateType", () => {
  it("accepts all 6 valid template types", () => {
    for (const type of TEMPLATE_TYPES) {
      expect(() => validateTemplateType(type)).not.toThrow();
    }
  });

  it("rejects invalid template type", () => {
    expect(() => validateTemplateType("bogus")).toThrow('Invalid template type "bogus"');
  });

  it("rejects empty string", () => {
    expect(() => validateTemplateType("")).toThrow("Invalid template type");
  });
});

describe("TEMPLATES", () => {
  it("has exactly 6 templates", () => {
    expect(Object.keys(TEMPLATES)).toHaveLength(6);
  });

  it("every template has debit, credit, and label", () => {
    for (const [key, template] of Object.entries(TEMPLATES)) {
      expect(template.debit).toMatch(/^\d{4}$/);
      expect(template.credit).toMatch(/^\d{4}$/);
      expect(template.label).toBeTruthy();
    }
  });

  it("all templates involve account 1100 (Cash)", () => {
    for (const template of Object.values(TEMPLATES)) {
      const accounts = [template.debit, template.credit];
      expect(accounts).toContain("1100");
    }
  });

  it("equipment_purchase debits 1500 Fixed Assets", () => {
    expect(TEMPLATES.equipment_purchase).toEqual({
      debit: "1500", credit: "1100", label: "Equipment Purchase",
    });
  });

  it("dividend_payment debits 3200 Retained Earnings (PT, not Owner's Capital)", () => {
    expect(TEMPLATES.dividend_payment.debit).toBe("3200");
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npm run test -- convex/manualJournal/__tests__/mutations.test.ts`
Expected: All PASS

- [ ] **Step 3: Commit**

```bash
git add convex/manualJournal/__tests__/mutations.test.ts
git commit -m "test(journal): add unit tests for template validation and mapping"
```

---

### Task 4: Create Query — `convex/manualJournal/queries.ts`

**Files:**
- Create: `convex/manualJournal/queries.ts`

- [ ] **Step 1: Write the query**

```typescript
/**
 * Manual Journal Entry queries.
 *
 * Lists manual JEs (with templateType metadata) for a given period.
 * Excludes historical CSV imports which also use sourceType "manual"
 * but lack metadata.templateType.
 */

import { v } from "convex/values";
import { query } from "../_generated/server";

/**
 * List manual journal entries for a period.
 *
 * Uses by_source index to fetch sourceType === "manual", then post-filters
 * by date range and metadata.templateType presence. Joins with
 * journalEntryLines and accounts for display data.
 *
 * Returns entries sorted by date descending.
 */
export const listByPeriod = query({
  args: {
    periodStart: v.number(),
    periodEnd: v.number(),
  },
  handler: async (ctx, args) => {
    // Fetch all manual journal entries (prefix scan on sourceType)
    const allManual = await ctx.db
      .query("journalEntries")
      .withIndex("by_source", (q) => q.eq("sourceType", "manual"))
      .collect();

    // Filter to period and templateType presence
    const entries = allManual.filter(
      (e) =>
        e.date >= args.periodStart &&
        e.date < args.periodEnd &&
        e.metadata?.templateType != null
    );

    // Sort by date descending (newest first)
    entries.sort((a, b) => b.date - a.date);

    // Join with lines and accounts for display
    const results = await Promise.all(
      entries.map(async (entry) => {
        const lines = await ctx.db
          .query("journalEntryLines")
          .withIndex("by_journal_entry", (q) =>
            q.eq("journalEntryId", entry._id)
          )
          .collect();

        // Resolve account names for each line
        const linesWithAccounts = await Promise.all(
          lines.map(async (line) => {
            const account = await ctx.db.get(line.accountId);
            return {
              accountId: line.accountId,
              accountCode: account?.code ?? "????",
              accountName: account?.name ?? "Unknown",
              debitAmount: line.debitAmount,
              creditAmount: line.creditAmount,
            };
          })
        );

        return {
          _id: entry._id,
          entryNumber: entry.entryNumber,
          date: entry.date,
          description: entry.description,
          templateType: entry.metadata?.templateType ?? null,
          isReversed: entry.isReversed,
          createdAt: entry.createdAt,
          lines: linesWithAccounts,
          // Convenience: total amount is the sum of debits (== sum of credits)
          amount: linesWithAccounts.reduce((sum, l) => sum + l.debitAmount, 0),
        };
      })
    );

    return results;
  },
});
```

- [ ] **Step 2: Verify type-check passes**

Run: `npm run type-check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add convex/manualJournal/queries.ts
git commit -m "feat(journal): add listByPeriod query for manual journal entries"
```

---

## Chunk 2: Frontend (Hooks + Page + Routing + Hub)

### Task 5: Create Frontend Hooks — `src/hooks/convex/useManualJournal.ts`

**Files:**
- Create: `src/hooks/convex/useManualJournal.ts`
- Modify: `src/hooks/convex/index.ts`

- [ ] **Step 1: Write the hooks file**

```typescript
/**
 * Manual Journal Entry hooks.
 * Query + mutation hooks for the Manual Journal Entry page.
 */
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { createMutationHook } from "./createMutationHook";

// ============================================================================
// QUERY HOOKS
// ============================================================================

/** List manual journal entries for a period (with line + account joins) */
export function useManualJournalEntries(periodStart: number, periodEnd: number) {
  return useQuery(api.manualJournal.queries.listByPeriod, {
    periodStart,
    periodEnd,
  });
}

// ============================================================================
// MUTATION HOOKS
// ============================================================================

/** Create a manual journal entry from a template */
export const useCreateManualJournalEntry = createMutationHook(
  api.manualJournal.mutations.create,
  {
    successMessage: "Journal entry created",
    errorMessage: "Failed to create journal entry",
  }
);
```

- [ ] **Step 2: Add barrel export to `src/hooks/convex/index.ts`**

Add at the end of the file, before the closing exports:

```typescript
// Manual Journal Entry (Manual JE Page)
export {
  useManualJournalEntries,
  useCreateManualJournalEntry,
} from "./useManualJournal";
```

- [ ] **Step 3: Verify type-check passes**

Run: `npm run type-check`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/hooks/convex/useManualJournal.ts src/hooks/convex/index.ts
git commit -m "feat(journal): add useManualJournal hooks with barrel export"
```

---

### Task 6: Create Page Component — `src/pages/ManualJournalEntry.tsx`

**Files:**
- Create: `src/pages/ManualJournalEntry.tsx`

This is the largest task. The page has 3 sections: template cards, inline form, recent entries table.

- [ ] **Step 1: Write the page component**

```typescript
/**
 * ManualJournalEntry — Template-based JE creation with recent entries.
 *
 * Layout:
 * 1. PageHeader
 * 2. Template cards (6 cards, 3x2 grid)
 * 3. Inline accordion form (expands below selected card)
 * 4. Recent entries table with Monthly/Custom period filter
 */

import { useState, useMemo, useCallback } from "react";
import { Wrench, Coins, Users, Building, Landmark, FileCheck, ChevronLeft, ChevronRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency, cn } from "@/lib/utils";
import { utcToWibDateStr, wibDateStrToUtcMs } from "@/lib/dateUtils";
import {
  computePeriodRange,
  getCurrentWibMonth,
  prevMonth,
  nextMonth,
  isCurrentOrFutureMonth,
  type ExpensePeriodMode,
} from "@/lib/expenseAnalyticsPeriod";
import { useManualJournalEntries, useCreateManualJournalEntry } from "@/hooks/convex/useManualJournal";

// ---------------------------------------------------------------------------
// Template card definitions
// ---------------------------------------------------------------------------

interface TemplateCard {
  type: string;
  label: string;
  description: string;
  icon: LucideIcon;
  debitLabel: string;
  creditLabel: string;
  badgeColor: string;
}

const TEMPLATE_CARDS: TemplateCard[] = [
  {
    type: "equipment_purchase",
    label: "Equipment Purchase",
    description: "Buy assets (oven, machine)",
    icon: Wrench,
    debitLabel: "1500 Fixed Assets",
    creditLabel: "1100 Cash",
    badgeColor: "bg-blue-500/20 text-blue-400",
  },
  {
    type: "loan_repayment",
    label: "Loan Repayment",
    description: "Pay back founder/bank loan",
    icon: Coins,
    debitLabel: "2500 Loans Payable",
    creditLabel: "1100 Cash",
    badgeColor: "bg-green-500/20 text-green-400",
  },
  {
    type: "dividend_payment",
    label: "Dividend Payment",
    description: "Distribute profits to shareholders",
    icon: Users,
    debitLabel: "3200 Retained Earnings",
    creditLabel: "1100 Cash",
    badgeColor: "bg-yellow-500/20 text-yellow-400",
  },
  {
    type: "capital_injection",
    label: "Capital Injection",
    description: "Shareholder adds capital",
    icon: Building,
    debitLabel: "1100 Cash",
    creditLabel: "3100 Owner's Capital",
    badgeColor: "bg-purple-500/20 text-purple-400",
  },
  {
    type: "receive_loan",
    label: "Receive a Loan",
    description: "New loan from bank/founder",
    icon: Landmark,
    debitLabel: "1100 Cash",
    creditLabel: "2500 Loans Payable",
    badgeColor: "bg-violet-500/20 text-violet-400",
  },
  {
    type: "tax_payment",
    label: "Tax Payment",
    description: "Pay monthly tax obligation",
    icon: FileCheck,
    debitLabel: "2400 Tax Payable",
    creditLabel: "1100 Cash",
    badgeColor: "bg-pink-500/20 text-pink-400",
  },
];

const BADGE_MAP: Record<string, string> = Object.fromEntries(
  TEMPLATE_CARDS.map((c) => [c.type, c.badgeColor])
);

const LABEL_MAP: Record<string, string> = Object.fromEntries(
  TEMPLATE_CARDS.map((c) => [c.type, c.label])
);

// Month names for period display
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function getDefaultDate(): string {
  const now = new Date();
  const wibOffset = 7 * 60 * 60 * 1000;
  const wib = new Date(now.getTime() + wibOffset);
  return wib.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ManualJournalEntry() {
  useDocumentTitle("Manual Journal Entry");

  // Template selection state
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  // Form state
  const [formDate, setFormDate] = useState(getDefaultDate);
  const [formAmount, setFormAmount] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Period state (matches ExpenseAnalytics pattern)
  const [periodMode, setPeriodMode] = useState<ExpensePeriodMode>("month");
  const initMonth = useMemo(() => getCurrentWibMonth(), []);
  const [monthYear, setMonthYear] = useState(initMonth.year);
  const [monthIndex, setMonthIndex] = useState(initMonth.month);
  const [customStart, setCustomStart] = useState<number>(
    wibDateStrToUtcMs(`${initMonth.year}-${String(initMonth.month + 1).padStart(2, "0")}-01`)
  );
  const [customEnd, setCustomEnd] = useState<number>(
    wibDateStrToUtcMs(
      `${initMonth.month === 11 ? initMonth.year + 1 : initMonth.year}-${String(((initMonth.month + 1) % 12) + 1).padStart(2, "0")}-01`
    )
  );

  const { periodStart, periodEnd } = useMemo(
    () => computePeriodRange(periodMode, monthYear, monthIndex, customStart, customEnd),
    [periodMode, monthYear, monthIndex, customStart, customEnd]
  );

  // Data hooks
  const entries = useManualJournalEntries(periodStart, periodEnd);
  const { mutate: createEntry } = useCreateManualJournalEntry();

  // Month navigation
  const isCurrentMonth = isCurrentOrFutureMonth(monthYear, monthIndex);
  const monthLabel = `${MONTH_NAMES[monthIndex]} ${monthYear}`;

  const goToPreviousMonth = useCallback(() => {
    const prev = prevMonth(monthYear, monthIndex);
    setMonthYear(prev.year);
    setMonthIndex(prev.month);
  }, [monthYear, monthIndex]);

  const goToNextMonth = useCallback(() => {
    const next = nextMonth(monthYear, monthIndex);
    setMonthYear(next.year);
    setMonthIndex(next.month);
  }, [monthYear, monthIndex]);

  const goToCurrentMonth = useCallback(() => {
    const current = getCurrentWibMonth();
    setMonthYear(current.year);
    setMonthIndex(current.month);
  }, []);

  // Form handlers
  const resetForm = useCallback(() => {
    setFormDate(getDefaultDate());
    setFormAmount("");
    setFormDescription("");
    setSelectedTemplate(null);
  }, []);

  const handleCardClick = useCallback((type: string) => {
    if (selectedTemplate === type) {
      setSelectedTemplate(null);
    } else {
      setSelectedTemplate(type);
      setFormDate(getDefaultDate());
      setFormAmount("");
      setFormDescription("");
    }
  }, [selectedTemplate]);

  const handleSubmit = useCallback(async () => {
    if (!selectedTemplate || !formAmount || !formDescription.trim()) return;

    const amount = Number(formAmount);
    if (amount <= 0 || !Number.isInteger(amount)) return;

    setIsSubmitting(true);
    try {
      await createEntry({
        templateType: selectedTemplate,
        date: wibDateStrToUtcMs(formDate),
        amount,
        description: formDescription.trim(),
      });
      resetForm();
    } catch {
      // Toast handled by createMutationHook
    } finally {
      setIsSubmitting(false);
    }
  }, [selectedTemplate, formAmount, formDescription, formDate, createEntry, resetForm]);

  const selectedCard = TEMPLATE_CARDS.find((c) => c.type === selectedTemplate);

  // Form validation
  const formError = useMemo(() => {
    if (!formDescription.trim()) return "Description is required";
    if (!formAmount) return "Amount is required";
    const amt = Number(formAmount);
    if (amt <= 0) return "Amount must be positive";
    if (!Number.isInteger(amt)) return "Amount must be a whole number (IDR)";
    return null;
  }, [formAmount, formDescription]);

  return (
    <div>
      <PageHeader
        title="Manual Journal Entry"
        description="Record balance sheet transactions using pre-configured templates"
      />

      {/* Template Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        {TEMPLATE_CARDS.map((card) => {
          const Icon = card.icon;
          const isSelected = selectedTemplate === card.type;
          return (
            <Card
              key={card.type}
              className={cn(
                "cursor-pointer transition-all hover:border-primary/50",
                isSelected && "border-primary ring-1 ring-primary"
              )}
              onClick={() => handleCardClick(card.type)}
            >
              <CardContent className="flex items-center gap-3 p-4">
                <div className={cn(
                  "flex items-center justify-center w-10 h-10 rounded-lg",
                  isSelected ? "bg-primary/20" : "bg-muted"
                )}>
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-medium text-sm">{card.label}</p>
                  <p className="text-xs text-muted-foreground">{card.description}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Inline Form (Accordion) */}
      {selectedCard && (
        <Card className="mb-6">
          <CardContent className="p-4 space-y-4">
            {/* Accounting preview */}
            <div className="text-sm text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
              DR {selectedCard.debitLabel} / CR {selectedCard.creditLabel}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="je-date">Date</Label>
                <Input
                  id="je-date"
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="je-amount">Amount (IDR)</Label>
                <Input
                  id="je-amount"
                  type="number"
                  min="1"
                  step="1"
                  placeholder="e.g. 4500000"
                  value={formAmount}
                  onChange={(e) => setFormAmount(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="je-desc">Description</Label>
                <Input
                  id="je-desc"
                  type="text"
                  placeholder="e.g. New packaging machine"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting || !!formError}
              >
                {isSubmitting ? "Saving..." : "Save Entry"}
              </Button>
              <Button
                variant="outline"
                onClick={resetForm}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              {formError && (
                <span className="text-xs text-muted-foreground">{formError}</span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Entries */}
      <div className="space-y-4">
        {/* Period controls */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-sm">Recent Entries</span>

          {/* Mode toggle */}
          <div className="flex items-center gap-1">
            {(["month", "custom"] as const).map((mode) => (
              <Badge
                key={mode}
                variant={periodMode === mode ? "default" : "outline"}
                className="cursor-pointer text-xs capitalize"
                onClick={() => setPeriodMode(mode)}
              >
                {mode === "month" ? "Monthly" : "Custom Range"}
              </Badge>
            ))}
          </div>

          {/* Month navigation */}
          {periodMode === "month" && (
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-7 w-7" onClick={goToPreviousMonth}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium min-w-[130px] text-center">{monthLabel}</span>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                onClick={goToNextMonth}
                disabled={isCurrentMonth}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" className="text-xs h-7" onClick={goToCurrentMonth}>
                Today
              </Button>
            </div>
          )}

          {/* Custom date inputs */}
          {periodMode === "custom" && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                className="h-7 rounded-md border border-input bg-background px-2 text-xs"
                value={utcToWibDateStr(customStart)}
                onChange={(e) => {
                  if (e.target.value) setCustomStart(wibDateStrToUtcMs(e.target.value));
                }}
              />
              <span className="text-xs text-muted-foreground">to</span>
              <input
                type="date"
                className="h-7 rounded-md border border-input bg-background px-2 text-xs"
                value={utcToWibDateStr(customEnd)}
                onChange={(e) => {
                  if (e.target.value) setCustomEnd(wibDateStrToUtcMs(e.target.value));
                }}
              />
            </div>
          )}
        </div>

        {/* Table */}
        {entries === undefined ? (
          <div className="text-sm text-muted-foreground py-8 text-center">Loading...</div>
        ) : entries.length === 0 ? (
          <div className="text-sm text-muted-foreground py-8 text-center">
            No manual journal entries for {periodMode === "month" ? monthLabel : "this period"}. Use the templates above to create one.
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium text-xs text-muted-foreground uppercase tracking-wider">Entry #</th>
                  <th className="text-left p-3 font-medium text-xs text-muted-foreground uppercase tracking-wider">Date</th>
                  <th className="text-left p-3 font-medium text-xs text-muted-foreground uppercase tracking-wider">Type</th>
                  <th className="text-left p-3 font-medium text-xs text-muted-foreground uppercase tracking-wider">Description</th>
                  <th className="text-right p-3 font-medium text-xs text-muted-foreground uppercase tracking-wider">Amount</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry._id} className="border-b last:border-0">
                    <td className="p-3 text-primary font-medium">{entry.entryNumber}</td>
                    <td className="p-3 text-muted-foreground">
                      {new Date(entry.date).toLocaleDateString("en-GB", {
                        day: "numeric", month: "short", year: "numeric",
                      })}
                    </td>
                    <td className="p-3">
                      {entry.templateType && (
                        <span className={cn(
                          "text-xs font-medium px-2 py-0.5 rounded-full",
                          BADGE_MAP[entry.templateType] ?? "bg-muted text-muted-foreground"
                        )}>
                          {LABEL_MAP[entry.templateType] ?? entry.templateType}
                        </span>
                      )}
                    </td>
                    <td className="p-3">{entry.description}</td>
                    <td className="p-3 text-right font-medium">{formatCurrency(entry.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify type-check passes**

Run: `npm run type-check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/pages/ManualJournalEntry.tsx
git commit -m "feat(journal): add ManualJournalEntry page with cards, inline form, and table"
```

---

### Task 7: Add Route and Hub Navigation

**Files:**
- Modify: `src/App.tsx` (~line 90 for lazy import, ~line 340 for route)
- Modify: `src/pages/HubPage.tsx` (split Financials into Financials + Accounting)

- [ ] **Step 1: Add lazy import to `src/App.tsx`**

Add after the `HistoricalImportPage` lazy import (~line 114):

```typescript
const ManualJournalEntry = lazyWithPreload(() =>
  import('./pages/ManualJournalEntry').then(m => ({ default: m.ManualJournalEntry }))
);
```

- [ ] **Step 2: Add route to `src/App.tsx`**

Add after the Historical Import route block (~line 347), inside the accounting routes section:

```tsx
{/* Manual Journal Entry (admin + manager) */}
<Route
  path="journal"
  element={
    <ProtectedRoute requiredPermission="canManageReimbursements">
      <ManualJournalEntry />
    </ProtectedRoute>
  }
/>
```

- [ ] **Step 3: Update HubPage — split Financials into Financials + Accounting**

In `src/pages/HubPage.tsx`, replace the current Financials section (~lines 100-118) with two sections:

Replace the existing Financials card object (~lines 100-118 of `src/pages/HubPage.tsx`):
```typescript
{
  title: "Financials",
  description: "Income statement, expense tracking, reimbursements, and payroll.",
  icon: FileText,
  color: "text-amber-500",
  primaryPath: "/financials",
  links: [
    { label: "Income Statement", path: "/financials" },
    { label: "Expenses", path: "/expenses" },
    { label: "Exp. Analytics", path: "/expense-analytics" },
    { label: "Reimburse", path: "/reimbursements" },
    { label: "Bank Accounts", path: "/bank-accounts" },
    { label: "Payroll", path: "/payroll" },
  ],
  ...
}
```

With two card objects (note: Bank Accounts REMOVED from Financials, MOVED to Accounting):
```typescript
{
  title: "Financials",
  description: "Income statement, expense tracking, reimbursements, and payroll.",
  icon: FileText,
  color: "text-amber-500",
  primaryPath: "/financials",
  links: [
    { label: "Income Statement", path: "/financials" },
    { label: "Expenses", path: "/expenses" },
    { label: "Exp. Analytics", path: "/expense-analytics" },
    { label: "Reimburse", path: "/reimbursements" },
    { label: "Payroll", path: "/payroll" },
  ],
  visible: (hp) =>
    hp("canAccessDashboard") ||
    hp("canSubmitExpenses") ||
    hp("canManageReimbursements"),
},
{
  title: "Accounting",
  description: "Journal entries, chart of accounts, and bank setup.",
  icon: Landmark,
  color: "text-emerald-500",
  primaryPath: "/journal",
  links: [
    { label: "Journal Entry", path: "/journal" },
    { label: "Accounts", path: "/accounts" },
    { label: "Bank Accounts", path: "/bank-accounts" },
    { label: "Import", path: "/import" },
  ],
  visible: (hp) => hp("canManageReimbursements"),
},
```

Note: `Landmark` icon is already imported. No new icon imports needed.

Also add icon mappings in the `LINK_ICONS` object (using already-imported icons):
```typescript
"Journal Entry": FileText,
"Accounts": Landmark,
"Import": FileText,
```

- [ ] **Step 4: Verify build passes**

Run: `npm run build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/pages/HubPage.tsx
git commit -m "feat(journal): add /journal route and split hub into Financials + Accounting"
```

---

### Task 8: Final Build Verification

- [ ] **Step 1: Run type-check**

Run: `npm run type-check`
Expected: PASS

- [ ] **Step 2: Run full test suite**

Run: `npm run test`
Expected: All pass, including new mutations tests

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 4: Final commit (if any fixes needed)**

Only if previous steps required fixes.
