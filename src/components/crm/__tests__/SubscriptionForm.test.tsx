import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { Id } from "../../../../convex/_generated/dataModel";

const mockCreateSub = vi.fn();
const mockNavigate = vi.fn();
vi.mock("convex/react", () => ({
  useQuery: () => [
    { _id: "p1", name: "Original" },
    { _id: "p2", name: "Jumbo" },
  ],
}));
vi.mock("convex-helpers/react/sessions", () => ({
  useSessionQuery: () => [], // listAgreementsByCustomer → none
  useSessionMutation: () => mockCreateSub,
}));
vi.mock("react-router-dom", async (orig) => ({
  ...(await orig<typeof import("react-router-dom")>()),
  useNavigate: () => mockNavigate,
}));

import { SubscriptionForm } from "../SubscriptionForm";
const customerId = "cust1" as Id<"customers">;

beforeEach(() => { mockCreateSub.mockReset(); mockNavigate.mockReset(); });

describe("SubscriptionForm", () => {
  it("blocks submit with empty label", () => {
    render(<MemoryRouter><SubscriptionForm customerId={customerId} /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: /create subscription/i }));
    expect(mockCreateSub).not.toHaveBeenCalled();
  });

  it("previews weekly qty and credit from the template + unit price", () => {
    render(<MemoryRouter><SubscriptionForm customerId={customerId} /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText(/unit price/i), { target: { value: "29000" } });
    const mon = screen.getByTestId("template-day-0");
    fireEvent.click(within(mon).getByRole("button", { name: /add product/i }));
    fireEvent.change(within(mon).getByLabelText("Quantity"), { target: { value: "150" } });
    expect(screen.getByTestId("weekly-qty-preview")).toHaveTextContent("150");
    // 150 * 29000 = 4.350.000
    expect(screen.getByTestId("weekly-credit-preview")).toHaveTextContent("4.350.000");
  });

  it("creates a draft with correctly shaped args and navigates", async () => {
    mockCreateSub.mockResolvedValue("sub99");
    render(<MemoryRouter><SubscriptionForm customerId={customerId} /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText(/label/i), { target: { value: "Morning Bundle A" } });
    fireEvent.change(screen.getByLabelText(/unit price/i), { target: { value: "29000" } });
    fireEvent.change(screen.getByLabelText(/baseline daily qty/i), { target: { value: "150" } });
    fireEvent.change(screen.getByLabelText(/cogs basis/i), { target: { value: "12000" } });
    const mon = screen.getByTestId("template-day-0");
    fireEvent.click(within(mon).getByRole("button", { name: /add product/i }));
    fireEvent.click(screen.getByRole("button", { name: /create subscription/i }));
    await waitFor(() => expect(mockCreateSub).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId,
        label: "Morning Bundle A",
        unitPrice: 29000,
        confidentialPrice: true,
        baselineDailyQty: 150,
        cogsBasis: 12000,
        creditRolloverPolicy: "expire",
        scheduleTemplate: expect.arrayContaining([
          expect.objectContaining({ dayOfWeek: 0, items: expect.any(Array) }),
        ]),
      }),
    ));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith(
      `/crm/customers/${customerId}/subscriptions/sub99`,
    ));
  });
});
