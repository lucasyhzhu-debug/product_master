/**
 * Shared formatter utilities for Frollie Pro.
 * These functions are used across multiple components to ensure consistent formatting.
 */

/**
 * Format a countdown from days remaining into human-readable string.
 * Used by IntegrationHealthCard, GoBizTokenDialog, BigSellerTokenDialog.
 *
 * @param daysRemaining - Number of days remaining (can be fractional or null)
 * @returns Human-readable string like "28 days", "3 days", "Expired"
 */
export function formatCountdown(daysRemaining: number | null): string {
  if (daysRemaining === null || daysRemaining <= 0) return "Expired";
  const days = Math.ceil(daysRemaining);
  return `${days} day${days === 1 ? "" : "s"}`;
}

/**
 * Format a relative time from a timestamp.
 * Returns human-readable string like "Just now", "5m ago", "2h ago", "3d ago".
 */
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);

  if (seconds < 60) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
