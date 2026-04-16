/**
 * AttendanceCorrectionDialog (Phase 74 — D-16, D-17, D-19).
 *
 * Manager/admin dialog for correcting attendance shifts. Mirrors
 * ShiftEditDialog's state machine:
 *
 *   input step -> review step -> submit mutation -> close on success
 *
 * Supports four actions per D-16:
 *   - edit_timestamps : adjust clockIn/clockOut on an existing row
 *   - add_missed      : insert a missed shift retroactively
 *   - reassign        : change the chef on an existing row
 *   - delete          : soft-delete an erroneous row
 *
 * D-19 (required correction note) is enforced both frontend-side
 * (Submit button `disabled={note.trim().length === 0 || pending}`) and
 * backend-side (ConvexError on empty trimmed note — see Plan 01 mutation).
 *
 * T-74-09 mitigation: the `attendance` prop is used ONLY to seed the form
 * fields on open. The backend correctAttendance mutation re-loads the real
 * record by attendanceId and mutates it atomically — no trust in the
 * synthetic Doc that /staff-performance constructs from session data.
 */

import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { useCorrectAttendance } from "@/hooks/convex/useAttendance";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { utcToWibTimeStr, utcToWibDateStr } from "@/lib/dateUtils";

type Action = "edit_timestamps" | "add_missed" | "reassign" | "delete";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * The attendance row to correct. Pass `null` to open the dialog in
   * "add_missed" mode. May be a synthetic Doc shape constructed on the
   * /staff-performance page — only seed fields (clockIn/clockOut/userId/date)
   * are read; the backend re-loads the real record by attendanceId on
   * submit (T-74-09).
   */
  attendance: Doc<"staffAttendance"> | null;
}

/**
 * Convert epoch ms to a datetime-local input value (YYYY-MM-DDTHH:MM in WIB).
 * The browser treats datetime-local as local-time — we pre-format in WIB so
 * managers see the same clock they see in the per-day table.
 */
function epochMsToDatetimeLocalWib(ms: number): string {
  const date = utcToWibDateStr(ms); // YYYY-MM-DD
  const time = utcToWibTimeStr(ms); // HH:MM
  return `${date}T${time}`;
}

/**
 * Convert a WIB datetime-local input value back to UTC epoch ms. WIB is UTC+7.
 * Returns NaN on malformed input so callers can guard rather than crash.
 */
function datetimeLocalWibToEpochMs(local: string): number {
  // `local` must be "YYYY-MM-DDTHH:MM" interpreted as WIB.
  if (typeof local !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(local)) {
    return NaN;
  }
  const [date, time] = local.split("T");
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  // WIB = UTC+7
  return Date.UTC(y, mo - 1, d, h - 7, mi);
}

