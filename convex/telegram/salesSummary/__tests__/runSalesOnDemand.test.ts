import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../../schema";
import { internal } from "../../../_generated/api";

const modules = import.meta.glob("/convex/**/*.ts");

let captured: Array<{ url: string; body: string }>;

beforeEach(() => {
  captured = [];
  process.env.TELEGRAM_BOT_TOKEN = "test-token";
  // No env fallback → getChatIdByRole throws (drives the failure path).
  delete process.env.TELEGRAM_FALLBACK_ROLE;
  delete process.env.TELEGRAM_CHAT_ID;
  global.fetch = vi.fn(async (input: RequestInfo, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const body = init?.body as string;
    captured.push({ url, body });
    return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { status: 200 });
  }) as unknown as typeof fetch;
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.TELEGRAM_BOT_TOKEN;
});

describe("runSalesOnDemand", () => {
  it("sends ack first, then a failure breadcrumb when the summary throws", async () => {
    const t = convexTest(schema, modules);
    // No sales-updates chat assigned → getChatIdByRole throws inside sendSalesSummary.
    await expect(
      t.action(internal.telegram.salesSummary.sendSalesSummary.runSalesOnDemand, {
        chatId: "-555",
      }),
    ).rejects.toThrow();

    const texts = captured.map((c) => JSON.parse(c.body).text as string);
    // Exactly two sends, in order: ack first, then the breadcrumb. getChatIdByRole
    // throws before any report chunk, so nothing else is sent.
    expect(texts).toHaveLength(2);
    expect(texts[0]).toContain("Acknowledged");
    expect(texts[1]).toContain("Sales update failed");
  });

  // Triple-review I1: happy path had zero coverage. Seed a sales-updates chat so the
  // daily summary resolves a destination and runs to completion. Proves ack-first,
  // that a report chunk follows the ack, and that no failure breadcrumb is emitted.
  it("happy path: sends the ack, then the summary report, with no failure breadcrumb", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("telegramChats", {
        chatId: "-555", chatType: "supergroup", title: "Sales",
        role: "sales-updates", registeredAt: 0, lastSeenAt: 0,
      });
    });

    await t.action(internal.telegram.salesSummary.sendSalesSummary.runSalesOnDemand, {
      chatId: "-555",
    });

    const texts = captured.map((c) => JSON.parse(c.body).text as string);
    expect(texts[0]).toContain("Acknowledged");                          // ack first
    expect(texts.some((x) => !x.includes("Acknowledged"))).toBe(true);   // a report chunk followed
    expect(texts.some((x) => x.includes("Sales update failed"))).toBe(false); // success → no breadcrumb
  });
});
