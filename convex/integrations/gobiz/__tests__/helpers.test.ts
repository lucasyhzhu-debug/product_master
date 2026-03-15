/**
 * Unit tests for GoBiz adapter helper functions.
 * Tests date conversion, header building, API query construction, and response parsing.
 *
 * Updated 2026-02-09: Tests match real GoBiz API format validated against live responses.
 */

import { describe, it, expect } from "vitest";
import {
  wibDateToUtcRange,
  wibDateToUtcIsoRange,
  buildDashboardHeaders,
  buildGoBizApiHeaders,
  buildJournalSearchBody,
  buildOrderSearchBody,
  buildJournalDedupKey,
  extractDashboardMetrics,
  extractJournalMetrics,
  aggregateJournalMetrics,
  parseOrderItems,
} from "../helpers";

// ============================================
// wibDateToUtcRange() Tests
// ============================================
describe("wibDateToUtcRange", () => {
  it("should convert WIB date to UTC millisecond range correctly", () => {
    const result = wibDateToUtcRange("2026-02-08");

    const fromDate = new Date(result.from);
    const toDate = new Date(result.to);

    expect(fromDate.getUTCFullYear()).toBe(2026);
    expect(fromDate.getUTCMonth()).toBe(1);
    expect(fromDate.getUTCDate()).toBe(7);
    expect(fromDate.getUTCHours()).toBe(17);
    expect(fromDate.getUTCMinutes()).toBe(0);

    expect(toDate.getUTCDate()).toBe(8);
    expect(toDate.getUTCHours()).toBe(16);
    expect(toDate.getUTCMinutes()).toBe(59);
    expect(toDate.getUTCSeconds()).toBe(59);
  });

  it("should handle month boundary correctly", () => {
    const result = wibDateToUtcRange("2026-03-01");

    const fromDate = new Date(result.from);
    const toDate = new Date(result.to);

    expect(fromDate.getUTCDate()).toBe(28);
    expect(fromDate.getUTCMonth()).toBe(1);
    expect(toDate.getUTCDate()).toBe(1);
    expect(toDate.getUTCMonth()).toBe(2);
  });

  it("should return valid timestamps (numbers)", () => {
    const result = wibDateToUtcRange("2026-02-08");

    expect(typeof result.from).toBe("number");
    expect(typeof result.to).toBe("number");
    expect(result.from).toBeGreaterThan(0);
    expect(result.to).toBeGreaterThan(result.from);
  });
});

// ============================================
// wibDateToUtcIsoRange() Tests
// ============================================
describe("wibDateToUtcIsoRange", () => {
  it("should return ISO 8601 strings matching journal API format", () => {
    const result = wibDateToUtcIsoRange("2026-02-08");

    // Expected: "2026-02-07T17:00:00.000Z" to "2026-02-08T16:59:59.999Z"
    expect(result.from).toBe("2026-02-07T17:00:00.000Z");
    expect(result.to).toBe("2026-02-08T16:59:59.999Z");
  });

  it("should handle month boundary correctly", () => {
    const result = wibDateToUtcIsoRange("2026-03-01");

    expect(result.from).toContain("2026-02-28T17:00:00");
    expect(result.to).toContain("2026-03-01T16:59:59");
  });
});

// ============================================
// buildDashboardHeaders() Tests
// ============================================
describe("buildDashboardHeaders", () => {
  it("should include all 5 ref IDs in x-ref-ids header", () => {
    const headers = buildDashboardHeaders("Bearer token123", 1000, 2000);

    const refIds = headers["x-ref-ids"].split(";");
    expect(refIds).toHaveLength(5);
    expect(refIds).toContain("total_gmv_bottomline_amount");
    expect(refIds).toContain("total_gmv_topline_amount");
    expect(refIds).toContain("total_commission_amount");
    expect(refIds).toContain("total_ad_burn_amount");
    expect(refIds).toContain("total_promo_burn_amount");
  });

  it("should set correct dashboard and panel IDs", () => {
    const headers = buildDashboardHeaders("Bearer token123", 1000, 2000);

    expect(headers["x-dashboard-id"]).toBe("107");
    expect(headers["x-panel-id"]).toBe("22");
  });

  it("should add Bearer prefix if missing", () => {
    const headers = buildDashboardHeaders("token123", 1000, 2000);
    expect(headers.authorization).toBe("Bearer token123");
  });
});

