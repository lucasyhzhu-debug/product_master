import { Link } from "react-router-dom";
import { Clock, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrentOpenShift } from "@/hooks/convex/useAttendance";
import { RunningTimer } from "./RunningTimer";
import { ClockOutButton } from "./ClockOutButton";

/**
 * Top-of-kitchen-view strip. When clocked in: name + running timer + clock-out button.
 * When not clocked in: a "Clock In" link to /kitchen/clock.
 */
export function AttendanceStrip() {
  const { user } = useAuth();
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
      <div className="flex items-center gap-2">
        <User className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-medium">{user?.name}</span>
        <span className="text-muted-foreground">·</span>
        <RunningTimer clockIn={openShift.clockIn} />
      </div>
      <ClockOutButton attendanceId={openShift._id} size="sm" />
    </div>
  );
}
