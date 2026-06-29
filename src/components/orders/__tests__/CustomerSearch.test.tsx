/**
 * T5: CustomerSearch — [B2B] prefix + companyName render + widened types.
 *
 * Covers:
 *   - B2B customer row shows "[B2B]" prefix and "— {companyName}" in the dropdown.
 *   - B2C customer row does NOT show "[B2B]".
 *   - Customer with customerType: undefined does NOT show "[B2B]".
 *
 * Mock pattern follows QrisChargeDialog.test.tsx and CustomerNameLink.test.tsx.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ---------------------------------------------------------------------------
// Hook mock — CustomerSearch uses useCustomerSearch from @/hooks/convex
// ---------------------------------------------------------------------------

const customerSearchMock = vi.fn();

vi.mock("@/hooks/convex", () => ({
  useCustomerSearch: (...args: unknown[]) => customerSearchMock(...args),
}));

// ---------------------------------------------------------------------------
// Import AFTER mocks
// ---------------------------------------------------------------------------
import { CustomerSearch } from "../CustomerSearch";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const B2B_CUSTOMER = {
  _id: "customers_b2b1",
  name: "Marchella",
  phone: "08211111111",
  defaultAddress: undefined,
  customerType: "b2b_wholesale" as const,
  companyName: "Amsterdam Coffee",
};

const B2C_CUSTOMER = {
  _id: "customers_b2c1",
  name: "Marchella",
  phone: "08222222222",
  defaultAddress: undefined,
  customerType: "direct_b2c" as const,
  companyName: undefined,
};

const UNDEFINED_TYPE_CUSTOMER = {
  _id: "customers_unk1",
  name: "Unknown Type",
  phone: "08233333333",
  defaultAddress: undefined,
  customerType: undefined,
  companyName: undefined,
};

function renderSearch() {
  return render(
    <CustomerSearch
      onCustomerSelect={vi.fn()}
      onNewCustomer={vi.fn(async () => undefined)}
    />,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CustomerSearch — [B2B] flag + companyName (T5)", () => {
  beforeEach(() => {
    customerSearchMock.mockReset();
  });

  it("shows [B2B] prefix and companyName for b2b_wholesale customer in dropdown", async () => {
    customerSearchMock.mockReturnValue([B2B_CUSTOMER]);

    const { getByRole } = renderSearch();
    const input = getByRole("textbox");
    await userEvent.type(input, "Marchella");

    expect(screen.getByText(/\[B2B\]/)).toBeInTheDocument();
    expect(screen.getByText(/Amsterdam Coffee/)).toBeInTheDocument();
  });

  it("does NOT show [B2B] for direct_b2c customer in dropdown", async () => {
    customerSearchMock.mockReturnValue([B2C_CUSTOMER]);

    renderSearch();
    const input = screen.getByRole("textbox");
    await userEvent.type(input, "Marchella");

    expect(screen.queryByText(/\[B2B\]/)).not.toBeInTheDocument();
  });

  it("does NOT show [B2B] when customerType is undefined", async () => {
    customerSearchMock.mockReturnValue([UNDEFINED_TYPE_CUSTOMER]);

    renderSearch();
    const input = screen.getByRole("textbox");
    await userEvent.type(input, "Unknown");

    expect(screen.queryByText(/\[B2B\]/)).not.toBeInTheDocument();
  });

  it("shows [B2B] and companyName in selected-state display after selecting a B2B customer", async () => {
    customerSearchMock.mockReturnValue([B2B_CUSTOMER]);

    renderSearch();
    const input = screen.getByRole("textbox");
    await userEvent.type(input, "Marchella");

    const b2bRow = screen.getByText(/\[B2B\]/);
    // Click the button that contains [B2B]
    const btn = b2bRow.closest("button");
    if (!btn) throw new Error("No button found for B2B customer row");
    await userEvent.click(btn);

    // After selection, selected-state should show [B2B] and companyName
    expect(screen.getByText(/\[B2B\]/)).toBeInTheDocument();
    expect(screen.getByText(/Amsterdam Coffee/)).toBeInTheDocument();
  });
});