// ============================================
// buildGoBizApiHeaders() Tests
// ============================================
describe("buildGoBizApiHeaders", () => {
  it("should set authentication-type to go-id", () => {
    const headers = buildGoBizApiHeaders("Bearer token123");
    expect(headers["authentication-type"]).toBe("go-id");
  });

  it("should include journal accept type", () => {
    const headers = buildGoBizApiHeaders("Bearer token123");
    expect(headers.accept).toContain("application/vnd.journal.v1+json");
  });

  it("should add Bearer prefix if missing", () => {
    const headers = buildGoBizApiHeaders("token123");
    expect(headers.authorization).toBe("Bearer token123");
  });
});

// ============================================
// buildJournalSearchBody() Tests (real API format)
// ============================================
describe("buildJournalSearchBody", () => {
  it("should produce valid structure with GoBiz query format", () => {
    const body = buildJournalSearchBody(
      "2026-02-07T17:00:00.000Z", "2026-02-08T16:59:59.999Z",
      ["G293156297"], 0, 50
    ) as any;

    expect(body.from).toBe(0);
    expect(body.size).toBe(50);
    expect(body.sort).toEqual({ time: { order: "desc" } }); // object, not array
    expect(body.included_categories).toEqual({
      incoming: ["transaction_share", "action"],
    });
  });

  it("should use ISO time strings in clauses", () => {
    const body = buildJournalSearchBody(
      "2026-02-07T17:00:00.000Z", "2026-02-08T16:59:59.999Z",
      ["G293156297"], 0, 20
    ) as any;

    const clauses = body.query[0].clauses;
    expect(body.query[0].op).toBe("and");

    // Find time range clauses
    const gteClauses = clauses.filter((c: any) => c.op === "gte");
    const lteClauses = clauses.filter((c: any) => c.op === "lte");

    expect(gteClauses).toHaveLength(1);
    expect(gteClauses[0].field).toBe("metadata.transaction.transaction_time");
    expect(gteClauses[0].value).toBe("2026-02-07T17:00:00.000Z");

    expect(lteClauses).toHaveLength(1);
    expect(lteClauses[0].value).toBe("2026-02-08T16:59:59.999Z");
  });

  it("should include merchant ID filter with 'in' operator for multi-merchant support", () => {
    const body = buildJournalSearchBody(
      "2026-02-07T17:00:00.000Z", "2026-02-08T16:59:59.999Z",
      ["G293156297"], 0, 20
    ) as any;

    const clauses = body.query[0].clauses;
    const merchantClause = clauses.find(
      (c: any) => c.field === "metadata.transaction.merchant_id"
    );

    expect(merchantClause).toBeDefined();
    expect(merchantClause.op).toBe("in"); // multi-merchant support uses "in" operator
    expect(merchantClause.value).toContain("G293156297"); // value is an array
  });

  it("should exclude GoSave/GoDeals transactions", () => {
    const body = buildJournalSearchBody(
      "2026-02-07T17:00:00.000Z", "2026-02-08T16:59:59.999Z",
      ["G293156297"], 0, 20
    ) as any;

    const clauses = body.query[0].clauses;
    const notClause = clauses.find((c: any) => c.op === "not");

    expect(notClause).toBeDefined();
    expect(notClause.clauses[0].op).toBe("or");
  });

  it("should filter by settlement status", () => {
    const body = buildJournalSearchBody(
      "2026-02-07T17:00:00.000Z", "2026-02-08T16:59:59.999Z",
      ["G293156297"], 0, 20
    ) as any;

    const clauses = body.query[0].clauses;
    const statusClause = clauses.find(
      (c: any) => c.field === "metadata.transaction.status"
    );

    expect(statusClause).toBeDefined();
    expect(statusClause.value).toContain("settlement");
    expect(statusClause.value).toContain("capture");
  });

  it("should support pagination offsets", () => {
    const body = buildJournalSearchBody(
      "2026-02-07T17:00:00.000Z", "2026-02-08T16:59:59.999Z",
      ["G293156297"], 20, 20
    ) as any;

    expect(body.from).toBe(20);
    expect(body.size).toBe(20);
  });
});

