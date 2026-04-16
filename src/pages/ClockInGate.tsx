import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, AlertTriangle, ChefHat, LogOut } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import {
  useClockIn,
  useCurrentOpenShift,
  useMyLastShiftSummary,
} from "@/hooks/convex/useAttendance";
import {
  utcToWibTimeStr,
  utcToWibDateStr,
  formatIndonesianDate,
  WIB_OFFSET_MS,
} from "@/lib/dateUtils";

/**
 * Phase 74 — ATT-01: Clock-In gate screen (D-01, D-02, D-04, D-13).
 *
 * Post-login landing for kitchen-role users. Shows a welcome card, current WIB time,
 * a one-tap Clock-In button, and a "Last shift" recap card. After clock-in, the user
 * is routed to /kitchen.
 *
 * D-04 prior-day open shift block:
 *   If getCurrentOpenShift returns a row dated before today (WIB), we hide the
 *   Clock-In button and show a remediation message: "You have an open shift from {date}.
 *   Please ask a manager to correct it." Backend also enforces this (defense-in-depth).
 *
 * Already-clocked-in short-circuit:
 *   If the user already has an OPEN shift FOR TODAY (WIB), we auto-redirect to /kitchen
 *   after 1s so a refresh of this page doesn't trap them at the gate.
 */
export function ClockInGate() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const openShift = useCurrentOpenShift();
  const lastShift = useMyLastShiftSummary();
  const clockIn = useClockIn();
  const [pending, setPending] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Minute-resolution live clock
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const todayWib = utcToWibDateStr(now);

  // Auto-redirect if already clocked in TODAY (same-day open shift).
  // (T-74-15 "permission-denied flash-loop" threat DROPPED 2026-04-16 — not a real risk;
  //  kitchen users are permitted on /kitchen so no second redirect occurs.)
  useEffect(() => {
    if (openShift && openShift.date === todayWib && !openShift.deletedAt) {
      const timer = setTimeout(() => navigate("/kitchen", { replace: true }), 1000);
      return () => clearTimeout(timer);
    }
  }, [openShift, todayWib, navigate]);

  const isPriorDayOpen = !!(
    openShift &&
    !openShift.deletedAt &&
    openShift.date < todayWib
  );
  const isSameDayOpen = !!(
    openShift &&
    !openShift.deletedAt &&
    openShift.date === todayWib
  );

  const handleClockIn = async () => {
    setPending(true);
    try {
      await clockIn({});
      toast.success("Clocked in");
      navigate("/kitchen", { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Clock-in failed");
    } finally {
      setPending(false);
    }
  };

  // Initial loading state — openShift is undefined while the query resolves.
  if (openShift === undefined) {
    return (
      <div className="flex min-h-[calc(100vh-56px)] items-center justify-center">
        <span className="text-sm text-muted-foreground">Loading…</span>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-56px)] flex-col items-center justify-center gap-6 bg-gradient-to-b from-background to-muted/30 p-6">
      <div className="w-full max-w-md space-y-4">
        <div className="text-center">
          <ChefHat className="mx-auto h-12 w-12 text-primary" />
          <h1 className="mt-2 text-2xl font-bold">Welcome, {user?.name ?? "Chef"}</h1>
          <p className="text-muted-foreground tabular-nums">
            {formatIndonesianDate(new Date(now + WIB_OFFSET_MS))} · {utcToWibTimeStr(now)} WIB
          </p>
        </div>

        {isPriorDayOpen ? (
          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                Open shift from {openShift!.date}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                You have an open shift from {openShift!.date}. Please ask a manager to
                correct it before clocking in again.
              </p>
              <Button variant="outline" onClick={logout} className="w-full">
                <LogOut className="mr-2 h-4 w-4" /> Log out
              </Button>
            </CardContent>
          </Card>
        ) : isSameDayOpen ? (
          <Card>
            <CardContent className="p-6 text-center">
              <p className="text-lg">
                You&apos;re clocked in since {utcToWibTimeStr(openShift!.clockIn)}. Loading
                kitchen…
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <Button
              size="lg"
              className="h-32 w-full text-2xl font-bold"
              onClick={handleClockIn}
              disabled={pending}
            >
              <Clock className="mr-3 h-8 w-8" />
              {pending ? "Clocking in…" : "Clock In"}
            </Button>
            {lastShift && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Last shift</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {lastShift.date} ·{" "}
                  {Math.floor(lastShift.durationMs / 3_600_000)}h{" "}
                  {Math.floor((lastShift.durationMs % 3_600_000) / 60_000)}m
                  {lastShift.ballsProduced > 0 && ` · ${lastShift.ballsProduced} balls`}
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
