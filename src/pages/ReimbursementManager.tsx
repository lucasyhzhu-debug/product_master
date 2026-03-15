/**
 * ReimbursementManager -- Admin reimbursement workflow page.
 *
 * Two tabs:
 * - Pending: Expenses awaiting payment grouped by employee, with batch creation
 * - Batches: Batch history with search, status filter, confirm/void actions
 *
 * Real-time: Convex auto-updates when batches are created/confirmed/voided.
 */
import { useState, useCallback, useEffect, useRef } from "react";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { PageHeader } from "@/components/layout/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Search,
  Inbox,
  Package,
  AlertCircle,
} from "lucide-react";

import {
  useAwaitingPayment,
  useCreateBatch,
  useBatches,
  useVoidBatch,
  type AwaitingPaymentGroup,
  type Batch,
} from "@/hooks/convex/useReimbursements";
import { VoidReasonDialog } from "@/components/shared";
import { PendingExpensesGroup } from "@/components/reimbursements/PendingExpensesGroup";
import { ConfirmBatchDialog } from "@/components/reimbursements/ConfirmBatchDialog";
import { BatchCard } from "@/components/reimbursements/BatchCard";
import type { Id } from "../../convex/_generated/dataModel";

// ============================================================================
// Status filter options
// ============================================================================
const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "voided", label: "Voided" },
] as const;

type StatusFilter = "all" | "pending" | "confirmed" | "voided";

// ============================================================================
// Main page component
// ============================================================================

export function ReimbursementManager() {
  useDocumentTitle("Reimbursement Manager");

  const [activeTab, setActiveTab] = useState("pending");

  // Confirm batch dialog state
  const [confirmTarget, setConfirmTarget] = useState<{
    batchId: Id<"reimbursementBatches">;
    batchNumber: string;
    totalAmount: number;
  } | null>(null);

  // Void dialog state
  const [voidTarget, setVoidTarget] = useState<{
    batchId: Id<"reimbursementBatches">;
    batchNumber: string;
  } | null>(null);

  const handleConfirmOpen = useCallback(
    (
      batchId: Id<"reimbursementBatches">,
      batchNumber: string,
      totalAmount: number,
    ) => {
      setConfirmTarget({ batchId, batchNumber, totalAmount });
    },
    [],
  );

  const voidBatch = useVoidBatch();

  const handleVoidOpen = useCallback(
    (batchId: Id<"reimbursementBatches">, batchNumber: string) => {
      setVoidTarget({ batchId, batchNumber });
    },
    [],
  );

  const handleVoidBatch = useCallback(
    async (reason: string) => {
      if (!voidTarget) return;
      await voidBatch.mutate({ batchId: voidTarget.batchId, reason });
    },
    [voidBatch, voidTarget],
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Reimbursement Manager"
        description="Manage employee expense reimbursement batches"
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="batches">Batches</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-4">
          <PendingTab
            onConfirmOpen={handleConfirmOpen}
          />
        </TabsContent>

        <TabsContent value="batches" className="mt-4">
          <BatchHistoryTab
            onConfirmOpen={handleConfirmOpen}
            onVoidOpen={handleVoidOpen}
          />
        </TabsContent>
      </Tabs>

      {/* Confirm Batch Dialog */}
      <ConfirmBatchDialog
        batchId={confirmTarget?.batchId ?? null}
        batchNumber={confirmTarget?.batchNumber ?? ""}
        totalAmount={confirmTarget?.totalAmount ?? 0}
        open={confirmTarget !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmTarget(null);
        }}
      />

      {/* Void Dialog */}
      <VoidReasonDialog
        title={`Void Batch ${voidTarget?.batchNumber ?? ""}`}
        description="This will create a reversing journal entry and return all expenses to the awaiting payment queue."
        open={voidTarget !== null}
        onOpenChange={(open) => {
          if (!open) setVoidTarget(null);
        }}
        onConfirm={handleVoidBatch}
        confirmLabel="Void Batch"
      />
    </div>
  );
}

// ============================================================================
// PendingTab -- Awaiting Payment Queue (RMB-01, RMB-02)
// ============================================================================

interface PendingTabProps {
  onConfirmOpen: (
    batchId: Id<"reimbursementBatches">,
    batchNumber: string,
    totalAmount: number,
  ) => void;
}

function PendingTab({ onConfirmOpen }: PendingTabProps) {
  const groups = useAwaitingPayment();
  const createBatch = useCreateBatch();
  const [creating, setCreating] = useState(false);

  const handleCreateBatch = useCallback(
    async (employeeUserId: Id<"users">, expenseIds: Id<"expenses">[]) => {
      setCreating(true);
      try {
        const result = await createBatch.mutate({ employeeUserId, expenseIds });
        // Auto-open confirm dialog for the new batch
        if (result) {
          onConfirmOpen(
            result.batchId as Id<"reimbursementBatches">,
            result.batchNumber,
            result.totalAmount,
          );
        }
      } finally {
        setCreating(false);
      }
    },
    [createBatch, onConfirmOpen],
  );

  // Loading state
  if (groups === undefined) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-[200px] w-full rounded-lg" />
        ))}
      </div>
    );
  }

  // Empty state
  if (groups.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <Inbox className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">
            No expenses awaiting payment
          </h3>
          <p className="text-sm text-muted-foreground">
            Approved expenses will appear here when they are ready for
            reimbursement.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Notice about bank details */}
      <div className="flex items-start gap-2 p-3 rounded-md bg-muted/50 text-sm text-muted-foreground">
        <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
        <span>
          Employees without bank details on file are highlighted. They can
          update their bank info from their profile.
        </span>
      </div>

      {/* Employee groups */}
      <div className="space-y-3">
        {groups.map((group: AwaitingPaymentGroup) => (
          <PendingExpensesGroup
            key={group.userId}
            group={group}
            onCreateBatch={handleCreateBatch}
            disabled={creating}
          />
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// BatchHistoryTab -- Batch History (RMB-03, RMB-05, RMB-06)
// ============================================================================

interface BatchHistoryTabProps {
  onConfirmOpen: (
    batchId: Id<"reimbursementBatches">,
    batchNumber: string,
    totalAmount: number,
  ) => void;
  onVoidOpen: (
    batchId: Id<"reimbursementBatches">,
    batchNumber: string,
  ) => void;
}

function BatchHistoryTab({ onConfirmOpen, onVoidOpen }: BatchHistoryTabProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Debounce search input (300ms)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(searchInput);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchInput]);

  const filterStatus =
    statusFilter === "all" ? undefined : statusFilter;
  const searchTerm = debouncedSearch || undefined;

  const batches = useBatches(filterStatus, searchTerm);

  return (
    <div className="space-y-4">
      {/* Search + Filter row */}
      <div className="flex flex-col sm:flex-row gap-2">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by RMB code or BCA reference..."
            className="pl-9"
          />
        </div>
        {/* Status filter buttons */}
        <div className="flex gap-1">
          {STATUS_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              variant={statusFilter === opt.value ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Loading state */}
      {batches === undefined && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[120px] w-full rounded-lg" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {batches !== undefined && batches.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Package className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No batches found</h3>
            <p className="text-sm text-muted-foreground">
              {debouncedSearch
                ? "Try adjusting your search terms."
                : "Created batches will appear here."}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Batch cards */}
      {batches !== undefined && batches.length > 0 && (
        <div className="space-y-3">
          {batches.map((batch: Batch) => (
            <BatchCard
              key={batch._id}
              batch={batch}
              onConfirm={onConfirmOpen}
              onVoid={onVoidOpen}
            />
          ))}
        </div>
      )}
    </div>
  );
}

