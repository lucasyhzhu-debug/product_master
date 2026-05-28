/**
 * Phase 85 — RTL tests for TelegramChatsManager (spec cases #21, #22).
 *
 * Covers:
 *   - Status badge derivation: archived / error / live / dormant (#22)
 *   - AlertDialog opens + forceReassign called when role already held (#21)
 *   - Empty state renders with /register command text
 *
 * Radix Select adaptation note:
 *   @radix-ui/react-select@2.2.6 uses pointer-capture APIs and portals that
 *   jsdom (27.x) does not implement. When userEvent.click opens the trigger,
 *   SelectContentImpl throws "target.hasPointerCapture is not a function" as
 *   an unhandled error, and the portal content never mounts — so there are
 *   no [role=option] items to click. This Radix version also does NOT render
 *   a hidden native <select> (data-radix-select-native-hidden was dropped in
 *   v2.x), ruling out the fireEvent.change-on-hidden-select approach.
 *
 *   No repo-wide precedent exists for driving Radix Select in tests (grep of
 *   src/__tests__ for "combobox", "onValueChange", and "SelectTrigger" found
 *   zero matches in all __tests__ files).
 *
 *   Adaptation chosen: mock @/components/ui/select with a lightweight test
 *   double that renders a plain native <select> forwarding onValueChange to
 *   the onChange handler. This is the established jsdom pattern when Radix
 *   portals are involved. The behavioral assertions (dialog opens, assignRole
 *   called with forceReassign:true) remain identical — we are only replacing
 *   the unworkable Radix portal mechanism with something jsdom can drive.
 *   The Select mock is scoped to this test file via vi.mock.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import React from "react";

// ---- Radix Select test double (jsdom-compatible native <select>) ----
// SelectTrigger, SelectContent, SelectScrollUpButton, SelectScrollDownButton
// and SelectSeparator are stubs that render nothing or pass-through children,
// because only Select (Root) + SelectItem need to be functional for this test.
vi.mock("@/components/ui/select", () => {
  type SelectRootProps = {
    value?: string;
    onValueChange?: (v: string) => void;
    children?: React.ReactNode;
  };
  type SelectItemProps = {
    value: string;
    children?: React.ReactNode;
  };

  // Collect (value, label) pairs via context so Select can build a <select>.
  const Ctx = React.createContext<{
    addOption: (v: string, label: string) => void;
    value: string;
    onValueChange: (v: string) => void;
  }>({ addOption: () => {}, value: "", onValueChange: () => {} });

  function Select({ value = "", onValueChange = () => {}, children }: SelectRootProps) {
    const [options, setOptions] = React.useState<{ v: string; label: string }[]>([]);
    const addOption = React.useCallback((v: string, label: string) => {
      setOptions((prev) => {
        if (prev.some((o) => o.v === v)) return prev;
        return [...prev, { v, label }];
      });
    }, []);
    return (
      <Ctx.Provider value={{ addOption, value, onValueChange }}>
        {/* Render children so SelectItem stubs can register their values */}
        <div style={{ display: "none" }}>{children}</div>
        <select
          role="combobox"
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
        >
          {options.map((o) => (
            <option key={o.v} value={o.v}>
              {o.label}
            </option>
          ))}
        </select>
      </Ctx.Provider>
    );
  }

  function SelectItem({ value, children }: SelectItemProps) {
    const { addOption } = React.useContext(Ctx);
    // Register option on first render via effect
    React.useEffect(() => {
      addOption(value, typeof children === "string" ? children : value);
    }, [value, children, addOption]);
    return null;
  }

  return {
    Select,
    SelectItem,
    // The remaining exports are used for structure only — render nothing
    SelectTrigger: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    SelectContent: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    SelectValue: () => null,
    SelectGroup: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    SelectLabel: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    SelectSeparator: () => null,
    SelectScrollUpButton: () => null,
    SelectScrollDownButton: () => null,
  };
});

