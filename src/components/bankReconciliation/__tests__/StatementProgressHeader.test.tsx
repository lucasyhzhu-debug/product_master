/**
 * Phase 73 Plan 03 Wave 0 — RED test stub for StatementProgressHeader.
 *
 * Validates BANK-04: live progress bar + 4 status chips reading
 * `useStatementProgress` from the hook facade.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const progressMock = vi.fn();

vi.mock("@/hooks/convex/useBankReconciliation", () => ({
  useStatementProgress: (id: unknown) => progressMock(id),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { _id: "u1", name: "Manager", role: "manager", token: "manager-token" },
  }),
}));

import { StatementProgressHeader } from "../StatementProgressHeader";

describe("StatementProgressHeader — Phase 73 BANK-04", () => {
  it("renders <Progress value={reconciledPct} /> from useStatementProgress", () => {
    progressMock.mockReturnValue({
      total: 67,
      unmatched: 8,
      autoMatched: 10,
      suggested: 12,
      confirmed: 37,
      matched: 59,
      reconciledPct: 55,
    });

    render(
      <StatementProgressHeader
        statementId={"stmt1" as never}
        statementName="BCA Nov 2025"
        periodLabel="Nov 2025"
      />,
    );

    const progress = screen.getByRole("progressbar");
    expect(progress).toHaveAttribute("aria-valuenow", "55");
  });

  it("renders four status chips with correct counts", () => {
    progressMock.mockReturnValue({
      total: 67,
      unmatched: 8,
      autoMatched: 10,
      suggested: 12,
      confirmed: 37,
      matched: 59,
      reconciledPct: 55,
    });

    render(
      <StatementProgressHeader
        statementId={"stmt1" as never}
        statementName="BCA Nov 2025"
        periodLabel="Nov 2025"
      />,
    );

    // matched chip shows aggregated count (autoMatched + suggested + confirmed)
    expect(screen.getByText(/59\s*matched/i)).toBeInTheDocument();
    expect(screen.getByText(/12\s*suggested/i)).toBeInTheDocument();
    expect(screen.getByText(/8\s*unmatched/i)).toBeInTheDocument();
    expect(screen.getByText(/37\s*confirmed/i)).toBeInTheDocument();
  });

  it("renders skeleton when progress query returns undefined", () => {
    progressMock.mockReturnValue(undefined);

    render(
      <StatementProgressHeader
        statementId={"stmt1" as never}
        statementName="BCA Nov 2025"
        periodLabel="Nov 2025"
      />,
    );

    // No progressbar role until data resolves; skeleton present instead.
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(document.querySelector('[data-testid="progress-header-skeleton"]')).not.toBeNull();
  });
});
