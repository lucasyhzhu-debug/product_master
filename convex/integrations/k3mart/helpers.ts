/**
 * K3Mart pure helper functions.
 * Extracted from adapter for testability.
 */

/**
 * Parse K3Mart date format "07 Feb 2026, 14:23" to epoch ms.
 */
export function parseK3MartDate(dateStr: string): number {
  // Format: "07 Feb 2026, 14:23"
  const cleaned = dateStr.replace(",", "");
  const parsed = new Date(cleaned);
  if (isNaN(parsed.getTime())) {
    // Fallback: try manual parsing
    const parts = dateStr.match(/(\d{2})\s+(\w{3})\s+(\d{4}),?\s+(\d{2}):(\d{2})/);
    if (parts) {
      const months: Record<string, number> = {
        Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
        Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
      };
      return new Date(
        parseInt(parts[3]),
        months[parts[2]] ?? 0,
        parseInt(parts[1]),
        parseInt(parts[4]),
        parseInt(parts[5])
      ).getTime();
    }
    return Date.now();
  }
  return parsed.getTime();
}

/**
 * Format a timestamp to YYYY-MM-DD string.
 */
export function formatDate(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Build a dedup key for a K3Mart sales transaction.
 */
export function buildDedupKey(
  transDate: string,
  outletName: string,
  productCode: string,
  qty: number,
  total: number
): string {
  return `${transDate}|${outletName}|${productCode}|${qty}|${total}`;
}