// ---- Hook mocks — the QRIS pattern ----
const mockChats = vi.fn();
const mockAssignRole = vi.fn();
const mockArchive = vi.fn();
const mockRestore = vi.fn();
const mockSendTest = vi.fn();

vi.mock("@/hooks/convex/useTelegramChats", () => ({
  useTelegramChats: (...a: unknown[]) => mockChats(...a),
  useAssignRole: () => mockAssignRole,
  useArchiveChat: () => mockArchive,
  useRestoreChat: () => mockRestore,
  useSendTestMessage: () => mockSendTest,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { TelegramChatsManager } from "../TelegramChatsManager";

// MemoryRouter is required because PageHeader renders <Link> from react-router-dom.
function renderPage() {
  return render(
    <MemoryRouter>
      <TelegramChatsManager />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAssignRole.mockResolvedValue(undefined);
});

// ============================================
// Status badge derivation tests (spec case #22) — 4 tests
// ============================================

describe("TelegramChatsManager status badge derivation (spec case #22)", () => {
  it.each([
    ["archived row", { archivedAt: 100, role: undefined }, "Archived"],
    [
      "error row (fresh)",
      { lastError: { at: Date.now() - 1000, message: "Forbidden" }, role: undefined },
      "Error",
    ],
    ["live row", { role: "pack-list" }, "Live"],
    ["dormant row", { role: undefined }, "Dormant"],
  ])("renders %s as %s", (_label, overrides, expectedLabel) => {
    mockChats.mockReturnValue([
      {
        _id: "x",
        chatId: "-100X",
        chatType: "group",
        title: "X",
        registeredAt: 0,
        lastSeenAt: 0,
        ...overrides,
      },
    ]);
    renderPage();
    expect(screen.getByText(expectedLabel)).toBeInTheDocument();
  });
});

// ============================================
// Reassignment dialog tests (spec case #21) — 1 test
// ============================================

describe("TelegramChatsManager reassignment dialog (spec case #21)", () => {
  it("opens AlertDialog when role already held by another chat", async () => {
    mockChats.mockReturnValue([
      {
        _id: "1",
        chatId: "-100A",
        chatType: "group",
        title: "Holder",
        role: "pack-list",
        registeredAt: 0,
        lastSeenAt: 0,
      },
      {
        _id: "2",
        chatId: "-100B",
        chatType: "group",
        title: "Candidate",
        registeredAt: 0,
        lastSeenAt: 0,
      },
    ]);
    renderPage();

    // Two native <select role="combobox"> elements rendered by the mock.
    // [0] = Holder row (current value "pack-list"), [1] = Candidate row (value "_none").
    const selects = screen.getAllByRole("combobox");
    expect(selects).toHaveLength(2);

    // Fire change on Candidate's select to pick "pack-list" — a role already held by Holder.
    fireEvent.change(selects[1], { target: { value: "pack-list" } });

    // The page detects the conflict and opens the AlertDialog.
    await waitFor(() => {
      expect(screen.getByText(/Reassign role\?/)).toBeInTheDocument();
      expect(screen.getByText(/currently delivered to/)).toBeInTheDocument();
    });

    // Click the "Reassign" confirm button.
    fireEvent.click(screen.getByText("Reassign"));

    // assignRole must be called with forceReassign: true.
    await waitFor(() => {
      expect(mockAssignRole).toHaveBeenCalledWith(
        expect.objectContaining({ forceReassign: true, role: "pack-list" }),
      );
    });
  });
});

// ============================================
// Empty state tests — 1 test
// ============================================

describe("TelegramChatsManager empty state", () => {
  it("renders empty state when no chats", () => {
    mockChats.mockReturnValue([]);
    renderPage();
    expect(screen.getByText(/No chats registered yet/)).toBeInTheDocument();
    expect(screen.getByText("/register@FrollieProBot")).toBeInTheDocument();
  });
});
