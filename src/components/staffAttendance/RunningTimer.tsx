import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

interface RunningTimerProps {
  /** Clock-in epoch ms */
  clockIn: number;
  className?: string;
}

/**
 * Minute-resolution running timer. Ticks every 60s (per plan: second-level precision
 * is overkill for kitchen work and costs render pressure on shared kiosks).
 *
 * Display only — authoritative hours computed server-side in getStaffPerformanceSummary
 * via durationMs. A kiosk clock manipulation would only inflate the DISPLAY, not the
 * computed hours (T-74-16 mitigation).
 */
export function RunningTimer({ clockIn, className }: RunningTimerProps) {
  // Display only — authoritative hours computed server-side in getStaffPerformanceSummary via durationMs.
  const [now, setNow] = useState(() => Date.now());
  // `clockIn` in deps resets the interval when the parent re-renders with a
  // new open-shift id (e.g. after a manager correction).
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, [clockIn]);
  const elapsedMs = Math.max(0, now - clockIn);
  const h = Math.floor(elapsedMs / 3_600_000);
  const m = Math.floor((elapsedMs % 3_600_000) / 60_000);
  return (
    <span className={`inline-flex items-center gap-1.5 tabular-nums ${className ?? ""}`}>
      <Clock className="h-4 w-4" />
      {h}h {m}m
    </span>
  );
}
