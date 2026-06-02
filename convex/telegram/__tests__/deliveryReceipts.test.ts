import { describe, it, expect } from "vitest";
import { packSlotKey, salesSlotKey } from "../deliveryReceipts";

// UTC ms for a WIB wall-clock instant (WIB = UTC+7).
function wib(y: number, m: number, d: number, h = 0, min = 0): number {
  return Date.UTC(y, m - 1, d, h - 7, min, 0, 0);
}

describe("packSlotKey", () => {
  it("keys by WIB calendar day per slot", () => {
    expect(packSlotKey("morning", wib(2026, 6, 2, 7, 0))).toBe("pack:morning:2026-06-02");
    expect(packSlotKey("midday", wib(2026, 6, 2, 13, 0))).toBe("pack:midday:2026-06-02");
  });

  it("morning and midday are distinct slots on the same day", () => {
    expect(packSlotKey("morning", wib(2026, 6, 2, 7, 0))).not.toBe(
      packSlotKey("midday", wib(2026, 6, 2, 13, 0)),
    );
  });

  // Core watchdog invariant: the sender (slot time) and the watchdog (+15min)
  // must derive the SAME key so the receipt check matches.
  it("sender and +15min watchdog produce the same key (no day rollover)", () => {
    const send = packSlotKey("morning", wib(2026, 6, 2, 7, 0));
    const watch = packSlotKey("morning", wib(2026, 6, 2, 7, 15));
    expect(watch).toBe(send);
  });
});

describe("salesSlotKey", () => {
  it("daily keys by WIB day", () => {
    expect(salesSlotKey("daily", wib(2026, 6, 2, 23, 0))).toBe("sales:daily:2026-06-02");
  });

  it("weekly keys by the firing Monday's WIB date", () => {
    // Cron fires Mon 07:00 WIB; +15min watchdog stays on the same Monday.
    expect(salesSlotKey("weekly", wib(2026, 6, 1, 7, 0))).toBe("sales:weekly:2026-06-01");
    expect(salesSlotKey("weekly", wib(2026, 6, 1, 7, 15))).toBe("sales:weekly:2026-06-01");
  });

  it("monthly keys by WIB month", () => {
    expect(salesSlotKey("monthly", wib(2026, 6, 1, 8, 0))).toBe("sales:monthly:2026-06");
    expect(salesSlotKey("monthly", wib(2026, 6, 1, 8, 15))).toBe("sales:monthly:2026-06");
  });
});
