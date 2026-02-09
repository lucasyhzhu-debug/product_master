/**
 * Unit tests for GoBiz adapter helper functions.
 * Tests date conversion, header building, and response parsing.
 */

import { describe, it, expect } from "vitest";
import {
  wibDateToUtcRange,
  buildDashboardHeaders,
  buildJournalSearchBody,
  buildOrderSearchBody,
  buildJournalDedupKey,
  extractDashboardMetrics,
  parseOrderItems,
} from "../helpers";

// ============================================
// wibDateToUtcRange() Tests - 3 tests
// ============================================
describe("wibDateToUtcRange", () => {
  it("should convert WIB date to UTC millisecond range correctly", () => {
    // 2026-02-08 in WIB = 2026-02-07 17:00:00 UTC to 2026-02-08 16:59:59.999 UTC
    const result = wibDateToUtcRange("2026-02-08");

    const fromDate = new Date(result.from);
    const toDate = new Date(result.to);

    // Check from time: 2026-02-07 17:00:00 UTC
    expect(fromDate.getUTCFullYear()).toBe(2026);
    expect(fromDate.getUTCMonth()).toBe(1); // Feb = 1
    expect(fromDate.getUTCDate()).toBe(7);
    expect(fromDate.getUTCHours()).toBe(17);
    expect(fromDate.getUTCMinutes()).toBe(0);
    expect(fromDate.getUTCSeconds()).toBe(0);

    // Check to time: 2026-02-08 16:59:59.999 UTC
    expect(toDate.getUTCFullYear()).toBe(2026);
    expect(toDate.getUTCMonth()).toBe(1); // Feb = 1
    expect(toDate.getUTCDate()).toBe(8);
    expect(toDate.getUTCHours()).toBe(16);
    expect(toDate.getUTCMinutes()).toBe(59);
    expect(toDate.getUTCSeconds()).toBe(59);
  });

  it("should handle month boundary correctly", () => {
    // 2026-03-01 in WIB = 2026-02-28 17:00:00 UTC to 2026-03-01 16:59:59.999 UTC
    const result = wibDateToUtcRange("2026-03-01");

    const fromDate = new Date(result.from);
    const toDate = new Date(result.to);

    expect(fromDate.getUTCDate()).toBe(28); // Feb 28
    expect(fromDate.getUTCMonth()).toBe(1); // Feb
    expect(toDate.getUTCDate()).toBe(1); // Mar 1
    expect(toDate.getUTCMonth()).toBe(2); // Mar
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
// buildDashboardHeaders() Tests - 3 tests
// ============================================
describe("buildDashboardHeaders", () => {
  it("should include all 5 ref IDs in x-ref-ids header", () => {
    const headers = buildDashboardHeaders("Bearer token123", 1000, 2000);

    expect(headers["x-ref-ids"]).toBeDefined();
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
// buildJournalSearchBody() Tests - 2 tests
// ============================================
describe("buildJournalSearchBody", () => {
  it("should produce valid structure with merchant ID", () => {
    const body = buildJournalSearchBody(1000, 2000, "G123456", 0, 50);

    expect(body).toHaveProperty("from", 0);
    expect(body).toHaveProperty("size", 50);
    expect(body).toHaveProperty("sort");
    expect(body).toHaveProperty("included_categories");
    expect(body).toHaveProperty("query");
  });

  it("should include time range and merchant ID in query", () => {
    const body = buildJournalSearchBody(1000, 2000, "G123456", 0, 50) as any;

    const clauses = body.query[0].clauses;
    expect(clauses).toHaveLength(2);

    // Check time range
    expect(clauses[0].range.time.gte).toBe(1000);
    expect(clauses[0].range.time.lte).toBe(2000);

    // Check merchant ID in query string
    expect(clauses[1].query_string.query).toContain("G123456");
  });
});

// ============================================
// buildOrderSearchBody() Tests - 1 test
// ============================================
describe("buildOrderSearchBody", () => {
  it("should include order number in query", () => {
    const body = buildOrderSearchBody("F-1234567890") as any;

    expect(body.query.term.order_number).toBe("F-1234567890");
  });
});

// ============================================
// buildJournalDedupKey() Tests - 2 tests
// ============================================
describe("buildJournalDedupKey", () => {
  it("should be deterministic (same input = same output)", () => {
    const key1 = buildJournalDedupKey("F-1234567890", 1000);
    const key2 = buildJournalDedupKey("F-1234567890", 1000);

    expect(key1).toBe(key2);
  });

  it("should produce different keys for different inputs", () => {
    const key1 = buildJournalDedupKey("F-1234567890", 1000);
    const key2 = buildJournalDedupKey("F-1234567890", 2000);
    const key3 = buildJournalDedupKey("F-9876543210", 1000);

    expect(key1).not.toBe(key2);
    expect(key1).not.toBe(key3);
  });
});

// ============================================
// extractDashboardMetrics() Tests - 3 tests
// ============================================
describe("extractDashboardMetrics", () => {
  it("should parse sample response with 5 metrics", () => {
    const sampleResponse = {
      responses: [
        {
          status: 200,
          hits: { total: { value: 42 } },
          aggregations: {
            "2": {
              buckets: [{ "1": { value: 1000000 }, key_as_string: "2026-02-08" }],
            },
          },
        },
        {
          status: 200,
          aggregations: {
            "2": {
              buckets: [{ "1": { value: 1500000 } }],
            },
          },
        },
        {
          status: 200,
          aggregations: {
            "2": {
              buckets: [{ "1": { value: 200000 } }],
            },
          },
        },
        {
          status: 200,
          aggregations: {
            "2": {
              buckets: [{ "1": { value: 50000 } }],
            },
          },
        },
        {
          status: 200,
          aggregations: {
            "2": {
              buckets: [{ "1": { value: 100000 } }],
            },
          },
        },
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
    const emptyResponse = { responses: [] };

    const result = extractDashboardMetrics(emptyResponse);

    expect(result.net).toBe(0);
    expect(result.gross).toBe(0);
    expect(result.commission).toBe(0);
    expect(result.adBurn).toBe(0);
    expect(result.promoBurn).toBe(0);
    expect(result.transactionCount).toBe(0);
  });

  it("should handle missing aggregations gracefully", () => {
    const responseWithoutAggs = {
      responses: [
        { status: 200, hits: { total: { value: 10 } } },
        { status: 200 },
        { status: 200 },
        { status: 200 },
        { status: 200 },
      ],
    };

    const result = extractDashboardMetrics(responseWithoutAggs);

    expect(result.net).toBe(0);
    expect(result.gross).toBe(0);
    expect(result.transactionCount).toBe(10);
  });
});

// ============================================
// parseOrderItems() Tests - 3 tests
// ============================================
describe("parseOrderItems", () => {
  it("should extract items from order response", () => {
    const orderResponse = {
      hits: {
        hits: [
          {
            _source: {
              items: [
                {
                  item_id: "item-1",
                  name: "Frollie Original",
                  price: 25000,
                  quantity: 2,
                  total_price: 50000,
                  variants: "Large",
                },
                {
                  item_id: "item-2",
                  name: "Frollie Bite",
                  price: 15000,
                  quantity: 3,
                  total_price: 45000,
                },
              ],
            },
          },
        ],
      },
    };

    const items = parseOrderItems(orderResponse);

    expect(items).toHaveLength(2);
    expect(items[0].externalItemId).toBe("item-1");
    expect(items[0].productName).toBe("Frollie Original");
    expect(items[0].unitPrice).toBe(25000);
    expect(items[0].quantity).toBe(2);
    expect(items[0].totalPrice).toBe(50000);
    expect(items[0].variants).toBe("Large");
  });

  it("should return empty array for response with no items", () => {
    const emptyResponse = {
      hits: {
        hits: [
          {
            _source: {},
          },
        ],
      },
    };

    const items = parseOrderItems(emptyResponse);

    expect(items).toHaveLength(0);
  });

  it("should handle missing hits gracefully", () => {
    const noHitsResponse = {};

    const items = parseOrderItems(noHitsResponse);

    expect(items).toHaveLength(0);
  });
});
