/**
 * Staff Performance Report page.
 *
 * Monthly production summary per kitchen staff member with CSV export.
 * Manager/admin only (canAccessDashboard permission).
 *
 * Phase 74 extensions:
 * - Hours column (D-11)
 * - FlaggedShiftsBanner + Jump-to-first interaction (D-15)
 * - PerDayBreakdownTable rendered inside expanded staff row (D-14)
 * - AttendanceCorrectionDialog wiring for Fix + "Record missed shift" (D-16/D-17)
 * - T-74-09 mitigation: synthetic Doc seed; backend re-loads real record.
 */

import { useState, useMemo, useCallback } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { useStaffPerformance, type StaffSummary } from "@/hooks/convex/useStaffPerformance";
import {
  downloadStaffPerformanceCSV,
  downloadDetailedStaffCSV,
} from "@/lib/staffPerformanceExport";
import { getCurrentWibMonth } from "@/lib/dateUtils";
import { formatHoursMinutes } from "@/lib/utils";
import { MONTH_NAMES } from "@/lib/financialHelpers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, ChevronDown, ChevronRight, Users, Calendar, TrendingUp, AlertTriangle } from "lucide-react";
import {
  FlaggedShiftsBanner,
  PerDayBreakdownTable,
  AttendanceCorrectionDialog,
} from "@/components/staffAttendance";
import type { Doc, Id } from "../../convex/_generated/dataModel";

type SessionShape = StaffSummary["perDayBreakdown"][number]["sessions"][number];

