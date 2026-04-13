/**
 * StatementHistoryList — previously-imported bank statements table.
 *
 * Columns: File | Period | Lines | Matched % | Uploaded.
 * Click a row to view its read-only review table.
 *
 * Security: account numbers shown as last-4 only in the period column context
 * per staffreview PII notes; full account info available only in the selected
 * statement's review view.
 */

import { useMemo } from "react";
import { FileSpreadsheet } from "lucide-react";
import type { Id } from "../../../convex/_generated/dataModel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type StatementDoc = {
  _id: Id<"bankStatements">;
  fileName: string;
  accountNumber: string;
  accountHolder: string;
  reportedPeriodStart: number;
  reportedPeriodEnd: number;
  lineCount: number;
  matchedCount: number;
  createdAt: number;
};

interface Props {
  statements: StatementDoc[] | undefined;
  selectedId: Id<"bankStatements"> | null;
  onSelect: (id: Id<"bankStatements">) => void;
}

function formatDate(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

function formatDateTime(ms: number): string {
  const d = new Date(ms);
  const date = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${date} ${time}`;
}

function maskAccount(accountNumber: string): string {
  if (accountNumber.length <= 4) return accountNumber;
  return `****${accountNumber.slice(-4)}`;
}

export function StatementHistoryList({ statements, selectedId, onSelect }: Props) {
  const sorted = useMemo(
    () => (statements ? [...statements].sort((a, b) => b.createdAt - a.createdAt) : []),
    [statements],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4" />
          Statement History
        </CardTitle>
      </CardHeader>
      <CardContent>
        {statements === undefined ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No statements imported yet. Upload a BCA XLSX or CSV above to get started.
          </p>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="text-xs">File</TableHead>
                  <TableHead className="text-xs">Account</TableHead>
                  <TableHead className="text-xs">Period</TableHead>
                  <TableHead className="text-xs text-right">Lines</TableHead>
                  <TableHead className="text-xs text-right">Matched</TableHead>
                  <TableHead className="text-xs">Uploaded</TableHead>
                  <TableHead className="text-xs text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((s) => {
                  const pct = s.lineCount > 0 ? Math.round((s.matchedCount / s.lineCount) * 100) : 0;
                  const isSelected = selectedId === s._id;
                  return (
                    <TableRow
                      key={s._id}
                      className={cn(isSelected && "bg-primary/5")}
                    >
                      <TableCell className="text-xs font-medium max-w-[200px] truncate">
                        {s.fileName}
                      </TableCell>
                      <TableCell className="text-xs font-mono">{maskAccount(s.accountNumber)}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {formatDate(s.reportedPeriodStart)} – {formatDate(s.reportedPeriodEnd)}
                      </TableCell>
                      <TableCell className="text-xs text-right tabular-nums">{s.lineCount}</TableCell>
                      <TableCell className="text-xs text-right tabular-nums">
                        {s.matchedCount}/{s.lineCount} ({pct}%)
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDateTime(s.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant={isSelected ? "secondary" : "outline"}
                          onClick={() => onSelect(s._id)}
                        >
                          {isSelected ? "Viewing" : "View"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
