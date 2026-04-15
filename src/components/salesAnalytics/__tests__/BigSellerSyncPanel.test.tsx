/**
 * Phase 79 Wave 0 — Plan 01 Task 2 (updated in Plan 07 Task 2 to match
 * the hooks barrel surface that Wave 3 actually ships).
 *
 * Verifies the two new admin action buttons ("Backfill historical items",
 * "Re-check empty rows") are rendered and wired to the useBackfill /
 * useRescan hooks.
 *
 * Anchor: DA-10 (backfill) + DA-13 (re-check).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock Convex hooks — match the real import path used by the component.
const backfillMock = vi.fn();
const rescanMock = vi.fn();
const startSyncMock = vi.fn();

vi.mock("@/hooks/convex", () => ({
  useBigSellerSyncState: () => ({ data: { stage: "idle" }, isLoading: false }),
  useBigSellerOrderStats: () => ({
    data: { totalOrders: 0, ordersByPlatform: {}, totalRevenue: 0, dateRange: null, allCostFeeZero: false },
    isLoading: false,
  }),
  useStartBigSellerSync: () => startSyncMock,
  useBackfillBigsellerItems: () => backfillMock,
  useRescanEmptyRows: () => rescanMock,
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { _id: "user1", name: "Admin", role: "admin", token: "admin-token" },
  }),
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

// Stub actionToast (uses react-dom portals).
vi.mock("@/lib/actionToast", () => ({
  actionToast: vi.fn(),
}));

// Import AFTER mocks.
import { BigSellerSyncPanel } from "../BigSellerSyncPanel";

describe("BigSellerSyncPanel — Phase 79 Plan 07 T2", () => {
  beforeEach(() => {
    backfillMock.mockReset();
    rescanMock.mockReset();
    startSyncMock.mockReset();
  });

  it("renders the 'Backfill historical items' button", () => {
    render(<BigSellerSyncPanel />);
    expect(screen.getByText("Backfill historical items")).toBeInTheDocument();
  });

  it("renders the 'Re-check empty rows' button", () => {
    render(<BigSellerSyncPanel />);
    expect(screen.getByText("Re-check empty rows")).toBeInTheDocument();
  });

  it("calls useBackfillBigsellerItems when 'Backfill historical items' is clicked", async () => {
    const user = userEvent.setup();
    backfillMock.mockResolvedValue({
      created: 10,
      skipped: 0,
      processedOrders: 5,
      hasMore: false,
    });

    render(<BigSellerSyncPanel />);
    await user.click(
      screen.getByRole("button", { name: /Backfill historical items/i }),
    );

    expect(backfillMock).toHaveBeenCalledTimes(1);
    expect(backfillMock).toHaveBeenCalledWith(
      expect.objectContaining({ token: "admin-token", limit: 500 }),
    );
  });

  it("disables the backfill button while the mutation is in flight", async () => {
    const user = userEvent.setup();
    // Never-resolving promise simulates in-flight state.
    backfillMock.mockImplementation(() => new Promise(() => {}));

    render(<BigSellerSyncPanel />);
    const btn = screen.getByRole("button", { name: /Backfill historical items/i });
    await user.click(btn);

    expect(btn).toBeDisabled();
  });
});
