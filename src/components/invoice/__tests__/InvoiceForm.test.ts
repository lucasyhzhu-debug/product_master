import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAutoSave, type AutoSaveConfig } from "../InvoiceForm";

describe("InvoiceForm auto-save debounce", () => {
  let saveFn: ReturnType<typeof vi.fn>;
  let onStatusChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    saveFn = vi.fn().mockResolvedValue(undefined);
    onStatusChange = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function renderAutoSave(overrides: Partial<AutoSaveConfig> = {}) {
    return renderHook(() =>
      useAutoSave({
        invoiceId: "test-invoice-id",
        onStatusChange,
        saveFn,
        ...overrides,
      }),
    );
  }

  it("does not fire save immediately on field change", () => {
    const { result } = renderAutoSave();

    // Mark as initialized (required before changes are accepted)
    act(() => {
      result.current.markInitialized();
    });

    // Trigger a field change
    act(() => {
      result.current.scheduleChange("buyerName", "Test Corp");
    });

    // Save should NOT have been called yet
    expect(saveFn).not.toHaveBeenCalled();
    // "saving" status should NOT have been set on keypress
    expect(onStatusChange).not.toHaveBeenCalledWith("saving");
  });

  it("fires save after 2 second debounce", async () => {
    const { result } = renderAutoSave();

    act(() => {
      result.current.markInitialized();
    });

    act(() => {
      result.current.scheduleChange("buyerName", "Test Corp");
    });

    // Advance timers by 2 seconds
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    // Save should have been called with the field
    expect(saveFn).toHaveBeenCalledTimes(1);
    expect(saveFn).toHaveBeenCalledWith({
      invoiceId: "test-invoice-id",
      buyerName: "Test Corp",
    });
  });

  it("resets debounce timer on subsequent changes within 2 seconds", async () => {
    const { result } = renderAutoSave();

    act(() => {
      result.current.markInitialized();
    });

    // First change
    act(() => {
      result.current.scheduleChange("buyerName", "Test");
    });

    // Wait 1 second (half the debounce time)
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    // Second change within debounce window - should reset the timer
    act(() => {
      result.current.scheduleChange("buyerName", "Test Corp");
    });

    // Wait another 1 second (total 2s from first, 1s from second)
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    // Should NOT have fired yet (only 1s since second change)
    expect(saveFn).not.toHaveBeenCalled();

    // Wait the remaining 1 second (2s from second change)
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    // Now save should fire exactly once with the latest value
    expect(saveFn).toHaveBeenCalledTimes(1);
    expect(saveFn).toHaveBeenCalledWith({
      invoiceId: "test-invoice-id",
      buyerName: "Test Corp",
    });
  });

  it("accumulates changed fields across debounce window", async () => {
    const { result } = renderAutoSave();

    act(() => {
      result.current.markInitialized();
    });

    // Change field A
    act(() => {
      result.current.scheduleChange("buyerName", "Test Corp");
    });

    // Change field B within the debounce window
    act(() => {
      result.current.scheduleChange("buyerAddress", "123 Main St");
    });

    // Advance timers by 2 seconds
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    // Single save call should contain both fields
    expect(saveFn).toHaveBeenCalledTimes(1);
    expect(saveFn).toHaveBeenCalledWith({
      invoiceId: "test-invoice-id",
      buyerName: "Test Corp",
      buyerAddress: "123 Main St",
    });
  });

  it("sets saving status inside timeout callback, not on keypress", async () => {
    const { result } = renderAutoSave();

    act(() => {
      result.current.markInitialized();
    });

    // Trigger change
    act(() => {
      result.current.scheduleChange("buyerName", "Test Corp");
    });

    // Immediately after keypress: "saving" should NOT be called
    expect(onStatusChange).not.toHaveBeenCalledWith("saving");

    // Advance 2s -- "saving" should fire inside the timeout
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    // Now "saving" should have been called
    expect(onStatusChange).toHaveBeenCalledWith("saving");
    // And then "saved" after the async save resolves
    expect(onStatusChange).toHaveBeenCalledWith("saved");
  });
});
