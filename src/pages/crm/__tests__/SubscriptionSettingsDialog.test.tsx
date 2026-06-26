/**
 * SubscriptionSettingsDialog RTL tests — Task 12.
 *
 * Covers:
 *   - Renders dialog with subscription label
 *   - Entering a baseline value + clicking submit calls scheduleBaselineChange({ subscriptionId, newQty })
 *   - Clicking "Give 30-day termination notice" + confirm calls giveTerminationNotice({ subscriptionId })
 *   - Loading state on baseline submit
 *   - Error state: toast.error called on mutation rejection
 *   - Termination button disabled when status is "terminating" or "ended"
 *
 * useSessionMutation is mocked via convex-helpers/react/sessions.
 * No on-mount manager-only query is exercised — all props are passed directly (Pitfall #19).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const scheduleBaselineFn = vi.fn();
const giveTerminationFn = vi.fn();
const useSessionMutationMock = vi.fn();

// Cyclic dispatch index — reset in beforeEach so each test gets clean slate.
// The component always calls useSessionMutation in fixed order:
//   even calls → scheduleBaselineFn, odd calls → giveTerminationFn.
// Cyclic dispatch handles re-renders correctly (vs mockReturnValueOnce which
// is consumed on the first render and returns undefined on re-renders).
let mockHookCallIdx = 0;

vi.mock("convex-helpers/react/sessions", () => ({
  useSessionMutation: (...args: unknown[]) => useSessionMutationMock(...args),
}));

// api module — anyApi proxy; mocked to supply stable string references.
vi.mock("../../../convex/_generated/api", () => ({
  api: {
    subscriptions: {
      mutations: {
        scheduleBaselineChange: "scheduleBaselineChange",
        giveTerminationNotice: "giveTerminationNotice",
      },
    },
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// Mock Radix Dialog to avoid portal rendering issues in JSDOM.
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({
    open,
    children,
  }: {
    open: boolean;
    onOpenChange: () => void;
    children: React.ReactNode;
  }) => (open ? <div role="dialog">{children}</div> : null),
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <h2>{children}</h2>
  ),
  DialogDescription: ({ children }: { children: React.ReactNode }) => (
    <p>{children}</p>
  ),
  DialogFooter: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

import { SubscriptionSettingsDialog } from "../SubscriptionSettingsDialog";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SUB_ID = "sub_xyz789" as never;

function renderDialog(overrides: { status?: string; label?: string } = {}) {
  const onClose = vi.fn();
  render(
    <SubscriptionSettingsDialog
      subscriptionId={SUB_ID}
      label={overrides.label ?? "Mon–Fri box"}
      baselineDailyQty={10}
      status={overrides.status ?? "active"}
      onClose={onClose}
    />,
  );
  return { onClose };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockHookCallIdx = 0;
  scheduleBaselineFn.mockResolvedValue({ effectiveDate: Date.now() + 14 * 86400000 });
  giveTerminationFn.mockResolvedValue({ terminationNoticeDate: Date.now(), endDate: Date.now() + 30 * 86400000 });

  // Cyclic dispatch: even slots → scheduleBaselineFn, odd → giveTerminationFn.
  // api.subscriptions.mutations.* is the anyApi Proxy (real convex reference),
  // not the mocked string — argument comparison won't work. Use call order.
  const cyclicFns = [scheduleBaselineFn, giveTerminationFn];
  useSessionMutationMock.mockImplementation(
    () => cyclicFns[mockHookCallIdx++ % cyclicFns.length],
  );
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SubscriptionSettingsDialog — rendering", () => {
  it("renders the dialog with subscription label", () => {
    renderDialog();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Mon–Fri box")).toBeInTheDocument();
  });

  it("renders the baseline input pre-filled with baselineDailyQty", () => {
    renderDialog();
    const input = screen.getByLabelText(/baseline daily qty/i);
    expect(input).toHaveValue(10);
  });

  it("renders the termination notice button", () => {
    renderDialog();
    expect(
      screen.getByRole("button", { name: /give 30-day termination notice/i }),
    ).toBeInTheDocument();
  });
});

describe("SubscriptionSettingsDialog — baseline change", () => {
  it("calls scheduleBaselineChange with subscriptionId and newQty on submit", async () => {
    renderDialog();
    const input = screen.getByLabelText(/baseline daily qty/i);
    await userEvent.clear(input);
    await userEvent.type(input, "15");

    const submitBtn = screen.getByRole("button", { name: /change baseline/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(scheduleBaselineFn).toHaveBeenCalledWith({
        subscriptionId: SUB_ID,
        newQty: 15,
      });
    });
  });

  it("shows loading state while baseline mutation is pending", async () => {
    // Never resolves — stays in loading state.
    scheduleBaselineFn.mockReturnValue(new Promise(() => {}));
    renderDialog();
    const submitBtn = screen.getByRole("button", { name: /change baseline/i });
    fireEvent.click(submitBtn);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /scheduling/i })).toBeDisabled();
    });
  });

  it("calls toast.error when scheduleBaselineChange rejects", async () => {
    scheduleBaselineFn.mockRejectedValue(new Error("Subscription has ended"));
    renderDialog();
    const submitBtn = screen.getByRole("button", { name: /change baseline/i });
    fireEvent.click(submitBtn);
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });
  });
});

describe("SubscriptionSettingsDialog — termination notice", () => {
  it("calls giveTerminationNotice with subscriptionId after confirm step", async () => {
    renderDialog();
    // Click the termination button to enter confirm step.
    const terminateBtn = screen.getByRole("button", { name: /give 30-day termination notice/i });
    fireEvent.click(terminateBtn);

    // Confirm step should appear.
    const confirmBtn = await screen.findByRole("button", { name: /confirm termination/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(giveTerminationFn).toHaveBeenCalledWith({ subscriptionId: SUB_ID });
    });
  });

  it("shows a confirmation prompt before firing the mutation", async () => {
    renderDialog();
    const terminateBtn = screen.getByRole("button", { name: /give 30-day termination notice/i });
    fireEvent.click(terminateBtn);

    // Mutation must NOT have been called yet.
    expect(giveTerminationFn).not.toHaveBeenCalled();
    // Confirm button must be visible.
    expect(
      screen.getByRole("button", { name: /confirm termination/i }),
    ).toBeInTheDocument();
  });

  it("calls toast.error when giveTerminationNotice rejects", async () => {
    giveTerminationFn.mockRejectedValue(new Error("Already terminating"));
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: /give 30-day termination notice/i }));
    fireEvent.click(await screen.findByRole("button", { name: /confirm termination/i }));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });
  });

  it("disables termination button when status is terminating", () => {
    renderDialog({ status: "terminating" });
    expect(
      screen.getByRole("button", { name: /give 30-day termination notice/i }),
    ).toBeDisabled();
  });

  it("disables termination button when status is ended", () => {
    renderDialog({ status: "ended" });
    expect(
      screen.getByRole("button", { name: /give 30-day termination notice/i }),
    ).toBeDisabled();
  });

  it("enables termination button when status is active", () => {
    renderDialog({ status: "active" });
    expect(
      screen.getByRole("button", { name: /give 30-day termination notice/i }),
    ).not.toBeDisabled();
  });
});
