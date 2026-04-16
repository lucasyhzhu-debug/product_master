import { useCurrentOpenShift } from "@/hooks/convex/useAttendance";
import { RunningTimer } from "./RunningTimer";
import { ClockOutButton } from "./ClockOutButton";

/**
 * Top-of-kitchen-view strip showing the current user's running timer + clock-out button.
 * Returns null when user is not clocked in, so it's a zero-footprint component in the
 * default state and safe to render unconditionally from KitchenViewV2.
 *
 * Placement contract: rendered at the top of KitchenViewV2 content (above ProductionTargetsBar).
 * DashboardHeader is NOT used here — it is orphaned on main (no import, no render).
 */
export function AttendanceStrip() {
  const openShift = useCurrentOpenShift();
  if (!openShift || openShift.deletedAt) return null;
  return (
    <div className="flex items-center justify-between rounded-md border-b bg-muted/30 px-3 py-1.5 text-sm">
      <RunningTimer clockIn={openShift.clockIn} className="font-medium" />
      <ClockOutButton attendanceId={openShift._id} size="sm" />
    </div>
  );
}
