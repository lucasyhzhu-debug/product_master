/**
 * Convex hooks for sales analytics health monitoring.
 * Wraps sync health status and enhanced credential queries from Plan 13-01.
 */
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

/**
 * Get per-platform sync health status with 6-hour staleness detection.
 * Public query -- no auth required (read-only health data).
 */
export function useConvexSyncHealthStatus() {
  const data = useQuery(api.externalData.queries.getSyncHealthStatus, {});
  return { data, isLoading: data === undefined };
}

/**
 * Get sync health alerts for dashboard banner.
 * Returns platforms that have been stale for 6+ hours.
 */
export function useConvexSyncHealthAlert() {
  const data = useQuery(api.externalData.queries.getSyncHealthAlert, {});
  return { data, isLoading: data === undefined };
}

/**
 * Get enhanced credential status with tokenExpiresIn for countdown.
 * Admin-only -- pass token to enable, undefined to skip.
 */
export function useConvexCredentialStatusEnhanced(
  platformId: string,
  token?: string
) {
  const data = useQuery(
    api.platformCredentials.queries.getCredentialStatus,
    token ? { token, platformId } : "skip"
  );
  return { data, isLoading: data === undefined };
}
