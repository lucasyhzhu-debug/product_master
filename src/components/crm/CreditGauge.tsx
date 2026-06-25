/**
 * CreditGauge — T26
 *
 * Per-subscription credit gauge driven by the DERIVED credit pool
 * (`deriveCreditPool` → `currentWeekPoolBySubscription[subId].pool`).
 *
 * Headline: `pool.creditRemaining` (integer IDR, formatted).
 * Progress bar: creditRemaining / creditIssued (0% guard when issued=0).
 * Empty state (D12): when pool is null → "No active credit pool this week".
 */

import { formatCurrency } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CreditPoolShape = {
  creditIssued: number;
  creditConsumed: number;
  creditRemaining: number;
  creditExpired: number;
};

interface CreditGaugeProps {
  pool: CreditPoolShape | null;
  subscriptionLabel?: string | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CreditGauge({ pool, subscriptionLabel }: CreditGaugeProps) {
  return (
    <div className="space-y-1.5">
      {pool === null ? (
        /* D12 empty state — no label; the subscription name is already shown below */
        <p className="text-xs text-muted-foreground italic">
          No active credit pool this week
        </p>
      ) : (
        <>
          {/* Label shown only when there's a gauge to identify */}
          {subscriptionLabel && (
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider truncate">
              {subscriptionLabel}
            </p>
          )}
          <CreditGaugeFilled pool={pool} />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Filled gauge (pool != null)
// ---------------------------------------------------------------------------

function CreditGaugeFilled({ pool }: { pool: CreditPoolShape }) {
  const { creditIssued, creditConsumed, creditRemaining } = pool;

  // Guard divide-by-zero (C9)
  const pct = creditIssued > 0 ? Math.min(creditRemaining / creditIssued, 1) : 0;
  const pctDisplay = Math.round(pct * 100);

  return (
    <div className="space-y-1">
      {/* Headline: creditRemaining */}
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-lg font-semibold tabular-nums">
          {formatCurrency(creditRemaining)}
        </span>
        <span className="text-xs text-muted-foreground">
          of {formatCurrency(creditIssued)}
        </span>
      </div>

      {/* Progress bar */}
      <div
        role="progressbar"
        aria-valuenow={pctDisplay}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${pctDisplay}% credit remaining`}
        className="h-2 rounded-full bg-muted overflow-hidden"
      >
        <div
          className="h-full rounded-full bg-emerald-500 transition-all"
          style={{ width: `${pctDisplay}%` }}
        />
      </div>

      {/* Secondary: consumed */}
      <p className="text-xs text-muted-foreground">
        {formatCurrency(creditConsumed)} consumed
      </p>
    </div>
  );
}
