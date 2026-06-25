/**
 * T12 — Nav smoke tests: CRM link visibility gated by canAccessCrm permission.
 *
 * manager + admin → canAccessCrm true  → "CRM" link visible
 * order_staff     → canAccessCrm false → "CRM" link absent
 *
 * Auth is mocked at the context level (same pattern as StatementProgressHeader.test.tsx).
 * Router is provided by MemoryRouter; ThemeContext is stubbed to avoid real DOM APIs.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Stub ThemeContext so Header doesn't hit matchMedia
vi.mock("@/contexts/ThemeContext", () => ({
  useTheme: () => ({ theme: "light", setTheme: vi.fn(), resolvedTheme: "light" }),
}));

// Stub useScrollDirection to avoid scroll listener side-effects in JSDOM
vi.mock("@/hooks/useScrollDirection", () => ({
  useScrollDirection: () => true,
}));

// We swap out AuthContext per test using factory below
const mockAuth = {
  user: null as { _id: string; name: string; role: string; token: string } | null,
  isAuthenticated: false,
  logout: vi.fn(),
  hasPermission: vi.fn(() => false),
  hasRole: vi.fn(() => false),
};

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockAuth,
}));

import { Header } from "../Header";

function renderHeader() {
  return render(
    <MemoryRouter>
      <Header />
    </MemoryRouter>,
  );
}

describe("Header — CRM nav entry (T12)", () => {
  it("shows the CRM link for a manager (canAccessCrm=true)", () => {
    mockAuth.user = { _id: "u1", name: "Manager", role: "manager", token: "mgr-token" };
    mockAuth.isAuthenticated = true;
    // manager has canAccessCrm = true → return true for that permission
    mockAuth.hasPermission.mockImplementation((perm: string) => perm === "canAccessCrm");

    renderHeader();

    expect(screen.getByRole("link", { name: /crm/i })).toBeInTheDocument();
  });

  it("hides the CRM link for order_staff (canAccessCrm=false)", () => {
    mockAuth.user = { _id: "u2", name: "Staff", role: "order_staff", token: "staff-token" };
    mockAuth.isAuthenticated = true;
    // order_staff does NOT have canAccessCrm
    mockAuth.hasPermission.mockImplementation(() => false);

    renderHeader();

    expect(screen.queryByRole("link", { name: /crm/i })).not.toBeInTheDocument();
  });
});
