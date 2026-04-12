// Synthetic BCA statement generator — NO REAL PII. Used by parseBcaXlsx.test.ts, reconciliation.test.ts, yearRollover.test.ts, parseBcaCsv.test.ts, mutations.test.ts.
//
// Mirrors the real BCA e-statement layout described in 72-CONTEXT.md §D-06a:
//   - rows 0–5: metadata block (title, accountNumber, holder, Periode, currency)
//   - row 6: column headers (Tanggal Transaksi | Keterangan | Jumlah | Keterangan | Saldo)
//   - rows 7..N: transactions (Col A date "DD-Mon", Col B description, Col C " Rp1,000,000 ",
//                Col D direction flag ("DB" for debit, "" for credit), Col E running balance)
//   - blank spacer row
//   - footer 4 rows: Saldo Awal / Mutasi Debet / Mutasi Kredit / Saldo Akhir
//
// Default dataset reproduces the 5-row 2511 sample (MALO→SYNTHETIC TEST CO PT). Reconciliation passes.
// All amounts are integer IDR. No real account numbers, no real person names.

import * as XLSX from "xlsx";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface SyntheticTxn {
  date: string; // "DD-Mon" Indonesian month (e.g. "19-Nov", "05-Jan")
  description: string;
  amountIdr: number; // positive integer
  direction: "debit" | "credit";
  runningBalanceIdr?: number | null; // null/undefined = blank (non-last-of-day)
}

export interface SyntheticHeader {
  accountNumber: string;
  accountHolder: string;
  period: string; // "DD/MM/YYYY - DD/MM/YYYY"
  currency: string; // "Rp"
}

export interface SyntheticFooter {
  openingBalance: number;
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
}

export interface SyntheticOptions {
  header?: Partial<SyntheticHeader>;
  transactions?: SyntheticTxn[];
  footer?: Partial<SyntheticFooter>;
  extraSheetName?: string | null; // if set, appends second sheet with same content
  tamperDebitTotal?: number | null; // if set, overrides footer Mutasi Debet to this value
}

// -----------------------------------------------------------------------------
// Defaults — 2511-shaped 5-transaction sample (synthetic, no PII)
// -----------------------------------------------------------------------------

const DEFAULT_HEADER: SyntheticHeader = {
  accountNumber: "9999999999",
  accountHolder: "SYNTHETIC TEST CO PT",
  period: "01/11/2025 - 30/11/2025",
  currency: "Rp",
};

const DEFAULT_TRANSACTIONS: SyntheticTxn[] = [
  // Row 7: credit 1,000,000 (BI-FAST) — last of day 19-Nov
  {
    date: "19-Nov",
    description: "BI-FAST CR BIF TRANSFER DR 019 SYNTHETIC PAYER ONE",
    amountIdr: 1_000_000,
    direction: "credit",
    runningBalanceIdr: 1_000_000,
  },
  // Row 8: debit 50,000 bank-fee — last of day 20-Nov
  {
    date: "20-Nov",
    description: "ND-LAINNYA",
    amountIdr: 50_000,
    direction: "debit",
    runningBalanceIdr: 950_000,
  },
  // Row 9: credit 135,000,000 — not last of day 30-Nov (saldo blank)
  {
    date: "30-Nov",
    description:
      "TRSF E-BANKING CR 3011/FTSCY/WS95271 135000000.00 Tania investment FAKE A / FAKE B",
    amountIdr: 135_000_000,
    direction: "credit",
    runningBalanceIdr: null,
  },
  // Row 10: debit 76,876,615 — not last of day 30-Nov (saldo blank)
  {
    date: "30-Nov",
    description:
      "TRSF E-BANKING DB 3011/FTSCY/WS95051 76876615.00 reimburse FAKE A / FAKE B",
    amountIdr: 76_876_615,
    direction: "debit",
    runningBalanceIdr: null,
  },
  // Row 11: debit 30,000 BIAYA ADM — last of day 30-Nov (running balance shown)
  {
    date: "30-Nov",
    description: "BIAYA ADM",
    amountIdr: 30_000,
    direction: "debit",
    runningBalanceIdr: 59_043_385,
  },
];

// Reconciliation: 0 + 136,000,000 − 76,956,615 = 59,043,385
const DEFAULT_FOOTER: SyntheticFooter = {
  openingBalance: 0,
  totalDebit: 76_956_615, // 50,000 + 76,876,615 + 30,000
  totalCredit: 136_000_000, // 1,000,000 + 135,000,000
  closingBalance: 59_043_385,
};

// -----------------------------------------------------------------------------
// Formatters (mirror real BCA output)
// -----------------------------------------------------------------------------

function fmtRp(n: number): string {
  // BCA: leading/trailing space, "Rp" prefix, comma thousands
  return ` Rp${n.toLocaleString("en-US")} `;
}

function fmtFooterAmount(n: number): string {
  // Footer format: no "Rp" prefix, but thousands commas + ".00" decimal
  return `${n.toLocaleString("en-US")}.00`;
}

// -----------------------------------------------------------------------------
// Row-matrix builder (shared by XLSX and CSV generators)
// -----------------------------------------------------------------------------

