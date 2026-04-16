/**
 * Staff Attendance hooks (Phase 74).
 *
 * Wraps the clockIn/clockOut mutations and the current-open-shift + last-shift-summary
 * queries. Token auto-injection via useProtectedMutation. Queries "skip" when there is
 * no authenticated session so callers can render without guards.
 *
 * Backend: convex/staffAttendance/{mutations,queries}.ts (Plan 74-01).
 */

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useAuth } from "../../contexts/AuthContext";
import { useProtectedMutation } from "./useProtectedMutation";

/**
 * The current user's open attendance row (clockOut undefined), or `null` when not
 * clocked in. Returns `undefined` while loading.
 */
export function useCurrentOpenShift() {
  const { user } = useAuth();
  return useQuery(
    api.staffAttendance.queries.getCurrentOpenShift,
    user?.token ? { token: user.token } : "skip"
  );
}

/**
 * The current user's most recent CLOSED shift summary for the gate screen
 * "Last shift" recap card. Returns `null` when no closed shift exists.
 */
export function useMyLastShiftSummary() {
  const { user } = useAuth();
  return useQuery(
    api.staffAttendance.queries.getMyLastShiftSummary,
    user?.token ? { token: user.token } : "skip"
  );
}

/**
 * Clock-in mutation. userId is derived from the session server-side (T-74-01);
 * callers MUST NOT pass a userId argument.
 */
export function useClockIn() {
  return useProtectedMutation(api.staffAttendance.mutations.clockIn);
}

/**
 * Clock-out mutation. Requires the attendance row id (from useCurrentOpenShift).
 */
export function useClockOut() {
  return useProtectedMutation(api.staffAttendance.mutations.clockOut);
}

// ---------------------------------------------------------------------------
// Phase 74 Plan 03 — Manager staff-performance + MyPerformance hooks
// ---------------------------------------------------------------------------

/**
 * Flagged shifts (manager/admin only). Returns `undefined` while loading, an
 * array of `{ attendance, userName, flagReasons }` otherwise.
 *
 * Consumed by StaffPerformance.tsx to render the top-of-page flagged banner
 * (D-15) and drive the "Jump to first flagged" scroll interaction.
 */
export function useFlaggedShifts(startDate: string, endDate: string) {
  const { user } = useAuth();
  return useQuery(
    api.staffAttendance.queries.getFlaggedShifts,
    user?.token ? { token: user.token, startDate, endDate } : "skip"
  );
}

/**
 * Personal performance view (D-13). T-74-03 info-disclosure mitigation —
 * backend hard-scopes `userIdFilter` to the session userId regardless of what
 * the client sends, so kitchen/order_staff roles cannot exfiltrate other
 * staff's hours. Returns `{ ...aggregation, staff: StaffSummary | null }` —
 * a single entity (or null) which differs intentionally from
 * getStaffPerformanceSummary's array-returning shape.
 */
export function useMyPerformance(startDate: string, endDate: string) {
  const { user } = useAuth();
  return useQuery(
    api.staffAttendance.queries.getMyPerformance,
    user?.token ? { token: user.token, startDate, endDate } : "skip"
  );
}

/**
 * Manager correction mutation wrapper. T-74-02 repudiation mitigation is
 * enforced server-side (required trimmed correctionNote + non-repudiable
 * corrections[] audit trail). Supports edit_timestamps | add_missed |
 * reassign | delete actions.
 */
export function useCorrectAttendance() {
  return useProtectedMutation(api.staffAttendance.mutations.correctAttendance);
}
