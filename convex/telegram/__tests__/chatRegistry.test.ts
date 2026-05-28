import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseCommand } from "../chatRegistry";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api, internal } from "../../_generated/api";
import { seedAdminSession } from "./testHelpers";

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

describe("touchChatLastSeen (spec cases #13, #14)", () => {
  it("no-ops for unregistered chat (pollution prevention)", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.telegram.chatRegistry.touchChatLastSeen, {
      chatId: "-100999",
    });
    const rows = await t.run(async (ctx) =>
      ctx.db.query("telegramChats").collect(),
    );
    expect(rows).toHaveLength(0);
  });

  it("no-ops for archived chat", async () => {
    const t = convexTest(schema, modules);
    let id: string;
    await t.run(async (ctx) => {
      id = await ctx.db.insert("telegramChats", {
        chatId: "-100333",
        chatType: "group",
        title: "Archived",
        archivedAt: 100,
        registeredAt: 0,
        lastSeenAt: 50,
      });
    });
    await t.mutation(internal.telegram.chatRegistry.touchChatLastSeen, {
      chatId: "-100333",
    });
    const row = await t.run(async (ctx) =>
      ctx.db
        .query("telegramChats")
        .withIndex("by_chatId", (q) => q.eq("chatId", "-100333"))
        .unique(),
    );
    expect(row?.lastSeenAt).toBe(50);  // unchanged
  });

  it("patches lastSeenAt for active registered chat", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("telegramChats", {
        chatId: "-100444",
        chatType: "supergroup",
        title: "Live",
        registeredAt: 0,
        lastSeenAt: 50,
      });
    });
    await t.mutation(internal.telegram.chatRegistry.touchChatLastSeen, {
      chatId: "-100444",
    });
    const row = await t.run(async (ctx) =>
      ctx.db
        .query("telegramChats")
        .withIndex("by_chatId", (q) => q.eq("chatId", "-100444"))
        .unique(),
    );
    expect(row?.lastSeenAt).toBeGreaterThan(50);
  });
});

describe("listChats", () => {
  it("returns active rows only when includeArchived false", async () => {
    const t = convexTest(schema, modules);
    const token = await seedAdminSession(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("telegramChats", {
        chatId: "A", chatType: "group", title: "Active", registeredAt: 0, lastSeenAt: 0,
      });
      await ctx.db.insert("telegramChats", {
        chatId: "B", chatType: "group", title: "Archived", archivedAt: 1,
        registeredAt: 0, lastSeenAt: 0,
      });
    });
    const active = await t.query(api.telegram.chatRegistry.listChats, {
      token, includeArchived: false,
    });
    expect(active.map((r) => r.chatId)).toEqual(["A"]);
    const all = await t.query(api.telegram.chatRegistry.listChats, {
      token, includeArchived: true,
    });
    expect(all.map((r) => r.chatId).sort()).toEqual(["A", "B"]);
  });

  it("rejects a non-manager/admin token", async () => {
    const t = convexTest(schema, modules);
    const token = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        name: "Kitchen", pinHash: "salt:hash", role: "kitchen",
        isActive: true, failedAttempts: 0, createdAt: Date.now(),
      });
      await ctx.db.insert("sessions", {
        userId, token: "tok-kitchen", expiresAt: Date.now() + 1e9, createdAt: Date.now(),
      });
      return "tok-kitchen";
    });
    await expect(
      t.query(api.telegram.chatRegistry.listChats, { token, includeArchived: false }),
    ).rejects.toThrow();
  });
});

