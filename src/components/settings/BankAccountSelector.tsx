/**
 * BankAccountSelector -- radio card selector for the default bank account.
 *
 * Displays active bank accounts as selectable cards with bank name,
 * account number, and holder name. Includes a "None" option to clear.
 */
import { cn } from "@/lib/utils";
import type { Id } from "../../../convex/_generated/dataModel";

interface BankAccountItem {
  _id: Id<"bankAccounts">;
  bankName: string;
  accountNumber: string;
  name: string;
}

interface BankAccountSelectorProps {
  bankAccounts: BankAccountItem[];
  selectedId: Id<"bankAccounts"> | undefined;
  onSelect: (id: Id<"bankAccounts"> | undefined) => void;
}

export function BankAccountSelector({
  bankAccounts,
  selectedId,
  onSelect,
}: BankAccountSelectorProps) {
  if (bankAccounts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No bank accounts configured. Add one in Bank Accounts Manager.
      </p>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {/* None option */}
      <button
        type="button"
        onClick={() => onSelect(undefined)}
        className={cn(
          "flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors hover:bg-accent/50",
          !selectedId
            ? "border-primary ring-1 ring-primary"
            : "border-border",
        )}
      >
        <span className="text-sm font-medium">None</span>
        <span className="text-xs text-muted-foreground">No default bank account</span>
      </button>

      {/* Bank account cards */}
      {bankAccounts.map((account) => {
        const isSelected = selectedId === account._id;
        return (
          <button
            type="button"
            key={account._id}
            onClick={() => onSelect(account._id)}
            className={cn(
              "flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors hover:bg-accent/50",
              isSelected
                ? "border-primary ring-1 ring-primary"
                : "border-border",
            )}
          >
            <span className="text-sm font-medium">{account.bankName}</span>
            <span className="text-xs text-muted-foreground font-mono">
              {account.accountNumber}
            </span>
            <span className="text-xs text-muted-foreground">
              {account.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}
