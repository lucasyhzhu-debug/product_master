/**
 * EditUndeliveredOrderControl — Task T10 (Slice 2 money-path UI).
 *
 * Reusable control to REDUCE / remove lines on an undelivered subscription
 * order. Used by OrderSlideOver (T10) and OrderDetail (T11, Pitfall #20).
 *
 * Verifies:
 *  - Gating: renders nothing for non-subscription orders or delivered statuses.
 *  - Shows the "Edit order (reduce)" trigger for an editable subscription order.
 *  - Submitting a reduction calls editUndeliveredSubscriptionOrder with ONLY
 *    the changed lines (reduction-only).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockEdit = vi.fn();

vi.mock("convex-helpers/react/sessions", () => ({
  useSessionMutation: vi.fn(() => mockEdit),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// Keep the Dialog always-rendered so we can interact without a portal.
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import React from "react";
import { toast } from "sonner";
import {
  EditUndeliveredOrderControl,
  type EditUndeliveredOrderItem,
} from "../EditUndeliveredOrderControl";

const ORDER_ID = "order_1" as Parameters<typeof EditUndeliveredOrderControl>[0]["orderId"];

const ITEMS: EditUndeliveredOrderItem[] = [
  { id: "item_a" as EditUndeliveredOrderItem["id"], productName: "Original", quantity: 5 },
  { id: "item_b" as EditUndeliveredOrderItem["id"], productName: "Jumbo", quantity: 3 },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockEdit.mockResolvedValue({ ok: true });
});

describe("EditUndeliveredOrderControl — gating", () => {
  it("renders nothing for a non-subscription order", () => {
    const { container } = render(
      <EditUndeliveredOrderControl
        orderId={ORDER_ID}
        status="BeingPrepared"
        isSubscriptionOrder={false}
        items={ITEMS}
      />,
    );
    expect(container.textContent).toBe("");
  });

  it("renders nothing for a delivered subscription order", () => {
    const { container } = render(
      <EditUndeliveredOrderControl
        orderId={ORDER_ID}
        status="AwaitingDelivery"
        isSubscriptionOrder={true}
        items={ITEMS}
      />,
    );
    expect(container.textContent).toBe("");
  });

  it("shows the trigger for an editable subscription order", () => {
    render(
      <EditUndeliveredOrderControl
        orderId={ORDER_ID}
        status="BeingPrepared"
        isSubscriptionOrder={true}
        items={ITEMS}
      />,
    );
    expect(screen.getByText(/edit order \(reduce\)/i)).toBeInTheDocument();
  });
});

describe("EditUndeliveredOrderControl — submit", () => {
  it("submits ONLY reduced lines", async () => {
    render(
      <EditUndeliveredOrderControl
        orderId={ORDER_ID}
        status="BeingPrepared"
        isSubscriptionOrder={true}
        items={ITEMS}
      />,
    );

    // Open the editor (populates qty inputs from current quantities).
    fireEvent.click(screen.getByText(/edit order \(reduce\)/i));

    // Reduce only the first line 5 -> 2; leave the second unchanged.
    const inputA = screen.getByLabelText(/quantity for original/i);
    fireEvent.change(inputA, { target: { value: "2" } });

    fireEvent.click(screen.getByText(/save reductions/i));

    await waitFor(() => expect(mockEdit).toHaveBeenCalledTimes(1));
    expect(mockEdit).toHaveBeenCalledWith({
      orderId: ORDER_ID,
      lines: [{ itemId: "item_a", newQty: 2 }],
    });
    expect(toast.success).toHaveBeenCalled();
  });

  it("blocks an increase (clamps to current → no changed line → Save disabled)", () => {
    render(
      <EditUndeliveredOrderControl
        orderId={ORDER_ID}
        status="BeingPrepared"
        isSubscriptionOrder={true}
        items={ITEMS}
      />,
    );
    fireEvent.click(screen.getByText(/edit order \(reduce\)/i));

    const inputA = screen.getByLabelText(/quantity for original/i);
    fireEvent.change(inputA, { target: { value: "9" } });

    const saveBtn = screen.getByText(/save reductions/i).closest("button")!;
    expect(saveBtn).toBeDisabled();
    fireEvent.click(saveBtn);
    expect(mockEdit).not.toHaveBeenCalled();
  });
});
