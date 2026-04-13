/**
 * BCA XLSX bank statement parser.
 *
 * Contract: D-06a/D-06b/D-28 (see 72-CONTEXT.md).
 * - Single-sheet only (reject multi-sheet workbooks).
 * - Metadata extracted by regex on column A (header labels untrusted).
 * - Row parsing + reconciliation check delegated to the shared helper
 *   `_parseBcaRows.ts` (kept in sync with parseBcaCsv).
 *
 * Security:
 *   - xlsx@0.20.3 from SheetJS CDN (CVE-pinned — see Plan 01).
 *   - Row count capped at MAX_ROWS (T-72-06).
 *   - Error messages never include accountNumber/accountHolder (T-72-10).
 */

import * as XLSX from "xlsx";
import type { ParsedStatement } from "./types";
import { parseRowsToStatement } from "./_parseBcaRows";
// Re-exports — public surface: callers only need to import from parseBcaXlsx
// to handle reconciliation failures and to understand the date pipeline.
// `parseIndonesianDate` + `resolveYearForRollover` fuel the row-level date
// resolution inside `_parseBcaRows.ts::parseTransactionRow`.
export { ReconciliationError } from "./types";
export { parseIndonesianDate, resolveYearForRollover } from "../../../convex/lib/indonesianDate";

export function parseBcaXlsx(buffer: ArrayBuffer): ParsedStatement {
  const wb = XLSX.read(buffer, { type: "array", cellDates: false });

  if (wb.SheetNames.length !== 1) {
    throw new Error(
      `Expected single-sheet BCA export, got ${wb.SheetNames.length} sheets`,
    );
  }

  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: true,
  });

  // Normalize every cell to string — SheetJS can emit numbers when `raw:false`
  // fails to string-coerce metadata / amount cells. Our parser assumes string
  // access throughout, so coerce here once.
  const stringRows: string[][] = rows.map((r) =>
    (r ?? []).map((cell) => (cell == null ? "" : String(cell))),
  );

  return parseRowsToStatement(stringRows);
}
