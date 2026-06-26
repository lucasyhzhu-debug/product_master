/**
 * Smoke test: cron minute uniqueness.
 * Ensures no two `crons.daily(...)` registrations share the same (hourUTC, minuteUTC)
 * and that the enforcement cron names are present in crons.ts.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const cronsSource = readFileSync(resolve(__dirname, "../crons.ts"), "utf-8");

describe("cron minute uniqueness", () => {
  it("registers both enforcement crons at unique daily (hourUTC, minuteUTC) slots", () => {
    // Match crons.daily( calls and capture name, hourUTC, minuteUTC.
    // Daily schedule objects have hourUTC + minuteUTC with NO dayOfWeek or day prefix,
    // so this regex correctly excludes weekly/monthly entries.
    const dailyRe =
      /crons\.daily\(\s*["']([^"']*)["']\s*,\s*\{\s*hourUTC:\s*(\d+)\s*,\s*minuteUTC:\s*(\d+)\s*\}/g;

    const seen = new Map<string, string>(); // "h:m" → cron name
    let m: RegExpExecArray | null;
    const collisions: string[] = [];

    while ((m = dailyRe.exec(cronsSource)) !== null) {
      const [, name, h, min] = m;
      const key = `${h}:${min}`;
      if (seen.has(key)) {
        collisions.push(`UTC ${key} collision: "${seen.get(key)}" vs "${name}"`);
      } else {
        seen.set(key, name);
      }
    }

    expect(collisions, collisions.join(", ")).toHaveLength(0);

    // The two enforcement crons must be registered, at their unique slots.
    expect(cronsSource).toContain('"subscription flip day locks"');
    expect(cronsSource).toContain('"subscription apply baseline changes"');
    expect(seen.has("5:25")).toBe(true);
    expect(seen.has("4:10")).toBe(true);
  });
});
