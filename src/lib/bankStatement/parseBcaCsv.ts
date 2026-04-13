/**
 * BCA CSV bank statement parser (fallback path).
 *
 * Same logical pipeline as `parseBcaXlsx`, just a different row extractor.
 * Uses Papa Parse to reduce the CSV text to a `string[][]` matrix, then
 * delegates to the shared helper `_parseBcaRows.ts`.
 */

import Papa from "papaparse";
import type { ParsedStatement } from "./types";
import { parseRowsToStatement } from "./_parseBcaRows";

export function parseBcaCsv(text: string): ParsedStatement {
  // Strip UTF-8 BOM — BCA portal CSV exports include \uFEFF, which Papa Parse
  // does not remove. Without this, the first-cell regex anchors (^No\. rekening)
  // fail to match and parsing throws "BCA metadata missing: account number"
  // on every portal-downloaded file.
  const stripped = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  const result = Papa.parse<string[]>(stripped, {
    header: false,
    skipEmptyLines: false,
  });

  const rows: string[][] = (result.data ?? []).map((r) =>
    (r ?? []).map((cell) => (cell == null ? "" : String(cell))),
  );

  return parseRowsToStatement(rows);
}
