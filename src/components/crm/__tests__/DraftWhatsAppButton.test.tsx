/**
 * DraftWhatsAppButton RTL tests — Task T23 (TDD).
 *
 * Covers:
 *   - Button renders with label "Draft WhatsApp reminder"
 *   - Clicking opens a https://wa.me/… URL with prefilled text (window.open)
 *   - Clicking calls logCustomerInteraction with type "whatsapp_drafted" + customerId + invoiceId
 *   - Button is disabled (with correct title) when phone is null/undefined
 *
 * useSessionMutation is mocked via convex-helpers/react/sessions (same pattern as CustomerDashboard.test.tsx).
 * window.open is mocked via vi.spyOn so no real browser window opens.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockMutateFn = vi.fn().mockResolvedValue("activity_id_123");
const useSessionMutationMock = vi.fn(() => mockMutateFn);

vi.mock("convex-helpers/react/sessions", () => ({
  useSessionMutation: (...args: unknown[]) => useSessionMutationMock(...args),
}));

vi.mock("../../../convex/_generated/api", () => ({
  api: {
    crm: {
      timeline: {
        logCustomerInteraction: "logCustomerInteraction",
      },
    },
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { DraftWhatsAppButton } from "../DraftWhatsAppButton";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Fixture constants
// ---------------------------------------------------------------------------

const CUSTOMER_ID = "cust_abc123" as const;
const INVOICE_ID = "inv_xyz789" as const;
const PHONE = "+628123456789";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let windowOpenSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockMutateFn.mockResolvedValue("activity_id_123");
  useSessionMutationMock.mockImplementation(() => mockMutateFn);
  windowOpenSpy = vi.spyOn(window, "open").mockImplementation(() => null);
});

// ---------------------------------------------------------------------------
// Tests — with phone
// ---------------------------------------------------------------------------

describe("DraftWhatsAppButton — with phone", () => {
  it("renders 'Draft WhatsApp reminder' button label", () => {
    render(
      <DraftWhatsAppButton
        phone={PHONE}
        customerId={CUSTOMER_ID}
        invoiceId={INVOICE_ID}
        customerName="Budi"
      />,
    );
    expect(
      screen.getByRole("button", { name: /draft whatsapp reminder/i }),
    ).toBeInTheDocument();
  });

  it("button is enabled when phone is provided", () => {
    render(
      <DraftWhatsAppButton
        phone={PHONE}
        customerId={CUSTOMER_ID}
        customerName="Budi"
      />,
    );
    expect(
      screen.getByRole("button", { name: /draft whatsapp reminder/i }),
    ).not.toBeDisabled();
  });

  it("opens a https://wa.me/… URL on click", async () => {
    render(
      <DraftWhatsAppButton
        phone={PHONE}
        customerId={CUSTOMER_ID}
        invoiceId={INVOICE_ID}
        customerName="Budi"
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /draft whatsapp reminder/i }),
    );
    await waitFor(() => {
      expect(windowOpenSpy).toHaveBeenCalledOnce();
      const [url, target, features] = windowOpenSpy.mock.calls[0] as [
        string,
        string,
        string,
      ];
      expect(url).toMatch(/^https:\/\/wa\.me\/628123456789/);
      expect(url).toContain("text=");
      expect(target).toBe("_blank");
      expect(features).toContain("noopener");
    });
  });

  it("calls logCustomerInteraction with whatsapp_drafted on click", async () => {
    render(
      <DraftWhatsAppButton
        phone={PHONE}
        customerId={CUSTOMER_ID}
        invoiceId={INVOICE_ID}
        customerName="Budi"
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /draft whatsapp reminder/i }),
    );
    await waitFor(() => {
      expect(mockMutateFn).toHaveBeenCalledWith(
        expect.objectContaining({
          customerId: CUSTOMER_ID,
          type: "whatsapp_drafted",
          invoiceId: INVOICE_ID,
          summary: "Drafted WhatsApp payment reminder",
        }),
      );
    });
  });

  it("shows an error toast (and does not throw) when logging the draft fails", async () => {
    mockMutateFn.mockRejectedValueOnce(new Error("network down"));
    render(
      <DraftWhatsAppButton
        phone={PHONE}
        customerId={CUSTOMER_ID}
        invoiceId={INVOICE_ID}
        customerName="Budi"
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /draft whatsapp reminder/i }),
    );
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("network down");
    });
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("does NOT label the action as sent (label must not include 'Send'/'Sent')", () => {
    render(
      <DraftWhatsAppButton
        phone={PHONE}
        customerId={CUSTOMER_ID}
        customerName="Budi"
      />,
    );
    const btn = screen.getByRole("button", { name: /draft whatsapp reminder/i });
    expect(btn.textContent?.toLowerCase()).not.toMatch(/\bsend\b|\bsent\b/);
  });
});

// ---------------------------------------------------------------------------
// Tests — no phone (disabled state)
// ---------------------------------------------------------------------------

describe("DraftWhatsAppButton — no phone", () => {
  it("button is disabled when phone is null", () => {
    render(
      <DraftWhatsAppButton
        phone={null}
        customerId={CUSTOMER_ID}
        customerName="Budi"
      />,
    );
    expect(
      screen.getByRole("button", { name: /draft whatsapp reminder/i }),
    ).toBeDisabled();
  });

  it("button is disabled when phone is undefined", () => {
    render(
      <DraftWhatsAppButton
        customerId={CUSTOMER_ID}
        customerName="Budi"
      />,
    );
    expect(
      screen.getByRole("button", { name: /draft whatsapp reminder/i }),
    ).toBeDisabled();
  });

  it("shows 'No phone number on file' title when disabled", () => {
    render(
      <DraftWhatsAppButton
        phone={null}
        customerId={CUSTOMER_ID}
        customerName="Budi"
      />,
    );
    expect(
      screen.getByRole("button", { name: /draft whatsapp reminder/i }),
    ).toHaveAttribute("title", "No phone number on file");
  });
});
