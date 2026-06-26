/**
 * T10 — TDD tests for DayPlanCell cutoff-warning + supplier-confirmation badge props.
 *
 * pastCutoff?: boolean  → shows "past 13:00 cutoff" warning (amber). Must NOT disable Add button.
 * needsSupplierConfirmation?: boolean → shows "needs supplier confirmation" badge (orange).
 * Both false/undefined → neither present.
 * locked prop remains the ONLY thing that disables the Add button.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DayPlanCell } from "../DayPlanCell";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PRODUCTS = [
  {
    _id: "prod1" as unknown as import("../../../../convex/_generated/dataModel").Id<"menuProducts">,
    name: "Original",
    unitPrice: 35000,
  },
];

const BASE_PROPS = {
  dayIndex: 0,
  dateMs: 1_700_000_000_000,
  lines: [],
  products: PRODUCTS as unknown as Parameters<typeof DayPlanCell>[0]["products"],
  unitPrice: 35000,
  locked: false,
  onChange: vi.fn(),
};

// ---------------------------------------------------------------------------
// pastCutoff prop
// ---------------------------------------------------------------------------

describe("DayPlanCell — pastCutoff prop", () => {
  it("renders 'past 13:00 cutoff' warning when pastCutoff is true", () => {
    render(<DayPlanCell {...BASE_PROPS} pastCutoff={true} />);
    expect(screen.getByText(/past 13:00 cutoff/i)).toBeInTheDocument();
  });

  it("Add product button is still ENABLED when pastCutoff is true (warn, not lock)", () => {
    render(<DayPlanCell {...BASE_PROPS} pastCutoff={true} />);
    const btn = screen.getByRole("button", { name: /add product/i });
    expect(btn).not.toBeDisabled();
  });

  it("does NOT render the cutoff warning when pastCutoff is false", () => {
    render(<DayPlanCell {...BASE_PROPS} pastCutoff={false} />);
    expect(screen.queryByText(/past 13:00 cutoff/i)).not.toBeInTheDocument();
  });

  it("does NOT render the cutoff warning when pastCutoff is undefined", () => {
    render(<DayPlanCell {...BASE_PROPS} />);
    expect(screen.queryByText(/past 13:00 cutoff/i)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// needsSupplierConfirmation prop
// ---------------------------------------------------------------------------

describe("DayPlanCell — needsSupplierConfirmation prop", () => {
  it("renders 'needs supplier confirmation' badge when prop is true", () => {
    render(<DayPlanCell {...BASE_PROPS} needsSupplierConfirmation={true} />);
    expect(screen.getByText(/needs supplier confirmation/i)).toBeInTheDocument();
  });

  it("does NOT render the badge when needsSupplierConfirmation is false", () => {
    render(<DayPlanCell {...BASE_PROPS} needsSupplierConfirmation={false} />);
    expect(
      screen.queryByText(/needs supplier confirmation/i),
    ).not.toBeInTheDocument();
  });

  it("does NOT render the badge when needsSupplierConfirmation is undefined", () => {
    render(<DayPlanCell {...BASE_PROPS} />);
    expect(
      screen.queryByText(/needs supplier confirmation/i),
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Both props false/undefined → neither present
// ---------------------------------------------------------------------------

describe("DayPlanCell — no warning props", () => {
  it("renders neither warning nor badge by default", () => {
    render(<DayPlanCell {...BASE_PROPS} />);
    expect(screen.queryByText(/past 13:00 cutoff/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/needs supplier confirmation/i),
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// locked prop remains the ONLY edit-disable
// ---------------------------------------------------------------------------

describe("DayPlanCell — locked prop", () => {
  it("hides the Add button when locked (existing behaviour unchanged)", () => {
    render(<DayPlanCell {...BASE_PROPS} locked={true} />);
    expect(
      screen.queryByRole("button", { name: /add product/i }),
    ).not.toBeInTheDocument();
  });

  it("shows both warning and badge while locked, without re-enabling Add", () => {
    render(
      <DayPlanCell
        {...BASE_PROPS}
        locked={true}
        pastCutoff={true}
        needsSupplierConfirmation={true}
      />,
    );
    expect(screen.getByText(/past 13:00 cutoff/i)).toBeInTheDocument();
    expect(screen.getByText(/needs supplier confirmation/i)).toBeInTheDocument();
    // Add button must stay hidden (locked hides it entirely)
    expect(
      screen.queryByRole("button", { name: /add product/i }),
    ).not.toBeInTheDocument();
  });
});
