/**
 * StatementReviewTable — read-only 17-column transaction view (D-08a / D-25).
 *
 * Modes:
 *  - "preview": renders pre-import from ParsedStatement.lines. Match-dependent
 *    columns (Updated Category / JE Debit / JE Credit / Confidence / Match Method)
 *    are intentionally empty because the server-side match engine hasn't run yet.
 *  - "imported": renders post-import from bankStatementLines + accounts lookup.
 *
 * All 17 columns are READ-ONLY in P72. Edit/Override/manual-match controls are
 * Phase 73 scope (D-25/D-26).
 *
 * Security:
 *  - React text rendering only (T-72-26) — no raw HTML injection.
 *  - Flags are pre-typed enums; rendered via a small label map.
 */

import type { Id } from "../../../convex/_generated/dataModel";
import type { ParsedLine, ParsedStatement } from "@/lib/bankStatement/types";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, cn } from "@/lib/utils";

type BankStatementLineDoc = {
  _id: Id<"bankStatementLines">;
  rowIndex: number;
  date: number;
  month: string;
  rawDescription: string;
  direction: "debit" | "credit";
  amountIdr: number;
  parsedCounterparty?: string;
  originalCategory?: string;
  matchMethod?: "keyword" | "exact_match" | "counterparty" | "linked_to_record" | "unmatched";
  updatedCategoryAccountId?: Id<"accounts">;
  subCategory?: string;
  plSection?: string;
  matchedRuleId?: Id<"bankKeywordRules">;
  jeDebitAccountId?: Id<"accounts">;
  jeCreditAccountId?: Id<"accounts">;
  matchedType?: "expense" | "revenue" | "reimbursement" | "payroll";
  matchedId?: string;
  overrideCategoryAccountId?: Id<"accounts">;
  confidence: "exact" | "strong" | "suggested" | "none";
  notes?: string;
  flags?: string[];
};

type AccountLookup = { _id: Id<"accounts">; name: string; code?: string };

interface CommonProps {
  accountsById?: Map<string, AccountLookup>;
}

type PreviewProps = CommonProps & {
  mode: "preview";
  parsed: ParsedStatement;
};

type ImportedProps = CommonProps & {
  mode: "imported";
  lines: BankStatementLineDoc[];
};

type Props = PreviewProps | ImportedProps;

// --- helpers ----------------------------------------------------------------

