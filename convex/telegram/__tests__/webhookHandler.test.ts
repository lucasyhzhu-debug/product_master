import { describe, it, expect, vi } from "vitest";
import { decideWebhookOutcome } from "../webhook";

const SECRET = "a".repeat(64);

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
      deps: { recordIfNew: async () => true, runAction: async () => {} },
    });
    expect(result.status).toBe(401);
  });

  it("returns 401 when secret mismatches", async () => {
    const result = await decideWebhookOutcome({
      providedSecret: "wrong",
      expectedSecret: SECRET,
      body: makeUpdate(),
      deps: { recordIfNew: async () => true, runAction: async () => {} },
    });
    expect(result.status).toBe(401);
  });

  it("returns 401 when expectedSecret env var missing", async () => {
    const result = await decideWebhookOutcome({
      providedSecret: SECRET,
      expectedSecret: undefined,
      body: makeUpdate(),
      deps: { recordIfNew: async () => true, runAction: async () => {} },
    });
    expect(result.status).toBe(401);
  });
});

describe("decideWebhookOutcome — command parsing", () => {
  it("triggers sendPackList for /pack", async () => {
    const runAction = vi.fn().mockResolvedValue(undefined);
    const result = await decideWebhookOutcome({
      providedSecret: SECRET,
      expectedSecret: SECRET,
      body: makeUpdate({ text: "/pack" }),
      deps: { recordIfNew: async () => true, runAction },
    });
    expect(result.status).toBe(200);
    expect(runAction).toHaveBeenCalledTimes(1);
  });

  it("triggers sendPackList for /pack@BotName (group form)", async () => {
    const runAction = vi.fn().mockResolvedValue(undefined);
    const result = await decideWebhookOutcome({
      providedSecret: SECRET,
      expectedSecret: SECRET,
      body: makeUpdate({ text: "/pack@FrolliePackBot" }),
      deps: { recordIfNew: async () => true, runAction },
    });
    expect(result.status).toBe(200);
    expect(runAction).toHaveBeenCalledTimes(1);
  });

  it("ignores non-/pack text without scheduling action", async () => {
    const runAction = vi.fn().mockResolvedValue(undefined);
    const result = await decideWebhookOutcome({
      providedSecret: SECRET,
      expectedSecret: SECRET,
      body: makeUpdate({ text: "hello" }),
      deps: { recordIfNew: async () => true, runAction },
    });
    expect(result.status).toBe(200);
    expect(runAction).not.toHaveBeenCalled();
  });

  it("ignores updates with no message field", async () => {
    const runAction = vi.fn().mockResolvedValue(undefined);
    const result = await decideWebhookOutcome({
      providedSecret: SECRET,
      expectedSecret: SECRET,
      body: { update_id: 5 },  // no message
      deps: { recordIfNew: async () => true, runAction },
    });
    expect(result.status).toBe(200);
    expect(runAction).not.toHaveBeenCalled();
  });

  it("ignores /pack with trailing args (e.g. '/pack now please') — strict command match", async () => {
    const runAction = vi.fn().mockResolvedValue(undefined);
    const recordIfNew = vi.fn().mockResolvedValue(true);
    const result = await decideWebhookOutcome({
      providedSecret: SECRET,
      expectedSecret: SECRET,
      body: makeUpdate({ text: "/pack now please" }),
      deps: { recordIfNew, runAction },
    });
    expect(result.status).toBe(200);
    expect(runAction).not.toHaveBeenCalled();
    // recordIfNew also NOT called — we don't burn an update_id slot on non-commands.
    expect(recordIfNew).not.toHaveBeenCalled();
  });
});

describe("decideWebhookOutcome — idempotency (R5)", () => {
  it("does not re-fire when recordIfNew reports duplicate (returns false)", async () => {
    const runAction = vi.fn().mockResolvedValue(undefined);
    const result = await decideWebhookOutcome({
      providedSecret: SECRET,
      expectedSecret: SECRET,
      body: makeUpdate({ text: "/pack", update_id: 999 }),
      deps: { recordIfNew: async () => false, runAction },
    });
    expect(result.status).toBe(200);
    expect(runAction).not.toHaveBeenCalled();
  });

  it("records the update_id BEFORE running the action (atomic dedupe + record)", async () => {
    const calls: string[] = [];
    const result = await decideWebhookOutcome({
      providedSecret: SECRET,
      expectedSecret: SECRET,
      body: makeUpdate({ text: "/pack" }),
      deps: {
        recordIfNew: async () => { calls.push("record"); return true; },
        runAction: async () => { calls.push("run"); },
      },
    });
    expect(result.status).toBe(200);
    expect(calls).toEqual(["record", "run"]);
  });

  it("does not call runAction when recordIfNew returns false even if other auth/parse passes", async () => {
    const runAction = vi.fn().mockResolvedValue(undefined);
    const recordIfNew = vi.fn().mockResolvedValue(false);
    await decideWebhookOutcome({
      providedSecret: SECRET,
      expectedSecret: SECRET,
      body: makeUpdate({ text: "/pack", update_id: 42 }),
      deps: { recordIfNew, runAction },
    });
    expect(recordIfNew).toHaveBeenCalledWith(42);
    expect(runAction).not.toHaveBeenCalled();
  });

  it("C3: still returns 200 if runAction throws (so Telegram doesn't retry-loop after recordIfNew committed)", async () => {
    // Suppress the expected console.warn from the catch path so the test output
    // stays clean — we still assert the catch fired by checking the 200 status.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const runAction = vi.fn().mockRejectedValue(new Error("scheduler hiccup"));
    const result = await decideWebhookOutcome({
      providedSecret: SECRET,
      expectedSecret: SECRET,
      body: makeUpdate({ text: "/pack", update_id: 7 }),
      deps: { recordIfNew: async () => true, runAction },
    });
    expect(result.status).toBe(200);
    expect(runAction).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
