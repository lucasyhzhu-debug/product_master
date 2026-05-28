import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { internal } from "../../_generated/api";

const modules = import.meta.glob("/convex/**/*.ts");

// Capture the sendTelegramHtml HTTP call by stubbing global.fetch.
let captured: Array<{ url: string; body: string }>;

beforeEach(() => {
  captured = [];
  process.env.TELEGRAM_BOT_TOKEN = "test-token";
  global.fetch = vi.fn(async (input: RequestInfo, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const body = init?.body as string;
    captured.push({ url, body });
    return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), {
      status: 200,
    });
  }) as unknown as typeof fetch;
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.TELEGRAM_BOT_TOKEN;
});

describe("registerChat confirmation messages (spec cases #19, #20)", () => {
  it("HTML-escapes <>& in chat title (XSS prevention)", async () => {
    const t = convexTest(schema, modules);
    await t.action(internal.telegram.chatRegistry.registerChat, {
      chatId: "-100555",
      chatType: "group",
      title: "Frollie & <Friends>",
      registeredBy: 42,
    });
    expect(captured).toHaveLength(1);
    const body = JSON.parse(captured[0].body);
    expect(body.text).toContain("Frollie &amp; &lt;Friends&gt;");
    expect(body.text).not.toContain("<Friends>");
  });

  it("new row → 'Chat registered as ... Assign a role at <URL>' confirmation", async () => {
    const t = convexTest(schema, modules);
    await t.action(internal.telegram.chatRegistry.registerChat, {
      chatId: "-100666", chatType: "supergroup", title: "New", registeredBy: 42,
    });
    expect(JSON.parse(captured[0].body).text).toMatch(/registered as.*New.*Assign a role at/);
  });

  it("existing dormant row → 'Already registered (no role assigned yet)' confirmation", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("telegramChats", {
        chatId: "-100777", chatType: "group", title: "Dormant",
        registeredAt: 0, lastSeenAt: 0,
      });
    });
    await t.action(internal.telegram.chatRegistry.registerChat, {
      chatId: "-100777", chatType: "group", title: "Dormant", registeredBy: 42,
    });
    expect(JSON.parse(captured[0].body).text).toMatch(/Already registered.*no role assigned/);
  });

  it("existing live row → 'Already registered as role <role>' confirmation", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("telegramChats", {
        chatId: "-100888", chatType: "group", title: "Live", role: "sales-updates",
        registeredAt: 0, lastSeenAt: 0,
      });
    });
    await t.action(internal.telegram.chatRegistry.registerChat, {
      chatId: "-100888", chatType: "group", title: "Live", registeredBy: 42,
    });
    expect(JSON.parse(captured[0].body).text).toMatch(/Already registered as role.*sales-updates/);
  });
});
