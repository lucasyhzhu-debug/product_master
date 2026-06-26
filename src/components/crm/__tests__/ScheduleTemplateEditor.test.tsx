import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { ScheduleTemplateEditor, type TemplateDay } from "../ScheduleTemplateEditor";
import type { Id } from "../../../../convex/_generated/dataModel";

const products = [
  { _id: "p1" as Id<"menuProducts">, name: "Original" },
  { _id: "p2" as Id<"menuProducts">, name: "Jumbo" },
];

function emptyDays(): TemplateDay[] {
  return Array.from({ length: 7 }, (_, i) => ({ dayOfWeek: i, items: [] }));
}

describe("ScheduleTemplateEditor", () => {
  it("renders 7 day-of-week rows Mon..Sun", () => {
    render(<ScheduleTemplateEditor days={emptyDays()} products={products} onChange={() => {}} />);
    expect(screen.getByText("Mon")).toBeInTheDocument();
    expect(screen.getByText("Sun")).toBeInTheDocument();
  });

  it("adds a product line to a day on '+ add product'", () => {
    const onChange = vi.fn();
    render(<ScheduleTemplateEditor days={emptyDays()} products={products} onChange={onChange} />);
    const monRow = screen.getByTestId("template-day-0");
    fireEvent.click(within(monRow).getByRole("button", { name: /add product/i }));
    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls[0][0] as TemplateDay[];
    expect(next[0].items).toHaveLength(1);
    expect(next[0].items[0].qty).toBe(1);
  });

  it("removes a product line", () => {
    const onChange = vi.fn();
    const days = emptyDays();
    days[0].items = [{ menuProductId: "p1" as Id<"menuProducts">, qty: 3 }];
    render(<ScheduleTemplateEditor days={days} products={products} onChange={onChange} />);
    const monRow = screen.getByTestId("template-day-0");
    fireEvent.click(within(monRow).getByRole("button", { name: /remove line/i }));
    const next = onChange.mock.calls[0][0] as TemplateDay[];
    expect(next[0].items).toHaveLength(0);
  });
});