function buildRowMatrix(
  header: SyntheticHeader,
  transactions: SyntheticTxn[],
  footer: SyntheticFooter,
): (string | number | null)[][] {
  const rows: (string | number | null)[][] = [];

  // Metadata (rows 0–5)
  rows.push(["Informasi Rekening - Mutasi Rekening", "", "", "", ""]);
  rows.push(["", "", "", "", ""]); // row 1 blank
  rows.push([`No. rekening : ${header.accountNumber}`, "", "", "", ""]);
  rows.push([`Nama : ${header.accountHolder}`, "", "", "", ""]);
  rows.push([`Periode : ${header.period}`, "", "", "", ""]);
  rows.push([`Kode Mata Uang : ${header.currency}`, "", "", "", ""]);

  // Column headers (row 6)
  rows.push(["Tanggal Transaksi", "Keterangan", "Jumlah", "Keterangan", "Saldo"]);

  // Transactions (rows 7..N)
  for (const txn of transactions) {
    rows.push([
      txn.date,
      txn.description,
      fmtRp(txn.amountIdr),
      txn.direction === "debit" ? "DB" : "",
      txn.runningBalanceIdr == null ? "" : fmtRp(txn.runningBalanceIdr),
    ]);
  }

  // Blank spacer
  rows.push(["", "", "", "", ""]);
  rows.push(["", "", "", "", ""]);

  // Footer (4 rows)
  rows.push([`Saldo Awal : ${fmtFooterAmount(footer.openingBalance)}`, "", "", "", ""]);
  rows.push([`Mutasi Debet : ${fmtFooterAmount(footer.totalDebit)}`, "", "", "", ""]);
  rows.push([`Mutasi Kredit : ${fmtFooterAmount(footer.totalCredit)}`, "", "", "", ""]);
  rows.push([`Saldo Akhir : ${fmtFooterAmount(footer.closingBalance)}`, "", "", "", ""]);

  return rows;
}

// -----------------------------------------------------------------------------
// Public API — XLSX generators
// -----------------------------------------------------------------------------

/**
 * Default synthetic BCA XLSX workbook mirroring the real 2511 5-transaction sample.
 * Reconciliation passes. No PII.
 */
export function generateSyntheticBcaWorkbook(opts: SyntheticOptions = {}): ArrayBuffer {
  const header: SyntheticHeader = { ...DEFAULT_HEADER, ...(opts.header ?? {}) };
  const transactions = opts.transactions ?? DEFAULT_TRANSACTIONS;
  const footer: SyntheticFooter = { ...DEFAULT_FOOTER, ...(opts.footer ?? {}) };

  if (opts.tamperDebitTotal != null) {
    footer.totalDebit = opts.tamperDebitTotal;
  }

  const rows = buildRowMatrix(header, transactions, footer);
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");

  if (opts.extraSheetName) {
    const ws2 = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws2, opts.extraSheetName);
  }

  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return out;
}

/**
 * Year-rollover fixture: 2 transactions spanning Dec 2025 → Jan 2026.
 * Periode "20/12/2025 - 19/01/2026". Tests the year-inference edge case
 * where the parser must switch year between rows.
 */
export function generateYearRolloverWorkbook(): ArrayBuffer {
  const header: SyntheticHeader = {
    ...DEFAULT_HEADER,
    period: "20/12/2025 - 19/01/2026",
  };
  const transactions: SyntheticTxn[] = [
    {
      date: "28-Des",
      description: "YEAR-END TRANSFER CR SYNTHETIC",
      amountIdr: 100_000,
      direction: "credit",
      runningBalanceIdr: 100_000,
    },
    {
      date: "05-Jan",
      description: "NEW YEAR DEBIT SYNTHETIC",
      amountIdr: 50_000,
      direction: "debit",
      runningBalanceIdr: 50_000,
    },
  ];
  const footer: SyntheticFooter = {
    openingBalance: 0,
    totalDebit: 50_000,
    totalCredit: 100_000,
    closingBalance: 50_000,
  };
  return generateSyntheticBcaWorkbook({ header, transactions, footer });
}

/**
 * Broken-reconciliation fixture: default dataset with tampered Mutasi Debet footer.
 * Used to confirm parser aborts import when debit sum ≠ reported debit total.
 */
export function generateBrokenReconciliationWorkbook(): ArrayBuffer {
  return generateSyntheticBcaWorkbook({ tamperDebitTotal: 99_999_999 });
}

/**
 * Multi-sheet fixture: default workbook with an extra "Sheet2". Used to confirm
 * the parser rejects multi-sheet workbooks (BCA exports are single-sheet).
 */
export function generateMultiSheetWorkbook(): ArrayBuffer {
  return generateSyntheticBcaWorkbook({ extraSheetName: "Sheet2" });
}

// -----------------------------------------------------------------------------
// Public API — CSV generator (fallback path)
// -----------------------------------------------------------------------------

/**
 * CSV representation of the default dataset. Comma-separated; same metadata/header/footer rows
 * as the XLSX layout. Description cells containing commas are double-quoted.
 */
export function generateCsvSyntheticString(): string {
  const rows = buildRowMatrix(DEFAULT_HEADER, DEFAULT_TRANSACTIONS, DEFAULT_FOOTER);
  return rows
    .map((row) =>
      row
        .map((cell) => {
          if (cell == null) return "";
          const s = String(cell);
          // Quote cells containing commas or quotes (RFC 4180)
          if (s.includes(",") || s.includes('"') || s.includes("\n")) {
            return `"${s.replace(/"/g, '""')}"`;
          }
          return s;
        })
        .join(","),
    )
    .join("\r\n");
}
