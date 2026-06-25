/**
 * T12 — Nav smoke tests: CRM link visibility gated by canAccessCrm permission.
 *
 * CRM ships in the "Config" dropdown (configItems). The dropdown must be opened
 * before querying. Radix DropdownMenu requires pointer events — we use
 * userEvent.setup() (user-event v14) which emulates them correctly in JSDOM.
 *
 * manager → canAccessCrm true  → CRM menuitem present after opening Config
 * order_staff → canAccessCrm false → CRM menuitem absent even after opening Config
 *
 * Auth mocked at context level; Router via MemoryRouter; ThemeContext + useScrollDirection stubbed.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

// Stub ThemeContext so Header doesn't hit matchMedia
vi.mock("@/contexts/ThemeContext", () => ({
  useTheme: () => ({ theme: "light", setTheme: vi.fn(), resolvedTheme: "light" }),
}));

// Stub useScrollDirection to avoid scroll listener side-effects in JSDOM
vi.mock("@/hooks/useScrollDirection", () => ({
  useScrollDirection: () => true,
}));

// Auth mock — swapped per test
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

describe("Header — CRM nav entry in Config dropdown (T12)", () => {
  it("shows the CRM entry for a manager after opening Config dropdown (canAccessCrm=true)", async () => {
    const user = userEvent.setup();

    mockAuth.user = { _id: "u1", name: "Manager", role: "manager", token: "mgr-token" };
    mockAuth.isAuthenticated = true;
    mockAuth.hasPermission.mockImplementation((perm: string) => perm === "canAccessCrm");

    renderHeader();

    // Open the Config dropdown
    const configTrigger = screen.getByRole("button", { name: /config/i });
    await user.click(configTrigger);

    // CRM should now be present in the dropdown content
    expect(screen.getByRole("menuitem", { name: /crm/i })).toBeInTheDocument();
  });

  it("hides the CRM entry for order_staff even after opening Config dropdown (canAccessCrm=false)", async () => {
    const user = userEvent.setup();

    mockAuth.user = { _id: "u2", name: "Staff", role: "order_staff", token: "staff-token" };
    mockAuth.isAuthenticated = true;
    mockAuth.hasPermission.mockImplementation(() => false);

    renderHeader();

    const configTrigger = screen.getByRole("button", { name: /config/i });
    await user.click(configTrigger);

    expect(screen.queryByRole("menuitem", { name: /crm/i })).not.toBeInTheDocument();
  });
});
