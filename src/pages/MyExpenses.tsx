/**
 * MyExpenses - Personal expense history with status filter tabs and timeline tracker.
 * All authenticated roles can access (PERM-01).
 * EXP-05: status filters AND timeline tracker.
 */
import { useState, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Plus, Receipt, X, Loader2, ClipboardCheck } from "lucide-react";
import {
  useMyExpenses,
  useExpenseStatusHistory,
  type ExpenseStatus,
} from "@/hooks/convex/useExpenses";
import { ExpenseCard } from "@/components/expenses/ExpenseCard";
import { ExpenseStatusBadge } from "@/components/expenses/StatusBadge";
import { formatCurrency } from "@/lib/utils";
import type { Id } from "../../convex/_generated/dataModel";

// Tab definitions
const TABS = [
  { value: "all", label: "All" },
  { value: "draft", label: "Drafts" },
  { value: "submitted", label: "Pending" },
  { value: "recorded", label: "Recorded" },
  { value: "approved", label: "Approved" },
  { value: "awaiting_payment", label: "Awaiting Payment" },
  { value: "paid", label: "Paid" },
  { value: "reimbursed", label: "Reimbursed" },
  { value: "rejected", label: "Rejected" },
  { value: "voided", label: "Voided" },
] as const;

export function MyExpenses() {
  useDocumentTitle("My Expenses");
  const { user } = useAuth();

  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<string>("all");
  const [selectedExpenseId, setSelectedExpenseId] = useState<Id<"expenses"> | null>(null);

  const isApprover = user?.role === "manager" || user?.role === "admin";

  // Map tab value to status filter
  const statusFilter: ExpenseStatus | undefined =
    activeTab === "all" ? undefined : (activeTab as ExpenseStatus);

  const expenses = useMyExpenses(statusFilter);
  const statusHistory = useExpenseStatusHistory(
    selectedExpenseId ?? undefined
  );

  // Find the selected expense for the timeline header
  const selectedExpense = selectedExpenseId
    ? expenses?.find((e) => e._id === selectedExpenseId)
    : null;

  const handleCardClick = useCallback(
    (id: string) => {
      const expense = expenses?.find((e) => e._id === id);
      if (!expense) return;

      if (expense.status === "draft") {
        // Navigate to edit form for drafts
        navigate(`/expenses/new?edit=${id}`);
      } else {
        // Toggle timeline panel for non-draft expenses
        setSelectedExpenseId((prev) =>
          prev === id ? null : (id as Id<"expenses">)
        );
      }
    },
    [expenses, navigate]
  );

  const handleCloseTimeline = useCallback(() => {
    setSelectedExpenseId(null);
  }, []);

  const handleTabChange = useCallback((value: string) => {
    setActiveTab(value);
    setSelectedExpenseId(null); // Close timeline when switching tabs
  }, []);

  return (
    <div className="space-y-4">
      <PageHeader
        title="My Expenses"
        action={
          <div className="flex items-center gap-2">
            {isApprover && (
              <Button variant="outline" asChild>
                <Link to="/expenses/approve">
                  <ClipboardCheck className="h-4 w-4 mr-2" />
                  Review Approvals
                </Link>
              </Button>
            )}
            <Button asChild>
              <Link to="/expenses/new">
                <Plus className="h-4 w-4 mr-2" />
                New Expense
              </Link>
            </Button>
          </div>
        }
      />

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          {TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Single TabsContent that renders based on activeTab */}
        {TABS.map((tab) => (
          <TabsContent key={tab.value} value={tab.value}>
            <ExpenseList
              expenses={expenses}
              onCardClick={handleCardClick}
              selectedExpenseId={selectedExpenseId}
            />
          </TabsContent>
        ))}
      </Tabs>

      {/* Timeline Tracker Panel */}
      {selectedExpenseId && selectedExpense && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base">
                {selectedExpense.expenseNumber} - Status History
              </CardTitle>
              <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                <span>{selectedExpense.description}</span>
                <span>{formatCurrency(selectedExpense.amount)}</span>
                <span>{selectedExpense.vendorName}</span>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCloseTimeline}
            >
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            {statusHistory === undefined ? (
              <div className="flex items-center gap-2 py-4">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm text-muted-foreground">
                  Loading history...
                </span>
              </div>
            ) : statusHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">
                No status history found.
              </p>
            ) : (
              <div className="space-y-0">
                {statusHistory.map((entry, i) => (
                  <div key={entry._id} className="flex gap-3 pb-4">
                    <div className="flex flex-col items-center">
                      <div className="w-2.5 h-2.5 rounded-full bg-primary mt-1.5" />
                      {i < statusHistory.length - 1 && (
                        <div className="w-0.5 flex-1 bg-border mt-1" />
                      )}
                    </div>
                    <div className="pb-2">
                      <div className="flex items-center gap-2">
                        <ExpenseStatusBadge status={entry.toStatus} />
                        <span className="text-xs text-muted-foreground">
                          {new Date(entry.changedAt).toLocaleString("id-ID")}
                        </span>
                      </div>
                      {entry.fromStatus && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          from {entry.fromStatus}
                        </p>
                      )}
                      {entry.comment && (
                        <p className="text-sm mt-1">{entry.comment}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function ExpenseList({
  expenses,
  onCardClick,
  selectedExpenseId,
}: {
  expenses: ReturnType<typeof useMyExpenses>;
  onCardClick: (id: string) => void;
  selectedExpenseId: Id<"expenses"> | null;
}) {
  // Loading
  if (expenses === undefined) {
    return (
      <div className="space-y-3 mt-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-[88px] w-full rounded-lg" />
        ))}
      </div>
    );
  }

  // Empty state
  if (expenses.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Receipt className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium mb-2">No expenses found</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Start by creating your first expense.
        </p>
        <Button asChild>
          <Link to="/expenses/new">
            <Plus className="h-4 w-4 mr-2" />
            Create Expense
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2 mt-4">
      {expenses.map((expense) => (
        <ExpenseCard
          key={expense._id}
          expense={expense}
          onClick={onCardClick}
          className={selectedExpenseId === expense._id ? "ring-2 ring-primary" : undefined}
        />
      ))}
    </div>
  );
}
