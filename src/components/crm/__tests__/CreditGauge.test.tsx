/**
 * T26 — TDD tests for CreditGauge.
 *
 * CreditGauge reads `pool.creditRemaining` (derived CreditPool) NOT
 * `week.creditRemaining`. Empty state fires when pool is null.
 *
 * formatCurrency("id-ID", IDR) formats 50_000 as "Rp 50.000" or "Rp50.000"
 * (locale output varies by Node ICU build); tests match on the digit string.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CreditGauge } from "../CreditGauge";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FULL_POOL = {
  creditIssued: 1_000_000,
  creditConsumed: 400_000,
  creditRemaining: 600_000,
  creditExpired: 0,
};

const ZERO_ISSUED_POOL = {
  creditIssued: 0,
  creditConsumed: 0,
  creditRemaining: 0,
  creditExpired: 0,
};

// ---------------------------------------------------------------------------
// Pool present — headline is creditRemaining
// ---------------------------------------------------------------------------

describe("CreditGauge — pool present", () => {
  it("renders pool.creditRemaining as the headline (formatted)", () => {
    render(<CreditGauge pool={FULL_POOL} subscriptionLabel="Weekly Plan" />);
    // creditRemaining = 600_000 → formatted number contains "600" at minimum
    expect(screen.getByText(/600/)).toBeInTheDocument();
  });

  it("does NOT display 'week.creditRemaining' text anywhere", () => {
    render(<CreditGauge pool={FULL_POOL} subscriptionLabel="Weekly Plan" />);
    // The brief explicitly guards against reading week.creditRemaining
    expect(screen.queryByText(/week\.creditRemaining/i)).not.toBeInTheDocument();
  });

  it("renders the subscription label when provided", () => {
    render(<CreditGauge pool={FULL_POOL} subscriptionLabel="Weekly Plan" />);
    expect(screen.getByText(/Weekly Plan/i)).toBeInTheDocument();
  });

  it("does NOT render the empty-state message when pool is provided", () => {
    render(<CreditGauge pool={FULL_POOL} />);
    expect(
      screen.queryByText(/no active credit pool/i),
    ).not.toBeInTheDocument();
  });

  it("renders a progress bar element", () => {
    const { container } = render(<CreditGauge pool={FULL_POOL} />);
    // The progress indicator must exist — look for role="progressbar" or a div
    // with aria-valuenow, or a div carrying a width style set to the fill %
    const progressBar = container.querySelector("[role='progressbar']");
    expect(progressBar).not.toBeNull();
  });

  it("guard: zero creditIssued does not throw (divide-by-zero)", () => {
    expect(() =>
      render(<CreditGauge pool={ZERO_ISSUED_POOL} />),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Pool null — empty state (D12)
// ---------------------------------------------------------------------------

describe("CreditGauge — pool null", () => {
  it("renders the empty-state message when pool is null", () => {
    render(<CreditGauge pool={null} />);
    expect(
      screen.getByText(/no active credit pool this week/i),
    ).toBeInTheDocument();
  });

  it("does NOT render a progress bar when pool is null", () => {
    const { container } = render(<CreditGauge pool={null} />);
    expect(container.querySelector("[role='progressbar']")).toBeNull();
  });

  it("does NOT render the label when pool is null (empty state is self-contained)", () => {
    render(<CreditGauge pool={null} subscriptionLabel="Weekend Plan" />);
    // Label suppressed in null state to avoid duplicating the sub name from the list below
    expect(screen.queryByText(/Weekend Plan/i)).not.toBeInTheDocument();
  });
});
