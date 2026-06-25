/**
 * TimelineItem RTL tests — subtype icon override (Phase D triple-review Fix C).
 *
 * Verifies the two-level taxonomy: getActivityVisual(category, subtype) applies the
 * SUBTYPE_ICON override so a payment_funded item (subtype "funded") renders ✓ instead
 * of the base finance 💳 icon.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { TimelineItem } from "../TimelineItem";
import type { TimelineItemData } from "../TimelineItem";

const CUSTOMER_ID = "cust_abc123";

function renderItem(item: TimelineItemData) {
  return render(
    <MemoryRouter>
      <TimelineItem item={item} customerId={CUSTOMER_ID} />
    </MemoryRouter>,
  );
}

describe("TimelineItem — subtype icon override", () => {
  it("renders the ✓ override for a payment_funded item with subtype 'funded'", () => {
    renderItem({
      id: "payment_funded:inv_1",
      eventType: "payment_funded",
      at: 1_750_000_000_000,
      actor: "Manager",
      title: "Invoice INV-001 paid",
      detail: "100.000 IDR",
      linkTo: { kind: "invoice", id: "inv_1" },
      subtype: "funded",
    });
    const disc = screen.getByTestId("timeline-icon-disc");
    expect(disc.textContent).toBe("✓");
  });

  it("falls back to the base finance 💳 icon when no subtype is set", () => {
    renderItem({
      id: "invoice_sent:inv_2",
      eventType: "invoice_sent",
      at: 1_750_000_000_000,
      actor: "Manager",
      title: "Invoice INV-002 sent",
      detail: "50.000 IDR",
      linkTo: { kind: "invoice", id: "inv_2" },
    });
    const disc = screen.getByTestId("timeline-icon-disc");
    expect(disc.textContent).toBe("💳");
  });
});
