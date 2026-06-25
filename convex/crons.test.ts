import { describe, it, expect } from "vitest";
import crons from "./crons";

/**
 * Reads registered cron jobs from the cronJobs() return value.
 * Shape confirmed via Node REPL:
 *   { crons: { [jobName]: { name: fnRef, args, schedule } }, isCrons: true }
 * The MAP KEY is the job name (string passed as first arg to .daily/.weekly/.monthly).
 * The VALUE.name is the Convex function reference string — NOT the job name.
 */
function jobsByName(): Record<string, { name: string; args: unknown[]; schedule: Record<string, unknown> }> {
  const anyc = crons as any;
  return anyc.crons ?? anyc._crons ?? {};
}

const SUBSCRIPTION_JOB_BASES = [
  "subscription confirm next week",
  "subscription invoice due",
  "subscription today deliveries",
  "subscription change cutoff",
  "subscription reconcile",
  "subscription delivery progress",
];

describe("crons — Phase E Slice 1 collision guard", () => {
  it("registers all 12 subscription jobs (6 primaries + 6 watchdogs)", () => {
    const registered = jobsByName();
    for (const base of SUBSCRIPTION_JOB_BASES) {
      expect(registered, `primary missing: "${base}"`).toHaveProperty(base);
      expect(registered, `watchdog missing: "${base} watchdog"`).toHaveProperty(`${base} watchdog`);
    }
  });

  it("6 subscription primary jobs have pairwise-unique UTC schedule signatures", () => {
    const registered = jobsByName();
    const sigs = SUBSCRIPTION_JOB_BASES.map((base) => {
      const j = registered[base];
      expect(j, `primary not found: "${base}"`).toBeDefined();
      return JSON.stringify(j.schedule);
    });

    const uniqueSigs = new Set(sigs);
    // Every primary must have a distinct schedule — collision means two fire at identical time
    expect(uniqueSigs.size, `primary schedule collision detected:\n${sigs.join("\n")}`).toBe(6);
  });

  it("6 subscription watchdog jobs have pairwise-unique UTC schedule signatures", () => {
    const registered = jobsByName();
    const sigs = SUBSCRIPTION_JOB_BASES.map((base) => {
      const j = registered[`${base} watchdog`];
      expect(j, `watchdog not found: "${base} watchdog"`).toBeDefined();
      return JSON.stringify(j.schedule);
    });

    const uniqueSigs = new Set(sigs);
    expect(uniqueSigs.size, `watchdog schedule collision detected:\n${sigs.join("\n")}`).toBe(6);
  });

  it("each primary fires BEFORE its watchdog on the same day/week slot", () => {
    const registered = jobsByName();
    for (const base of SUBSCRIPTION_JOB_BASES) {
      const ps = registered[base].schedule;
      const ws = registered[`${base} watchdog`].schedule;

      // Same schedule type (daily/weekly/monthly)
      expect(ws["type"], `${base}: type mismatch`).toBe(ps["type"]);

      // For weekly, watchdog must be on the same dayOfWeek
      if (ps["type"] === "weekly") {
        expect(ws["dayOfWeek"], `${base}: watchdog on different day`).toBe(ps["dayOfWeek"]);
      }
      // For monthly, watchdog must be on the same day-of-month
      if (ps["type"] === "monthly") {
        expect(ws["day"], `${base}: watchdog on different month-day`).toBe(ps["day"]);
      }

      // Both must be in the same UTC hour
      expect(ws["hourUTC"], `${base}: watchdog in different hour`).toBe(ps["hourUTC"]);

      // Watchdog must fire strictly AFTER primary within the same hour
      expect(
        ws["minuteUTC"] as number,
        `${base}: watchdog minuteUTC (${ws["minuteUTC"]}) must be > primary (${ps["minuteUTC"]})`
      ).toBeGreaterThan(ps["minuteUTC"] as number);
    }
  });

  it("weekly invoice-due (Mon 01:30 UTC) does not collide with monthly summary (1st 01:00 UTC)", () => {
    const registered = jobsByName();
    const invoiceDue = registered["subscription invoice due"];
    const monthlySummary = registered["sales summary monthly"];

    expect(invoiceDue, "subscription invoice due must be registered").toBeDefined();
    expect(monthlySummary, "sales summary monthly must be registered").toBeDefined();

    // Specifically: invoice-due must be at 01:30, NOT 01:00 (the collision-avoidance fix from spec)
    expect(invoiceDue.schedule["hourUTC"]).toBe(1);
    expect(invoiceDue.schedule["minuteUTC"]).toBe(30);

    // Monthly summary must be at 01:00 — confirming the separation is real
    expect(monthlySummary.schedule["hourUTC"]).toBe(1);
    expect(monthlySummary.schedule["minuteUTC"]).toBe(0);
  });
});
