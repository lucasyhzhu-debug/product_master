import { describe, it, expect } from "vitest";
import { truncateWithTooltip, formatCurrencyCompact } from "@/lib/chartPrimitives";

describe("truncateWithTooltip", () => {
  it("returns display=full when within limit", () => {
    expect(truncateWithTooltip("Short", 22)).toEqual({ display: "Short", full: "Short" });
  });

  it("ellipsizes and preserves full label when over limit", () => {
    const result = truncateWithTooltip("Dubai Chewy Cookie - Regular Pack Of 3", 22);
    expect(result.display).toBe("Dubai Chewy Cookie - …");
    expect(result.full).toBe("Dubai Chewy Cookie - Regular Pack Of 3");
  });

  it("defaults max to 22", () => {
    expect(truncateWithTooltip("Short").display).toBe("Short");
  });
});

describe("formatCurrencyCompact", () => {
  it("formats thousands as rb", () => {
    expect(formatCurrencyCompact(15000)).toBe("Rp 15rb");
    expect(formatCurrencyCompact(999)).toBe("Rp 999");
  });

  it("formats millions as jt with Indonesian comma decimal", () => {
    expect(formatCurrencyCompact(1200000)).toBe("Rp 1,2jt");
    expect(formatCurrencyCompact(14580000)).toBe("Rp 14,6jt");
  });

  it("formats billions as M", () => {
    expect(formatCurrencyCompact(1_500_000_000)).toBe("Rp 1,5M");
  });

  it("formats zero", () => {
    expect(formatCurrencyCompact(0)).toBe("Rp 0");
  });
});
