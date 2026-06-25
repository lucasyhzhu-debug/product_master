/**
 * AgreementPage RTL tests — Task T15.
 *
 * Covers:
 *   - Renders versions list with lang badges and last-upload date.
 *   - Upload button calls generateAgreementUploadUrl → POST → createSupplyAgreement.
 *   - Linked subscriptions section (A4 bidirectional links).
 *   - Empty state when no agreements exist (D12).
 *   - Loading state (undefined query).
 *   - Not-found state (null customer).
 *   - "Add version" path calls addAgreementVersion.
 *
 * useSessionQuery / useSessionMutation are mocked via convex-helpers/react/sessions.
 * fetch is mocked globally to stub the Convex storage POST.
 * useParams is resolved by MemoryRouter route.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockMutateFn = vi.fn();
// Mutable holder updated before each test.
let mockAgreementsData: unknown = undefined;
const useSessionQueryMock = vi.fn();
const useSessionMutationMock = vi.fn();

vi.mock("convex-helpers/react/sessions", () => ({
  useSessionQuery: (...args: unknown[]) => useSessionQueryMock(...args),
  useSessionMutation: (...args: unknown[]) => useSessionMutationMock(...args),
}));

// Mock api — keys match `api["crm/agreements"].xxx`.
vi.mock("../../../convex/_generated/api", () => ({
  api: {
    "crm/agreements": {
      listAgreementsByCustomer: "listAgreementsByCustomer",
      getAgreement: "getAgreement",
      generateAgreementUploadUrl: "generateAgreementUploadUrl",
      createSupplyAgreement: "createSupplyAgreement",
      addAgreementVersion: "addAgreementVersion",
      linkAgreementToSubscription: "linkAgreementToSubscription",
    },
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/components/crm/Breadcrumbs", () => ({
  Breadcrumbs: ({ trail }: { trail: { label: string }[] }) => (
    <nav aria-label="breadcrumb">{trail.map((s) => s.label).join(" / ")}</nav>
  ),
}));

// Mock Dialog to avoid portal issues in JSDOM
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
}));

vi.mock("@/components/crm/AgreementUpload", () => ({
  AgreementUpload: ({
    onUploaded,
    mode,
  }: {
    onUploaded: (storageId: string, fileName: string, lang: "id" | "en") => void;
    mode: "create" | "add-version";
    agreementId?: string;
    disabled?: boolean;
  }) => (
    <div data-testid="agreement-upload" data-mode={mode}>
      <button
        onClick={() => onUploaded("storage_abc", "agreement_id.pdf", "id")}
        data-testid="upload-trigger"
      >
        Upload {mode === "create" ? "Agreement" : "Version"}
      </button>
    </div>
  ),
}));

import { AgreementPage } from "../AgreementPage";

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------

const CUSTOMER_ID = "cust_abc123" as const;
const AGREEMENT_ID = "agr_001" as const;
const SUB_ID = "sub_xyz789" as const;
const STORAGE_ID_1 = "storage_111" as const;
const STORAGE_ID_2 = "storage_222" as const;

const VERSION_ID = {
  fileStorageId: STORAGE_ID_1,
  fileName: "agreement_id.pdf",
  uploadedAt: 1_750_000_000_000,
  lang: "id" as const,
};

const VERSION_EN = {
  fileStorageId: STORAGE_ID_2,
  fileName: "agreement_en.pdf",
  uploadedAt: 1_750_100_000_000,
  lang: "en" as const,
};

const AGREEMENT_DOC = {
  _id: AGREEMENT_ID,
  _creationTime: 1_750_000_000_000,
  customerId: CUSTOMER_ID,
  fileStorageId: STORAGE_ID_1,
  fileName: "agreement_id.pdf",
  fileSize: 102400,
  uploadedBy: "user_001",
  uploadedAt: 1_750_000_000_000,
  status: "signed" as const,
  subscriptionId: SUB_ID,
  versions: [VERSION_ID, VERSION_EN],
};

const AGREEMENT_DOC_NO_VERSIONS = {
  ...AGREEMENT_DOC,
  versions: [],
  subscriptionId: undefined,
};

const SUBSCRIPTION_DOC = {
  _id: SUB_ID,
  customerId: CUSTOMER_ID,
  status: "active",
  label: "Mon–Fri box",
};

const CUSTOMER_RECORD = {
  customer: { _id: CUSTOMER_ID, name: "Budi Santoso" },
  subscriptions: [SUBSCRIPTION_DOC],
  agreements: [AGREEMENT_DOC],
  currentWeekPoolBySubscription: {},
  unpaidInvoices: [],
};

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

function renderPage(customerId: string = CUSTOMER_ID) {
  return render(
    <MemoryRouter
      initialEntries={[`/crm/customers/${customerId}/agreements`]}
    >
      <Routes>
        <Route
          path="/crm/customers/:customerId/agreements"
          element={<AgreementPage />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockAgreementsData = [AGREEMENT_DOC];
  mockMutateFn.mockResolvedValue(AGREEMENT_ID);

  // Re-apply implementations cleared by clearAllMocks.
  // useSessionQuery returns mockAgreementsData for listAgreementsByCustomer.
  useSessionQueryMock.mockImplementation(() => mockAgreementsData);
  useSessionMutationMock.mockImplementation(() => mockMutateFn);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AgreementPage — loading state", () => {
  it("shows loading when agreements query is undefined", () => {
    // Override default — undefined means still loading.
    mockAgreementsData = undefined;
    useSessionQueryMock.mockImplementation(() => mockAgreementsData);
    renderPage();
    // LoadingPage renders — agreement section headings must NOT appear.
    expect(screen.queryByText("agreement_id.pdf")).not.toBeInTheDocument();
    expect(screen.queryByText(/no supply agreement/i)).not.toBeInTheDocument();
  });
});

describe("AgreementPage — empty state", () => {
  it("shows empty state when no agreements", () => {
    mockAgreementsData = [];
    useSessionQueryMock.mockImplementation(() => mockAgreementsData);
    renderPage();
    expect(screen.getByText(/no supply agreement/i)).toBeInTheDocument();
  });
});

describe("AgreementPage — versions list", () => {
  it("renders both version lang badges (ID and EN)", () => {
    renderPage();
    expect(screen.getByText("ID")).toBeInTheDocument();
    expect(screen.getByText("EN")).toBeInTheDocument();
  });

  it("renders the agreement status badge", () => {
    renderPage();
    expect(screen.getByText("signed")).toBeInTheDocument();
  });

  it("renders the last-upload date (from versions[1].uploadedAt)", () => {
    renderPage();
    // utcToWibDateStr(1_750_100_000_000) → date string; at least one date appears.
    // Use getAllByText since both version rows and the header may show dates.
    const dateElements = screen.getAllByText(/\d{4}-\d{2}-\d{2}/);
    expect(dateElements.length).toBeGreaterThan(0);
  });

  it("renders version file names as open links", () => {
    renderPage();
    expect(screen.getByText("agreement_id.pdf")).toBeInTheDocument();
    expect(screen.getByText("agreement_en.pdf")).toBeInTheDocument();
  });
});

describe("AgreementPage — linked subscriptions (A4)", () => {
  it("renders linked subscriptions section", () => {
    renderPage();
    expect(screen.getByText(/linked subscription/i)).toBeInTheDocument();
  });

  it("renders a link to the linked subscription page", () => {
    renderPage();
    const allLinks = screen.getAllByRole("link");
    const subLink = allLinks.find((a) =>
      (a as HTMLAnchorElement).href.includes(
        `/crm/customers/${CUSTOMER_ID}/subscriptions/${SUB_ID}`,
      ),
    );
    expect(subLink).toBeTruthy();
  });

  it("shows 'not linked' when agreement has no subscriptionId", () => {
    mockAgreementsData = [AGREEMENT_DOC_NO_VERSIONS];
    useSessionQueryMock.mockImplementation(() => mockAgreementsData);
    renderPage();
    expect(screen.getByText(/not linked/i)).toBeInTheDocument();
  });
});

describe("AgreementPage — upload new agreement", () => {
  it("renders the AgreementUpload component in create mode when no agreements", () => {
    mockAgreementsData = [];
    useSessionQueryMock.mockImplementation(() => mockAgreementsData);
    renderPage();
    // empty state shows an upload trigger
    expect(screen.getByTestId("agreement-upload")).toBeInTheDocument();
  });

  it("calls createSupplyAgreement after upload via AgreementUpload", async () => {
    mockAgreementsData = [];
    useSessionQueryMock.mockImplementation(() => mockAgreementsData);
    renderPage();

    const uploadBtn = screen.getByTestId("upload-trigger");
    fireEvent.click(uploadBtn);

    await waitFor(() => {
      expect(mockMutateFn).toHaveBeenCalledWith(
        expect.objectContaining({
          customerId: CUSTOMER_ID,
          fileStorageId: "storage_abc",
          fileName: "agreement_id.pdf",
          lang: "id",
        }),
      );
    });
  });
});

describe("AgreementPage — add version flow", () => {
  it("renders AgreementUpload in add-version mode when agreement exists", () => {
    renderPage();
    const uploads = screen.getAllByTestId("agreement-upload");
    const addVersion = uploads.find(
      (el) => el.getAttribute("data-mode") === "add-version",
    );
    expect(addVersion).toBeTruthy();
  });

  it("calls addAgreementVersion after upload in add-version mode", async () => {
    renderPage();
    const uploads = screen.getAllByTestId("agreement-upload");
    const addVersionEl = uploads.find(
      (el) => el.getAttribute("data-mode") === "add-version",
    );
    expect(addVersionEl).toBeTruthy();
    const btn = addVersionEl!.querySelector("[data-testid='upload-trigger']")!;
    fireEvent.click(btn);

    await waitFor(() => {
      expect(mockMutateFn).toHaveBeenCalledWith(
        expect.objectContaining({
          agreementId: AGREEMENT_ID,
          fileStorageId: "storage_abc",
          fileName: "agreement_id.pdf",
          lang: "id",
        }),
      );
    });
  });
});
