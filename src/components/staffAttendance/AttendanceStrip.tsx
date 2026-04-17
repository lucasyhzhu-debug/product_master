import { Link } from "react-router-dom";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCurrentOpenShift } from "@/hooks/convex/useAttendance";
import { RunningTimer } from "./RunningTimer";
import { ClockOutButton } from "./ClockOutButton";

/**
 * Top-of-kitchen-view strip. When clocked in: running timer + clock-out button.
 * When not clocked in: a "Clock In" link to /kitchen/clock.
 */
export function AttendanceStrip() {
  const openShift = useCurrentOpenShift();
  if (!openShift || openShift.deletedAt) {
    return (
      <div className="flex items-center justify-center rounded-md border border-dashed bg-muted/20 px-3 py-2">
        <Button variant="outline" size="sm" asChild>
          <Link to="/kitchen/clock" className="flex items-center gap-1.5">
            <Clock className="h-4 w-4" />
            Clock In
          </Link>
        </Button>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between rounded-md border-b bg-muted/30 px-3 py-1.5 text-sm">
      <RunningTimer clockIn={openShift.clockIn} className="font-medium" />
      <ClockOutButton attendanceId={openShift._id} size="sm" />
    </div>
  );
}
