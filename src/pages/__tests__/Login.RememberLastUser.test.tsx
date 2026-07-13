/**
 * Login — "remember last signed-in user" (PR #234).
 *
 * These cover the invariants that `tsc` cannot protect:
 *
 *  - The auto-select must NOT be consumed by the Convex loading tick
 *    (`useQuery` returns `undefined` before it returns the array). If the
 *    one-shot ref were set before the undefined-guard, auto-select would
 *    never fire at all.
 *  - After tapping "Login as someone else", a live-query re-emission of
 *    `activeUsers` (a fresh array identity) must NOT snap the operator back
 *    onto the PIN pad. This is the entire reason the ref guard exists; a
 *    future refactor that adds `selectedUserId` to the dep array, or converts
 *    the effect to derived state, silently reintroduces the bug.
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

function renderLogin() {
  return render(
    <MemoryRouter>
      <Login />
    </MemoryRouter>
  );
}

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

  // The loading tick must not burn the one-shot ref.
  it("still auto-selects when the user list resolves after mount", () => {
    localStorage.setItem("malo_last_user_id", RINA._id);
    mockUseQuery.mockReturnValue(undefined); // Convex still loading
    const { rerender } = renderLogin();

    expect(pinPadFor("Rina")).not.toBeInTheDocument();

    mockUseQuery.mockReturnValue(USERS); // data arrives
    rerender(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );

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

    // Regression guard for the useRef one-shot. Without it, any live-query
    // push (user renamed, user added) yanks the operator back to Rina's pad.
    it("survives a live re-emission of the user list", () => {
      localStorage.setItem("malo_last_user_id", RINA._id);
      mockUseQuery.mockReturnValue(USERS);
      const { rerender } = renderLogin();

      fireEvent.click(screen.getByText("Login as someone else"));
      expect(grid()).toBeInTheDocument();

      // Convex pushes a fresh array identity (same data, new reference).
      mockUseQuery.mockReturnValue([...USERS]);
      rerender(
        <MemoryRouter>
          <Login />
        </MemoryRouter>
      );

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
