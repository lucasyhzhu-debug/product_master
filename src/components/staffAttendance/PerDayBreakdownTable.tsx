/**
 * PerDayBreakdownTable (Phase 74 — D-14).
 *
 * Nested per-day table rendered inside an expanded staff row on
 * /staff-performance. Columns are dynamic based on the union of
 * componentTotals[].code across all days in the period; each column header
 * renders the name followed by the unit in parentheses — literally
 * `<name> ({unit})` — e.g., "Big Ball (pcs)", "Outer-Marshmallow (g)" —
 * so a glance at a row never mixes units (D-14).
 *
 * Subtotal behaviour respects native units — components measured in grams are
 * summed separately from components measured in pieces; never sum across units
 * (D-11).
 *
 * Flagged-row interaction: rows with any flagged session render a yellow
 * badge + "Fix" button that opens the AttendanceCorrectionDialog. The Fix
 * button is suppressed when `fixEnabled={false}` (used for legacy rows
 * without a resolved chefUserId — see StaffPerformance.handleFix guard).
 */

import { useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import { utcToWibTimeStr } from "@/lib/dateUtils";
import { formatHoursMinutes } from "@/lib/utils";
import type { Id } from "../../../convex/_generated/dataModel";

interface Session {
  attendanceId: Id<"staffAttendance">;
  clockIn: number;
  clockOut: number | null;
  durationMs: number | null;
  isFlagged: boolean;
  flagReasons: string[];
}

interface ComponentTotal {
  code: string;
  name: string;
  unit: "g" | "pcs";
  quantity: number;
}

interface DayBreakdown {
  date: string;
  hoursWorked: number;
  sessions: Session[];
  componentTotals: ComponentTotal[];
  ballsProduced: number;
}

interface Props {
  perDayBreakdown: DayBreakdown[];
  onFixShift: (attendanceId: Id<"staffAttendance">) => void;
  /** Hide the Fix button when false (e.g., legacy rows with undefined chefUserId). */
  fixEnabled?: boolean;
}

export function PerDayBreakdownTable({
  perDayBreakdown,
  onFixShift,
  fixEnabled = true,
}: Props) {
  // Build union of component columns across all days, preserving first-seen order.
  const columnDefs = useMemo(() => {
    const map = new Map<string, { name: string; unit: "g" | "pcs" }>();
    for (const d of perDayBreakdown) {
      for (const c of d.componentTotals) {
        if (!map.has(c.code)) map.set(c.code, { name: c.name, unit: c.unit });
      }
    }
    return Array.from(map.entries()).map(([code, v]) => ({ code, ...v }));
  }, [perDayBreakdown]);

  // TOTAL row — per-component sum in native units (D-11: never sum across units).
  const totals = useMemo(() => {
    const totalHours = perDayBreakdown.reduce((a, d) => a + d.hoursWorked, 0);
    const totalBalls = perDayBreakdown.reduce((a, d) => a + d.ballsProduced, 0);
    const totalByCode = new Map<string, number>();
    for (const d of perDayBreakdown) {
      for (const c of d.componentTotals) {
        totalByCode.set(c.code, (totalByCode.get(c.code) ?? 0) + c.quantity);
      }
    }
    return { totalHours, totalBalls, totalByCode };
  }, [perDayBreakdown]);

  if (perDayBreakdown.length === 0) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        No shifts in this period.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead className="text-right">Hours</TableHead>
          <TableHead className="text-right">Sessions</TableHead>
          <TableHead className="text-right">Balls</TableHead>
          {columnDefs.map((c) => (
            <TableHead key={c.code} className="text-right">
              {c.name} ({c.unit})
            </TableHead>
          ))}
          <TableHead></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {perDayBreakdown.map((day) => {
          const hasFlag = day.sessions.some((s) => s.isFlagged);
          const firstFlagged = day.sessions.find((s) => s.isFlagged);
          const totalsByCode = new Map(
            day.componentTotals.map((c) => [c.code, c.quantity]),
          );
          return (
            <TableRow
              key={day.date}
              data-flagged={hasFlag ? "true" : undefined}
            >
              <TableCell>
                <div className="flex items-center gap-2">
                  {hasFlag && (
                    <Badge
                      variant="outline"
                      className="border-yellow-500 bg-yellow-50 text-yellow-700 dark:bg-yellow-950/20"
                    >
                      <AlertTriangle className="mr-1 h-3 w-3" />
                      Flag
                    </Badge>
                  )}
                  <span>{day.date}</span>
                  <span className="text-xs text-muted-foreground">
                    (
                    {day.sessions
                      .map(
                        (s) =>
                          `${utcToWibTimeStr(s.clockIn)}-${s.clockOut !== null ? utcToWibTimeStr(s.clockOut) : "…"}`,
                      )
                      .join(", ")}
                    )
                  </span>
                </div>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatHoursMinutes(day.hoursWorked)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {day.sessions.length}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {day.ballsProduced}
              </TableCell>
              {columnDefs.map((c) => {
                const q = totalsByCode.get(c.code);
                return (
                  <TableCell
                    key={c.code}
                    className="text-right tabular-nums"
                  >
                    {q === undefined ? "—" : q}
                  </TableCell>
                );
              })}
              <TableCell>
                {hasFlag && firstFlagged && fixEnabled && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onFixShift(firstFlagged.attendanceId)}
                  >
                    Fix
                  </Button>
                )}
              </TableCell>
            </TableRow>
          );
        })}
        <TableRow className="border-t-2 font-semibold">
          <TableCell>TOTAL</TableCell>
          <TableCell className="text-right tabular-nums">
            {formatHoursMinutes(totals.totalHours)}
          </TableCell>
          <TableCell />
          <TableCell className="text-right tabular-nums">
            {totals.totalBalls}
          </TableCell>
          {columnDefs.map((c) => (
            <TableCell
              key={c.code}
              className="text-right tabular-nums"
            >
              {totals.totalByCode.get(c.code) ?? 0}
            </TableCell>
          ))}
          <TableCell />
        </TableRow>
      </TableBody>
    </Table>
  );
}
