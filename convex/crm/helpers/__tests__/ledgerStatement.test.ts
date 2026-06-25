import { describe, it, expect } from "vitest";
import { Doc, Id } from "../../../_generated/dataModel";
import { buildLedgerStatement } from "../ledgerStatement";

// Minimal factory for creditLedger fixture docs.
// Cast to Doc<"creditLedger"> so TypeScript is satisfied without a real Convex insert.
function makeLedgerDoc(
  overrides: Partial<Doc<"creditLedger">> & {
    type: Doc<"creditLedger">["type"];
    amount: number;
    balanceAfter: number;
    subscriptionId: Id<"subscriptions">;
    subscriptionWeekId: Id<"subscriptionWeeks">;
    createdBy: Id<"users">;
    _creationTime: number;
  },
): Doc<"creditLedger"> {
  return {
    _id: `ledger_${overrides._creationTime}` as Id<"creditLedger">,
    ...overrides,
  } as Doc<"creditLedger">;
}

const SUB_ID = "sub_001" as Id<"subscriptions">;
const WEEK_ID = "week_001" as Id<"subscriptionWeeks">;
const WEEK_ID_2 = "week_000" as Id<"subscriptionWeeks">;
const USER_ID = "user_001" as Id<"users">;
const ORDER_ID = "order_001" as Id<"orders">;
const INVOICE_ID = "invoice_001" as Id<"invoices">;

