import { Badge } from "@/components/ui/badge";

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  draft: {
    label: "Draft",
    className: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  },
  submitted: {
    label: "Pending",
    className: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  },
  approved: {
    label: "Approved",
    className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  },
  rejected: {
    label: "Rejected",
    className: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  },
  awaiting_payment: {
    label: "Awaiting Payment",
    className: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  },
  reimbursed: {
    label: "Reimbursed",
    className: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  },
  voided: {
    label: "Voided",
    className: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 line-through",
  },
};

export function ExpenseStatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || { label: status, className: "" };
  return (
    <Badge variant="outline" className={config.className}>
      {config.label}
    </Badge>
  );
}
