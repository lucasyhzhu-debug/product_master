/**
 * AgreementPage RTL tests — Task T15.
 *
 * Covers:
 *   - Renders versions list with lang badges and last-upload date.
 *   - Version Open buttons resolve storage URLs via getFileUrl and render as links.
 *   - Upload button calls createSupplyAgreement with real fileSize (not 0).
 *   - Linked subscriptions section (A4 bidirectional links).
 *   - Empty state when no agreements exist (D12).
 *   - Loading state (undefined query).
 *   - "Add version" path calls addAgreementVersion.
 *
 * NOTE on mock strategy:
 *   The convex _generated/api mock may not intercept the real FunctionReference
 *   objects because Vitest resolves the mock path relative to the test file.
 *   Instead, we discriminate useSessionQuery calls by REFERENCE IDENTITY:
 *     - The first unique query ref seen per render = listAgreementsByCustomer
 *     - All other refs = getFileUrl
 *   This is robust regardless of whether the api mock intercepts.
 *
 *   useSessionMutation similarly returns mockMutateFn for all calls; the test
 *   asserts which mutation was called by the args passed to mockMutateFn.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

// ---------------------------------------------------------------------------
// Shared state — mutated by each test before renderPage().
// ---------------------------------------------------------------------------

let mockAgreements: unknown = undefined;
let mockFileUrl: string | null | undefined = "https://storage.convex.cloud/file.pdf";

const mockMutateFn = vi.fn();

// We discriminate query calls by reference identity:
// The first unique query ref = listAgreementsByCustomer, others = getFileUrl.
let _seenListRef: unknown = null;
const useSessionQueryMock = vi.fn((query: unknown) => {
  if (_seenListRef === null) {
    _seenListRef = query;
  }
  if (query === _seenListRef) return mockAgreements;
  return mockFileUrl;
});

const useSessionMutationMock = vi.fn(() => mockMutateFn);

vi.mock("convex-helpers/react/sessions", () => ({
  useSessionQuery: (...args: unknown[]) => useSessionQueryMock(...args),
  useSessionMutation: (...args: unknown[]) => useSessionMutationMock(...args),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/components/crm/Breadcrumbs", () => ({
  Breadcrumbs: ({ trail }: { trail: { label: string }[] }) => (
    <nav aria-label="breadcrumb">{trail.map((s) => s.label).join(" / ")}</nav>
  ),
}));

// AgreementUpload mock — passes fileSize through onUploaded.
vi.mock("@/components/crm/AgreementUpload", () => ({
  AgreementUpload: ({
    onUploaded,
    mode,
  }: {
    onUploaded: (
      storageId: string,
      fileName: string,
      lang: "id" | "en",
      fileSize: number,
    ) => void;
    mode: "create" | "add-version";
    disabled?: boolean;
  }) => (
    <div data-testid="agreement-upload" data-mode={mode}>
      <button
        onClick={() =>
          onUploaded("storage_abc", "agreement_id.pdf", "id", 51200)
        }
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
const FILE_URL = "https://storage.convex.cloud/file.pdf";

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
  // Reset the ref discriminator for each test render cycle.
  _seenListRef = null;
  // Happy-path defaults.
  mockAgreements = [AGREEMENT_DOC];
  mockFileUrl = FILE_URL;
  // Re-apply implementations cleared by clearAllMocks.
  useSessionQueryMock.mockImplementation((query: unknown) => {
    if (_seenListRef === null) {
      _seenListRef = query;
    }
    if (query === _seenListRef) return mockAgreements;
    return mockFileUrl;
  });
  useSessionMutationMock.mockImplementation(() => mockMutateFn);
  mockMutateFn.mockResolvedValue(AGREEMENT_ID);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AgreementPage — loading state", () => {
  it("shows loading when agreements query is undefined", () => {
    mockAgreements = undefined;
    renderPage();
    expect(screen.queryByText("agreement_id.pdf")).not.toBeInTheDocument();
    expect(screen.queryByText(/no supply agreement/i)).not.toBeInTheDocument();
  });
});

describe("AgreementPage — empty state", () => {
  it("shows empty state when no agreements", () => {
    mockAgreements = [];
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

  it("renders the last-upload date (from versions uploadedAt)", () => {
    renderPage();
    const dateElements = screen.getAllByText(/\d{4}-\d{2}-\d{2}/);
    expect(dateElements.length).toBeGreaterThan(0);
  });

  it("renders version file names", () => {
    renderPage();
    expect(screen.getByText("agreement_id.pdf")).toBeInTheDocument();
    expect(screen.getByText("agreement_en.pdf")).toBeInTheDocument();
  });

  it("renders Open links pointing at the resolved storage URL (A1)", () => {
    renderPage();
    // Each VersionOpenButton renders <a href={FILE_URL}> when getFileUrl resolves.
    const openLinks = screen
      .getAllByRole("link")
      .filter((a) => (a as HTMLAnchorElement).href === FILE_URL);
    // Two versions → two open links.
    expect(openLinks.length).toBe(2);
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
    mockAgreements = [AGREEMENT_DOC_NO_VERSIONS];
    renderPage();
    expect(screen.getByText(/not linked/i)).toBeInTheDocument();
  });
});

describe("AgreementPage — upload new agreement", () => {
  it("renders AgreementUpload in create mode when no agreements", () => {
    mockAgreements = [];
    renderPage();
    expect(screen.getByTestId("agreement-upload")).toBeInTheDocument();
    expect(
      screen.getByTestId("agreement-upload").getAttribute("data-mode"),
    ).toBe("create");
  });

  it("calls createSupplyAgreement with real fileSize after upload", async () => {
    mockAgreements = [];
    renderPage();

    fireEvent.click(screen.getByTestId("upload-trigger"));

    await waitFor(() => {
      expect(mockMutateFn).toHaveBeenCalledWith(
        expect.objectContaining({
          customerId: CUSTOMER_ID,
          fileStorageId: "storage_abc",
          fileName: "agreement_id.pdf",
          lang: "id",
          fileSize: 51200,
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
    const btn = addVersionEl!.querySelector(
      "[data-testid='upload-trigger']",
    )!;
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
