import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const mockCreate = vi.fn();
const mockNavigate = vi.fn();
vi.mock("convex-helpers/react/sessions", () => ({
  useSessionMutation: () => mockCreate,
}));
vi.mock("react-router-dom", async (orig) => ({
  ...(await orig<typeof import("react-router-dom")>()),
  useNavigate: () => mockNavigate,
}));

import { NewCustomerDialog } from "../NewCustomerDialog";

beforeEach(() => {
  mockCreate.mockReset();
  mockNavigate.mockReset();
});

describe("NewCustomerDialog", () => {
  it("blocks submit when name is empty", () => {
    render(<MemoryRouter><NewCustomerDialog open onOpenChange={() => {}} /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: /create customer/i }));
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("creates and navigates to the new customer hub", async () => {
    mockCreate.mockResolvedValue("cust123");
    render(<MemoryRouter><NewCustomerDialog open onOpenChange={() => {}} /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText(/customer name/i), { target: { value: "UAT Cafe" } });
    fireEvent.change(screen.getByLabelText(/whatsapp/i), { target: { value: "628111" } });
    fireEvent.click(screen.getByRole("button", { name: /create customer/i }));
    await waitFor(() => expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ name: "UAT Cafe", whatsapp: "628111" }),
    ));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/crm/customers/cust123"));
  });
});
