/**
 * Convex hooks for Phase 72 bank reconciliation.
 *
 * All hooks are admin-gated on the backend via requireRole / protectedMutation.
 * Loading → returns `undefined` from useQuery; consumers must guard.
 *
 * Mutation helpers:
 *  - useCreateStatement: plain mutation (token supplied explicitly).
 *  - useSeedBankRules / useCreateBankRule / useUpdateBankRule / useDeactivateBankRule:
 *    protectedMutation wrappers — `useSessionMutation` injects the sessionId.
 */

import { useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import { useSessionMutation } from "convex-helpers/react/sessions";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useAuth } from "@/contexts/AuthContext";

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** 50 most-recent bank statements ordered by createdAt DESC. */
export function useBankStatements() {
  const { user } = useAuth();
  return useQuery(
    api.bankStatements.queries.listStatements,
    user?.token ? { token: user.token } : "skip",
  );
}

/** Single bank statement header. */
export function useBankStatement(id: Id<"bankStatements"> | null) {
  const { user } = useAuth();
  return useQuery(
    api.bankStatements.queries.getStatement,
    id && user?.token ? { token: user.token, id } : "skip",
  );
}

/** Single bank line by id (Phase 73 Plan 04 — AssetRegister CapEx round-trip). */
export function useBankLine(lineId: Id<"bankStatementLines"> | null | undefined) {
  const { user } = useAuth();
  return useQuery(
    api.bankStatements.queries.getLine,
    lineId && user?.token ? { token: user.token, lineId } : "skip",
  );
}

/** All lines for a statement, optionally filtered by status. */
export function useBankStatementLines(
  statementId: Id<"bankStatements"> | null,
  statusFilter?: "unmatched" | "auto_matched" | "suggested" | "confirmed",
) {
  const { user } = useAuth();
  return useQuery(
    api.bankStatements.queries.listLines,
    statementId && user?.token
      ? { token: user.token, statementId, statusFilter }
      : "skip",
  );
}

/**
 * Probe for a pre-existing statement with the given fileHash. Returns
 * `undefined` while loading, `null` when no duplicate, or the existing
 * header's `{_id, createdAt}` when one is found. Pass `null` to skip.
 */
export function useBankStatementByFileHash(fileHash: string | null) {
  const { user } = useAuth();
  return useQuery(
    api.bankStatements.queries.findByFileHash,
    fileHash && user?.token ? { token: user.token, fileHash } : "skip",
  );
}

/** Active (or all) bank keyword rules sorted by priority DESC, ruleCode ASC. */
export function useBankKeywordRules(includeInactive?: boolean) {
  const { user } = useAuth();
  return useQuery(
    api.bankKeywordRules.queries.list,
    user?.token ? { token: user.token, includeInactive } : "skip",
  );
}

