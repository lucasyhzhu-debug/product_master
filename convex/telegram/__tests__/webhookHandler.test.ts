import { describe, it, expect, vi } from "vitest";
import { decideWebhookOutcome } from "../webhook";
import type { WebhookDeps } from "../webhook";

const SECRET = "a".repeat(64);

function defaultDeps(over: Partial<WebhookDeps> = {}): WebhookDeps {
  return {
    recordIfNew: async () => true,
    runPack: async () => {},
    runRegister: async () => {},
    runStart: async () => {},
    touchLastSeen: async () => {},
    // Load-bearing: /pack and /sales are now gated (COMMAND_POLICY). Seeding the
    // pack-list role here is what makes the pre-existing /pack dispatch tests below
    // (which don't override getChatAuth) exercise the AUTHORIZED path. Tests that
    // need a different sender override getChatAuth explicitly.
    getChatAuth: async () => ({ registered: true, role: "pack-list", archived: false }),
    runSales: async () => {},
    sendNudge: async () => {},
    ...over,
  };
}

function makeUpdate(over: Partial<{ update_id: number; text: string }> = {}) {
  return {
    update_id: over.update_id ?? 123,
    message: {
      message_id: 1,
      date: 1700000000,
      chat: { id: -1001234567890, type: "supergroup" },
      from: { id: 42, is_bot: false, first_name: "Test" },
      text: over.text ?? "/pack",
    },
  };
}

describe("decideWebhookOutcome — auth", () => {
  it("returns 401 when secret missing", async () => {
    const result = await decideWebhookOutcome({
      providedSecret: null,
      expectedSecret: SECRET,
      body: makeUpdate(),
      deps: defaultDeps(),
    });
    expect(result.status).toBe(401);
  });

  it("returns 401 when secret mismatches", async () => {
    const result = await decideWebhookOutcome({
      providedSecret: "wrong",
      expectedSecret: SECRET,
      body: makeUpdate(),
      deps: defaultDeps(),
    });
    expect(result.status).toBe(401);
  });

  it("returns 401 when expectedSecret env var missing", async () => {
    const result = await decideWebhookOutcome({
      providedSecret: SECRET,
      expectedSecret: undefined,
      body: makeUpdate(),
      deps: defaultDeps(),
    });
    expect(result.status).toBe(401);
  });
});

describe("decideWebhookOutcome — command parsing", () => {
  it("triggers sendPackList for /pack", async () => {
    const runPack = vi.fn().mockResolvedValue(undefined);
    const result = await decideWebhookOutcome({
      providedSecret: SECRET,
      expectedSecret: SECRET,
      body: makeUpdate({ text: "/pack" }),
      deps: defaultDeps({ runPack }),
    });
    expect(result.status).toBe(200);
    expect(runPack).toHaveBeenCalledTimes(1);
  });

  it("triggers sendPackList for /pack@BotName (group form)", async () => {
    const runPack = vi.fn().mockResolvedValue(undefined);
    const result = await decideWebhookOutcome({
      providedSecret: SECRET,
      expectedSecret: SECRET,
      body: makeUpdate({ text: "/pack@FrolliePackBot" }),
      deps: defaultDeps({ runPack }),
    });
    expect(result.status).toBe(200);
    expect(runPack).toHaveBeenCalledTimes(1);
  });

  it("ignores non-/pack text without scheduling action", async () => {
    const runPack = vi.fn().mockResolvedValue(undefined);
    const result = await decideWebhookOutcome({
      providedSecret: SECRET,
      expectedSecret: SECRET,
      body: makeUpdate({ text: "hello" }),
      deps: defaultDeps({ runPack }),
    });
    expect(result.status).toBe(200);
    expect(runPack).not.toHaveBeenCalled();
  });

  it("ignores updates with no message field", async () => {
    const runPack = vi.fn().mockResolvedValue(undefined);
    const result = await decideWebhookOutcome({
      providedSecret: SECRET,
      expectedSecret: SECRET,
      body: { update_id: 5 },  // no message
      deps: defaultDeps({ runPack }),
    });
    expect(result.status).toBe(200);
    expect(runPack).not.toHaveBeenCalled();
  });

  it("ignores /pack with trailing args (e.g. '/pack now please') — strict command match", async () => {
    const runPack = vi.fn().mockResolvedValue(undefined);
    const recordIfNew = vi.fn().mockResolvedValue(true);
    const result = await decideWebhookOutcome({
      providedSecret: SECRET,
      expectedSecret: SECRET,
      body: makeUpdate({ text: "/pack now please" }),
      deps: defaultDeps({ recordIfNew, runPack }),
    });
    expect(result.status).toBe(200);
    expect(runPack).not.toHaveBeenCalled();
    // recordIfNew also NOT called — we don't burn an update_id slot on non-commands.
    expect(recordIfNew).not.toHaveBeenCalled();
  });
});

