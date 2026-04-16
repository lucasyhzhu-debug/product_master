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