/** Single bank keyword rule by id. */
export function useBankKeywordRule(id: Id<"bankKeywordRules"> | null) {
  const { user } = useAuth();
  return useQuery(
    api.bankKeywordRules.queries.getById,
    id && user?.token ? { token: user.token, id } : "skip",
  );
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

type CreateStatementPayload = {
  header: {
    fileHash: string;
    fileName: string;
    accountNumber: string;
    accountHolder: string;
    reportedPeriodStart: number;
    reportedPeriodEnd: number;
    currency: string;
    openingBalance: number;
    closingBalance: number;
    reportedDebitTotal: number;
    reportedCreditTotal: number;
  };
  lines: Array<{
    rowIndex: number;
    date: number;
    rawDescription: string;
    direction: "debit" | "credit";
    amountIdr: number;
    runningBalanceIdr?: number;
    parsedCounterparty?: string;
  }>;
};

/** Atomic ingest: parsed statement → dedup + classify + persist. */
export function useCreateStatement() {
  const createFn = useMutation(api.bankStatements.mutations.createFromParsedStatement);
  const { user } = useAuth();
  return useCallback(
    async (payload: CreateStatementPayload) => {
      if (!user?.token) {
        throw new Error("Not authenticated");
      }
      return await createFn({ token: user.token, ...payload });
    },
    [createFn, user?.token],
  );
}

/**
 * Seed all 26 default bank keyword rules.
 * Idempotent: returns `[ { ruleCode, action: "created" | "updated" } ]`.
 */
export function useSeedBankRules() {
  const seedFn = useMutation(api.bankKeywordRules.mutations.seedDefaults);
  const { user } = useAuth();
  return useCallback(async () => {
    if (!user?.token) {
      throw new Error("Not authenticated");
    }
    return await seedFn({ token: user.token });
  }, [seedFn, user?.token]);
}

/** Create a new bank keyword rule (admin-only, session-injected). */
export function useCreateBankRule() {
  return useSessionMutation(api.bankKeywordRules.mutations.create);
}

/** Update an existing bank keyword rule (admin-only, session-injected). */
export function useUpdateBankRule() {
  return useSessionMutation(api.bankKeywordRules.mutations.update);
}

/** Soft-delete (deactivate) a bank keyword rule (admin-only). */
export function useDeactivateBankRule() {
  return useSessionMutation(api.bankKeywordRules.mutations.deactivate);
}

// ---------------------------------------------------------------------------
// Phase 73 — Reconciliation queries (manager + admin per D-23)
// ---------------------------------------------------------------------------

/** Live progress aggregate for a single statement. Returns undefined while loading. */
export function useStatementProgress(statementId: Id<"bankStatements"> | undefined | null) {
  const { user } = useAuth();
  return useQuery(
    api.bankStatements.queries.getStatementProgress,
    statementId && user?.token ? { token: user.token, statementId } : "skip",
  );
}

/**
 * Bulk progress aggregate keyed by statementId. Backend caps at 50 ids
 * per call (RESEARCH Pitfall 7).
 */
export function useStatementProgressBulk(statementIds: Id<"bankStatements">[] | undefined) {
  const { user } = useAuth();
  return useQuery(
    api.bankStatements.queries.getStatementProgressBulk,
    statementIds && user?.token
      ? { token: user.token, statementIds }
      : "skip",
  );
}

/** Candidate records (4 grouped lists) for a selected bank line. */
export function useCandidatesForLine(lineId: Id<"bankStatementLines"> | undefined | null) {
  const { user } = useAuth();
  return useQuery(
    api.bankStatements.queries.listCandidatesForLine,
    lineId && user?.token ? { token: user.token, lineId } : "skip",
  );
}

// Search hook arg shape — mirrors backend optional filters.
// Each search hook is a thin useQuery wrapper. NO factory / NO hooks-in-hooks.
export type BankSearchArgs = {
  amountIdr?: number;
  dateStart?: number;
  dateEnd?: number;
  searchTerm?: string;
  /** When true, the underlying useQuery is skipped (returns undefined). */
  skip?: boolean;
};

export function useSearchExpenses(args: BankSearchArgs) {
  const { user } = useAuth();
  const { skip, ...filters } = args;
  return useQuery(
    api.bankStatements.queries.searchExpenses,
    skip || !user?.token ? "skip" : { token: user.token, ...filters },
  );
}

export function useSearchRevenue(args: BankSearchArgs) {
  const { user } = useAuth();
  const { skip, ...filters } = args;
  return useQuery(
    api.bankStatements.queries.searchRevenue,
    skip || !user?.token ? "skip" : { token: user.token, ...filters },
  );
}

export function useSearchReimbursements(args: BankSearchArgs) {
  const { user } = useAuth();
  const { skip, ...filters } = args;
  return useQuery(
    api.bankStatements.queries.searchReimbursements,
    skip || !user?.token ? "skip" : { token: user.token, ...filters },
  );
}

export function useSearchPayroll(args: BankSearchArgs) {
  const { user } = useAuth();
  const { skip, ...filters } = args;
  return useQuery(
    api.bankStatements.queries.searchPayroll,
    skip || !user?.token ? "skip" : { token: user.token, ...filters },
  );
}

/** Revenue gap dashboard rows for a WIB period (Plan 05 consumes). */
export function useRevenueGap(
  periodStart: number | undefined,
  periodEnd: number | undefined,
) {
  const { user } = useAuth();
  return useQuery(
    api.bankStatements.queries.revenueGapByPeriod,
    periodStart !== undefined && periodEnd !== undefined && user?.token
      ? { token: user.token, periodStart, periodEnd }
      : "skip",
  );
}

// ---------------------------------------------------------------------------
// Phase 73 — Reconciliation mutations (manager + admin per D-23)
// ---------------------------------------------------------------------------

export type MatchedType = "expense" | "revenue" | "reimbursement" | "payroll" | "subscriptionWeeklyInvoice";

/** Link a bank line to an expense / revenue / reimbursement / payroll record. */
export function useManualMatch() {
  const fn = useMutation(api.bankStatements.mutations.manualMatch);
  const { user } = useAuth();
  return useCallback(
    async (args: {
      lineId: Id<"bankStatementLines">;
      matchedType: MatchedType;
      matchedId: string;
    }) => {
      if (!user?.token) throw new Error("Not authenticated");
      return await fn({ token: user.token, ...args });
    },
    [fn, user?.token],
  );
}

/** Clear match link; if confirmed, posts a reversal JE (D-25 + JE-03). */
export function useUnmatch() {
  const fn = useMutation(api.bankStatements.mutations.unmatch);
  const { user } = useAuth();
  return useCallback(
    async (args: { lineId: Id<"bankStatementLines"> }) => {
      if (!user?.token) throw new Error("Not authenticated");
      return await fn({ token: user.token, ...args });
    },
    [fn, user?.token],
  );
}

/** Post the per-line journal entry; transitions the line to "confirmed". */
export function useConfirmLine() {
  const fn = useMutation(api.bankStatements.mutations.confirmLine);
  const { user } = useAuth();
  return useCallback(
    async (args: { lineId: Id<"bankStatementLines"> }) => {
      if (!user?.token) throw new Error("Not authenticated");
      return await fn({ token: user.token, ...args });
    },
    [fn, user?.token],
  );
}

/** Batch-post all exact-tier matched lines for a statement (atomic). */
export function useBatchConfirmExactTier() {
  const fn = useMutation(api.bankStatements.mutations.batchConfirmExactTier);
  const { user } = useAuth();
  return useCallback(
    async (args: { statementId: Id<"bankStatements"> }) => {
      if (!user?.token) throw new Error("Not authenticated");
      return await fn({ token: user.token, ...args });
    },
    [fn, user?.token],
  );
}

/**
 * Inline-create a submitted (NOT approved) expense from a bank line and
 * link it back. D-17 — never posts approval automatically.
 */
export function useInlineCreateExpense() {
  const fn = useMutation(api.bankStatements.mutations.inlineCreateExpense);
  const { user } = useAuth();
  return useCallback(
    async (args: Omit<Parameters<typeof fn>[0], "token">) => {
      if (!user?.token) throw new Error("Not authenticated");
      return await fn({ token: user.token, ...args });
    },
    [fn, user?.token],
  );
}

/** Inline-create an externalRevenue row and link it back to the bank line. */
export function useInlineCreateRevenue() {
  const fn = useMutation(api.bankStatements.mutations.inlineCreateRevenue);
  const { user } = useAuth();
  return useCallback(
    async (args: Omit<Parameters<typeof fn>[0], "token">) => {
      if (!user?.token) throw new Error("Not authenticated");
      return await fn({ token: user.token, ...args });
    },
    [fn, user?.token],
  );
}

/** Inline-create a reimbursement batch and link it back to the bank line. */
export function useInlineCreateReimbursement() {
  const fn = useMutation(api.bankStatements.mutations.inlineCreateReimbursement);
  const { user } = useAuth();
  return useCallback(
    async (args: Omit<Parameters<typeof fn>[0], "token">) => {
      if (!user?.token) throw new Error("Not authenticated");
      return await fn({ token: user.token, ...args });
    },
    [fn, user?.token],
  );
}

/** Mark a bank line as linked to a freshly-created fixed asset expense (D-21 / I1). */
export function useMarkAssetLinked() {
  const fn = useMutation(api.bankStatements.mutations.markAssetLinked);
  const { user } = useAuth();
  return useCallback(
    async (args: {
      bankLineId: Id<"bankStatementLines">;
      expenseId: Id<"expenses">;
    }) => {
      if (!user?.token) throw new Error("Not authenticated");
      return await fn({ token: user.token, ...args });
    },
    [fn, user?.token],
  );
}

/** Manager-or-admin learn-from-override path. Plain create stays admin-only. */
export function useCreateRuleFromOverride() {
  const fn = useMutation(api.bankKeywordRules.mutations.createFromOverride);
  const { user } = useAuth();
  return useCallback(
    async (args: Omit<Parameters<typeof fn>[0], "token">) => {
      if (!user?.token) throw new Error("Not authenticated");
      return await fn({ token: user.token, ...args });
    },
    [fn, user?.token],
  );
}
