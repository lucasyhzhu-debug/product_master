/**
 * ShiftHistoryList
 *
 * Manager-only shift history panel (KIT-16). Displays past shift records grouped
 * by date, with optional date range filtering. Each record shows:
 *   - Submitted by + time
 *   - Produced summary (enriched with product names from backend)
 *   - Waste summary (if any)
 *   - Edit indicator (if edited by manager)
 *   - Edit button (opens ShiftEditDialog)
 *
 * Requirements: KIT-16
 */

import { useState } from "react";
import { History, Pencil } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ShiftEditDialog } from "./ShiftEditDialog";

// -------------------------------------------------------
// Types
// -------------------------------------------------------

interface ProducedEntry {
  menuProductId: string;
  menuProductName: string;
  quantity: number;
}

interface WasteEntry {
  menuProductId: string;
  menuProductName: string;
  reason: string;
  quantity: number;
}

export interface ShiftRecord {
  _id: string;
  date: string;
  submittedAt: number;
  submittedBy: string;
  produced: ProducedEntry[];
  waste: WasteEntry[];
  editedAt?: number;
  editedBy?: string;
  editNote?: string;
}

// -------------------------------------------------------
// Helpers
// -------------------------------------------------------

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatDate(dateStr: string): string {
  // dateStr is YYYY-MM-DD
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function buildProducedSummary(produced: ProducedEntry[]): string {
  if (produced.length === 0) return "Nothing recorded";
  return produced.map((p) => `${p.quantity}x ${p.menuProductName}`).join(", ");
}

function buildWasteSummary(waste: WasteEntry[]): string {
  if (waste.length === 0) return "";
  return waste.map((w) => `${w.quantity}x ${w.menuProductName} (${w.reason.replace("_", " ")})`).join(", ");
}

// -------------------------------------------------------
// Main component
// -------------------------------------------------------

export function ShiftHistoryList() {
  const { user } = useAuth();

  // Default date range: last 7 days
  const today = new Date();
  const wibToday = new Date(today.getTime() + 7 * 60 * 60 * 1000);
  const defaultEndDate = wibToday.toISOString().slice(0, 10);
  const sevenDaysAgo = new Date(wibToday.getTime() - 6 * 24 * 60 * 60 * 1000);
  const defaultStartDate = sevenDaysAgo.toISOString().slice(0, 10);

  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(defaultEndDate);

  // Edit dialog state
  const [editRecord, setEditRecord] = useState<ShiftRecord | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  // Query shift history (manager/admin only)
  const history = useQuery(
    api.kitchenShiftRecords.queries.getShiftHistory,
    user?.token
      ? { token: user.token, startDate, endDate }
      : "skip"
  );

  // -------------------------------------------------------
  // Render
  // -------------------------------------------------------

  if (!user?.token) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          Shift History
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Date range filter */}
        <div className="flex items-end gap-3">
          <div className="space-y-1.5 flex-1">
            <Label className="text-xs text-muted-foreground">From</Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1.5 flex-1">
            <Label className="text-xs text-muted-foreground">To</Label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
        </div>

        {/* Records list */}
        {history === undefined && (
          <div className="space-y-3">
            <Skeleton className="h-20 rounded-lg" />
            <Skeleton className="h-20 rounded-lg" />
            <Skeleton className="h-16 rounded-lg" />
          </div>
        )}

        {history !== undefined && history.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No shift records found for this date range.
          </p>
        )}

        {history !== undefined && history.length > 0 && (
          <div className="space-y-4">
            {groupByDate(history).map(({ date, records }) => (
              <div key={date}>
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                  {formatDate(date)}
                </h3>
                <div className="space-y-2">
                  {records.map((record) => (
                    <ShiftRecordCard
                      key={record._id}
                      record={record as ShiftRecord}
                      onEdit={(r) => {
                        setEditRecord(r);
                        setEditOpen(true);
                      }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Edit dialog */}
      {editRecord && (
        <ShiftEditDialog
          record={editRecord}
          open={editOpen}
          onClose={() => {
            setEditOpen(false);
            setEditRecord(null);
          }}
        />
      )}
    </Card>
  );
}

// -------------------------------------------------------
// Record card
// -------------------------------------------------------

function ShiftRecordCard({
  record,
  onEdit,
}: {
  record: ShiftRecord;
  onEdit: (record: ShiftRecord) => void;
}) {
  const totalProduced = record.produced.reduce((sum, p) => sum + p.quantity, 0);
  const totalWaste = record.waste.reduce((sum, w) => sum + w.quantity, 0);
  const wasteSummary = buildWasteSummary(record.waste);

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-0.5 min-w-0">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium">{record.submittedBy}</span>
            <span className="text-muted-foreground text-xs">
              {formatTime(record.submittedAt)}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            {buildProducedSummary(record.produced)}
          </p>
          {totalWaste > 0 && (
            <p className="text-xs text-destructive/80">{wasteSummary}</p>
          )}
          {record.editedAt && record.editedBy && (
            <div className="flex items-center gap-1 mt-1">
              <Badge variant="outline" className="text-xs h-5 px-1.5">
                edited by {record.editedBy} at {formatTime(record.editedAt)}
              </Badge>
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <div className="text-right text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{totalProduced}</span> produced
            {totalWaste > 0 && (
              <>
                {" "}
                <span className="font-medium text-destructive">{totalWaste}</span> waste
              </>
            )}
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs text-muted-foreground"
            onClick={() => onEdit(record)}
          >
            <Pencil className="h-3 w-3 mr-1" />
            Edit
          </Button>
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------
// Helper: group records by date
// -------------------------------------------------------

function groupByDate(
  records: Array<{ date: string; [key: string]: unknown }>
): Array<{ date: string; records: typeof records }> {
  const dateMap = new Map<string, typeof records>();
  for (const record of records) {
    const existing = dateMap.get(record.date) ?? [];
    dateMap.set(record.date, [...existing, record]);
  }
  // Already sorted by backend (date desc)
  return Array.from(dateMap.entries()).map(([date, recs]) => ({
    date,
    records: recs,
  }));
}
