/**
 * DrawdownChart — T27
 *
 * Per-subscription daily credit-drawdown chart for the CRM financial pane.
 *
 * CRM principles enforced:
 *   A1  — title is a link to the subscription page.
 *   C4  — ONE subscription at a time; no summed roll-up.
 *   C9  — windowed load (current week only via getCustomerDrawdown).
 *   C10 — creditRemaining is read from the derived pool; never re-keyed here.
 *   D12 — designed loading / empty states.
 *
 * Chart layout (ComposedChart, mirrors WeekdayDualAxisChart pattern):
 *   Left Y axis  — pcs/day bars: solid=Delivered, lighter-fill=Planned.
 *   Right Y axis — IDR line: creditRemaining.
 *   ReferenceLine at today boundary (first future day) when a mixed week.
 *   Leftover-credit badge near title when series.leftoverFlag is true.
 *
 * Pitfall #9: no hooks after conditional returns — all hooks are at the top.
 */

import { Link } from "react-router-dom";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { useSessionQuery } from "convex-helpers/react/sessions";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartFrame, CHART_MARGIN } from "@/lib/chartPrimitives";
import { formatCurrency } from "@/lib/utils";
import type { DrawdownPoint } from "../../../convex/crm/helpers/drawdownSeries";

// ---------------------------------------------------------------------------
// Day label formatter (epoch ms → short weekday, e.g. "Mon")
// Dates are stored as UTC midnight by the backend; getUTCDay() resolves the correct weekday.
// ---------------------------------------------------------------------------

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function formatDayLabel(epochMs: number): string {
  return WEEKDAY_SHORT[new Date(epochMs).getUTCDay()] ?? "—";
}

// ---------------------------------------------------------------------------
// Custom tooltip
// ---------------------------------------------------------------------------

type TooltipPayload = {
  payload?: {
    label?: string;
    deliveredPcs?: number;
    plannedPcs?: number;
    creditRemaining?: number;
  };
};

function DrawdownTooltipContent({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  return (
    <div
      data-chart-tooltip
      className="rounded-md border border-border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md"
    >
      <div className="mb-1 font-medium">{p.label ?? ""}</div>
      <div className="space-y-0.5 text-xs tabular-nums">
        <div>Delivered: {p.deliveredPcs ?? 0} pcs</div>
        <div>Planned: {p.plannedPcs ?? 0} pcs</div>
        <div>Credit remaining: {formatCurrency(p.creditRemaining ?? 0)}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chart title — shared between empty-state and real chart
// ---------------------------------------------------------------------------

function DrawdownChartTitle({
  label,
  subscriptionUrl,
  leftoverFlag,
}: {
  label: string;
  subscriptionUrl: string;
  leftoverFlag: boolean;
}) {
  return (
    <CardTitle className="text-sm font-medium flex items-center gap-2 flex-wrap">
      <Link
        to={subscriptionUrl}
        className="hover:underline inline-flex items-center gap-0.5"
        aria-label={`Credit drawdown for ${label}`}
      >
        Credit drawdown — {label}
      </Link>
      {leftoverFlag && (
        <Badge
          className="text-xs bg-amber-100 text-amber-700"
          data-testid="leftover-flag"
        >
          Unspent credit
        </Badge>
      )}
    </CardTitle>
  );
}

// ---------------------------------------------------------------------------
// DrawdownChart
// ---------------------------------------------------------------------------

interface DrawdownChartProps {
  subscriptionId: Id<"subscriptions">;
  subscriptionLabel?: string | null;
  customerId: Id<"customers">;
}

export function DrawdownChart({
  subscriptionId,
  subscriptionLabel,
  customerId,
}: DrawdownChartProps) {
  // Pitfall #9: hook called unconditionally at the top.
  const result = useSessionQuery(api.crm.drawdown.getCustomerDrawdown, {
    subscriptionId,
  });

  const label = subscriptionLabel ?? `···${subscriptionId.slice(-6)}`;
  const subscriptionUrl = `/crm/customers/${customerId}/subscriptions/${subscriptionId}`;

  // D12: loading state — reuse ChartFrame skeleton pattern.
  if (result === undefined) {
    return (
      <ChartFrame title={`Credit drawdown — ${label}`} loading>
        {null}
      </ChartFrame>
    );
  }

  // D12: empty state — null result or week with no planned days.
  if (result === null || result.series.points.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <DrawdownChartTitle
            label={label}
            subscriptionUrl={subscriptionUrl}
            leftoverFlag={false}
          />
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground py-4 text-center">
            No drawdown data for the current week.
          </p>
        </CardContent>
      </Card>
    );
  }

  const { points, leftoverFlag } = result.series;

  // Build Recharts data array.
  const chartData = points.map((pt: DrawdownPoint) => ({
    label: formatDayLabel(pt.date),
    deliveredPcs: pt.deliveredPcs,
    plannedPcs: pt.plannedPcs,
    creditRemaining: pt.creditRemaining,
  }));

  // Today divider: show only when the week has a mix of past and future days.
  // x = label of the first future day (isPast=false), with at least one past day before it.
  const firstFutureIdx = points.findIndex((pt: DrawdownPoint) => !pt.isPast);
  // firstFutureIdx > 0 means there's at least one past day before the first
  // future day (when findIndex is -1 or 0 there's no mid-week divider to draw).
  const showTodayLine = firstFutureIdx > 0;
  const todayDividerLabel =
    showTodayLine ? (chartData[firstFutureIdx]?.label ?? null) : null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <DrawdownChartTitle
          label={label}
          subscriptionUrl={subscriptionUrl}
          leftoverFlag={leftoverFlag}
        />
      </CardHeader>
      <CardContent>
        <div style={{ height: "320px" }}>
          <ResponsiveContainer width="100%" height="100%" minWidth={280}>
            <ComposedChart data={chartData} margin={CHART_MARGIN}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              {/* Left axis — pcs/day */}
              <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
              {/* Right axis — IDR credit remaining */}
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 11 }}
                tickFormatter={(v: number) => formatCurrency(v)}
              />
              <Tooltip content={<DrawdownTooltipContent />} />
              <Legend />

              {/* Delivered pcs — solid bar (left axis) */}
              <Bar
                yAxisId="left"
                dataKey="deliveredPcs"
                name="Delivered"
                fill="#22c55e"
              />

              {/* Planned pcs — lighter bar (left axis) distinguishes plan from actuals */}
              <Bar
                yAxisId="left"
                dataKey="plannedPcs"
                name="Planned"
                fill="#22c55e"
                fillOpacity={0.35}
              />

              {/* Credit remaining — line on right axis */}
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="creditRemaining"
                name="Credit remaining"
                stroke="#f97316"
                strokeWidth={2}
                dot={{ r: 2 }}
              />

              {/* Today divider — only when the week spans past + future */}
              {todayDividerLabel && (
                <ReferenceLine
                  x={todayDividerLabel}
                  yAxisId="left"
                  strokeDasharray="4 4"
                  stroke="#94a3b8"
                  label={{
                    value: "Today",
                    position: "top",
                    fontSize: 10,
                    fill: "#64748b",
                  }}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
