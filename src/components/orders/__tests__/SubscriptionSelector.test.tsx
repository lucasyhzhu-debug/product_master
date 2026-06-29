/**
 * T6: SubscriptionSelector — subscription selector under Customer card.
 *
 * Covers:
 *   (a) one sub  → renders a control AND fires onSelect(theOnlySubId) on mount (auto-select)
 *   (b) two subs → renders a radio group, does NOT auto-select
 *   (c) zero subs / null → renders nothing
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { Id } from "../../../../convex/_generated/dataModel";

// ---------------------------------------------------------------------------
// Import AFTER any mocks (none needed — purely presentational component)
// ---------------------------------------------------------------------------
import { SubscriptionSelector } from "../SubscriptionSelector";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SUB_ID_1 = "subscriptions:sub001" as Id<"subscriptions">;
const SUB_ID_2 = "subscriptions:sub002" as Id<"subscriptions">;

const ONE_SUB = [
  { subscriptionId: SUB_ID_1, label: "Amsterdam Coffee — Weekly", creditRemaining: 500000 },
];

const TWO_SUBS = [
  { subscriptionId: SUB_ID_1, label: "Amsterdam Coffee — Weekly", creditRemaining: 500000 },
  { subscriptionId: SUB_ID_2, label: "Amsterdam Coffee — Bi-weekly", creditRemaining: null },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SubscriptionSelector", () => {
  it("(a) single sub: renders a control AND calls onSelect with the sub id on mount", async () => {
    const onSelect = vi.fn();
    render(
      <SubscriptionSelector
        subs={ONE_SUB}
        selectedSubId={null}
        onSelect={onSelect}
      />
    );

    // The label should appear in the DOM
    expect(screen.getByText(/Amsterdam Coffee — Weekly/i)).toBeTruthy();

    // Auto-select fires on mount
    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith(SUB_ID_1);
    });
  });

  it("(b) two subs: renders radio group, does NOT auto-select", async () => {
    const onSelect = vi.fn();
    render(
      <SubscriptionSelector
        subs={TWO_SUBS}
        selectedSubId={null}
        onSelect={onSelect}
      />
    );

    // Both labels rendered
    expect(screen.getByText(/Amsterdam Coffee — Weekly/i)).toBeTruthy();
    expect(screen.getByText(/Amsterdam Coffee — Bi-weekly/i)).toBeTruthy();

    // Radio inputs present
    const radios = screen.getAllByRole("radio");
    expect(radios.length).toBe(2);

    // onSelect not called automatically
    await waitFor(() => {
      expect(onSelect).not.toHaveBeenCalled();
    });
  });

  it("(c) zero subs: renders nothing", () => {
    const onSelect = vi.fn();
    const { container } = render(
      <SubscriptionSelector
        subs={[]}
        selectedSubId={null}
        onSelect={onSelect}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("(c) null subs: renders nothing", () => {
    const onSelect = vi.fn();
    const { container } = render(
      <SubscriptionSelector
        subs={null}
        selectedSubId={null}
        onSelect={onSelect}
      />
    );
    expect(container.firstChild).toBeNull();
  });
});