describe("decideWebhookOutcome — idempotency (R5)", () => {
  it("does not re-fire when recordIfNew reports duplicate (returns false)", async () => {
    const runPack = vi.fn().mockResolvedValue(undefined);
    const result = await decideWebhookOutcome({
      providedSecret: SECRET,
      expectedSecret: SECRET,
      body: makeUpdate({ text: "/pack", update_id: 999 }),
      deps: defaultDeps({ recordIfNew: async () => false, runPack }),
    });
    expect(result.status).toBe(200);
    expect(runPack).not.toHaveBeenCalled();
  });

  it("records the update_id BEFORE running the action (atomic dedupe + record)", async () => {
    const calls: string[] = [];
    const result = await decideWebhookOutcome({
      providedSecret: SECRET,
      expectedSecret: SECRET,
      body: makeUpdate({ text: "/pack" }),
      deps: defaultDeps({
        recordIfNew: async () => { calls.push("record"); return true; },
        runPack: async () => { calls.push("pack"); },
      }),
    });
    expect(result.status).toBe(200);
    expect(calls).toEqual(["record", "pack"]);
  });

  it("does not call runPack when recordIfNew returns false even if other auth/parse passes", async () => {
    const runPack = vi.fn().mockResolvedValue(undefined);
    const recordIfNew = vi.fn().mockResolvedValue(false);
    await decideWebhookOutcome({
      providedSecret: SECRET,
      expectedSecret: SECRET,
      body: makeUpdate({ text: "/pack", update_id: 42 }),
      deps: defaultDeps({ recordIfNew, runPack }),
    });
    expect(recordIfNew).toHaveBeenCalledWith(42);
    expect(runPack).not.toHaveBeenCalled();
  });

  it("C3: still returns 200 if runPack throws (so Telegram doesn't retry-loop after recordIfNew committed)", async () => {
    // Suppress the expected console.warn from the catch path so the test output
    // stays clean — we still assert the catch fired by checking the 200 status.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const runPack = vi.fn().mockRejectedValue(new Error("scheduler hiccup"));
    const result = await decideWebhookOutcome({
      providedSecret: SECRET,
      expectedSecret: SECRET,
      body: makeUpdate({ text: "/pack", update_id: 7 }),
      deps: defaultDeps({ recordIfNew: async () => true, runPack }),
    });
    expect(result.status).toBe(200);
    expect(runPack).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("decideWebhookOutcome — /register routing (spec case #15)", () => {
  it("dispatches /register to runRegister with chat metadata", async () => {
    const runRegister = vi.fn().mockResolvedValue(undefined);
    const result = await decideWebhookOutcome({
      providedSecret: SECRET,
      expectedSecret: SECRET,
      body: {
        update_id: 1001,
        message: {
          message_id: 1, text: "/register",
          chat: { id: -100123, type: "supergroup", title: "New Group" },
          from: { id: 42, is_bot: false, first_name: "User" },
        },
      } as any,
      deps: defaultDeps({ runRegister }),
    });
    expect(result.status).toBe(200);
    expect(runRegister).toHaveBeenCalledWith({
      chatId: "-100123",
      chatType: "supergroup",
      title: "New Group",
      registeredBy: 42,
    });
  });
});

describe("decideWebhookOutcome — /register dedupe (spec case #16)", () => {
  it("does not re-fire runRegister when update_id duplicates", async () => {
    const runRegister = vi.fn();
    const result = await decideWebhookOutcome({
      providedSecret: SECRET,
      expectedSecret: SECRET,
      body: {
        update_id: 2002,
        message: { message_id: 1, text: "/register", chat: { id: -100, type: "group", title: "X" } },
      } as any,
      deps: defaultDeps({ recordIfNew: async () => false, runRegister }),
    });
    expect(result.status).toBe(200);
    expect(runRegister).not.toHaveBeenCalled();
  });
});

describe("decideWebhookOutcome — non-command messages (spec case #17)", () => {
  it("dispatches non-command text to touchLastSeen (no dedupe by update_id)", async () => {
    const touchLastSeen = vi.fn().mockResolvedValue(undefined);
    const recordIfNew = vi.fn();
    const result = await decideWebhookOutcome({
      providedSecret: SECRET,
      expectedSecret: SECRET,
      body: {
        update_id: 3003,
        message: { message_id: 1, text: "hello @FrolliePackBot", chat: { id: -100, type: "group" } },
      } as any,
      deps: defaultDeps({ recordIfNew, touchLastSeen }),
    });
    expect(result.status).toBe(200);
    expect(recordIfNew).not.toHaveBeenCalled();
    expect(touchLastSeen).toHaveBeenCalledWith("-100");
  });
});

describe("decideWebhookOutcome — /start (spec §webhook dispatch)", () => {
  it("dispatches /start to runStart without consulting getChatAuth (open command)", async () => {
    const runStart = vi.fn().mockResolvedValue(undefined);
    const getChatAuth = vi.fn();
    const result = await decideWebhookOutcome({
      providedSecret: SECRET,
      expectedSecret: SECRET,
      body: {
        update_id: 4004,
        message: { message_id: 1, text: "/start", chat: { id: -100, type: "private" } },
      } as any,
      deps: defaultDeps({ runStart, getChatAuth }),
    });
    expect(result.status).toBe(200);
    expect(getChatAuth).not.toHaveBeenCalled();
    expect(runStart).toHaveBeenCalledWith("-100");
  });
});

describe("decideWebhookOutcome — unknown slash command", () => {
  it("silently 200-acks unknown slash command without dedupe or dispatch", async () => {
    const recordIfNew = vi.fn();
    const runPack = vi.fn();
    const touchLastSeen = vi.fn();
    const result = await decideWebhookOutcome({
      providedSecret: SECRET,
      expectedSecret: SECRET,
      body: {
        update_id: 5005,
        message: { message_id: 1, text: "/foobar", chat: { id: -100, type: "group" } },
      } as any,
      deps: defaultDeps({ recordIfNew, runPack, touchLastSeen }),
    });
    expect(result.status).toBe(200);
    expect(recordIfNew).not.toHaveBeenCalled();
    expect(runPack).not.toHaveBeenCalled();
    expect(touchLastSeen).not.toHaveBeenCalled(); // unknown slash ≠ non-command; no touch
  });
});

describe("decideWebhookOutcome — command authorization policy", () => {
  const SECRET2 = "a".repeat(64);
  const auth = (over: { registered?: boolean; role?: string; archived?: boolean }) =>
    async () => ({ registered: true, archived: false, ...over });

  it("/sales from a sales-updates chat → dispatches runSales with chatId", async () => {
    const runSales = vi.fn().mockResolvedValue(undefined);
    const result = await decideWebhookOutcome({
      providedSecret: SECRET2, expectedSecret: SECRET2,
      body: makeUpdate({ text: "/sales" }),
      deps: defaultDeps({ getChatAuth: auth({ role: "sales-updates" }), runSales }),
    });
    expect(result.status).toBe(200);
    expect(runSales).toHaveBeenCalledWith("-1001234567890");
  });

  it("/sales from a pack-list chat → nudge, no dispatch (per-command match)", async () => {
    const runSales = vi.fn();
    const sendNudge = vi.fn().mockResolvedValue(undefined);
    const recordIfNew = vi.fn();
    const result = await decideWebhookOutcome({
      providedSecret: SECRET2, expectedSecret: SECRET2,
      body: makeUpdate({ text: "/sales" }),
      deps: defaultDeps({ getChatAuth: auth({ role: "pack-list" }), runSales, sendNudge, recordIfNew }),
    });
    expect(result.status).toBe(200);
    expect(runSales).not.toHaveBeenCalled();
    expect(recordIfNew).not.toHaveBeenCalled();
    expect(sendNudge).toHaveBeenCalledTimes(1);
    expect(sendNudge.mock.calls[0][1]).toContain("sales-updates");
  });

  it("/sales from a registered chat with no role → nudge", async () => {
    const runSales = vi.fn();
    const sendNudge = vi.fn().mockResolvedValue(undefined);
    await decideWebhookOutcome({
      providedSecret: SECRET2, expectedSecret: SECRET2,
      body: makeUpdate({ text: "/sales" }),
      deps: defaultDeps({ getChatAuth: auth({ role: undefined }), runSales, sendNudge }),
    });
    expect(runSales).not.toHaveBeenCalled();
    expect(sendNudge).toHaveBeenCalledTimes(1);
  });

  it("/sales from an archived sales-updates chat → nudge", async () => {
    const runSales = vi.fn();
    const sendNudge = vi.fn().mockResolvedValue(undefined);
    await decideWebhookOutcome({
      providedSecret: SECRET2, expectedSecret: SECRET2,
      body: makeUpdate({ text: "/sales" }),
      deps: defaultDeps({ getChatAuth: auth({ role: "sales-updates", archived: true }), runSales, sendNudge }),
    });
    expect(runSales).not.toHaveBeenCalled();
    expect(sendNudge).toHaveBeenCalledTimes(1);
  });

  it("/sales from an unregistered chat → nudge", async () => {
    const runSales = vi.fn();
    const sendNudge = vi.fn().mockResolvedValue(undefined);
    await decideWebhookOutcome({
      providedSecret: SECRET2, expectedSecret: SECRET2,
      body: makeUpdate({ text: "/sales" }),
      deps: defaultDeps({ getChatAuth: async () => ({ registered: false, archived: false }), runSales, sendNudge }),
    });
    expect(runSales).not.toHaveBeenCalled();
    expect(sendNudge).toHaveBeenCalledTimes(1);
  });

  it("/pack from a sales-updates chat → nudge (pack now gated, was open)", async () => {
    const runPack = vi.fn();
    const sendNudge = vi.fn().mockResolvedValue(undefined);
    await decideWebhookOutcome({
      providedSecret: SECRET2, expectedSecret: SECRET2,
      body: makeUpdate({ text: "/pack" }),
      deps: defaultDeps({ getChatAuth: auth({ role: "sales-updates" }), runPack, sendNudge }),
    });
    expect(runPack).not.toHaveBeenCalled();
    expect(sendNudge).toHaveBeenCalledTimes(1);
    expect(sendNudge.mock.calls[0][1]).toContain("pack-list");
  });

  it("/pack from a pack-list chat → still dispatches (no regression to shipped flow)", async () => {
    const runPack = vi.fn().mockResolvedValue(undefined);
    const result = await decideWebhookOutcome({
      providedSecret: SECRET2, expectedSecret: SECRET2,
      body: makeUpdate({ text: "/pack" }),
      deps: defaultDeps({ getChatAuth: auth({ role: "pack-list" }), runPack }),
    });
    expect(result.status).toBe(200);
    expect(runPack).toHaveBeenCalledTimes(1);
  });

  it("/register is open — dispatches without consulting getChatAuth", async () => {
    const getChatAuth = vi.fn();
    const runRegister = vi.fn().mockResolvedValue(undefined);
    await decideWebhookOutcome({
      providedSecret: SECRET2, expectedSecret: SECRET2,
      body: { update_id: 9, message: { message_id: 1, text: "/register", chat: { id: -7, type: "group", title: "X" } } } as any,
      deps: defaultDeps({ getChatAuth, runRegister }),
    });
    expect(getChatAuth).not.toHaveBeenCalled();
    expect(runRegister).toHaveBeenCalledTimes(1);
  });
});
