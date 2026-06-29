/**
 * SubscriptionCreditBanner — T8
 *
 * Presentational-only banner shown in the order form when the customer has
 * active subscriptions. Detail-only (T6): displays the per-line credit split and
 * a Fulfil button. The subscription CHOICE lives in SubscriptionSelector (Customer
 * card) and is passed in via selectedSubId — the banner no longer owns a radio.
 *
 * Props:
 *   contexts         — array from useSubscriptionCreditContext; null = loading
 *   selectedSubId    — currently selected subscriptionId (or null) from SubscriptionSelector
 *   onFulfilWithCredit — called when the Fulfil button is clicked
 *   busy             — disables all interactive controls while a mutation runs
 */
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn, formatCurrency } from "@/lib/utils";
import type { Id } from "../../../convex/_generated/dataModel";

// ---- Types ---------------------------------------------------------------

interface CreditSplitLine {
  menuProductId: Id<"menuProducts">;
  qty: number;
  retailUnitPrice: number;
  eligible: boolean;
  effectiveUnitPrice: number;
  lineTotal: number;
}

interface CreditSplit {
  lines: CreditSplitLine[];
  eligibleSubtotal: number;
  offPlanTotal: number;
  creditCovered: number;
  eligibleShortfall: number;
  amountDue: number;
}

export interface SubscriptionCreditContext {
  subscriptionId: Id<"subscriptions">;
  label: string;
  weekId: Id<"subscriptionWeeks"> | null;
  allowedProductIds: Id<"menuProducts">[];
  availableCredit: number;
  split: CreditSplit | null;
  plannedDeliveriesRemaining: number;
}

interface SubscriptionCreditBannerProps {
  /** null = still loading; empty array = no active subs */
  contexts: SubscriptionCreditContext[] | null;
  selectedSubId: Id<"subscriptions"> | null;
  onFulfilWithCredit: () => void;
  busy?: boolean;
}

// ---- Component -----------------------------------------------------------

export function SubscriptionCreditBanner({
  contexts,
  selectedSubId,
  onFulfilWithCredit,
  busy = false,
}: SubscriptionCreditBannerProps) {
  // All hooks above any conditional return (pitfall #9).

  // Loading state
  if (contexts === null) {
    return (
      <Card className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
        <CardContent className="flex items-center gap-2 py-3">
          <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
          <span className="text-sm text-blue-700 dark:text-blue-300">
            Checking subscription credit…
          </span>
        </CardContent>
      </Card>
    );
  }

  // No active subscriptions — render nothing
  if (contexts.length === 0) {
    return null;
  }

  // The subscription choice now comes solely from selectedSubId (set by
  // SubscriptionSelector on the Customer card). The banner is detail-only (T6).
  const selectedCtx = contexts.find((c) => c.subscriptionId === selectedSubId) ?? null;

  return (
    <Card className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
      <CardHeader className="pb-2 pt-3">
        <CardTitle className="text-sm font-semibold text-blue-800 dark:text-blue-200">
          Subscription Credit
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pb-3">
        {/* Selected subscription label (chosen via SubscriptionSelector) */}
        {selectedCtx && (
          <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
            {selectedCtx.label}
            {selectedCtx.availableCredit > 0 && (
              <span className="ml-1 text-muted-foreground">
                ({formatCurrency(selectedCtx.availableCredit)} available)
              </span>
            )}
          </p>
        )}

        {/* Context detail for the selected sub */}
        {(() => {
          const ctx = selectedCtx;
          if (!ctx) {
            // No subscription selected yet (choose one in the Customer card above)
            return (
              <p className="text-xs text-muted-foreground">
                Select a subscription above to see credit details.
              </p>
            );
          }

          if (ctx.weekId === null) {
            return (
              <p className="text-sm text-amber-700 dark:text-amber-400">
                No credit available this week.
              </p>
            );
          }

          const split = ctx.split;
          if (!split) {
            return (
              <p className="text-sm text-muted-foreground">
                Available credit: {formatCurrency(ctx.availableCredit)}
              </p>
            );
          }

          return (
            <div className="space-y-2">
              {/* Per-line eligibility */}
              <div className="space-y-1">
                {split.lines.map((line, i) => (
                  <div
                    key={`${String(line.menuProductId)}-${i}`}
                    className="flex items-center justify-between text-xs"
                  >
                    <span className="flex items-center gap-1 text-blue-800 dark:text-blue-300">
                      <span
                        className={cn(
                          "font-medium",
                          line.eligible
                            ? "text-green-700 dark:text-green-400"
                            : "text-muted-foreground",
                        )}
                      >
                        {line.eligible ? "✓" : "✗"}
                      </span>
                      {line.qty}× @ {formatCurrency(line.retailUnitPrice)}
                    </span>
                    <Badge
                      variant={line.eligible ? "secondary" : "outline"}
                      className={cn(
                        "text-xs",
                        line.eligible
                          ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                          : "text-muted-foreground",
                      )}
                    >
                      {formatCurrency(line.lineTotal)}
                    </Badge>
                  </div>
                ))}
              </div>

              {/* Credit summary */}
              <div className="flex items-center justify-between border-t border-blue-200 pt-2 text-sm dark:border-blue-800">
                <span className="text-blue-700 dark:text-blue-300">
                  Credit covers {formatCurrency(split.creditCovered)}
                </span>
                <span className="font-semibold text-blue-900 dark:text-blue-100">
                  {formatCurrency(split.amountDue)} due
                </span>
              </div>
            </div>
          );
        })()}

        {/* Fulfil button */}
        <Button
          size="sm"
          className="w-full"
          disabled={
            busy ||
            selectedSubId === null ||
            selectedCtx?.weekId === null
          }
          onClick={onFulfilWithCredit}
        >
          {busy ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Processing…
            </>
          ) : (
            "Fulfil with Subscription Credit"
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
