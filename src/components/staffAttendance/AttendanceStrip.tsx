import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Clock, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrentOpenShift } from "@/hooks/convex/useAttendance";
import { utcToWibDateStr } from "@/lib/dateUtils";
import { RunningTimer } from "./RunningTimer";
import { ClockOutButton } from "./ClockOutButton";

/**
 * Top-of-kitchen-view strip. When clocked in: name + running timer + clock-out button.
 * When not clocked in: a "Clock In" link to /kitchen/clock.
 *
 * D-04 prior-day guard (mirrors ClockInGate):
 *   If the open shift's WIB date is before today AND the user is not a
 *   manager/admin, the backend will reject self-closure. Render an inline
 *   remediation alert instead of a Clock-Out button that's guaranteed to fail.
 *   Minute-resolution tick covers the case where midnight rolls over while
 *   the kitchen view is open.
 */
export function AttendanceStrip() {
  const { user } = useAuth();
  const openShift = useCurrentOpenShift();

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

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

  const isManager = user?.role === "manager" || user?.role === "admin";
  const isPriorDayOpen = openShift.date < utcToWibDateStr(now);

  if (isPriorDayOpen && !isManager) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-sm text-destructive">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span className="font-medium">
          Open shift from {openShift.date} — ask a manager to correct it.
        </span>
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
