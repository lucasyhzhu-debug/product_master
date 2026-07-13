/**
 * Login — "remember last signed-in user" (PR #234).
 *
 * These cover the invariants that `tsc` cannot protect:
 *
 *  - The remembered user is applied once the Convex query resolves (`useQuery`
 *    returns `undefined` first), not dropped on the loading tick.
 *  - After tapping "Login as someone else", a live-query re-emission of
 *    `activeUsers` (a fresh array identity) must NOT snap the operator back
 *    onto the PIN pad. The selection is derived from an explicit-choice state
 *    rather than synced in via an effect, so a re-emit just recomputes the
 *    same values — this test locks that in against a refactor back to an
 *    effect (which needs a one-shot guard to be correct at all).
 *  - A remembered user who is no longer active is forgotten, not offered.
 */
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const mockUseQuery = vi.fn();
vi.mock("convex/react", () => ({
  useQuery: () => mockUseQuery(),
}));

vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({
    login: vi.fn(),
    isAuthenticated: false,
    user: null,
  }),
}));

import Login from "../Login";

const RINA = { _id: "user_rina", name: "Rina", role: "order_staff", avatarUrl: undefined };
const BUDI = { _id: "user_budi", name: "Budi", role: "kitchen", avatarUrl: undefined };
const USERS = [RINA, BUDI];

// Must return a FRESH element each call. Passing the same element reference to
// rerender() hits React's element-identity bailout: with no state change, the
// re-render is skipped entirely and the component never sees the resolved
// query — which silently turns the rerender-based tests below into no-ops.
const loginUI = () => (
  <MemoryRouter>
    <Login />
  </MemoryRouter>
);

const renderLogin = () => render(loginUI());

const grid = () => screen.queryByText("Who's signing in?");
const pinPadFor = (name: string) => screen.queryByText(name);

describe("Login — remember last signed-in user", () => {
  beforeEach(() => {
    localStorage.clear();
    mockUseQuery.mockReset();
  });

  it("shows the avatar grid when no one is remembered", () => {
    mockUseQuery.mockReturnValue(USERS);
    renderLogin();

    expect(grid()).toBeInTheDocument();
    expect(screen.queryByText("Login as someone else")).not.toBeInTheDocument();
  });

  it("opens on the PIN pad for the remembered user", () => {
    localStorage.setItem("malo_last_user_id", RINA._id);
    mockUseQuery.mockReturnValue(USERS);
    renderLogin();

    expect(grid()).not.toBeInTheDocument();
    expect(pinPadFor("Rina")).toBeInTheDocument();
    expect(screen.getByText("Welcome back — enter your PIN")).toBeInTheDocument();
    expect(screen.getByText("Login as someone else")).toBeInTheDocument();
  });

  // The loading tick must not drop the remembered user.
  it("still auto-selects when the user list resolves after mount", () => {
    localStorage.setItem("malo_last_user_id", RINA._id);
    mockUseQuery.mockReturnValue(undefined); // Convex still loading
    const { rerender } = renderLogin();

    expect(pinPadFor("Rina")).not.toBeInTheDocument();

    mockUseQuery.mockReturnValue(USERS); // data arrives
    rerender(loginUI());

    expect(pinPadFor("Rina")).toBeInTheDocument();
  });

  // The selection is derived, not synced in via an effect, so the PIN pad is
  // on the FIRST frame that has data. An effect-based version would paint the
  // avatar grid first and then snap — a visible flash of the wrong screen on
  // every single login-page load.
  it("never paints the avatar grid before snapping to the PIN pad", () => {
    localStorage.setItem("malo_last_user_id", RINA._id);
    mockUseQuery.mockReturnValue(USERS);
    renderLogin();

    // If the grid had painted first, this would have been rendered at least once.
    expect(grid()).not.toBeInTheDocument();
    expect(pinPadFor("Rina")).toBeInTheDocument();
  });

  it("forgets a remembered user who is no longer active", () => {
    localStorage.setItem("malo_last_user_id", "user_deactivated");
    mockUseQuery.mockReturnValue(USERS);
    renderLogin();

    expect(grid()).toBeInTheDocument();
    expect(localStorage.getItem("malo_last_user_id")).toBeNull();
  });

  it("ignores a device-tampered id that matches no active user", () => {
    localStorage.setItem("malo_last_user_id", "not-a-real-id");
    mockUseQuery.mockReturnValue(USERS);
    renderLogin();

    expect(grid()).toBeInTheDocument();
  });

  describe("'Login as someone else'", () => {
    it("returns to the avatar grid", () => {
      localStorage.setItem("malo_last_user_id", RINA._id);
      mockUseQuery.mockReturnValue(USERS);
      renderLogin();

      fireEvent.click(screen.getByText("Login as someone else"));

      expect(grid()).toBeInTheDocument();
      expect(screen.queryByText("Welcome back — enter your PIN")).not.toBeInTheDocument();
    });

    // Regression guard: any live-query push (user renamed, user added) must not
    // yank the operator back to Rina's pad after they said "not me".
    it("survives a live re-emission of the user list", () => {
      localStorage.setItem("malo_last_user_id", RINA._id);
      mockUseQuery.mockReturnValue(USERS);
      const { rerender } = renderLogin();

      fireEvent.click(screen.getByText("Login as someone else"));
      expect(grid()).toBeInTheDocument();

      // Convex pushes a fresh array identity (same data, new reference).
      mockUseQuery.mockReturnValue([...USERS]);
      rerender(loginUI());

      expect(grid()).toBeInTheDocument();
      expect(screen.queryByText("Welcome back — enter your PIN")).not.toBeInTheDocument();
    });

    // Deliberate: the memory is "last person who LOGGED IN", not "last person
    // who touched the screen". Only a successful login advances it. See the
    // header comment in src/lib/lastUser.ts.
    it("does NOT clear the remembered user (only a successful login advances it)", () => {
      localStorage.setItem("malo_last_user_id", RINA._id);
      mockUseQuery.mockReturnValue(USERS);
      renderLogin();

      fireEvent.click(screen.getByText("Login as someone else"));

      expect(localStorage.getItem("malo_last_user_id")).toBe(RINA._id);
    });
  });
});
