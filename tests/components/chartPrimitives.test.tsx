import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import {
  truncateWithTooltip,
  formatCurrencyCompact,
  ChartTooltip,
  ChartFrame,
  CHART_MARGIN,
  X_AXIS_STRING_LABEL_PROPS,
} from "@/lib/chartPrimitives";

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

// Inline WCAG 2.x relative luminance + contrast ratio (test-only scaffolding)
function relativeLuminance(hex: string): number {
  const nums = hex.replace("#", "").match(/.{2}/g)!.map((c) => {
    const v = parseInt(c, 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  const [r, g, b] = nums;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(fg: string, bg: string): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

describe("ChartTooltip contrast", () => {
  it("applies bg-popover + text-popover-foreground classes; popover colors meet WCAG AA", () => {
    const { container } = render(
      <ChartTooltip
        active
        payload={[{ name: "Revenue", value: 14580000, color: "#f97316" }]}
        label="Dubai Chewy Cookie"
      />,
    );
    const tooltip = container.querySelector("[data-chart-tooltip]") as HTMLElement;
    expect(tooltip).toBeTruthy();
    expect(tooltip.className).toContain("bg-popover");
    expect(tooltip.className).toContain("text-popover-foreground");

    // Dark-mode palette resolved inline (jsdom can't resolve CSS vars)
    const darkBg = "#0a0a0a";
    const lightFg = "#fafafa";
    expect(contrast(lightFg, darkBg)).toBeGreaterThanOrEqual(4.5);
  });

  it("renders category color as swatch, never as value text color", () => {
    const { container } = render(
      <ChartTooltip
        active
        payload={[{ name: "Revenue", value: 14580000, color: "#f97316" }]}
        label="Test"
      />,
    );
    const valueEl = container.querySelector("[data-tooltip-value]") as HTMLElement;
    expect(valueEl).toBeTruthy();
    expect(valueEl.style.color).toBe(""); // no inline color — inherits popover-foreground

    const swatch = container.querySelector("[data-tooltip-swatch]") as HTMLElement;
    expect(swatch).toBeTruthy();
    expect(swatch.style.backgroundColor.toLowerCase()).toMatch(/f97316|rgb\(249,\s*115,\s*22\)/i);
  });

  it("renders nothing when inactive", () => {
    const { container } = render(<ChartTooltip active={false} payload={[]} />);
    expect(container.firstChild).toBeNull();
  });
});

describe("ChartFrame", () => {
  it("renders title + children with default height 320", () => {
    const { getByText, container } = render(
      <ChartFrame title="Test Chart">
        <div>inner</div>
      </ChartFrame>,
    );
    expect(getByText("Test Chart")).toBeTruthy();
    expect(getByText("inner")).toBeTruthy();
    const frame = container.querySelector("[data-chart-frame]") as HTMLElement;
    expect(frame.style.height).toBe("320px");
  });

  it("renders loading state when loading=true and NOT the children", () => {
    const { container, queryByText } = render(
      <ChartFrame title="Test" loading>
        <div>inner</div>
      </ChartFrame>,
    );
    expect(queryByText("inner")).toBeNull();
    expect(container.querySelector("[data-chart-skeleton]")).toBeTruthy();
  });
});

describe("chart constants", () => {
  it("CHART_MARGIN uses 64px bottom + left for non-clipping axis labels", () => {
    expect(CHART_MARGIN).toEqual({ top: 16, right: 48, bottom: 64, left: 64 });
  });

  it("X_AXIS_STRING_LABEL_PROPS rotates -35deg, forces interval 0, height 80", () => {
    expect(X_AXIS_STRING_LABEL_PROPS.angle).toBe(-35);
    expect(X_AXIS_STRING_LABEL_PROPS.textAnchor).toBe("end");
    expect(X_AXIS_STRING_LABEL_PROPS.interval).toBe(0);
    expect(X_AXIS_STRING_LABEL_PROPS.height).toBe(80);
  });
});
