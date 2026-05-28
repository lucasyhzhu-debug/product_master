import { describe, it, expect } from "vitest";
import { parseCommand } from "../chatRegistry";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { internal } from "../../_generated/api";

const modules = import.meta.glob("/convex/**/*.ts");

describe("parseCommand — good inputs (spec case #1)", () => {
  it.each([
    ["/pack", "pack"],
    ["/pack@FrolliePackBot", "pack"],
    ["/register", "register"],
    ["/register@FrolliePackBot", "register"],
    ["/start", "start"],
    ["/start@FrolliePackBot", "start"],
    ["  /pack  ", "pack"], // whitespace trim
  ])("parses %s as %s", (input, expected) => {
    expect(parseCommand(input)).toBe(expected);
  });
});

describe("parseCommand — bad inputs (spec case #2)", () => {
  it.each([
    ["/pack now please"],   // trailing args
    ["/PACK"],              // case
    ["/packlist"],          // not exact
    ["pack"],               // missing slash
    [""],                   // empty
    ["   "],                // whitespace only
    ["/Foo"],               // unknown command
    ["/pack@"],             // empty bot suffix
    ["/pack @Bot"],         // space before @
  ])("rejects %s", (input) => {
    expect(parseCommand(input)).toBeNull();
  });
});

describe("getChatIdByRole (spec case #3)", () => {
  it("returns the active row's chatId when matching role exists", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("telegramChats", {
        chatId: "-100111",
        chatType: "supergroup",
        title: "Ops",
        role: "pack-list",
        registeredAt: 0,
        lastSeenAt: 0,
      });
    });
    const id = await t.query(internal.telegram.chatRegistry.getChatIdByRole, {
      role: "pack-list",
    });
    expect(id).toBe("-100111");
  });

  it("ignores archived rows even if role matches", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("telegramChats", {
        chatId: "-100222",
        chatType: "group",
        title: "Old Ops",
        role: "pack-list",
        archivedAt: 999,
        registeredAt: 0,
        lastSeenAt: 0,
      });
    });
    // No active row + no env fallback configured → throws.
    await expect(
      t.query(internal.telegram.chatRegistry.getChatIdByRole, { role: "pack-list" }),
    ).rejects.toThrow(/No Telegram chat assigned/);
  });

  it("falls back to TELEGRAM_CHAT_ID env when TELEGRAM_FALLBACK_ROLE matches", async () => {
    const t = convexTest(schema, modules);
    const prev = { fb: process.env.TELEGRAM_FALLBACK_ROLE, cid: process.env.TELEGRAM_CHAT_ID };
    process.env.TELEGRAM_FALLBACK_ROLE = "pack-list";
    process.env.TELEGRAM_CHAT_ID = "-100ENV";
    try {
      const id = await t.query(internal.telegram.chatRegistry.getChatIdByRole, {
        role: "pack-list",
      });
      expect(id).toBe("-100ENV");
    } finally {
      process.env.TELEGRAM_FALLBACK_ROLE = prev.fb;
      process.env.TELEGRAM_CHAT_ID = prev.cid;
    }
  });

  it("throws when neither table row nor env fallback configured", async () => {
    const t = convexTest(schema, modules);
    const prev = process.env.TELEGRAM_FALLBACK_ROLE;
    delete process.env.TELEGRAM_FALLBACK_ROLE;
    try {
      await expect(
        t.query(internal.telegram.chatRegistry.getChatIdByRole, { role: "pack-list" }),
      ).rejects.toThrow(/No Telegram chat assigned/);
    } finally {
      process.env.TELEGRAM_FALLBACK_ROLE = prev;
    }
  });
});