/** Returns YYYY-MM-DD start and end for a given 0-indexed month. */
function getMonthRange(year: number, month: number) {
  const start = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const end = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

function MonthPicker({
  year,
  month,
  onChange,
}: {
  year: number;
  month: number;
  onChange: (year: number, month: number) => void;
}) {
  const value = `${year}-${String(month + 1).padStart(2, "0")}`;
  return (
    <input
      type="month"
      value={value}
      onChange={(e) => {
        const [y, m] = e.target.value.split("-").map(Number);
        onChange(y, m - 1);
      }}
      className="rounded-md border border-input bg-background px-3 py-2 text-sm"
    />
  );
}

function StaffDetailRow({
  staff,
  onFix,
  columnCount,
}: {
  staff: StaffSummary;
  onFix: (
    attendanceId: Id<"staffAttendance">,
    session: SessionShape,
    date: string,
    userId: Id<"users">,
  ) => void;
  columnCount: number;
}) {
  const [open, setOpen] = useState(false);

  const sortedProducts = useMemo(
    () => [...staff.productBreakdown].sort((a, b) => b.quantity - a.quantity),
    [staff.productBreakdown]
  );
  const sortedComponents = useMemo(
    () => [...staff.componentBreakdown].sort((a, b) => b.grams - a.grams),
    [staff.componentBreakdown]
  );
  const sortedComponentWaste = useMemo(
    () => [...staff.componentWasteBreakdown].sort((a, b) => b.grams - a.grams),
    [staff.componentWasteBreakdown]
  );

  return (
    <>
      <TableRow className="cursor-pointer hover:bg-muted/50" onClick={() => setOpen(!open)}>
        <TableCell>
          <div className="flex items-center gap-2">
            {open ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
            <span className="font-medium">{staff.chefName}</span>
          </div>
        </TableCell>
        <TableCell className="text-right font-mono">
          {staff.totalBallsProduced.toLocaleString()}
        </TableCell>
        <TableCell className="text-right font-mono">
          {staff.totalComponentGrams > 0
            ? `${staff.totalComponentGrams.toLocaleString()}g`
            : "-"}
        </TableCell>
        <TableCell className="text-right font-mono">
          {staff.totalWaste > 0 ? (
            <span className="text-orange-400">{staff.totalWaste.toLocaleString()}</span>
          ) : (
            "-"
          )}
        </TableCell>
        <TableCell className="text-right">{staff.shiftCount}</TableCell>
        <TableCell className="text-right">{staff.daysWorked}</TableCell>
        {/* Hours column (Phase 74) — between Days Worked and (implicit) next column */}
        <TableCell className="text-right tabular-nums">
          {formatHoursMinutes(staff.totalHoursWorked ?? 0)}
        </TableCell>
      </TableRow>

      {open && (
        <tr>
          <td colSpan={columnCount} className="p-0">
            <div className="bg-muted/30 px-8 py-4 space-y-3 border-b">
              {/* Product breakdown */}
              {sortedProducts.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                    Production by Product
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1 text-sm">
                    {sortedProducts.map((p) => (
                        <div key={p.menuProductId} className="flex justify-between">
                          <span className="text-muted-foreground truncate mr-2">{p.name}</span>
                          <span className="font-mono">
                            {p.quantity.toLocaleString()}
                            {p.ballCount !== p.quantity && (
                              <span className="text-muted-foreground ml-1">({p.ballCount} balls)</span>
                            )}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Component breakdown */}
              {sortedComponents.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                    Component Production
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1 text-sm">
                    {sortedComponents.map((c) => (
                        <div key={c.code} className="flex justify-between">
                          <span className="text-muted-foreground truncate mr-2">{c.name}</span>
                          <span className="font-mono">{c.grams.toLocaleString()}g</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Component waste */}
              {sortedComponentWaste.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                    Component Waste
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1 text-sm">
                    {sortedComponentWaste.map((c) => (
                        <div key={c.code} className="flex justify-between text-orange-400">
                          <span className="truncate mr-2">{c.name}</span>
                          <span className="font-mono">{c.grams.toLocaleString()}g</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Product waste breakdown */}
              {staff.totalWaste > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                    Product Waste
                  </h4>
                  <div className="flex gap-6 text-sm">
                    {staff.wasteByReason.map((w) => (
                      <div key={w.reason} className="text-orange-400">
                        {w.reason}: {w.quantity.toLocaleString()}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Phase 74 — Per-day attendance + production breakdown */}
              <div className="mt-4">
                <h4 className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Per-day breakdown
                </h4>
                <PerDayBreakdownTable
                  perDayBreakdown={staff.perDayBreakdown ?? []}
                  // chefUserId && guard — Fix button hidden when false. The
                  // dialog cannot operate without a user to reassign to
                  // (for add_missed flows) or a real row (for edit_timestamps).
                  fixEnabled={Boolean(staff.chefUserId)}
                  onFixShift={(aid) => {
                    // Short-circuit when fixEnabled is false (defence in depth).
                    if (!staff.chefUserId) return;
                    const day = (staff.perDayBreakdown ?? []).find((d) =>
                      d.sessions.some((s) => s.attendanceId === aid),
                    );
                    const session = day?.sessions.find(
                      (s) => s.attendanceId === aid,
                    );
                    if (day && session) {
                      // chefUserId is a string (preserved from the underlying
                      // kitchenShiftRecords.chefUserId field) which originates
                      // from a users table Id. Safe to cast — backend
                      // correctAttendance re-validates when it mutates.
                      onFix(
                        aid,
                        session,
                        day.date,
                        staff.chefUserId as Id<"users">,
                      );
                    }
                  }}
                />
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export function StaffPerformance() {
  const current = useMemo(() => getCurrentWibMonth(), []);
  const [year, setYear] = useState(current.year);
  const [month, setMonth] = useState(current.month);

  const { start, end } = useMemo(() => getMonthRange(year, month), [year, month]);
  const { data, isLoading } = useStaffPerformance(start, end);

  const periodDisplay = `${MONTH_NAMES[month]} ${year}`;
  const periodLabel = `${MONTH_NAMES[month]}-${year}`;

  // Phase 74 — correction dialog state
  const [correcting, setCorrecting] = useState<Doc<"staffAttendance"> | null>(
    null,
  );
  const [addMissedOpen, setAddMissedOpen] = useState(false);

  // Totals
  const totals = useMemo(() => {
    if (!data) return null;
    return data.staff.reduce(
      (acc, s) => ({
        balls: acc.balls + s.totalBallsProduced,
        grams: acc.grams + s.totalComponentGrams,
        waste: acc.waste + s.totalWaste,
        shifts: acc.shifts + s.shiftCount,
      }),
      { balls: 0, grams: 0, waste: 0, shifts: 0 }
    );
  }, [data]);

  // Phase 74 — aggregate flagged count across all staff for the banner.
  const totalFlagged = useMemo(
    () =>
      data?.staff.reduce(
        (a, s) => a + (s.flaggedShiftCount ?? 0),
        0,
      ) ?? 0,
    [data],
  );

  // Phase 74 — scroll the first flagged row into view.
  const jumpToFirstFlagged = useCallback(() => {
    const el = document.querySelector<HTMLElement>('[data-flagged="true"]');
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  // Phase 74 — Fix-button handler. Constructs a synthetic Doc from session
  // data (T-74-09: synthetic Doc is a form seed ONLY; backend re-loads by id).
  // Canonical path — no backend single-record fetch query is defined; the
  // correctAttendance mutation reads the real row by attendanceId on submit.
  const handleFix = useCallback(
    (
      attendanceId: Id<"staffAttendance">,
      session: SessionShape,
      date: string,
      userId: Id<"users">,
    ) => {
      setCorrecting({
        _id: attendanceId,
        _creationTime: 0,
        userId,
        date,
        clockIn: session.clockIn,
        clockOut: session.clockOut ?? undefined,
        durationMs: session.durationMs ?? undefined,
      } as Doc<"staffAttendance">);
    },
    [],
  );

  // Column count for the expanded row colSpan (7 columns after adding Hours).
  const STAFF_TABLE_COLUMN_COUNT = 7;

  return (
    <div>
      <PageHeader
        title="Staff Performance"
        description={`Production report for ${periodDisplay}`}
        action={
          <div className="flex items-center gap-3">
            <MonthPicker
              year={year}
              month={month}
              onChange={(y, m) => {
                setYear(y);
                setMonth(m);
              }}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAddMissedOpen(true)}
            >
              Record missed shift
            </Button>
            {data && data.staff.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Download className="h-4 w-4 mr-2" />
                    Export CSV
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => downloadStaffPerformanceCSV(data, periodLabel)}
                  >
                    Summary (one row per staff)
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => downloadDetailedStaffCSV(data, periodLabel)}
                  >
                    Detailed (pivot-ready)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        }
      />

      {/* Phase 74 — flagged banner (D-15). Renders null when totalFlagged === 0. */}
      <FlaggedShiftsBanner
        flaggedCount={totalFlagged}
        onJumpToFirst={jumpToFirstFlagged}
      />

      {isLoading && (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          Loading production data...
        </div>
      )}

      {data && data.staff.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No shift records found for {periodDisplay}.
          </CardContent>
        </Card>
      )}

      {data && data.staff.length > 0 && totals && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Staff
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data.staff.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Total Balls
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totals.balls.toLocaleString()}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Total Shifts
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totals.shifts}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Total Waste
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-400">
                  {totals.waste > 0 ? totals.waste.toLocaleString() : "0"}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Staff table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Per-Staff Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Staff</TableHead>
                    <TableHead className="text-right">Balls Produced</TableHead>
                    <TableHead className="text-right">Components</TableHead>
                    <TableHead className="text-right">Waste</TableHead>
                    <TableHead className="text-right">Shifts</TableHead>
                    <TableHead className="text-right">Days</TableHead>
                    <TableHead className="text-right">Hours</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.staff.map((staff) => (
                    <StaffDetailRow
                      key={staff.staffKey}
                      staff={staff}
                      onFix={handleFix}
                      columnCount={STAFF_TABLE_COLUMN_COUNT}
                    />
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      {/* Phase 74 — correction dialogs */}
      <AttendanceCorrectionDialog
        open={correcting !== null}
        onOpenChange={(o) => {
          if (!o) setCorrecting(null);
        }}
        attendance={correcting}
      />
      <AttendanceCorrectionDialog
        open={addMissedOpen}
        onOpenChange={setAddMissedOpen}
        attendance={null}
      />
    </div>
  );
}