export function AttendanceCorrectionDialog({
  open,
  onOpenChange,
  attendance,
}: Props) {
  const correctAttendance = useCorrectAttendance();
  const users = useQuery(api.auth.queries.listUsers);

  // Default action: edit_timestamps if we have an attendance row, else add_missed.
  const defaultAction: Action = attendance ? "edit_timestamps" : "add_missed";

  const [step, setStep] = useState<"input" | "review">("input");
  const [action, setAction] = useState<Action>(defaultAction);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);

  // Form state
  const [selectedUserId, setSelectedUserId] = useState<string>(
    attendance?.userId ?? "",
  );
  const [newDate, setNewDate] = useState<string>(
    attendance?.date ?? utcToWibDateStr(Date.now()),
  );
  const [clockInLocal, setClockInLocal] = useState<string>(
    attendance?.clockIn ? epochMsToDatetimeLocalWib(attendance.clockIn) : "",
  );
  const [clockOutLocal, setClockOutLocal] = useState<string>(
    attendance?.clockOut
      ? epochMsToDatetimeLocalWib(attendance.clockOut)
      : "",
  );

  // Re-seed form state when the attendance target changes (dialog re-opened
  // on a different row). Avoids stale seed values carrying between targets.
  useEffect(() => {
    if (!open) return;
    const action: Action = attendance ? "edit_timestamps" : "add_missed";
    setAction(action);
    setStep("input");
    setNote("");
    setSelectedUserId(attendance?.userId ?? "");
    setNewDate(attendance?.date ?? utcToWibDateStr(Date.now()));
    setClockInLocal(
      attendance?.clockIn ? epochMsToDatetimeLocalWib(attendance.clockIn) : "",
    );
    setClockOutLocal(
      attendance?.clockOut
        ? epochMsToDatetimeLocalWib(attendance.clockOut)
        : "",
    );
  }, [open, attendance]);

  const activeUsers = useMemo(
    () => (users ?? []).filter((u) => u.isActive !== false),
    [users],
  );

  const canSubmit = useMemo(() => {
    if (pending) return false;
    if (note.trim().length === 0) return false;
    // Per-action validation
    if (action === "edit_timestamps") {
      if (!attendance) return false;
      if (!clockInLocal) return false;
    }
    if (action === "add_missed") {
      if (!selectedUserId) return false;
      if (!newDate) return false;
      if (!clockInLocal) return false;
    }
    if (action === "reassign") {
      if (!attendance) return false;
      if (!selectedUserId) return false;
    }
    if (action === "delete") {
      if (!attendance) return false;
    }
    return true;
  }, [
    pending,
    note,
    action,
    attendance,
    clockInLocal,
    selectedUserId,
    newDate,
  ]);

  async function handleSubmit() {
    setPending(true);
    try {
      // Malformed datetime-local input → NaN from the parser; guard so we
      // don't send NaN to the mutation (which would fail a cryptic Convex
      // validator message).
      const parsedClockIn =
        action === "edit_timestamps" || action === "add_missed"
          ? datetimeLocalWibToEpochMs(clockInLocal)
          : undefined;
      const parsedClockOut =
        (action === "edit_timestamps" || action === "add_missed") &&
        clockOutLocal
          ? datetimeLocalWibToEpochMs(clockOutLocal)
          : undefined;
      if (parsedClockIn !== undefined && Number.isNaN(parsedClockIn)) {
        toast.error("Clock-in time is invalid");
        setPending(false);
        return;
      }
      if (parsedClockOut !== undefined && Number.isNaN(parsedClockOut)) {
        toast.error("Clock-out time is invalid");
        setPending(false);
        return;
      }
      await correctAttendance({
        action,
        correctionNote: note.trim(),
        attendanceId:
          action === "add_missed"
            ? undefined
            : (attendance?._id as Id<"staffAttendance"> | undefined),
        userId:
          action === "add_missed" || action === "reassign"
            ? (selectedUserId as Id<"users">)
            : undefined,
        date: action === "add_missed" ? newDate : undefined,
        clockIn: parsedClockIn,
        clockOut: parsedClockOut,
      });
      toast.success("Attendance corrected");
      onOpenChange(false);
    } catch (error) {
      const msg =
        error instanceof Error
          ? error.message
          : "Failed to correct attendance";
      toast.error(msg);
      setStep("input");
    } finally {
      setPending(false);
    }
  }

  function handleReview() {
    setStep("review");
  }

  // Review step — show before/after diff.
  if (step === "review") {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm correction</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-sm">
            <ReviewDiff
              action={action}
              attendance={attendance}
              newDate={newDate}
              newUserId={selectedUserId}
              newClockInLocal={clockInLocal}
              newClockOutLocal={clockOutLocal}
              users={users}
            />
            <div className="rounded-md bg-muted/50 px-3 py-2">
              <p className="text-xs text-muted-foreground">Note</p>
              <p className="text-sm">{note.trim()}</p>
            </div>
          </div>
          <DialogFooter className="flex gap-2 sm:justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStep("input")}
              disabled={pending}
            >
              Back
            </Button>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={!canSubmit}
            >
              {pending ? "Saving…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // Input step
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {attendance ? "Correct attendance" : "Record missed shift"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          {/* Action selector */}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Action
            </Label>
            <Select
              value={action}
              onValueChange={(val) => setAction(val as Action)}
            >
              <SelectTrigger className="text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {attendance && (
                  <SelectItem value="edit_timestamps">
                    Edit timestamps
                  </SelectItem>
                )}
                <SelectItem value="add_missed">Add missed shift</SelectItem>
                {attendance && (
                  <SelectItem value="reassign">Reassign chef</SelectItem>
                )}
                {attendance && (
                  <SelectItem value="delete">Delete shift</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* User selector (add_missed + reassign) */}
          {(action === "add_missed" || action === "reassign") && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">
                Staff member
              </Label>
              <Select
                value={selectedUserId}
                onValueChange={(val) => setSelectedUserId(val)}
              >
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="Select staff…" />
                </SelectTrigger>
                <SelectContent>
                  {activeUsers.map((u) => (
                    <SelectItem key={u._id} value={u._id}>
                      {u.name} ({u.role})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Date picker (add_missed) */}
          {action === "add_missed" && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">
                Date (WIB)
              </Label>
              <Input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="text-sm"
              />
            </div>
          )}

          {/* Clock in/out (edit_timestamps + add_missed) */}
          {(action === "edit_timestamps" || action === "add_missed") && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">
                  Clock in (WIB)
                </Label>
                <Input
                  type="datetime-local"
                  value={clockInLocal}
                  onChange={(e) => setClockInLocal(e.target.value)}
                  className="text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">
                  Clock out (WIB, optional)
                </Label>
                <Input
                  type="datetime-local"
                  value={clockOutLocal}
                  onChange={(e) => setClockOutLocal(e.target.value)}
                  className="text-sm"
                />
              </div>
            </>
          )}

          {/* Delete confirmation text */}
          {action === "delete" && attendance && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
              <p className="font-medium text-destructive">
                This will soft-delete the shift.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {attendance.date} — {utcToWibTimeStr(attendance.clockIn)} to{" "}
                {attendance.clockOut
                  ? utcToWibTimeStr(attendance.clockOut)
                  : "…"}
              </p>
            </div>
          )}

          {/* Correction note (ALWAYS required — D-19) */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">
              Correction note (required)
            </Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Explain why this correction is being made…"
              className="text-sm min-h-[80px]"
            />
          </div>
        </div>
        <DialogFooter className="flex gap-2 sm:justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleReview}
            disabled={!canSubmit}
          >
            Review
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * ReviewDiff — per-action summary of what the mutation will change. Pure
 * presentational; no hooks (safe to render inside the conditional review
 * branch).
 */
function ReviewDiff({
  action,
  attendance,
  newDate,
  newUserId,
  newClockInLocal,
  newClockOutLocal,
  users,
}: {
  action: Action;
  attendance: Doc<"staffAttendance"> | null;
  newDate: string;
  newUserId: string;
  newClockInLocal: string;
  newClockOutLocal: string;
  users: Array<{ _id: string; name: string }> | undefined;
}) {
  const userName =
    users?.find((u) => u._id === newUserId)?.name ?? "(unknown)";
  const newIn = newClockInLocal
    ? datetimeLocalWibToEpochMs(newClockInLocal)
    : undefined;
  const newOut = newClockOutLocal
    ? datetimeLocalWibToEpochMs(newClockOutLocal)
    : undefined;

  if (action === "edit_timestamps" && attendance) {
    return (
      <div className="space-y-2 rounded-md border border-border p-3">
        <p className="text-xs text-muted-foreground">Edit timestamps</p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <p className="text-muted-foreground">Clock in (before)</p>
            <p className="font-mono">{utcToWibTimeStr(attendance.clockIn)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Clock in (after)</p>
            <p className="font-mono">
              {newIn !== undefined ? utcToWibTimeStr(newIn) : "—"}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Clock out (before)</p>
            <p className="font-mono">
              {attendance.clockOut
                ? utcToWibTimeStr(attendance.clockOut)
                : "—"}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Clock out (after)</p>
            <p className="font-mono">
              {newOut !== undefined ? utcToWibTimeStr(newOut) : "—"}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (action === "add_missed") {
    return (
      <div className="space-y-2 rounded-md border border-border p-3">
        <p className="text-xs text-muted-foreground">Add missed shift</p>
        <div className="space-y-1 text-xs">
          <p>
            Staff: <span className="font-medium">{userName}</span>
          </p>
          <p>
            Date: <span className="font-mono">{newDate}</span>
          </p>
          <p>
            Clock in:{" "}
            <span className="font-mono">
              {newIn !== undefined ? utcToWibTimeStr(newIn) : "—"}
            </span>
          </p>
          <p>
            Clock out:{" "}
            <span className="font-mono">
              {newOut !== undefined ? utcToWibTimeStr(newOut) : "—"}
            </span>
          </p>
        </div>
      </div>
    );
  }

  if (action === "reassign" && attendance) {
    const prevName =
      users?.find((u) => u._id === attendance.userId)?.name ?? "(unknown)";
    return (
      <div className="space-y-2 rounded-md border border-border p-3">
        <p className="text-xs text-muted-foreground">Reassign chef</p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <p className="text-muted-foreground">Before</p>
            <p className="font-medium">{prevName}</p>
          </div>
          <div>
            <p className="text-muted-foreground">After</p>
            <p className="font-medium">{userName}</p>
          </div>
        </div>
      </div>
    );
  }

  if (action === "delete" && attendance) {
    return (
      <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-3">
        <p className="text-xs font-medium text-destructive">
          This shift will be soft-deleted.
        </p>
        <p className="text-xs text-muted-foreground">
          {attendance.date} — {utcToWibTimeStr(attendance.clockIn)} to{" "}
          {attendance.clockOut ? utcToWibTimeStr(attendance.clockOut) : "…"}
        </p>
      </div>
    );
  }

  return null;
}