// ============================================
// extractJournalMetrics() Tests (real API format)
// ============================================
describe("extractJournalMetrics", () => {
  // Real journal hit structure from GoBiz API (2026-02-09)
  const realJournalHit = {
    amount: 11000000, // centesimal: Rp 110,000
    time: "2026-02-08T14:45:34Z",
    status: "success",
    reference_id: "4f0ce355-86d9-30f6-96c2-548e31c77457",
    id: "4f0ce355-86d9-30f6-96c2-548e31c77457",
    metadata: {
      transaction: {
        status: "settlement",
        payment_type: "gopay",
        order_id: "F-3125143400",
        gross_amount: 11000000,
        merchant_id: "G293156297",
        transaction_time: "2026-02-08T14:45:34.000Z",
      },
    },
    transaction_share: [
      {
        amount: 8680100.0, // centesimal: Rp 86,801
        metadata: {
          variables: {
            commission: 2319900.0, // centesimal: Rp 23,199
            gross_amount: 11000000.0,
            value_added_tax: 229900.0,
            merchant_percentage_fee: 0.19,
            vat: 0.11,
          },
          merchant_share: 8680100.0,
          provider_share: 2319900.0,
          total_fee: 2319900.0,
        },
      },
    ],
  };

  it("should extract metrics from real journal hit with ÷100 conversion", () => {
    const metrics = extractJournalMetrics(realJournalHit);

    expect(metrics).not.toBeNull();
    expect(metrics!.gross).toBe(110000); // 11000000 / 100
    expect(metrics!.net).toBe(86801); // 8680100 / 100
    expect(metrics!.commission).toBe(23199); // 2319900 / 100
    expect(metrics!.orderNumber).toBe("F-3125143400");
    expect(metrics!.referenceId).toBe("4f0ce355-86d9-30f6-96c2-548e31c77457");
    expect(metrics!.paymentType).toBe("gopay");
    expect(metrics!.status).toBe("settlement");
  });

  it("should parse transaction time to milliseconds", () => {
    const metrics = extractJournalMetrics(realJournalHit);

    expect(metrics!.transactionTime).toBe("2026-02-08T14:45:34Z");
    expect(metrics!.transactionTimeMs).toBeGreaterThan(0);
    expect(typeof metrics!.transactionTimeMs).toBe("number");
  });

  it("should return null for null/undefined hit", () => {
    expect(extractJournalMetrics(null)).toBeNull();
    expect(extractJournalMetrics(undefined)).toBeNull();
  });

  it("should handle hit with missing transaction_share", () => {
    const hitNoShare = {
      amount: 5000000,
      time: "2026-02-08T10:00:00Z",
      status: "success",
      reference_id: "test-id",
      metadata: {
        transaction: {
          status: "settlement",
          payment_type: "qris",
          order_id: "F-0000000000",
        },
      },
    };

    const metrics = extractJournalMetrics(hitNoShare);

    expect(metrics).not.toBeNull();
    expect(metrics!.gross).toBe(50000); // 5000000 / 100
    expect(metrics!.net).toBe(0);
    expect(metrics!.commission).toBe(0);
  });

  it("should verify commission rate is ~21.1%", () => {
    const metrics = extractJournalMetrics(realJournalHit);

    const commissionRate = metrics!.commission / metrics!.gross;
    expect(commissionRate).toBeCloseTo(0.211, 2);
  });

  it("should extract promoDiscount from variables.voucher_amount / 100", () => {
    // Promo order hit: same structure as realJournalHit but with voucher_amount
    const promoHit = {
      ...realJournalHit,
      amount: 14000000, // centesimal: Rp 140,000
      transaction_share: [
        {
          amount: 8597400, // centesimal: Rp 85,974
          metadata: {
            variables: {
              commission: 2952600, // centesimal: Rp 29,526
              gross_amount: 14000000,
              voucher_amount: 2450000, // centesimal: Rp 24,500
              value_added_tax: 292600,
              merchant_percentage_fee: 0.19,
              vat: 0.11,
            },
            merchant_share: 8597400,
            provider_share: 2952600,
            total_fee: 2952600,
          },
        },
      ],
    };

    const metrics = extractJournalMetrics(promoHit);

    expect(metrics).not.toBeNull();
    expect(metrics!.promoDiscount).toBe(24500); // 2450000 / 100
  });

  it("should return promoDiscount=0 when voucher_amount is absent", () => {
    // The existing realJournalHit has no voucher_amount
    const metrics = extractJournalMetrics(realJournalHit);

    expect(metrics).not.toBeNull();
    expect(metrics!.promoDiscount).toBe(0);
  });
});

