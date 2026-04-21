/**
 * Phase 75 Wave 0 — Plan 00 Task 4
 *
 * Unit tests for FIN-02:
 *   D-10 — rename channel sub-row label "Gross Margin" → "Contribution Margin"
 *   D-11 — ChannelRow MUST NOT render OpEx/D&A/CapEx/FCF sub-rows
 *
 * RED-state expectation: authored during Wave 0 to run RED against the base
 * commit (ChannelRow.tsx line 148 today renders "Gross Margin"). Plan 02
 * renames the label and these 2 tests flip green. If the parent branch has
 * already executed Plan 02, tests pass immediately — test 2's forbidden-term
 * set permanently guards the D-11 scope against future OpEx-allocation regressions.
 */

import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ChannelRow } from "./ChannelRow";

function renderChannelRow(overrides: Partial<{
  source: string;
  displayName: string;
  gross: number;
  netRevenue: number;
  confidence: "exact" | "calculated" | "inferred" | "missing";
  cogs: { production: number; packaging: number; total: number };
}> = {}) {
  const channel = {
    source: "gofood",
    displayName: "GoFood",
    gross: 5_000_000,
    netRevenue: 4_500_000,
    confidence: "exact" as const,
    cogs: { production: 1_000_000, packaging: 500_000, total: 1_500_000 },
    ...overrides,
  };
  // ChannelRow renders <tr> — wrap in a table for valid DOM.
  return render(
    <table>
      <tbody>
        <ChannelRow
          channel={channel}
          totalGross={10_000_000}
          showComparison={false}
        />
      </tbody>
    </table>,
  );
}

describe("ChannelRow — Phase 75 (FIN-02)", () => {
  it("Expanded channel row shows 'Contribution Margin' label (not 'Gross Margin')", () => {
    const { container } = renderChannelRow();
    // Click the row to expand — ChannelRow toggles expanded state on tr click.
    const row = container.querySelector("tr");
    if (!row) throw new Error("Row not rendered");
    fireEvent.click(row);

    // Contribution Margin MUST appear.
    expect(screen.getByText("Contribution Margin")).toBeInTheDocument();
    // Gross Margin MUST NOT appear (strict rename — no dual labelling).
    expect(screen.queryByText("Gross Margin")).not.toBeInTheDocument();
  });

  it("ChannelRow renders only through Contribution Margin — no OpEx/D/A/CapEx/FCF sub-rows", () => {
    const { container } = renderChannelRow();
    const row = container.querySelector("tr");
    if (!row) throw new Error("Row not rendered");
    fireEvent.click(row);

    // Forbidden terms — any future change that starts allocating OpEx / D/A /
    // CapEx / FCF at the channel level will fail this test. D-11 permanently
    // limits ChannelRow to Gross/COGS/Contribution-Margin scope.
    const forbidden = [
      "OpEx",
      "Operating Expenses",
      "Depreciation",
      "Amortization",
      "EBITDA",
      "EBIT",
      "Net Income",
      "CapEx",
      "Free Cash Flow",
      "FCF",
    ];

    for (const term of forbidden) {
      expect(
        screen.queryByText(new RegExp(term, "i")),
        `Forbidden term "${term}" found in ChannelRow — D-11 scope violation`,
      ).not.toBeInTheDocument();
    }
  });
});
