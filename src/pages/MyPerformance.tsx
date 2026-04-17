/**
 * My Performance page (Phase 74 — D-13).
 *
 * Personal attendance + production view scoped to the caller's own userId.
 * Backend `getMyPerformance` hard-scopes the userIdFilter to the session
 * userId (T-74-03 info-disclosure mitigation), so even kitchen/order_staff
 * roles cannot exfiltrate another staff's hours by passing a different id.
 *
 * Renders the same PerDayBreakdownTable used on /staff-performance, but
 * staff cannot self-fix shifts — onFixShift is a no-op here. Manager/admin
 * use /staff-performance for corrections.
 */

import { useState, useMemo } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { useMyPerformance } from "@/hooks/convex/useAttendance";
import { PerDayBreakdownTable } from "@/components/staffAttendance";
import { getCurrentWibMonth } from "@/lib/dateUtils";
import { MONTH_NAMES } from "@/lib/financialHelpers";
import { formatHoursMinutes } from "@/lib/utils";
import {
  downloadDetailedStaffCSV,
} from "@/lib/staffPerformanceExport";
import type { StaffPerformanceData } from "@/hooks/convex/useStaffPerformance";

function getMonthRange(year: number, month: number) {
  const start = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const end = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

export function MyPerformance() {
  const current = useMemo(() => getCurrentWibMonth(), []);
  const [year, setYear] = useState(current.year);
  const [month, setMonth] = useState(current.month);
  const { start, end } = useMemo(() => getMonthRange(year, month), [year, month]);
  const data = useMyPerformance(start, end);

  const periodDisplay = `${MONTH_NAMES[month]} ${year}`;
  const periodLabel = `${MONTH_NAMES[month]}-${year}`;

  if (data === undefined) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        Loading…
      </div>
    );
  }

  // Empty-state (D-06 + order_staff with no attendance + no production):
  // getMyPerformance returns `{ ...aggregates, staff: null }` when the user
  // has no rows.
  if (!data || !data.staff) {
    return (
      <div>
        <PageHeader
          title="My Performance"
          description={periodDisplay}
          action={
            <input
              type="month"
              value={`${year}-${String(month + 1).padStart(2, "0")}`}
              onChange={(e) => {
                const [y, m] = e.target.value.split("-").map(Number);
                setYear(y);
                setMonth(m - 1);
              }}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          }
        />
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <p>No attendance data for {periodDisplay}.</p>
            <p className="mt-2 text-sm">
              Clock in on the kitchen gate screen to start recording hours.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const me = data.staff;

  // Build a StaffPerformanceData-shaped object for the CSV helper (expects an
  // array `staff`). `me` matches the StaffSummary shape one-to-one.
  const csvData: StaffPerformanceData = {
    startDate: data.startDate,
    endDate: data.endDate,
    totalRecords: data.totalRecords,
    staff: [me],
  };

  return (
    <div>
      <PageHeader
        title="My Performance"
        description={periodDisplay}
        action={
          <div className="flex items-center gap-3">
            <input
              type="month"
              value={`${year}-${String(month + 1).padStart(2, "0")}`}
              onChange={(e) => {
                const [y, m] = e.target.value.split("-").map(Number);
                setYear(y);
                setMonth(m - 1);
              }}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadDetailedStaffCSV(csvData, periodLabel)}
            >
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          </div>
        }
      />

      {/* Summary card */}
      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          <div>
            <div className="text-xs text-muted-foreground">Hours</div>
            <div className="text-xl font-semibold tabular-nums">
              {formatHoursMinutes(me.totalHoursWorked ?? 0)}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Days</div>
            <div className="text-xl font-semibold tabular-nums">
              {me.daysAttended ?? 0}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Balls</div>
            <div className="text-xl font-semibold tabular-nums">
              {me.totalBallsProduced.toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Shifts</div>
            <div className="text-xl font-semibold tabular-nums">
              {me.shiftCount}
            </div>
          </div>
          {(me.totalComponentGrams ?? 0) > 0 && (
            <div>
              <div className="text-xs text-muted-foreground">Components</div>
              <div className="text-xl font-semibold tabular-nums">
                {((me.totalComponentGrams ?? 0) / 1000).toFixed(1)} kg
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Per-day breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Per-day breakdown</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <PerDayBreakdownTable
            perDayBreakdown={me.perDayBreakdown ?? []}
            // Staff cannot self-correct shifts — hide Fix button. Managers
            // use /staff-performance for corrections.
            fixEnabled={false}
            onFixShift={() => {
              /* no-op — staff cannot self-correct (D-13) */
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