// ============================================
// aggregateJournalMetrics() Tests
// ============================================
describe("aggregateJournalMetrics", () => {
  const makeHit = (amount: number, orderId: string, status: string = "settlement") => ({
    amount,
    time: "2026-02-08T10:00:00Z",
    status: "success",
    reference_id: `ref-${orderId}`,
    metadata: {
      transaction: { status, payment_type: "gopay", order_id: orderId },
    },
    transaction_share: [
      {
        amount: amount * 0.789, // ~78.9% net
        metadata: {
          variables: { commission: amount * 0.211 },
          merchant_share: amount * 0.789,
        },
      },
    ],
  });

  it("should aggregate multiple settlement transactions", () => {
    const hits = [
      makeHit(11000000, "F-001"),
      makeHit(11000000, "F-002"),
      makeHit(33000000, "F-003"),
    ];

    const result = aggregateJournalMetrics(hits);

    expect(result.transactionCount).toBe(3);
    expect(result.transactions).toHaveLength(3);
    // Total gross: (11M + 11M + 33M) / 100 = 550,000
    expect(result.gross).toBeCloseTo(550000, 0);
  });

  it("should include capture status transactions (same as settlement)", () => {
    const hits = [
      makeHit(11000000, "F-001", "settlement"),
      makeHit(5000000, "F-002", "capture"), // also included (Midtrans/GoPay completed)
    ];

    const result = aggregateJournalMetrics(hits);

    expect(result.transactionCount).toBe(2);
    expect(result.gross).toBeCloseTo(160000, 0); // (11M + 5M) / 100
  });

  it("should exclude refund and partial_refund transactions", () => {
    const hits = [
      makeHit(11000000, "F-001", "settlement"),
      makeHit(5000000, "F-002", "refund"), // excluded
      makeHit(3000000, "F-003", "partial_refund"), // excluded
    ];

    const result = aggregateJournalMetrics(hits);

    expect(result.transactionCount).toBe(1);
    expect(result.gross).toBeCloseTo(110000, 0);
  });

  it("should return zeros for empty hits", () => {
    const result = aggregateJournalMetrics([]);

    expect(result.gross).toBe(0);
    expect(result.net).toBe(0);
    expect(result.commission).toBe(0);
    expect(result.transactionCount).toBe(0);
    expect(result.transactions).toHaveLength(0);
  });

  it("should include promoDiscount in aggregate totals", () => {
    const promoHits = [
      {
        amount: 14000000,
        time: "2026-03-15T10:00:00Z",
        status: "success",
        reference_id: "ref-promo-1",
        metadata: {
          transaction: {
            status: "settlement",
            payment_type: "gopay",
            order_id: "F-PROMO-001",
            merchant_id: "G293156297",
          },
        },
        transaction_share: [
          {
            amount: 8597400,
            metadata: {
              variables: {
                commission: 2952600,
                voucher_amount: 2450000, // Rp 24,500
              },
              merchant_share: 8597400,
            },
          },
        ],
      },
      {
        amount: 5000000,
        time: "2026-03-15T11:00:00Z",
        status: "success",
        reference_id: "ref-promo-2",
        metadata: {
          transaction: {
            status: "settlement",
            payment_type: "gopay",
            order_id: "F-PROMO-002",
            merchant_id: "G293156297",
          },
        },
        transaction_share: [
          {
            amount: 2370500,
            metadata: {
              variables: {
                commission: 1054500,
                voucher_amount: 1575000, // Rp 15,750
              },
              merchant_share: 2370500,
            },
          },
        ],
      },
    ];

    const result = aggregateJournalMetrics(promoHits);

    expect(result.transactionCount).toBe(2);
    expect(result.promoDiscount).toBe(24500 + 15750); // 40,250
  });
});

// ============================================
// buildOrderSearchBody() Tests
// ============================================
describe("buildOrderSearchBody", () => {
  it("should include order number in query (confirmed against real API)", () => {
    const body = buildOrderSearchBody("F-3125143400") as any;

    expect(body.query.term.order_number).toBe("F-3125143400");
  });
});

