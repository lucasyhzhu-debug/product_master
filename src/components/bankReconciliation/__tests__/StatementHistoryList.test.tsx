/**
 * Phase 73 Plan 03 Wave 0 — RED test stub for StatementHistoryList.
 *
 * Validates the BANK-04 extension: per-row live progress column reading
 * `useStatementProgressBulk` from the bank reconciliation hook facade.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const progressBulkMock = vi.fn();

vi.mock("@/hooks/convex/useBankReconciliation", () => ({
  useStatementProgressBulk: (ids: string[]) => progressBulkMock(ids),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { _id: "u1", name: "Manager", role: "manager", token: "manager-token" },
  }),
}));

import { StatementHistoryList } from "../StatementHistoryList";

const SAMPLE_STATEMENT = {
  _id: "stmt1" as const,
  fileName: "BCA Nov 2025.xlsx",
  accountNumber: "1234567890",
  accountHolder: "PT Frollie",
  reportedPeriodStart: Date.UTC(2025, 10, 1),
  reportedPeriodEnd: Date.UTC(2025, 10, 30),
  lineCount: 60,
  matchedCount: 47,
  createdAt: Date.UTC(2025, 11, 1, 10, 0),
};

describe("StatementHistoryList — Phase 73 BANK-04 progress column", () => {
  it("renders a Progress element per row with value derived from useStatementProgressBulk", () => {
    progressBulkMock.mockReturnValue({
      stmt1: {
        total: 60,
        unmatched: 5,
        autoMatched: 8,
        suggested: 4,
        confirmed: 43,
        matched: 55,
        reconciledPct: 72,
      },
    });

    render(
      <StatementHistoryList
        statements={[SAMPLE_STATEMENT as never]}
        selectedId={null}
        onSelect={() => {}}
      />,
    );

    const progress = screen.getAllByRole("progressbar");
    expect(progress.length).toBeGreaterThanOrEqual(1);
    expect(progress[0]).toHaveAttribute("aria-valuenow", "72");
  });

  it("shows {matched}/{total} count next to the progress bar", () => {
    progressBulkMock.mockReturnValue({
      stmt1: {
        total: 60,
        unmatched: 5,
        autoMatched: 8,
        suggested: 4,
        confirmed: 43,
        matched: 55,
        reconciledPct: 72,
      },
    });

    render(
      <StatementHistoryList
        statements={[SAMPLE_STATEMENT as never]}
        selectedId={null}
        onSelect={() => {}}
      />,
    );

    expect(screen.getByText(/55\s*\/\s*60/)).toBeInTheDocument();
  });

  it("renders an empty-state message when statements list is []", () => {
    progressBulkMock.mockReturnValue({});

    render(
      <StatementHistoryList statements={[]} selectedId={null} onSelect={() => {}} />,
    );

    expect(screen.getByText(/No statements imported/i)).toBeInTheDocument();
  });

  it("renders skeletons / loading state when useStatementProgressBulk returns undefined", () => {
    progressBulkMock.mockReturnValue(undefined);

    render(
      <StatementHistoryList
        statements={[SAMPLE_STATEMENT as never]}
        selectedId={null}
        onSelect={() => {}}
      />,
    );

    // Skeleton rendered in the live-progress cell — no progressbar value yet.
    const cells = document.querySelectorAll('[data-testid="progress-skeleton"]');
    expect(cells.length).toBeGreaterThanOrEqual(1);
  });
});