describe("assignRole (spec cases #4, #5, #6, #7)", () => {
  it("rejects unknown role string (case #5 — validation gap)", async () => {
    const t = convexTest(schema, modules);
    const token = await seedAdminSession(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("telegramChats", {
        chatId: "X", chatType: "group", title: "X", registeredAt: 0, lastSeenAt: 0,
      });
    });
    await expect(
      t.mutation(api.telegram.chatRegistry.assignRole, {
        token, chatId: "X", role: "not-a-real-role",
      } as any),
    ).rejects.toThrow(/Unknown telegram role/);
  });

  it("rejects missing chatId (case #6 — existence guard)", async () => {
    const t = convexTest(schema, modules);
    const token = await seedAdminSession(t);
    await expect(
      t.mutation(api.telegram.chatRegistry.assignRole, {
        token, chatId: "GHOST", role: "pack-list",
      } as any),
    ).rejects.toThrow(/No registered Telegram chat/);
  });

  it("clears role when role=null without forceReassign (case #7)", async () => {
    const t = convexTest(schema, modules);
    const token = await seedAdminSession(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("telegramChats", {
        chatId: "C", chatType: "group", title: "C",
        role: "pack-list", registeredAt: 0, lastSeenAt: 0,
      });
    });
    await t.mutation(api.telegram.chatRegistry.assignRole, {
      token, chatId: "C", role: null,
    } as any);
    const row = await t.run(async (ctx) =>
      ctx.db.query("telegramChats").withIndex("by_chatId", (q) => q.eq("chatId", "C")).unique());
    expect(row?.role).toBeUndefined();
  });

  it("reassigns atomically when forceReassign=true (case #4 — atomicity)", async () => {
    const t = convexTest(schema, modules);
    const token = await seedAdminSession(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("telegramChats", {
        chatId: "OLD", chatType: "group", title: "Old",
        role: "pack-list", registeredAt: 0, lastSeenAt: 0,
      });
      await ctx.db.insert("telegramChats", {
        chatId: "NEW", chatType: "group", title: "New",
        registeredAt: 0, lastSeenAt: 0,
      });
    });
    await t.mutation(api.telegram.chatRegistry.assignRole, {
      token, chatId: "NEW", role: "pack-list", forceReassign: true,
    } as any);
    const [oldRow, newRow] = await t.run(async (ctx) => [
      await ctx.db.query("telegramChats").withIndex("by_chatId", (q) => q.eq("chatId", "OLD")).unique(),
      await ctx.db.query("telegramChats").withIndex("by_chatId", (q) => q.eq("chatId", "NEW")).unique(),
    ]);
    expect(oldRow?.role).toBeUndefined();
    expect(newRow?.role).toBe("pack-list");
  });

  it("rejects assignment when role already held without forceReassign", async () => {
    const t = convexTest(schema, modules);
    const token = await seedAdminSession(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("telegramChats", {
        chatId: "HOLDER", chatType: "group", title: "Holder",
        role: "pack-list", registeredAt: 0, lastSeenAt: 0,
      });
      await ctx.db.insert("telegramChats", {
        chatId: "OTHER", chatType: "group", title: "Other",
        registeredAt: 0, lastSeenAt: 0,
      });
    });
    await expect(
      t.mutation(api.telegram.chatRegistry.assignRole, {
        token, chatId: "OTHER", role: "pack-list",
      } as any),
    ).rejects.toThrow(/already held/);
  });

  it("rejects assigning a role to an ARCHIVED chat (edge case — silent dead-end guard)", async () => {
    const t = convexTest(schema, modules);
    const token = await seedAdminSession(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("telegramChats", {
        chatId: "ARCH", chatType: "group", title: "Archived",
        archivedAt: 100, registeredAt: 0, lastSeenAt: 0,
      });
    });
    await expect(
      t.mutation(api.telegram.chatRegistry.assignRole, {
        token, chatId: "ARCH", role: "pack-list",
      } as any),
    ).rejects.toThrow(/archived chat/);
  });
});

describe("archiveChat / restoreChat (spec cases #11, #12)", () => {
  it("archives sets archivedAt AND clears role in one atomic patch (case #11)", async () => {
    const t = convexTest(schema, modules);
    const token = await seedAdminSession(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("telegramChats", {
        chatId: "A1", chatType: "group", title: "A1",
        role: "pack-list", registeredAt: 0, lastSeenAt: 0,
      });
    });
    await t.mutation(api.telegram.chatRegistry.archiveChat, {
      token, chatId: "A1",
    } as any);
    const row = await t.run(async (ctx) =>
      ctx.db.query("telegramChats").withIndex("by_chatId", (q) => q.eq("chatId", "A1")).unique());
    expect(row?.archivedAt).toBeGreaterThan(0);
    expect(row?.role).toBeUndefined();
  });

  it("archiveChat rejects missing chatId (case #12)", async () => {
    const t = convexTest(schema, modules);
    const token = await seedAdminSession(t);
    await expect(
      t.mutation(api.telegram.chatRegistry.archiveChat, {
        token, chatId: "GHOST",
      } as any),
    ).rejects.toThrow(/No registered Telegram chat/);
  });

  it("restoreChat clears archivedAt", async () => {
    const t = convexTest(schema, modules);
    const token = await seedAdminSession(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("telegramChats", {
        chatId: "R1", chatType: "group", title: "R1",
        archivedAt: 100, registeredAt: 0, lastSeenAt: 0,
      });
    });
    await t.mutation(api.telegram.chatRegistry.restoreChat, {
      token, chatId: "R1",
    } as any);
    const row = await t.run(async (ctx) =>
      ctx.db.query("telegramChats").withIndex("by_chatId", (q) => q.eq("chatId", "R1")).unique());
    expect(row?.archivedAt).toBeUndefined();
  });

  it("restoreChat rejects missing chatId (case #12)", async () => {
    const t = convexTest(schema, modules);
    const token = await seedAdminSession(t);
    await expect(
      t.mutation(api.telegram.chatRegistry.restoreChat, {
        token, chatId: "GHOST",
      } as any),
    ).rejects.toThrow(/No registered Telegram chat/);
  });
});

