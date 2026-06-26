/**
 * NewSubscriptionPage RTL smoke test.
 *
 * Asserts:
 *   - The "New subscription" heading renders.
 *   - The breadcrumb trail ("CRM", "Customer", "New subscription") is present.
 *   - The SubscriptionForm is mounted (via stub).
 *
 * react-router-dom MemoryRouter supplies a :customerId param via initialEntries.
 * SubscriptionForm is stubbed so no Convex transport is needed.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

// Stub SubscriptionForm — we only care that it is rendered, not its internals.
vi.mock("@/components/crm/SubscriptionForm", () => ({
  SubscriptionForm: ({ customerId }: { customerId: string }) => (
    <div data-testid="subscription-form" data-customer-id={customerId} />
  ),
}));

// Breadcrumbs — render real component (no convex dependency).

import { NewSubscriptionPage } from "../NewSubscriptionPage";

const CUSTOMER_ID = "cust_abc123";

function renderPage() {
  return render(
    <MemoryRouter
      initialEntries={[`/crm/customers/${CUSTOMER_ID}/subscriptions/new`]}
    >
      <Routes>
        <Route
          path="/crm/customers/:customerId/subscriptions/new"
          element={<NewSubscriptionPage />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("NewSubscriptionPage", () => {
  it("renders the 'New subscription' heading", () => {
    renderPage();
    expect(
      screen.getByRole("heading", { name: /new subscription/i }),
    ).toBeInTheDocument();
  });

  it("renders breadcrumb segments CRM, Customer, New subscription", () => {
    renderPage();
    // CRM and Customer render as links; New subscription renders as current page text.
    expect(screen.getByRole("link", { name: /^CRM$/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^Customer$/i })).toBeInTheDocument();
    expect(screen.getByText("New subscription", { selector: "span" })).toBeInTheDocument();
  });

  it("renders SubscriptionForm with the customerId from the URL", () => {
    renderPage();
    const form = screen.getByTestId("subscription-form");
    expect(form).toBeInTheDocument();
    expect(form).toHaveAttribute("data-customer-id", CUSTOMER_ID);
  });
});
