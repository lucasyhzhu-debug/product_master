/**
 * Shared fixture builders for Phase 73 reconciliation mutation tests.
 *
 * Provides `seedReconcileFixture(t)` — returns tokens for admin/manager/kitchen/order_staff
 * plus a pre-seeded statement, one unmatched line, one matched-not-confirmed line,
 * one confirmed line, and representative records (expense / revenue / reimbursement / payroll)
 * plus the two accounts (cash + expense) used for JE posting.
 *
 * Intentionally lives alongside mutations.test.ts — reuses the same convex-test idiom.
 */

import type { convexTest } from "convex-test";
import type { Id } from "../../_generated/dataModel";

type TestT = ReturnType<typeof convexTest>;

export interface ReconcileFixture {
  adminToken: string;
  managerToken: string;
  kitchenToken: string;
  orderStaffToken: string;
  adminUserId: Id<"users">;
  managerUserId: Id<"users">;
  cashAccountId: Id<"accounts">;
  expenseAccountId: Id<"accounts">;
  revenueAccountId: Id<"accounts">;
  statementId: Id<"bankStatements">;
  unmatchedLineId: Id<"bankStatementLines">;
  matchedLineId: Id<"bankStatementLines">;
  confirmedLineId: Id<"bankStatementLines">;
  confirmedJournalEntryId: Id<"journalEntries">;
  expenseId: Id<"expenses">;
  altExpenseId: Id<"expenses">;
  revenueId: Id<"externalRevenue">;
  reimbursementId: Id<"reimbursementBatches">;
}

async function createSession(t: TestT, role: "admin" | "manager" | "kitchen" | "order_staff", name: string): Promise<{ token: string; userId: Id<"users"> }> {
  const token = `${role}-token-${Date.now()}-${Math.random()}`;
  const userId = await t.run(async (ctx) => {
    const uid = await ctx.db.insert("users", {
      name,
      pinHash: "salt:hash",
      role,
      isActive: true,
      failedAttempts: 0,
      createdAt: Date.now(),
    } as never);
    await ctx.db.insert("sessions", {
      userId: uid,
      token,
      expiresAt: Date.now() + 8 * 3600 * 1000,
      createdAt: Date.now(),
    } as never);
    return uid as Id<"users">;
  });
  return { token, userId };
}