describe("sendTestMessage (spec case #18)", () => {
  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = "test-token";
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.TELEGRAM_BOT_TOKEN;
  });

  it("populates lastError on Telegram 403", async () => {
    const t = convexTest(schema, modules);
    const token = await seedAdminSession(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("telegramChats", {
        chatId: "T1", chatType: "group", title: "Test",
        registeredAt: 0, lastSeenAt: 0,
      });
    });
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ ok: false, description: "Forbidden: bot was kicked" }), {
        status: 403,
      }),
    ) as unknown as typeof fetch;
    await expect(
      t.action(api.telegram.chatRegistry.sendTestMessage, {
        token, chatId: "T1",
      } as any),
    ).rejects.toThrow();
    const row = await t.run(async (ctx) =>
      ctx.db.query("telegramChats").withIndex("by_chatId", (q) => q.eq("chatId", "T1")).unique());
    expect(row?.lastError?.message).toContain("Forbidden");
    expect(row?.lastError?.at).toBeGreaterThan(0);
  });

  it("truncates lastError.message to 200 chars with trailing ellipsis", async () => {
    const t = convexTest(schema, modules);
    const token = await seedAdminSession(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("telegramChats", {
        chatId: "T2", chatType: "group", title: "Test",
        registeredAt: 0, lastSeenAt: 0,
      });
    });
    const longMsg = "x".repeat(500);
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ ok: false, description: longMsg }), {
        status: 500,
      }),
    ) as unknown as typeof fetch;
    await expect(
      t.action(api.telegram.chatRegistry.sendTestMessage, {
        token, chatId: "T2",
      } as any),
    ).rejects.toThrow();
    const row = await t.run(async (ctx) =>
      ctx.db.query("telegramChats").withIndex("by_chatId", (q) => q.eq("chatId", "T2")).unique());
    expect(row?.lastError?.message.length).toBe(200);
    expect(row?.lastError?.message.endsWith("…")).toBe(true);
  });
});

describe("seedChatFromEnv (spec cases #8, #9, #10)", () => {
  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = "test-token";
    process.env.TELEGRAM_CHAT_ID = "-100SEED";
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({
        ok: true,
        result: { id: -100, type: "supergroup", title: "Seeded Title" },
      }), { status: 200 }),
    ) as unknown as typeof fetch;
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
  });

  it("throws on invalid role string", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.action(internal.telegram.chatRegistry.seedChatFromEnv, { role: "bogus" }),
    ).rejects.toThrow(/Unknown telegram role/);
  });

  it("throws when TELEGRAM_BOT_TOKEN missing (case #8)", async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    const t = convexTest(schema, modules);
    await expect(
      t.action(internal.telegram.chatRegistry.seedChatFromEnv, { role: "pack-list" }),
    ).rejects.toThrow(/TELEGRAM_BOT_TOKEN/);
  });

  it("throws when TELEGRAM_CHAT_ID missing (case #8)", async () => {
    delete process.env.TELEGRAM_CHAT_ID;
    const t = convexTest(schema, modules);
    await expect(
      t.action(internal.telegram.chatRegistry.seedChatFromEnv, { role: "pack-list" }),
    ).rejects.toThrow(/TELEGRAM_CHAT_ID/);
  });

  it("throws on Telegram getChat API failure (case #9)", async () => {
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ ok: false, description: "Unauthorized" }), {
        status: 401,
      }),
    ) as unknown as typeof fetch;
    const t = convexTest(schema, modules);
    await expect(
      t.action(internal.telegram.chatRegistry.seedChatFromEnv, { role: "pack-list" }),
    ).rejects.toThrow(/Unauthorized/);
  });

  // Case #10: four row-existence sub-cases
  it("status='inserted' when no pre-existing row (case #10a)", async () => {
    const t = convexTest(schema, modules);
    const result = await t.action(internal.telegram.chatRegistry.seedChatFromEnv, {
      role: "pack-list",
    });
    expect(result).toMatchObject({ status: "inserted", role: "pack-list" });
  });

  it("status='graduated-dormant' when existing row has no role (case #10b)", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("telegramChats", {
        chatId: "-100SEED", chatType: "supergroup", title: "Existing",
        registeredAt: 0, lastSeenAt: 0,
      });
    });
    const result = await t.action(internal.telegram.chatRegistry.seedChatFromEnv, {
      role: "pack-list",
    });
    expect(result).toMatchObject({ status: "graduated-dormant", role: "pack-list" });
  });

  it("status='already-exists-same-role' when existing row has same role (case #10c)", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("telegramChats", {
        chatId: "-100SEED", chatType: "supergroup", title: "Existing",
        role: "pack-list", registeredAt: 0, lastSeenAt: 0,
      });
    });
    const result = await t.action(internal.telegram.chatRegistry.seedChatFromEnv, {
      role: "pack-list",
    });
    expect(result).toMatchObject({ status: "already-exists-same-role" });
  });

  it("throws when existing row has DIFFERENT role (case #10d — intentional non-idempotent)", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("telegramChats", {
        chatId: "-100SEED", chatType: "supergroup", title: "Existing",
        role: "sales-updates", registeredAt: 0, lastSeenAt: 0,
      });
    });
    await expect(
      t.action(internal.telegram.chatRegistry.seedChatFromEnv, { role: "pack-list" }),
    ).rejects.toThrow(/already registered with role/);
  });

  it("seedFromEnvWrite re-validates role (defense-in-depth, direct internal call)", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(internal.telegram.chatRegistry.seedFromEnvWrite, {
        chatId: "-100SEED", chatType: "supergroup", title: "X", role: "bogus",
      }),
    ).rejects.toThrow(/Unknown telegram role/);
  });
});
