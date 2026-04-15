/**
 * ReconciliationActionBar — sticky footer for the split-view workspace.
 *
 * Buttons (UI-SPEC §6.2):
 *  - Match selected (primary) — both line + candidate selected
 *  - Unmatch auto (destructive outline) — line has matchedType
 *  - Confirm (primary) — line is matched and has both JE accounts
 *    OR Route to Asset Register (D-20 CapEx swap)
 *  - Confirm all exact-tier (primary) — batch action (Plan 04 wires dialog)
 *  - Search all records (tertiary) — Plan 04 wires dialog
 *  - + Create expense / + Create revenue / + Create reimbursement
 *    (secondary) — visible only for unmatched lines
 *
 * role="toolbar" per UI-SPEC §9 a11y.
 */

import type { Doc } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MatchedType } from "./CandidateRow";

interface Props {
  selectedLine: Doc<"bankStatementLines"> | null;
  selectedCandidate: { type: MatchedType; id: string } | null;
  onMatch: () => void;
  onUnmatch: () => void;
  onConfirm: () => void;
  onBatchConfirm: () => void;
  onSearchAll: () => void;
  onRouteToAssetRegister: () => void;
  onInlineCreateExpense: () => void;
  onInlineCreateRevenue: () => void;
  onInlineCreateReimbursement: () => void;
  className?: string;
}

const CAPEX_FLAG = "capex_needs_asset_register";

export function ReconciliationActionBar({
  selectedLine,
  selectedCandidate,
  onMatch,
  onUnmatch,
  onConfirm,
  onBatchConfirm,
  onSearchAll,
  onRouteToAssetRegister,
  onInlineCreateExpense,
  onInlineCreateRevenue,
  onInlineCreateReimbursement,
  className,
}: Props) {
  const hasLine = selectedLine !== null;
  const hasCandidate = selectedCandidate !== null;
  const canMatch = hasLine && hasCandidate;
  const canUnmatch = hasLine && !!selectedLine?.matchedType;
  const isCapEx = !!selectedLine?.flags?.includes(CAPEX_FLAG);
  const canConfirm =
    hasLine &&
    (selectedLine?.status === "auto_matched" || selectedLine?.status === "suggested") &&
    !!selectedLine?.jeDebitAccountId &&
    !!selectedLine?.jeCreditAccountId;
  const showInlineCreate = selectedLine?.status === "unmatched";

  return (
    <div
      role="toolbar"
      aria-label="Reconciliation actions"
      className={cn(
        "flex flex-wrap items-center gap-2 border-t border-border bg-background p-3",
        className,
      )}
    >
      <Button onClick={onMatch} disabled={!canMatch} size="sm">
        Match selected
      </Button>
      <Button
        onClick={onUnmatch}
        disabled={!canUnmatch}
        size="sm"
        variant="outline"
        className="border-destructive/40 text-destructive hover:bg-destructive/10"
      >
        Unmatch auto
      </Button>
      {isCapEx ? (
        <Button onClick={onRouteToAssetRegister} size="sm">
          Route to Asset Register
        </Button>
      ) : (
        <Button onClick={onConfirm} disabled={!canConfirm} size="sm">
          Confirm
        </Button>
      )}
      <Button onClick={onBatchConfirm} size="sm" variant="default">
        Confirm all exact-tier
      </Button>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        {showInlineCreate && (
          <>
            <Button onClick={onInlineCreateExpense} size="sm" variant="secondary">
              + Create expense
            </Button>
            <Button onClick={onInlineCreateRevenue} size="sm" variant="secondary">
              + Create revenue
            </Button>
            <Button onClick={onInlineCreateReimbursement} size="sm" variant="secondary">
              + Create reimbursement
            </Button>
          </>
        )}
        <Button onClick={onSearchAll} size="sm" variant="ghost">
          Search all records
        </Button>
      </div>
    </div>
  );
}
