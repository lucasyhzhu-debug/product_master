/**
 * SubscriptionCreditBanner RTL smoke tests (T8).
 *
 * Presentational-only component — no Convex, no hooks mocking needed.
 *
 * Assertions:
 *   1. renders nothing when contexts = [] (no active subscriptions)
 *   2. renders "Rp" + due figure for a single context with a split
 *   3. disables the Fulfil button until a sub is selected when 2 contexts
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  SubscriptionCreditBanner,
  type SubscriptionCreditContext,
} from "./SubscriptionCreditBanner";

// ---- Mock data -----------------------------------------------------------

const SUB_ID_1 = "sub_1" as Parameters<typeof SubscriptionCreditBanner>[0]["selectedSubId"] & string;
const SUB_ID_2 = "sub_2" as Parameters<typeof SubscriptionCreditBanner>[0]["selectedSubId"] & string;
const WEEK_ID = "week_1" as SubscriptionCreditContext["weekId"] & string;
const PRODUCT_ID = "prod_1" as SubscriptionCreditContext["allowedProductIds"][number];

const SPLIT_ONE_LINE = {
  lines: [
    {
      menuProductId: PRODUCT_ID as SubscriptionCreditContext["split"] extends infer S | null
        ? S extends { lines: Array<infer L> }
          ? L extends { menuProductId: infer M }
            ? M
            : never
          : never
        : never,
      qty: 2,
      retailUnitPrice: 35000,
      eligible: true,
      effectiveUnitPrice: 0,
      lineTotal: 70000,
    },
  ],
  eligibleSubtotal: 70000,
  offPlanTotal: 0,
  creditCovered: 70000,
  eligibleShortfall: 0,
  amountDue: 0,
};

function makeCtx(
  id: string,
  label: string,
  weekId: string | null = WEEK_ID,
  amountDue = 5000,
): SubscriptionCreditContext {
  return {
    subscriptionId: id as SubscriptionCreditContext["subscriptionId"],
    label,
    weekId: weekId as SubscriptionCreditContext["weekId"],
    allowedProductIds: [PRODUCT_ID],
    availableCredit: 70000,
    split: weekId
      ? {
          ...SPLIT_ONE_LINE,
          amountDue,
          creditCovered: 70000 - amountDue,
        }
      : null,
    plannedDeliveriesRemaining: 3,
  };
}

// ---- Tests ---------------------------------------------------------------

describe("SubscriptionCreditBanner", () => {
  it("renders nothing when contexts is empty (no active subscriptions)", () => {
    const { container } = render(
      <SubscriptionCreditBanner
        contexts={[]}
        selectedSubId={null}
        onSelectSub={vi.fn()}
        onFulfilWithCredit={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders Rp + due figure for a single context with a split", () => {
    const ctx = makeCtx(SUB_ID_1, "Plan A", WEEK_ID, 15000);
    render(
      <SubscriptionCreditBanner
        contexts={[ctx]}
        selectedSubId={null}
        onSelectSub={vi.fn()}
        onFulfilWithCredit={vi.fn()}
      />,
    );
    // Should show the "Rp X due" summary line (full text content of the span)
    expect(screen.getByText(/Rp 15\.000 due/)).toBeInTheDocument();
  });

  it("disables the Fulfil button until a sub is selected when 2 contexts present", async () => {
    const ctx1 = makeCtx(SUB_ID_1, "Plan A");
    const ctx2 = makeCtx(SUB_ID_2, "Plan B");
    const onSelect = vi.fn();
    const onFulfil = vi.fn();

    render(
      <SubscriptionCreditBanner
        contexts={[ctx1, ctx2]}
        selectedSubId={null}
        onSelectSub={onSelect}
        onFulfilWithCredit={onFulfil}
      />,
    );

    // Button should be disabled when no sub selected
    const btn = screen.getByRole("button", { name: /fulfil with subscription credit/i });
    expect(btn).toBeDisabled();

    // Click a radio — simulate selection by clicking the radio item
    const radio1 = screen.getByRole("radio", { name: /Plan A/i });
    await userEvent.click(radio1);
    expect(onSelect).toHaveBeenCalled();
  });
});
