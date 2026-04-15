/**
 * StatementHistoryList — previously-imported bank statements table.
 *
 * Columns: File | Account | Period | Imported | Live progress | Uploaded | Actions.
 * Click a row to view its read-only review table OR open the split-view
 * workspace (Phase 73).
 *
 * Phase 73 BANK-04: live "Progress" column reads `useStatementProgressBulk`
 * for accurate confirmed-vs-imported reconciliation. The legacy
 * `matchedCount` snapshot from the import event is preserved as "Imported"
 * for diagnostic clarity per RESEARCH Pitfall 7.
 */

import { useMemo } from "react";
import { FileSpreadsheet } from "lucide-react";
import type { Id } from "../../../convex/_generated/dataModel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useStatementProgressBulk } from "@/hooks/convex/useBankReconciliation";

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

  // Bulk-fetch live progress for all visible statements (single query call,
  // backend-capped at 50 ids — RESEARCH Pitfall 7 + T-73-19).
  const statementIds = useMemo(() => sorted.map((s) => s._id), [sorted]);
  const progressMap = useStatementProgressBulk(statementIds.length > 0 ? statementIds : undefined);

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
                  <TableHead className="text-xs text-right">Imported</TableHead>
                  <TableHead className="text-xs">Live progress</TableHead>
                  <TableHead className="text-xs">Uploaded</TableHead>
                  <TableHead className="text-xs text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((s) => {
                  const importedPct =
                    s.lineCount > 0 ? Math.round((s.matchedCount / s.lineCount) * 100) : 0;
                  const live = progressMap?.[s._id];
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
                      <TableCell className="text-xs text-right tabular-nums text-muted-foreground">
                        {s.matchedCount}/{s.lineCount} ({importedPct}%)
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {progressMap === undefined ? (
                          <Skeleton
                            className="h-2 w-24"
                            data-testid="progress-skeleton"
                          />
                        ) : live ? (
                          <div className="flex items-center gap-2">
                            <Progress
                              value={live.reconciledPct}
                              max={100}
                              className="h-1.5 w-24"
                              aria-label={`${live.reconciledPct}% reconciled`}
                              aria-valuenow={live.reconciledPct}
                              aria-valuemin={0}
                              aria-valuemax={100}
                            />
                            <span className="tabular-nums text-muted-foreground">
                              {`${live.matched}/${live.total}`}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
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