const MONTH_LABELS_EN = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function formatDateDDMMYYYY(ms: number): string {
  const d = new Date(ms);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function formatMonthLabel(ms: number): string {
  const d = new Date(ms);
  return `${MONTH_LABELS_EN[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

const CONFIDENCE_CLASS: Record<"exact" | "strong" | "suggested" | "none", string> = {
  exact: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  strong: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30",
  suggested: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  none: "bg-muted text-muted-foreground border-muted-foreground/20",
};

const FLAG_LABELS: Record<string, string> = {
  capex_needs_asset_register: "CapEx — needs asset register",
  related_party: "Related party",
  direction_sensitive: "Direction sensitive",
  needs_line_item_review: "Needs line-item review",
  negates_revenue: "Negates revenue",
  catch_all_misc: "Catch-all",
};

function accountLabel(
  id: Id<"accounts"> | undefined,
  accountsById: Map<string, AccountLookup> | undefined,
): string {
  if (!id) return "—";
  const doc = accountsById?.get(id);
  if (!doc) return String(id).slice(-6);
  return doc.code ? `${doc.code} · ${doc.name}` : doc.name;
}

// --- row renderers ----------------------------------------------------------

function PreviewRow({ line }: { line: ParsedLine }) {
  return (
    <TableRow>
      <TableCell className="text-xs">{line.rowIndex}</TableCell>
      <TableCell className="whitespace-nowrap text-xs">{formatDateDDMMYYYY(line.date)}</TableCell>
      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
        {formatMonthLabel(line.date)}
      </TableCell>
      <TableCell className="min-w-[220px] max-w-[320px] text-xs break-words">
        {line.rawDescription}
      </TableCell>
      <TableCell className="text-right whitespace-nowrap text-xs tabular-nums">
        {line.direction === "debit" ? formatCurrency(line.amountIdr) : "—"}
      </TableCell>
      <TableCell className="text-right whitespace-nowrap text-xs tabular-nums">
        {line.direction === "credit" ? formatCurrency(line.amountIdr) : "—"}
      </TableCell>
      {/* Pre-import: classification columns are empty */}
      <TableCell className="text-xs text-muted-foreground">—</TableCell>
      <TableCell className="text-xs text-muted-foreground">—</TableCell>
      <TableCell className="text-xs text-muted-foreground">—</TableCell>
      <TableCell className="text-xs text-muted-foreground">—</TableCell>
      <TableCell className="text-xs text-muted-foreground">—</TableCell>
      <TableCell className="text-xs text-muted-foreground">—</TableCell>
      <TableCell className="text-xs text-muted-foreground">—</TableCell>
      <TableCell className="text-xs text-muted-foreground">—</TableCell>
      <TableCell className="text-xs text-muted-foreground">—</TableCell>
      <TableCell className="text-xs text-muted-foreground">—</TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {line.parsedCounterparty ? `~ ${line.parsedCounterparty}` : ""}
      </TableCell>
    </TableRow>
  );
}

function ImportedRow({
  line,
  accountsById,
}: {
  line: BankStatementLineDoc;
  accountsById: Map<string, AccountLookup> | undefined;
}) {
  return (
    <TableRow>
      <TableCell className="text-xs">{line.rowIndex}</TableCell>
      <TableCell className="whitespace-nowrap text-xs">{formatDateDDMMYYYY(line.date)}</TableCell>
      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
        {formatMonthLabel(line.date)}
      </TableCell>
      <TableCell className="min-w-[220px] max-w-[320px] text-xs break-words">
        {line.rawDescription}
      </TableCell>
      <TableCell className="text-right whitespace-nowrap text-xs tabular-nums">
        {line.direction === "debit" ? formatCurrency(line.amountIdr) : "—"}
      </TableCell>
      <TableCell className="text-right whitespace-nowrap text-xs tabular-nums">
        {line.direction === "credit" ? formatCurrency(line.amountIdr) : "—"}
      </TableCell>
      <TableCell className="text-xs">{line.originalCategory ?? "—"}</TableCell>
      <TableCell className="text-xs capitalize">
        {(line.matchMethod ?? "unmatched").replace(/_/g, " ")}
      </TableCell>
      <TableCell className="text-xs">
        {accountLabel(line.updatedCategoryAccountId, accountsById)}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">{line.subCategory ?? "—"}</TableCell>
      <TableCell className="text-xs">{line.plSection ?? "—"}</TableCell>
      <TableCell className="text-xs">
        {accountLabel(line.jeDebitAccountId, accountsById)}
      </TableCell>
      <TableCell className="text-xs">
        {accountLabel(line.jeCreditAccountId, accountsById)}
      </TableCell>
      <TableCell className="text-xs">
        {line.matchedType && line.matchedId ? (
          <span className="font-mono text-[10px] text-muted-foreground">
            {line.matchedType}#{line.matchedId.slice(-6)}
          </span>
        ) : (
          "—"
        )}
      </TableCell>
      <TableCell className="text-xs">
        {accountLabel(line.overrideCategoryAccountId, accountsById)}
      </TableCell>
      <TableCell className="text-xs">
        <Badge
          variant="outline"
          className={cn("text-[10px] font-medium capitalize", CONFIDENCE_CLASS[line.confidence])}
        >
          {line.confidence}
        </Badge>
        {line.flags && line.flags.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {line.flags.map((f) => (
              <Badge key={f} variant="outline" className="text-[10px] font-normal">
                {FLAG_LABELS[f] ?? f}
              </Badge>
            ))}
          </div>
        )}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">{line.notes ?? ""}</TableCell>
    </TableRow>
  );
}

// --- main -------------------------------------------------------------------

export function StatementReviewTable(props: Props) {
  const isPreview = props.mode === "preview";
  const rows = isPreview ? props.parsed.lines : props.lines;

  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40">
            <TableHead className="text-xs">No</TableHead>
            <TableHead className="text-xs">Date</TableHead>
            <TableHead className="text-xs">Month</TableHead>
            <TableHead className="text-xs">Description</TableHead>
            <TableHead className="text-xs text-right">Debit</TableHead>
            <TableHead className="text-xs text-right">Credit</TableHead>
            <TableHead className="text-xs">Original Category</TableHead>
            <TableHead className="text-xs">Match Method</TableHead>
            <TableHead className="text-xs">Updated Category</TableHead>
            <TableHead className="text-xs">Sub-Category</TableHead>
            <TableHead className="text-xs">P&amp;L Section</TableHead>
            <TableHead className="text-xs">JE Debit</TableHead>
            <TableHead className="text-xs">JE Credit</TableHead>
            <TableHead className="text-xs">Source / Match</TableHead>
            <TableHead className="text-xs">Override Category</TableHead>
            <TableHead className="text-xs">Confidence / Flags</TableHead>
            <TableHead className="text-xs">Notes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={17} className="text-center text-xs text-muted-foreground py-6">
                No transactions.
              </TableCell>
            </TableRow>
          ) : isPreview ? (
            (rows as ParsedLine[]).map((line) => <PreviewRow key={line.rowIndex} line={line} />)
          ) : (
            (rows as BankStatementLineDoc[]).map((line) => (
              <ImportedRow key={line._id} line={line} accountsById={props.accountsById} />
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
