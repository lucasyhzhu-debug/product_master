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
  const result = Papa.parse<string[]>(text, {
    header: false,
    skipEmptyLines: false,
  });

  const rows: string[][] = (result.data ?? []).map((r) =>
    (r ?? []).map((cell) => (cell == null ? "" : String(cell))),
  );

  return parseRowsToStatement(rows);
}
