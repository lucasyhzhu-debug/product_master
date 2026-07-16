/**
 * OrderQrisStatus — the read-only "QRIS payment attached" row shown on both
 * order surfaces so a paid QRIS stays visible after the order transitions.
 *
 * Purely presentational (props only) — no hook/auth mocks needed.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OrderQrisStatus } from "../OrderQrisStatus";

describe("OrderQrisStatus", () => {
  const FUTURE = Date.now() + 30 * 60 * 1000;

  it("renders nothing while loading (undefined) or when no row (null)", () => {
    const { container: loading } = render(
      <OrderQrisStatus row={undefined} orderStatus="AwaitingPayment" onView={() => {}} />,
    );
    expect(loading.firstChild).toBeNull();

    const { container: none } = render(
      <OrderQrisStatus row={null} orderStatus="AwaitingPayment" onView={() => {}} />,
    );
    expect(none.firstChild).toBeNull();
  });

  it("shows a Paid row with amount + source, and stays even on a terminal order", () => {
    render(
      <OrderQrisStatus
        row={{ status: "paid", amount: 120000, source: "DANA" }}
        orderStatus="Cancelled"
        onView={() => {}}
      />,
    );
    expect(screen.getByText(/QRIS Paid/)).toBeInTheDocument();
    expect(screen.getByText(/120\.000/)).toBeInTheDocument();
    expect(screen.getByText(/DANA/)).toBeInTheDocument();
  });

  it("shows a live pending row awaiting payment with a View QR action", () => {
    const onView = vi.fn();
    render(
      <OrderQrisStatus
        row={{ status: "pending", amount: 35000, expiresAt: FUTURE }}
        orderStatus="AwaitingPayment"
        onView={onView}
      />,
    );
    expect(screen.getByText(/QRIS ready/)).toBeInTheDocument();
    expect(screen.getByText(/awaiting payment/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /View QR/i }));
    expect(onView).toHaveBeenCalledTimes(1);
  });

  it("hides a pending (still-scannable) row on a terminal/cancelled order", () => {
    const { container } = render(
      <OrderQrisStatus
        row={{ status: "pending", amount: 35000, expiresAt: FUTURE }}
        orderStatus="Cancelled"
        onView={() => {}}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("hides a pending row whose 30-min window has elapsed", () => {
    const { container } = render(
      <OrderQrisStatus
        row={{ status: "pending", amount: 35000, expiresAt: Date.now() - 1000 }}
        orderStatus="AwaitingPayment"
        onView={() => {}}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("View on a paid row re-opens the dialog", () => {
    const onView = vi.fn();
    render(
      <OrderQrisStatus
        row={{ status: "paid", amount: 50000 }}
        orderStatus="PaymentReceived"
        onView={onView}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^View$/i }));
    expect(onView).toHaveBeenCalledTimes(1);
  });
});
