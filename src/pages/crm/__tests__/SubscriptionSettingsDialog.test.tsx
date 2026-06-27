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

vi.mock("convex-helpers/react/sessions", () => ({
  useSessionMutation: (...args: unknown[]) => useSessionMutationMock(...args),
}));

// api module — mocked to supply stable string references that argument-based
// dispatch can compare. Path is 4 levels up from __tests__/ to reach root convex/.
vi.mock("../../../../convex/_generated/api", () => ({
  api: {
    subscriptions: {
      mutations: {
        scheduleBaselineChange: "scheduleBaselineChange",
        cancelBaselineChange: "cancelBaselineChange",
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
  scheduleBaselineFn.mockResolvedValue({ effectiveDate: Date.now() + 14 * 86400000 });
  giveTerminationFn.mockResolvedValue({ terminationNoticeDate: Date.now(), endDate: Date.now() + 30 * 86400000 });

  // Argument-based dispatch: api module is mocked to stable string constants
  // above, so useSessionMutation receives a distinguishable string per mutation.
  useSessionMutationMock.mockImplementation((mutationRef) => {
    if (mutationRef === "scheduleBaselineChange") return scheduleBaselineFn;
    if (mutationRef === "giveTerminationNotice") return giveTerminationFn;
    return vi.fn();
  });
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

  it("does not call scheduleBaselineChange when qty is 0", async () => {
    renderDialog();
    const input = screen.getByLabelText(/baseline daily qty/i);
    await userEvent.clear(input);
    await userEvent.type(input, "0");
    fireEvent.click(screen.getByRole("button", { name: /change baseline/i }));
    expect(scheduleBaselineFn).not.toHaveBeenCalled();
  });

  it("does not call scheduleBaselineChange when input is cleared (empty → 0)", async () => {
    renderDialog();
    const input = screen.getByLabelText(/baseline daily qty/i);
    await userEvent.clear(input);
    fireEvent.click(screen.getByRole("button", { name: /change baseline/i }));
    expect(scheduleBaselineFn).not.toHaveBeenCalled();
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

  it("hides the termination button and shows an ending notice when status is terminating", () => {
    renderDialog({ status: "terminating" });
    expect(
      screen.queryByRole("button", { name: /give 30-day termination notice/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/this subscription is ending/i)).toBeInTheDocument();
  });

  it("hides the termination button and shows an ended notice when status is ended", () => {
    renderDialog({ status: "ended" });
    expect(
      screen.queryByRole("button", { name: /give 30-day termination notice/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/this subscription has ended/i)).toBeInTheDocument();
  });

  it("enables termination button when status is active", () => {
    renderDialog({ status: "active" });
    expect(
      screen.getByRole("button", { name: /give 30-day termination notice/i }),
    ).not.toBeDisabled();
  });
});

describe("SubscriptionSettingsDialog — pending baseline change record", () => {
  it("shows the staged change and a cancel affordance when pendingBaselineChange is set", () => {
    const onClose = vi.fn();
    render(
      <SubscriptionSettingsDialog
        subscriptionId={SUB_ID}
        label="Mon–Fri box"
        baselineDailyQty={10}
        status="active"
        pendingBaselineChange={{ newQty: 15, effectiveDate: Date.now() + 14 * 86400000 }}
        onClose={onClose}
      />,
    );
    expect(screen.getByText(/pending change/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /cancel change/i }),
    ).toBeInTheDocument();
  });
});
