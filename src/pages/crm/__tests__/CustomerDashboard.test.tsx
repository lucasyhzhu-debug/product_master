/**
 * CustomerDashboard RTL tests — Task T14.
 *
 * Covers:
 *   - Two panes render (left identity pane, right financial pane)
 *   - ContactLinks section is present in left pane
 *   - Subscriptions list renders links to /crm/customers/:id/subscriptions/:subId
 *   - Edit form (CRM fields) calls updateCustomerCrmFields on submit
 *   - "View activity timeline →" present as a coming-in-D2 affordance
 *   - Loading state (undefined query returns LoadingPage)
 *   - Null record (not-found) state renders not-found message
 *   - Empty subscriptions state is handled gracefully
 *
 * useSessionQuery / useSessionMutation are mocked via convex-helpers/react/sessions.
 * useParams is mocked so the page resolves the :customerId route param.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockMutateFn = vi.fn().mockResolvedValue("cust_abc123");
// Persistent return value — stays stable across re-renders (no .shift()).
let mockQueryReturnValue: unknown = undefined;
const useSessionQueryMock = vi.fn(() => mockQueryReturnValue);
const useSessionMutationMock = vi.fn(() => mockMutateFn);

vi.mock("convex-helpers/react/sessions", () => ({
  useSessionQuery: (...args: unknown[]) => useSessionQueryMock(...args),
  useSessionMutation: (...args: unknown[]) => useSessionMutationMock(...args),
}));

vi.mock("../../../convex/_generated/api", () => ({
  api: {
    crm: {
      customers: {
        getCustomerRecord: "getCustomerRecord",
        updateCustomerCrmFields: "updateCustomerCrmFields",
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
}));

vi.mock("@/components/crm/Breadcrumbs", () => ({
  Breadcrumbs: ({ trail }: { trail: { label: string }[] }) => (
    <nav aria-label="breadcrumb">{trail.map((s) => s.label).join(" / ")}</nav>
  ),
}));

vi.mock("@/components/crm/ContactLinks", () => ({
  ContactLinks: () => <div data-testid="contact-links">ContactLinks</div>,
}));

vi.mock("@/components/crm/LinkableObject", () => ({
  LinkableObject: ({
    children,
    comingIn,
    to,
  }: {
    children: React.ReactNode;
    comingIn?: string;
    to: string | null;
  }) => {
    if (to !== null) return <a href={to}>{children}</a>;
    if (comingIn)
      return (
        <span>
          {children}
          <span>coming in {comingIn}</span>
        </span>
      );
    return <span>{children}</span>;
  },
}));

import { CustomerDashboard } from "../CustomerDashboard";

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------

const CUSTOMER_ID = "cust_abc123" as const;
const SUB_ID = "sub_xyz789" as const;
const AGREEMENT_ID = "agr_001" as const;

const CUSTOMER_DOC = {
  _id: CUSTOMER_ID,
  _creationTime: 1_750_000_000_000,
  name: "Budi Santoso",
  phone: "+628123456789",
  email: "budi@example.com",
  whatsapp: null,
  altPhone: null,
  instagram: null,
  otherSocials: [],
  deliveryAddress: "Jl. Contoh 1, Jakarta",
  storeAddress: null,
  otherAddresses: [],
  notes: "Important customer",
  keyContactName: "Budi",
  keyContactRole: "Owner",
};

const SUBSCRIPTION_DOC = {
  _id: SUB_ID,
  _creationTime: 1_750_000_000_000,
  customerId: CUSTOMER_ID,
  status: "active",
  label: "Mon–Fri box",
  agreementId: AGREEMENT_ID,
};

const AGREEMENT_DOC = {
  _id: AGREEMENT_ID,
  _creationTime: 1_750_000_000_000,
  customerId: CUSTOMER_ID,
  status: "active",
};

const CUSTOMER_RECORD = {
  customer: CUSTOMER_DOC,
  subscriptions: [SUBSCRIPTION_DOC],
  agreements: [AGREEMENT_DOC],
  currentWeekPoolBySubscription: {
    [SUB_ID]: null,
  },
  unpaidInvoices: [],
};

// ---------------------------------------------------------------------------
// Render helper — wrap in MemoryRouter with route param
// ---------------------------------------------------------------------------

function renderPage(customerId: string = CUSTOMER_ID) {
  return render(
    <MemoryRouter initialEntries={[`/crm/customers/${customerId}`]}>
      <Routes>
        <Route path="/crm/customers/:customerId" element={<CustomerDashboard />} />
      </Routes>
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockQueryReturnValue = undefined;
  mockMutateFn.mockResolvedValue(CUSTOMER_ID);
  // Re-apply implementations cleared by clearAllMocks.
  useSessionQueryMock.mockImplementation(() => mockQueryReturnValue);
  useSessionMutationMock.mockImplementation(() => mockMutateFn);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CustomerDashboard — loading state", () => {
  it("shows loading spinner when query is undefined", () => {
    mockQueryReturnValue = (undefined);
    renderPage();
    // LoadingPage renders — section headings must NOT appear.
    expect(screen.queryByText("Budi Santoso")).not.toBeInTheDocument();
    expect(screen.queryByText(/subscriptions/i)).not.toBeInTheDocument();
  });
});

describe("CustomerDashboard — not found state", () => {
  it("shows not-found message when record is null", () => {
    mockQueryReturnValue = (null);
    renderPage();
    // Multiple elements may contain "not found" (breadcrumb + paragraph) — check any.
    expect(screen.getAllByText(/not found/i).length).toBeGreaterThan(0);
  });
});

describe("CustomerDashboard — two panes render", () => {
  it("renders left identity pane with customer name", () => {
    mockQueryReturnValue = (CUSTOMER_RECORD);
    renderPage();
    expect(screen.getByText("Budi Santoso")).toBeInTheDocument();
  });

  it("renders ContactLinks in the left pane", () => {
    mockQueryReturnValue = (CUSTOMER_RECORD);
    renderPage();
    expect(screen.getByTestId("contact-links")).toBeInTheDocument();
  });

  it("renders delivery address in the left pane", () => {
    mockQueryReturnValue = (CUSTOMER_RECORD);
    renderPage();
    expect(screen.getByText("Jl. Contoh 1, Jakarta")).toBeInTheDocument();
  });

  it("renders notes in the left pane", () => {
    mockQueryReturnValue = (CUSTOMER_RECORD);
    renderPage();
    expect(screen.getByText("Important customer")).toBeInTheDocument();
  });

  it("renders the right financial pane with subscriptions section", () => {
    mockQueryReturnValue = (CUSTOMER_RECORD);
    renderPage();
    expect(screen.getByText(/subscriptions/i)).toBeInTheDocument();
  });
});

describe("CustomerDashboard — subscriptions list links", () => {
  it("renders a link to the subscription page for each subscription", () => {
    mockQueryReturnValue = (CUSTOMER_RECORD);
    renderPage();
    const allLinks = screen.getAllByRole("link");
    const subLink = allLinks.find((a) =>
      (a as HTMLAnchorElement).href.includes(
        `/crm/customers/${CUSTOMER_ID}/subscriptions/${SUB_ID}`,
      ),
    );
    expect(subLink).toBeTruthy();
  });

  it("shows the subscription label", () => {
    mockQueryReturnValue = (CUSTOMER_RECORD);
    renderPage();
    expect(screen.getByText("Mon–Fri box")).toBeInTheDocument();
  });
});

describe("CustomerDashboard — empty subscriptions", () => {
  it("shows empty message when no subscriptions", () => {
    mockQueryReturnValue = ({
      ...CUSTOMER_RECORD,
      subscriptions: [],
      currentWeekPoolBySubscription: {},
    });
    renderPage();
    expect(screen.getByText(/no active subscriptions/i)).toBeInTheDocument();
  });
});

describe("CustomerDashboard — activity timeline affordance", () => {
  it("renders 'View activity timeline' as a real link (T22 wired)", () => {
    mockQueryReturnValue = (CUSTOMER_RECORD);
    renderPage();
    expect(screen.getByText(/View activity timeline/i)).toBeInTheDocument();
    // T22 is shipped — LinkableObject renders as a real <a> link now
    const allLinks = screen.getAllByRole("link");
    const activityLink = allLinks.find((a) =>
      (a as HTMLAnchorElement).href.includes("/activity"),
    );
    expect(activityLink).toBeTruthy();
  });
});

describe("CustomerDashboard — CRM-fields edit form", () => {
  it("opens the edit form when Settings action is triggered", async () => {
    mockQueryReturnValue = (CUSTOMER_RECORD);
    renderPage();
    const settingsButton = screen.getByRole("button", { name: /settings|edit/i });
    fireEvent.click(settingsButton);
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
  });

  it("calls updateCustomerCrmFields on form submit", async () => {
    mockQueryReturnValue = (CUSTOMER_RECORD);
    renderPage();
    // Open edit form
    const settingsButton = screen.getByRole("button", { name: /settings|edit/i });
    fireEvent.click(settingsButton);

    // Find and submit the form
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    const submitButton = screen.getByRole("button", { name: /save/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockMutateFn).toHaveBeenCalledWith(
        expect.objectContaining({ customerId: CUSTOMER_ID }),
      );
    });
  });
});