export async function seedReconcileFixture(t: TestT): Promise<ReconcileFixture> {
  const { token: adminToken, userId: adminUserId } = await createSession(t, "admin", "Test Admin");
  const { token: managerToken, userId: managerUserId } = await createSession(t, "manager", "Test Manager");
  const { token: kitchenToken } = await createSession(t, "kitchen", "Test Kitchen");
  const { token: orderStaffToken } = await createSession(t, "order_staff", "Test OrderStaff");

  const now = Date.now();
  const lineDate = Date.UTC(2026, 0, 10);

  return await t.run(async (ctx) => {
    // Accounts
    const cashAccountId = await ctx.db.insert("accounts", {
      code: "1110",
      name: "Cash / Bank — BCA",
      type: "asset",
      category: "Assets",
      isActive: true,
      isSystem: true,
    } as never);
    const expenseAccountId = await ctx.db.insert("accounts", {
      code: "6100",
      name: "Office Expense",
      type: "opex",
      category: "OpEx",
      isActive: true,
      isSystem: true,
    } as never);
    const revenueAccountId = await ctx.db.insert("accounts", {
      code: "4210",
      name: "Revenue — Online",
      type: "revenue",
      category: "Revenue",
      isActive: true,
      isSystem: true,
    } as never);

    // Statement header
    const statementId = await ctx.db.insert("bankStatements", {
      fileHash: `hash-${now}-${Math.random()}`,
      fileName: "Mutasi-BCA-2601.xlsx",
      accountNumber: "6044830994",
      accountHolder: "PT FROLLIE",
      reportedPeriodStart: Date.UTC(2026, 0, 1),
      reportedPeriodEnd: Date.UTC(2026, 0, 31),
      currency: "Rp",
      openingBalance: 1_000_000,
      closingBalance: 1_000_000,
      reportedDebitTotal: 0,
      reportedCreditTotal: 0,
      lineCount: 3,
      matchedCount: 0,
      uploadedBy: adminUserId,
      createdAt: now,
    } as never);

    // Candidate expense
    const expenseId = await ctx.db.insert("expenses", {
      expenseNumber: "EXP-0001",
      submittedBy: adminUserId,
      amount: 250000,
      accountId: expenseAccountId,
      expenseDate: lineDate,
      description: "Office supplies",
      vendorName: "Warung ABC",
      paymentMethod: "company_paid",
      status: "approved",
      lateSubmission: false,
      createdAt: now,
    } as never);

    // Alternate expense — for cross-link guard
    const altExpenseId = await ctx.db.insert("expenses", {
      expenseNumber: "EXP-0002",
      submittedBy: adminUserId,
      amount: 500000,
      accountId: expenseAccountId,
      expenseDate: lineDate,
      description: "Spare",
      vendorName: "Warung XYZ",
      paymentMethod: "company_paid",
      status: "approved",
      lateSubmission: false,
      createdAt: now,
    } as never);

    // Candidate revenue
    const revenueId = await ctx.db.insert("externalRevenue", {
      source: "gobiz",
      transactionDate: lineDate,
      periodStart: lineDate,
      periodEnd: lineDate,
      revenueGross: 300000,
      revenueNet: 285000,
      dataOrigin: "manual_entry",
      confidence: "exact",
    } as never);

    // Candidate reimbursement batch
    const reimbursementId = await ctx.db.insert("reimbursementBatches", {
      batchNumber: "RB-0001",
      employeeUserId: adminUserId,
      totalAmount: 400000,
      status: "pending",
      createdBy: adminUserId,
      createdAt: now,
    } as never);

    // Unmatched line — status='unmatched', no matched record, has je accounts suggested
    const unmatchedLineId = await ctx.db.insert("bankStatementLines", {
      statementId,
      rowIndex: 1,
      date: lineDate,
      month: "2026-01",
      rawDescription: "Office supply purchase",
      direction: "debit",
      amountIdr: 250000,
      confidence: "strong",
      status: "unmatched",
      isAutoMatched: false,
      jeDebitAccountId: expenseAccountId,
      jeCreditAccountId: cashAccountId,
    } as never);

    // Matched (suggested) line — polymorphic link to expense, not yet confirmed
    const matchedLineId = await ctx.db.insert("bankStatementLines", {
      statementId,
      rowIndex: 2,
      date: lineDate,
      month: "2026-01",
      rawDescription: "Another office supply",
      direction: "debit",
      amountIdr: 250000,
      confidence: "exact",
      status: "suggested",
      isAutoMatched: false,
      jeDebitAccountId: expenseAccountId,
      jeCreditAccountId: cashAccountId,
      matchedType: "expense",
      matchedId: expenseId,
      matchMethod: "linked_to_record",
    } as never);

    // Pre-confirmed line + its JE (for unmatch reversal tests)
    const confirmedJournalEntryId = await ctx.db.insert("journalEntries", {
      entryNumber: "JE-0101-001",
      date: lineDate,
      description: "Bank debit — Preconfirmed",
      sourceType: "bank_statement",
      isReversed: false,
      createdBy: adminUserId,
      createdAt: now,
    } as never);
    await ctx.db.insert("journalEntryLines", {
      journalEntryId: confirmedJournalEntryId,
      accountId: expenseAccountId,
      entryDate: lineDate,
      debitAmount: 250000,
      creditAmount: 0,
    } as never);
    await ctx.db.insert("journalEntryLines", {
      journalEntryId: confirmedJournalEntryId,
      accountId: cashAccountId,
      entryDate: lineDate,
      debitAmount: 0,
      creditAmount: 250000,
    } as never);

    const confirmedLineId = await ctx.db.insert("bankStatementLines", {
      statementId,
      rowIndex: 3,
      date: lineDate,
      month: "2026-01",
      rawDescription: "Preconfirmed",
      direction: "debit",
      amountIdr: 250000,
      confidence: "exact",
      status: "confirmed",
      isAutoMatched: false,
      jeDebitAccountId: expenseAccountId,
      jeCreditAccountId: cashAccountId,
      matchedType: "expense",
      matchedId: altExpenseId,
      matchMethod: "linked_to_record",
      confirmedAt: now,
      confirmedBy: adminUserId,
      confirmedJournalEntryId,
    } as never);

    // Patch journalEntry with sourceId = confirmedLineId (P73 confirm contract)
    await ctx.db.patch(confirmedJournalEntryId, { sourceId: confirmedLineId });

    return {
      adminToken,
      managerToken,
      kitchenToken,
      orderStaffToken,
      adminUserId,
      managerUserId,
      cashAccountId,
      expenseAccountId,
      revenueAccountId,
      statementId,
      unmatchedLineId,
      matchedLineId,
      confirmedLineId,
      confirmedJournalEntryId,
      expenseId,
      altExpenseId,
      revenueId,
      reimbursementId,
    };
  });
}
