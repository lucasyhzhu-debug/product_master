import { describe, it, expect } from "vitest";
import {
  generateSyntheticBcaWorkbook,
  generateCsvSyntheticString,
} from "../../../../tests/fixtures/bca-sample-synthetic";
import { parseBcaXlsx } from "../parseBcaXlsx";
import { parseBcaCsv } from "../parseBcaCsv";

describe("parseBcaCsv — parity with parseBcaXlsx", () => {
  it("returns an identically-shaped ParsedStatement as parseBcaXlsx for the same dataset", () => {
    const xlsxParsed = parseBcaXlsx(generateSyntheticBcaWorkbook());
    const csvParsed = parseBcaCsv(generateCsvSyntheticString());

    expect(csvParsed.header).toEqual(xlsxParsed.header);
    expect(csvParsed.lines).toHaveLength(xlsxParsed.lines.length);
    for (let i = 0; i < xlsxParsed.lines.length; i++) {
      // Compare field-by-field rather than deep-equal to allow any trivial
      // whitespace-trim divergence in rawDescription between SheetJS and Papa.
      const a = xlsxParsed.lines[i];
      const b = csvParsed.lines[i];
      expect(b.rowIndex).toBe(a.rowIndex);
      expect(b.date).toBe(a.date);
      expect(b.direction).toBe(a.direction);
      expect(b.amountIdr).toBe(a.amountIdr);
      expect(b.runningBalanceIdr).toBe(a.runningBalanceIdr);
      expect(b.rawDescription.trim()).toBe(a.rawDescription.trim());
    }
  });
});
