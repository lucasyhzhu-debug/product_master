// src/components/crm/ReconcileWeekDialog.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReconcileWeekDialog } from "./ReconcileWeekDialog";

// Stub the session mutation hook so the dialog renders without a Convex provider.
vi.mock("convex-helpers/react/sessions", () => ({ useSessionMutation: () => vi.fn() }));

describe("ReconcileWeekDialog", () => {
  it("disables Reconcile until a comment is entered", async () => {
    render(
      <ReconcileWeekDialog subscriptionWeekId={"w1" as never} open onOpenChange={() => {}} />,
    );
    const submit = screen.getByRole("button", { name: /reconcile/i });
    expect(submit).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/comment/i), "cafe undercount");
    expect(submit).toBeEnabled();
  });
});
