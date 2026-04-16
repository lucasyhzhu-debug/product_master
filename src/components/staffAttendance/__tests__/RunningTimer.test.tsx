import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { RunningTimer } from "../RunningTimer";

describe("RunningTimer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("renders initial 0h 0m at t=0", () => {
    vi.setSystemTime(new Date("2026-04-16T10:00:00Z"));
    render(<RunningTimer clockIn={Date.now()} />);
    expect(screen.getByText(/0h 0m/)).toBeInTheDocument();
  });

  it("updates to 1h 30m after 90 minutes", () => {
    vi.setSystemTime(new Date("2026-04-16T10:00:00Z"));
    const clockIn = Date.now();
    render(<RunningTimer clockIn={clockIn} />);
    act(() => {
      vi.advanceTimersByTime(90 * 60_000);
    });
    expect(screen.getByText(/1h 30m/)).toBeInTheDocument();
  });
});
