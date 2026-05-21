/**
 * Phase 84 Wave 0 — TDD RED tests for QrisChargeDialog (R5 / R7).
 *
 *   - Mounts without crashing for all 3 roles (order_staff, manager, admin) — the
 *     role superset that canAccessOrders resolves to (pitfall #19; no order_staff crash).
 *   - Renders the ACTIVE state (subscription returns a status:"pending" row with a
 *     qrString + future expiresAt) so QRCodeSVG is actually INVOKED — catches a
 *     wrong default-vs-named qrcode.react import (staffreview I5).
 *   - Flips to the paid panel when the subscription row.status === "paid" (reactive).
 *
 * RED STATE: imports `{ QrisChargeDialog }` from `../QrisChargeDialog`, which does
 * NOT exist until Plan 05 (84-05). Running this suite fails to resolve the module —
 * that is the TDD contract for Wave 0. DO NOT stub the component.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// ---- Hook mocks (the dialog reads the active QRIS row + config from useQris). ----
const activeQrisMock = vi.fn();
const qrisConfigMock = vi.fn();

vi.mock("@/hooks/convex/useQris", () => ({
  useActiveQrisPayment: (...args: unknown[]) => activeQrisMock(...args),
  useQrisConfig: (...args: unknown[]) => qrisConfigMock(...args),
}));

// AuthContext — the active user role is parameterised per test.
const authUserMock = vi.fn();
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: authUserMock() }),
}));

vi.mock("sonner", () => ({
  toast: {
    loading: vi.fn(() => "toast-id"),
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    dismiss: vi.fn(),
  },
}));

// Import AFTER mocks. RED until Plan 05 lands the component.
import { QrisChargeDialog } from "../QrisChargeDialog";

const PENDING_ROW = {
  status: "pending" as const,
  qrString: "00020101021226TESTQR0521",
  amount: 35000,
  expiresAt: Date.now() + 30 * 60 * 1000,
};

const PAID_ROW = {
  status: "paid" as const,
  qrString: "00020101021226TESTQR0521",
  amount: 35000,
  expiresAt: Date.now() + 30 * 60 * 1000,
  paidAt: Date.now(),
};

function setRole(role: "order_staff" | "manager" | "admin") {
  authUserMock.mockReturnValue({ _id: "u1", name: "Tester", role, token: `${role}-token` });
}

describe("QrisChargeDialog (R5/R7)", () => {
  beforeEach(() => {
    activeQrisMock.mockReset();
    qrisConfigMock.mockReset();
    authUserMock.mockReset();
    qrisConfigMock.mockReturnValue({ enabled: true, qrisNmid: "ID12345", merchantName: "Frollie" });
    activeQrisMock.mockReturnValue(PENDING_ROW);
  });

  it.each(["order_staff", "manager", "admin"] as const)(
    "mounts without crashing for role %s (no order_staff crash, pitfall #19)",
    (role) => {
      setRole(role);
      expect(() =>
        render(<QrisChargeDialog open orderId={"order_1" as never} onOpenChange={() => {}} />),
      ).not.toThrow();
    },
  );

  it("renders the ACTIVE state so QRCodeSVG is actually invoked (qrString present)", () => {
    setRole("manager");
    activeQrisMock.mockReturnValue(PENDING_ROW);
    const { container } = render(
      <QrisChargeDialog open orderId={"order_1" as never} onOpenChange={() => {}} />,
    );
    // qrcode.react's QRCodeSVG renders an <svg>; assert it actually mounted.
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("flips to the paid panel reactively when the subscription row.status === 'paid'", () => {
    setRole("manager");
    activeQrisMock.mockReturnValue(PAID_ROW);
    render(<QrisChargeDialog open orderId={"order_1" as never} onOpenChange={() => {}} />);
    expect(screen.getByText(/paid/i)).toBeInTheDocument();
  });
});
