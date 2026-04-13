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