// ============================================
// parseOrderItems() Tests (real API format)
// ============================================
describe("parseOrderItems", () => {
  it("should extract items from real order response format", () => {
    // Real response structure from orders/search API (2026-02-09)
    const realOrderResponse = {
      status: "success",
      data: {
        hits: [
          {
            items: [
              {
                id: "3ed392a3-4f25-46a8-ae63-4d9cb9e2d4da",
                name: "Regular Pack of 3",
                price: 110000,
                quantity: 1,
                note: "",
                promo_id: "",
                variants: [],
              },
            ],
            gross_amount: 110000,
            order_number: "F-3125143400",
            merchant_id: "G293156297",
          },
        ],
        total: 1,
      },
    };

    const items = parseOrderItems(realOrderResponse);

    expect(items).toHaveLength(1);
    expect(items[0].externalItemId).toBe("3ed392a3-4f25-46a8-ae63-4d9cb9e2d4da");
    expect(items[0].productName).toBe("Regular Pack of 3");
    expect(items[0].unitPrice).toBe(110000);
    expect(items[0].quantity).toBe(1);
    expect(items[0].totalPrice).toBe(110000);
    expect(items[0].variants).toBeUndefined(); // empty array → undefined
  });

  it("should handle multiple items with variants", () => {
    const multiItemResponse = {
      status: "success",
      data: {
        hits: [
          {
            items: [
              {
                id: "item-1",
                name: "Regular Pack of 3",
                price: 110000,
                quantity: 2,
                variants: [],
              },
              {
                id: "item-2",
                name: "Frollie Bite",
                price: 45000,
                quantity: 1,
                variants: [{ name: "Size", value: "Large" }],
              },
            ],
          },
        ],
        total: 1,
      },
    };

    const items = parseOrderItems(multiItemResponse);

    expect(items).toHaveLength(2);
    expect(items[0].totalPrice).toBe(220000); // 110000 × 2
    expect(items[0].variants).toBeUndefined(); // empty array
    expect(items[1].totalPrice).toBe(45000); // 45000 × 1
    expect(items[1].variants).toBe(JSON.stringify([{ name: "Size", value: "Large" }]));
  });

  it("should return empty array for response with no items", () => {
    const noItemsResponse = {
      status: "success",
      data: {
        hits: [{}],
        total: 1,
      },
    };

    const items = parseOrderItems(noItemsResponse);
    expect(items).toHaveLength(0);
  });

  it("should handle missing data gracefully", () => {
    expect(parseOrderItems({})).toHaveLength(0);
    expect(parseOrderItems(null)).toHaveLength(0);
    expect(parseOrderItems(undefined)).toHaveLength(0);
  });
});

// ============================================
// buildJournalDedupKey() Tests
// ============================================
describe("buildJournalDedupKey", () => {
  it("should be deterministic (same input = same output)", () => {
    const key1 = buildJournalDedupKey("F-3125143400", 1770561934000);
    const key2 = buildJournalDedupKey("F-3125143400", 1770561934000);
    expect(key1).toBe(key2);
  });

  it("should produce different keys for different inputs", () => {
    const key1 = buildJournalDedupKey("F-3125143400", 1770561934000);
    const key2 = buildJournalDedupKey("F-3125143400", 1770560331000);
    const key3 = buildJournalDedupKey("F-3125138736", 1770561934000);

    expect(key1).not.toBe(key2);
    expect(key1).not.toBe(key3);
  });
});

// ============================================
// extractDashboardMetrics() Tests
// ============================================
describe("extractDashboardMetrics", () => {
  it("should parse sample response with 5 metrics", () => {
    const sampleResponse = {
      responses: [
        {
          status: 200,
          hits: { total: { value: 42 } },
          aggregations: { "2": { buckets: [{ "1": { value: 1000000 } }] } },
        },
        { status: 200, aggregations: { "2": { buckets: [{ "1": { value: 1500000 } }] } } },
        { status: 200, aggregations: { "2": { buckets: [{ "1": { value: 200000 } }] } } },
        { status: 200, aggregations: { "2": { buckets: [{ "1": { value: 50000 } }] } } },
        { status: 200, aggregations: { "2": { buckets: [{ "1": { value: 100000 } }] } } },
      ],
    };

    const result = extractDashboardMetrics(sampleResponse);

    expect(result.net).toBe(1000000);
    expect(result.gross).toBe(1500000);
    expect(result.commission).toBe(200000);
    expect(result.adBurn).toBe(50000);
    expect(result.promoBurn).toBe(100000);
    expect(result.transactionCount).toBe(42);
  });

  it("should handle empty response gracefully", () => {
    const result = extractDashboardMetrics({ responses: [] });

    expect(result.net).toBe(0);
    expect(result.gross).toBe(0);
    expect(result.commission).toBe(0);
    expect(result.transactionCount).toBe(0);
  });

  it("should handle missing aggregations gracefully", () => {
    const result = extractDashboardMetrics({
      responses: [
        { status: 200, hits: { total: { value: 10 } } },
        { status: 200 },
        { status: 200 },
        { status: 200 },
        { status: 200 },
      ],
    });

    expect(result.net).toBe(0);
    expect(result.transactionCount).toBe(10);
  });
});
