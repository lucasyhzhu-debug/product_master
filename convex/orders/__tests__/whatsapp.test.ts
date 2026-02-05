import { describe, it, expect } from "vitest";
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatOrderItem,
  formatOrderItemsList,
  formatDeliveryInfo,
  getStatusLabel,
} from "../whatsappHelpers";

// ============================================
// formatCurrency() Tests - 2 tests
// ============================================
describe("formatCurrency", () => {
  it("should format currency in Indonesian Rupiah format", () => {
    const result = formatCurrency(50000);
    expect(result).toBe("Rp 50.000");
  });

  it("should handle large amounts with proper thousand separators", () => {
    const result = formatCurrency(1500000);
    expect(result).toBe("Rp 1.500.000");
  });
});

// ============================================
// formatDate() Tests - 2 tests
// ============================================
describe("formatDate", () => {
  it("should format date in Indonesian locale", () => {
    // January 31, 2024 at midnight UTC
    const timestamp = new Date(2024, 0, 31).getTime();
    const result = formatDate(timestamp);
    // Indonesian format: "31 Jan 2024"
    expect(result).toMatch(/31.*Jan.*2024/);
  });

  it("should format different months correctly", () => {
    // December 25, 2024
    const timestamp = new Date(2024, 11, 25).getTime();
    const result = formatDate(timestamp);
    expect(result).toMatch(/25.*Des.*2024/);
  });
});

// ============================================
// formatDateTime() Tests - 1 test
// ============================================
describe("formatDateTime", () => {
  it("should include both date and time", () => {
    // January 15, 2024 at 14:30
    const date = new Date(2024, 0, 15, 14, 30);
    const timestamp = date.getTime();
    const result = formatDateTime(timestamp);
    // Should contain date parts and time
    expect(result).toMatch(/15/);
    expect(result).toMatch(/Jan/);
    expect(result).toMatch(/2024/);
  });
});

// ============================================
// formatOrderItem() Tests - 2 tests
// ============================================
describe("formatOrderItem", () => {
  it("should format item without variant", () => {
    const item = {
      productName: "Keripik Singkong",
      quantity: 2,
      unitPrice: 25000,
    };
    const result = formatOrderItem(item);
    expect(result).toBe("2x Keripik Singkong @ 25k");
  });

  it("should format item with variant", () => {
    const item = {
      productName: "Keripik Singkong",
      productVariant: "Balado",
      quantity: 3,
      unitPrice: 30000,
    };
    const result = formatOrderItem(item);
    expect(result).toBe("3x Keripik Singkong (Balado) @ 30k");
  });
});

// ============================================
// formatOrderItemsList() Tests - 1 test
// ============================================
describe("formatOrderItemsList", () => {
  it("should format multiple items with bullet points", () => {
    const items = [
      { productName: "Item A", quantity: 1, unitPrice: 10000 },
      { productName: "Item B", quantity: 2, unitPrice: 20000 },
    ];
    const result = formatOrderItemsList(items);
    expect(result).toContain("\u2022 1x Item A @ 10k");
    expect(result).toContain("\u2022 2x Item B @ 20k");
    expect(result.split("\n").length).toBe(2);
  });
});

// ============================================
// formatDeliveryInfo() Tests - 3 tests
// ============================================
describe("formatDeliveryInfo", () => {
  it("should format pickup with default location", () => {
    const info = { deliveryType: "Pickup" };
    const result = formatDeliveryInfo(info);
    expect(result).toBe("Pickup at: Goldfinch Legato");
  });

  it("should format pickup with custom location", () => {
    const info = { deliveryType: "Pickup", pickupLocation: "Central Park" };
    const result = formatDeliveryInfo(info);
    expect(result).toBe("Pickup at: Central Park");
  });

  it("should format delivery with address", () => {
    const info = {
      deliveryType: "Delivery",
      deliveryAddress: "Jl. Sudirman No. 123",
    };
    const result = formatDeliveryInfo(info);
    expect(result).toBe("Delivery to: Jl. Sudirman No. 123");
  });
});

// ============================================
// getStatusLabel() Tests - 2 tests (total = 10 tests in file)
// ============================================
describe("getStatusLabel", () => {
  it("should return correct label for known statuses", () => {
    expect(getStatusLabel("Draft")).toBe("[Draft]");
    expect(getStatusLabel("ProductionComplete")).toBe("[Cooking Done]");
    expect(getStatusLabel("Packaging")).toBe("[Packaging]");
    expect(getStatusLabel("CompleteShipped")).toBe("[Shipped]");
  });

  it("should return default label for unknown status", () => {
    expect(getStatusLabel("UnknownStatus")).toBe("[Order]");
  });
});
