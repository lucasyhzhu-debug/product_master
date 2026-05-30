import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { internal } from "../../_generated/api";

const modules = import.meta.glob("/convex/**/*.ts");

describe("getChatAuth", () => {
  it("unregistered chat → {registered:false, archived:false}", async () => {
    const t = convexTest(schema, modules);
    const r = await t.query(internal.telegram.chatRegistry.getChatAuth, { chatId: "-1" });
    expect(r).toEqual({ registered: false, archived: false });
  });

  it("registered with role → returns role, not archived", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("telegramChats", {
        chatId: "-100", chatType: "group", title: "Sales", role: "sales-updates",
        registeredAt: 0, lastSeenAt: 0,
      });
    });
    const r = await t.query(internal.telegram.chatRegistry.getChatAuth, { chatId: "-100" });
    expect(r).toEqual({ registered: true, role: "sales-updates", archived: false });
  });

  it("registered without role → role undefined", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("telegramChats", {
        chatId: "-200", chatType: "group", title: "Dormant", registeredAt: 0, lastSeenAt: 0,
      });
    });
    const r = await t.query(internal.telegram.chatRegistry.getChatAuth, { chatId: "-200" });
    expect(r).toEqual({ registered: true, role: undefined, archived: false });
  });

  it("archived chat → archived:true", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("telegramChats", {
        chatId: "-300", chatType: "group", title: "Archived",
        registeredAt: 0, lastSeenAt: 0, archivedAt: 123,
      });
    });
    const r = await t.query(internal.telegram.chatRegistry.getChatAuth, { chatId: "-300" });
    expect(r).toEqual({ registered: true, role: undefined, archived: true });
  });

  it("env-fallback chat (no DB row) → authorized for the fallback role", async () => {
    process.env.TELEGRAM_FALLBACK_ROLE = "pack-list";
    process.env.TELEGRAM_CHAT_ID = "-400";
    try {
      const t = convexTest(schema, modules);
      const r = await t.query(internal.telegram.chatRegistry.getChatAuth, { chatId: "-400" });
      expect(r).toEqual({ registered: true, role: "pack-list", archived: false });
    } finally {
      delete process.env.TELEGRAM_FALLBACK_ROLE;
      delete process.env.TELEGRAM_CHAT_ID;
    }
  });

  it("env-fallback set but DIFFERENT chatId → not authorized", async () => {
    process.env.TELEGRAM_FALLBACK_ROLE = "pack-list";
    process.env.TELEGRAM_CHAT_ID = "-400";
    try {
      const t = convexTest(schema, modules);
      const r = await t.query(internal.telegram.chatRegistry.getChatAuth, { chatId: "-999" });
      expect(r).toEqual({ registered: false, archived: false });
    } finally {
      delete process.env.TELEGRAM_FALLBACK_ROLE;
      delete process.env.TELEGRAM_CHAT_ID;
    }
  });
});