describe("buildLedgerStatement", () => {
  it("returns rows sorted by _creationTime asc even when input is unsorted", () => {
    const entries = [
      makeLedgerDoc({
        type: "drawdown",
        amount: -30_000,
        balanceAfter: 70_000,
        subscriptionId: SUB_ID,
        subscriptionWeekId: WEEK_ID,
        createdBy: USER_ID,
        orderId: ORDER_ID,
        _creationTime: 2000,
      }),
      makeLedgerDoc({
        type: "topup",
        amount: 100_000,
        balanceAfter: 100_000,
        subscriptionId: SUB_ID,
        subscriptionWeekId: WEEK_ID,
        createdBy: USER_ID,
        _creationTime: 1000,
      }),
    ];

    const { rows } = buildLedgerStatement(entries);
    expect(rows).toHaveLength(2);
    expect(rows[0].at).toBe(1000);
    expect(rows[1].at).toBe(2000);
  });

  it("mirrors stored amount as signedAmount (positive for topup)", () => {
    const entries = [
      makeLedgerDoc({
        type: "topup",
        amount: 100_000,
        balanceAfter: 100_000,
        subscriptionId: SUB_ID,
        subscriptionWeekId: WEEK_ID,
        createdBy: USER_ID,
        _creationTime: 1000,
      }),
    ];

    const { rows } = buildLedgerStatement(entries);
    expect(rows[0].signedAmount).toBe(100_000);
    expect(rows[0].type).toBe("topup");
  });

  it("mirrors stored amount as signedAmount (negative for drawdown)", () => {
    const entries = [
      makeLedgerDoc({
        type: "drawdown",
        amount: -30_000,
        balanceAfter: 70_000,
        subscriptionId: SUB_ID,
        subscriptionWeekId: WEEK_ID,
        createdBy: USER_ID,
        orderId: ORDER_ID,
        _creationTime: 2000,
      }),
    ];

    const { rows } = buildLedgerStatement(entries);
    expect(rows[0].signedAmount).toBe(-30_000);
  });

  it("mirrors stored balanceAfter (week-scoped, not recomputed cross-week)", () => {
    const entries = [
      makeLedgerDoc({
        type: "topup",
        amount: 100_000,
        balanceAfter: 100_000,
        subscriptionId: SUB_ID,
        subscriptionWeekId: WEEK_ID,
        createdBy: USER_ID,
        _creationTime: 1000,
      }),
      makeLedgerDoc({
        type: "drawdown",
        amount: -30_000,
        balanceAfter: 70_000,
        subscriptionId: SUB_ID,
        subscriptionWeekId: WEEK_ID,
        createdBy: USER_ID,
        orderId: ORDER_ID,
        _creationTime: 2000,
      }),
      makeLedgerDoc({
        type: "drawdown",
        amount: -30_000,
        balanceAfter: 40_000,
        subscriptionId: SUB_ID,
        subscriptionWeekId: WEEK_ID,
        createdBy: USER_ID,
        invoiceId: INVOICE_ID,
        _creationTime: 3000,
      }),
    ];

    const { rows } = buildLedgerStatement(entries);
    expect(rows[0].balanceAfter).toBe(100_000);
    expect(rows[1].balanceAfter).toBe(70_000);
    expect(rows[2].balanceAfter).toBe(40_000);
  });

  it("resolves link.kind='order' when orderId is present", () => {
    const entries = [
      makeLedgerDoc({
        type: "drawdown",
        amount: -30_000,
        balanceAfter: 70_000,
        subscriptionId: SUB_ID,
        subscriptionWeekId: WEEK_ID,
        createdBy: USER_ID,
        orderId: ORDER_ID,
        _creationTime: 2000,
      }),
    ];

    const { rows } = buildLedgerStatement(entries);
    expect(rows[0].link).toEqual({ kind: "order", id: ORDER_ID });
  });

  it("resolves link.kind='invoice' when invoiceId is present", () => {
    const entries = [
      makeLedgerDoc({
        type: "drawdown",
        amount: -30_000,
        balanceAfter: 40_000,
        subscriptionId: SUB_ID,
        subscriptionWeekId: WEEK_ID,
        createdBy: USER_ID,
        invoiceId: INVOICE_ID,
        _creationTime: 3000,
      }),
    ];

    const { rows } = buildLedgerStatement(entries);
    expect(rows[0].link).toEqual({ kind: "invoice", id: INVOICE_ID });
  });

  it("resolves link.kind='week' when rolloverFromWeekId is present", () => {
    const entries = [
      makeLedgerDoc({
        type: "topup",
        amount: 40_000,
        balanceAfter: 40_000,
        subscriptionId: SUB_ID,
        subscriptionWeekId: WEEK_ID,
        createdBy: USER_ID,
        rolloverFromWeekId: WEEK_ID_2,
        _creationTime: 4000,
      }),
    ];

    const { rows } = buildLedgerStatement(entries);
    expect(rows[0].link).toEqual({ kind: "week", id: WEEK_ID_2 });
  });

  it("resolves link.kind=null when no reference ids are present", () => {
    const entries = [
      makeLedgerDoc({
        type: "topup",
        amount: 100_000,
        balanceAfter: 100_000,
        subscriptionId: SUB_ID,
        subscriptionWeekId: WEEK_ID,
        createdBy: USER_ID,
        _creationTime: 1000,
      }),
    ];

    const { rows } = buildLedgerStatement(entries);
    expect(rows[0].link).toEqual({ kind: null, id: null });
  });

  it("threads through createdBy, note, and at correctly", () => {
    const entries = [
      makeLedgerDoc({
        type: "adjustment",
        amount: 5_000,
        balanceAfter: 105_000,
        subscriptionId: SUB_ID,
        subscriptionWeekId: WEEK_ID,
        createdBy: USER_ID,
        note: "manual correction",
        _creationTime: 9000,
      }),
    ];

    const { rows } = buildLedgerStatement(entries);
    expect(rows[0].createdBy).toBe(USER_ID);
    expect(rows[0].note).toBe("manual correction");
    expect(rows[0].at).toBe(9000);
  });

  it("omits note when absent (undefined, not null)", () => {
    const entries = [
      makeLedgerDoc({
        type: "topup",
        amount: 100_000,
        balanceAfter: 100_000,
        subscriptionId: SUB_ID,
        subscriptionWeekId: WEEK_ID,
        createdBy: USER_ID,
        _creationTime: 1000,
      }),
    ];

    const { rows } = buildLedgerStatement(entries);
    expect(rows[0].note).toBeUndefined();
  });

  it("returns empty rows for empty input", () => {
    const { rows } = buildLedgerStatement([]);
    expect(rows).toHaveLength(0);
  });

  it("full scenario: topup + two drawdowns + rollover topup", () => {
    const entries = [
      // Delivered out of order to verify sorting.
      makeLedgerDoc({
        type: "drawdown",
        amount: -30_000,
        balanceAfter: 70_000,
        subscriptionId: SUB_ID,
        subscriptionWeekId: WEEK_ID,
        createdBy: USER_ID,
        orderId: ORDER_ID,
        _creationTime: 2000,
      }),
      makeLedgerDoc({
        type: "topup",
        amount: 40_000,
        balanceAfter: 40_000,
        subscriptionId: SUB_ID,
        subscriptionWeekId: WEEK_ID,
        createdBy: USER_ID,
        rolloverFromWeekId: WEEK_ID_2,
        _creationTime: 4000,
      }),
      makeLedgerDoc({
        type: "topup",
        amount: 100_000,
        balanceAfter: 100_000,
        subscriptionId: SUB_ID,
        subscriptionWeekId: WEEK_ID,
        createdBy: USER_ID,
        _creationTime: 1000,
      }),
      makeLedgerDoc({
        type: "drawdown",
        amount: -30_000,
        balanceAfter: 40_000,
        subscriptionId: SUB_ID,
        subscriptionWeekId: WEEK_ID,
        createdBy: USER_ID,
        invoiceId: INVOICE_ID,
        _creationTime: 3000,
      }),
    ];

    const { rows } = buildLedgerStatement(entries);

    expect(rows).toHaveLength(4);

    // Sorted order: 1000, 2000, 3000, 4000.
    expect(rows[0]).toMatchObject({
      type: "topup",
      signedAmount: 100_000,
      balanceAfter: 100_000,
      link: { kind: null, id: null },
      at: 1000,
    });
    expect(rows[1]).toMatchObject({
      type: "drawdown",
      signedAmount: -30_000,
      balanceAfter: 70_000,
      link: { kind: "order", id: ORDER_ID },
      at: 2000,
    });
    expect(rows[2]).toMatchObject({
      type: "drawdown",
      signedAmount: -30_000,
      balanceAfter: 40_000,
      link: { kind: "invoice", id: INVOICE_ID },
      at: 3000,
    });
    expect(rows[3]).toMatchObject({
      type: "topup",
      signedAmount: 40_000,
      balanceAfter: 40_000,
      link: { kind: "week", id: WEEK_ID_2 },
      at: 4000,
    });
  });
});
