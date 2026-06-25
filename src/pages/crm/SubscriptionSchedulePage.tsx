/**
 * SubscriptionSchedulePage — /crm/customers/:customerId/subscriptions/:subId/week
 *
 * Schedule calendar for one subscription week.
 * Manager + admin only (canAccessCrm).
 *
 * Session hooks: useSessionQuery / useSessionMutation (protectedQuery/protectedMutation).
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Copy,
  FileText,
  LayoutTemplate,
  Minus,
  Pencil,
  RefreshCw,
  Save,
} from "lucide-react";
import { useSessionQuery, useSessionMutation } from "convex-helpers/react/sessions";
import { useQuery } from "convex/react";
import { toast } from "sonner";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { EmptyState } from "@/components/shared/EmptyState";
import { LoadingPage } from "@/components/shared/LoadingState";
import { WeekCalendarGrid } from "@/components/crm/WeekCalendarGrid";
import type { LocalWeekPlan } from "@/components/crm/WeekCalendarGrid";
import type { ScheduleLineLocal } from "@/components/crm/ProductLineEditor";
import { formatCurrency } from "@/lib/utils";
import { utcToWibDateStr, formatSubscriptionWeekLabel } from "@/lib/dateUtils";
import { getErrorMessage } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;


/** Status badge colours */
const STATUS_BADGE: Record<string, string> = {
  planned: "bg-blue-100 text-blue-700",
  confirmed: "bg-amber-100 text-amber-700",
  invoiced: "bg-purple-100 text-purple-700",
  paid: "bg-green-100 text-green-700",
  delivering: "bg-teal-100 text-teal-700",
  reconciled: "bg-gray-100 text-gray-600",
  closed: "bg-gray-100 text-gray-500",
};

/**
 * Convert plannedDays from Convex into a LocalWeekPlan (7-element array indexed Mon→Sun).
 * Convex day.date is a UTC epoch ms for WIB midnight of that day.
 * dayIndex = (date - weekStart) / DAY_MS.
 */
function toLocalWeekPlan(
  plannedDays: Array<{
    date: number;
    items: Array<{ menuProductId: Id<"menuProducts">; qty: number; unitPrice: number }>;
  }>,
  weekStart: number,
): LocalWeekPlan {
  const plan: LocalWeekPlan = [[], [], [], [], [], [], []];
  for (const day of plannedDays) {
    const idx = Math.round((day.date - weekStart) / DAY_MS);
    if (idx < 0 || idx > 6) continue;
    plan[idx] = day.items.map((it) => ({
      menuProductId: it.menuProductId,
      qty: it.qty,
      unitPrice: it.unitPrice,
    }));
  }
  return plan;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function SubscriptionSchedulePage() {
  const { subId } = useParams<{ customerId: string; subId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // weekStart comes from the query string (epoch ms as string), falls back to
  // "current Monday" computed client-side in WIB.
  const weekStartMs: number = useMemo(() => {
    const raw = searchParams.get("weekStart");
    if (raw) {
      const parsed = parseInt(raw, 10);
      if (!isNaN(parsed)) return parsed;
    }
    // Default: current WIB week Monday
    const nowWib = Date.now() + 7 * 3600_000;
    const d = new Date(nowWib);
    // getUTCDay: 0=Sun, 1=Mon … 6=Sat → shift to Mon=0
    const dow = (d.getUTCDay() + 6) % 7;
    return nowWib - dow * DAY_MS - (nowWib % DAY_MS) - 7 * 3600_000;
  }, [searchParams]);

  const subscriptionId = subId as Id<"subscriptions">;

  // ---------------------------------------------------------------------------
  // Server data
  // ---------------------------------------------------------------------------
  const planningData = useSessionQuery(api.subscriptions.scheduling.queries.getPlanningWeek, {
    subscriptionId,
    weekStart: weekStartMs,
  });

  // menuProducts.queries.list is a public `query` (no sessionId arg) — must use plain
  // useQuery; useSessionQuery injects sessionId and Convex rejects it (ArgumentValidationError).
  const products = useQuery(api.menuProducts.queries.list, { activeOnly: true });

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------
  const seedWeekMutation = useSessionMutation(api.subscriptions.weeks.seedWeek);
  const saveWeekPlanMutation = useSessionMutation(api.subscriptions.weeks.saveWeekPlan);
  const confirmWeekMutation = useSessionMutation(
    api.subscriptions.scheduling.confirmWeek.confirmWeek,
  );
  const createInvoiceMutation = useSessionMutation(
    api.subscriptions.invoicing.createSubscriptionWeeklyInvoice,
  );

  // Amend mutation (T3 backend)
  const amendWeek = useSessionMutation(api.subscriptions.amend.amendConfirmedWeek);

  // ---------------------------------------------------------------------------
  // Local editable plan (derived from Convex week.plannedDays)
  // Convex is the source of truth; localDays shadows changes before seedWeek is called.
  // ---------------------------------------------------------------------------
  const [localDays, setLocalDays] = useState<LocalWeekPlan | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [amending, setAmending] = useState(false);

  // Ref holds the latest server-derived display plan so handleDayChange can
  // seed from it on the FIRST edit (when prev is null) without adding
  // displayPlan to the useCallback dep array (which would violate C1's
  // hoisting requirement and break Rules of Hooks).
  const displayPlanRef = useRef<LocalWeekPlan>([[], [], [], [], [], [], []]);

  // C1: hoisted above ALL early returns so Rules of Hooks is satisfied.
  // Uses functional updater — no dependency on post-guard `displayPlan`.
  const handleDayChange = useCallback(
    (dayIndex: number, lines: ScheduleLineLocal[]) => {
      setLocalDays((prev) => {
        // On first edit (prev === null) seed from the server-derived plan so
        // other days retain their data. The ref is stable — not a dependency.
        const base: LocalWeekPlan = prev ?? displayPlanRef.current;
        const next = [...base] as LocalWeekPlan;
        next[dayIndex] = lines;
        return next;
      });
    },
    [], // stable — only depends on setLocalDays (stable) and displayPlanRef (stable ref)
  );

  // Loading guard (D12)
  if (planningData === undefined || products === undefined) {
    return <LoadingPage />;
  }

  // Null = subscription not found
  if (planningData === null) {
    return (
      <EmptyState
        icon={CalendarDays}
        title="Subscription not found"
        description="This subscription or week could not be loaded. Check the URL and try again."
        action={{ label: "Go back", onClick: () => navigate(-1) }}
      />
    );
  }

  const { week, subscription } = planningData;
  const isLocked = week !== null && week.status !== "planned";
  const amendable =
    week !== null &&
    (["confirmed", "invoiced", "paid", "delivering"] as string[]).includes(week.status);
  // Grid is editable when: planned week (existing) OR operator opted into amend mode.
  const gridLocked = isLocked && !amending;
  const unitPrice = subscription.unitPrice;

  // Display plan: prefer localDays (unsaved edits) otherwise derive from week
  const displayPlan: LocalWeekPlan =
    localDays ??
    (week !== null
      ? toLocalWeekPlan(week.plannedDays, weekStartMs)
      : [[], [], [], [], [], [], []]);

  // Keep the ref in sync with the latest server-derived plan so handleDayChange
  // can seed from it on the first edit without needing it as a dep.
  displayPlanRef.current = displayPlan;

  const weekTotal = displayPlan.reduce(
    (s, lines) => s + lines.reduce((ds, l) => ds + l.qty * unitPrice, 0),
    0,
  );

  const productOptions = (products ?? []).map((p) => ({
    _id: p._id,
    name: p.name,
  }));

  // ---------------------------------------------------------------------------
  // Seed actions — only valid when week === null (unseeded)
  // ---------------------------------------------------------------------------
  async function handleSeed(source: "template" | "previousWeek" | "blank") {
    // Guard: seedWeek is create-only; calling it on an existing week is a no-op.
    // The buttons are only rendered when week === null, so this is a safety net.
    if (week !== null) return;

    setSeeding(true);
    try {
      await seedWeekMutation({ subscriptionId, weekStart: weekStartMs, source });
      setLocalDays(null); // let Convex data re-populate
      toast.success(
        source === "blank"
          ? "Blank week created"
          : source === "previousWeek"
            ? "Week copied from previous week"
            : "Week seeded from template",
      );
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to seed week"));
    } finally {
      setSeeding(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Save plan — persist localDays to Convex plannedDays
  // ---------------------------------------------------------------------------
  async function handleSave(plan: LocalWeekPlan, weekId: Id<"subscriptionWeeks">): Promise<boolean> {
    setSaving(true);
    try {
      // Convert LocalWeekPlan (7-element array indexed Mon→Sun) into the
      // { date, items } shape saveWeekPlan expects. Skip entirely-empty days
      // so the backend stores only days that actually have lines.
      const days = plan
        .map((lines, i) => ({
          date: weekStartMs + i * DAY_MS,
          items: lines.map((l) => ({ menuProductId: l.menuProductId, qty: l.qty })),
        }))
        .filter((d) => d.items.length > 0);

      await saveWeekPlanMutation({
        subscriptionWeekId: weekId,
        days,
      });
      setLocalDays(null); // let Convex data repopulate (edits now persisted)
      toast.success("Plan saved.");
      return true;
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to save plan"));
      return false;
    } finally {
      setSaving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Confirm → generate orders + invoice
  // ---------------------------------------------------------------------------
  async function handleConfirm() {
    if (!week) {
      toast.error("Seed the week first before confirming.");
      return;
    }
    if (week.status !== "planned") {
      toast.error(`Week is ${week.status} — only planned weeks can be confirmed.`);
      return;
    }
    setConfirming(true);
    try {
      // Persist any unsaved edits first so confirm always acts on saved data.
      if (localDays !== null) {
        const saved = await handleSave(localDays, week._id);
        if (!saved) {
          setConfirming(false);
          return;
        }
      }
      await confirmWeekMutation({ subscriptionWeekId: week._id });
      await createInvoiceMutation({ subscriptionWeekId: week._id });
      toast.success("Week confirmed and invoice created.");
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to confirm week"));
    } finally {
      setConfirming(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  const weekLabel = formatSubscriptionWeekLabel(weekStartMs);
  const statusLabel = week?.status ?? "unseeded";
  const statusClass = STATUS_BADGE[statusLabel] ?? "bg-gray-100 text-gray-500";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 mt-0.5"
            onClick={() => navigate(-1)}
            aria-label="Go back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold leading-tight">Schedule Calendar</h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-sm text-muted-foreground">{weekLabel}</span>
              <Badge className={`text-xs font-medium capitalize ${statusClass}`}>
                {statusLabel}
              </Badge>
              <span className="text-xs text-muted-foreground">
                Partner price: {formatCurrency(unitPrice)} / unit
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              WIB Mon–Sun &middot; week starting {utcToWibDateStr(weekStartMs)}
            </p>
          </div>
        </div>

        {/* Action bar */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Seed source buttons — only when week is unseeded (week === null).
              seedWeek is create-only; these buttons have no effect on an existing week. */}
          {week === null && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleSeed("template")}
                disabled={seeding}
                className="text-xs"
              >
                <LayoutTemplate className="h-3.5 w-3.5 mr-1.5" />
                Reset to template
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleSeed("previousWeek")}
                disabled={seeding}
                className="text-xs"
              >
                <Copy className="h-3.5 w-3.5 mr-1.5" />
                Copy last week
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleSeed("blank")}
                disabled={seeding}
                className="text-xs"
              >
                <Minus className="h-3.5 w-3.5 mr-1.5" />
                Blank
              </Button>

              <Separator orientation="vertical" className="h-6" />
            </>
          )}

          {/* Save plan — only visible when there are unsaved local edits on an existing week */}
          {!isLocked && localDays !== null && week !== null && (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleSave(localDays, week._id)}
                disabled={saving || confirming}
                className="text-xs"
              >
                {saving ? (
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5 mr-1.5" />
                )}
                Save plan
              </Button>

              <Separator orientation="vertical" className="h-6" />
            </>
          )}

          {/* Confirm — only when week exists and is still planned */}
          {!isLocked && (
            <Button
              size="sm"
              onClick={handleConfirm}
              disabled={confirming || saving || !week || week.status !== "planned"}
              className="text-xs"
            >
              {confirming ? (
                <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
              )}
              Confirm &rarr; orders + invoice
            </Button>
          )}

          {/* Amend week toggle — only for amendable statuses (confirmed/invoiced/paid/delivering) */}
          {amendable && !amending && (
            <Button variant="outline" size="sm" onClick={() => setAmending(true)} className="text-xs">
              <Pencil className="h-4 w-4 mr-1.5" /> Amend week
            </Button>
          )}

          {/* Save amendments button — visible while amend mode is active */}
          {amending && week !== null && (
            <Button
              size="sm"
              className="text-xs"
              onClick={async () => {
                // Reuse the SAME LocalWeekPlan → days conversion as saveWeekPlan (handleSave).
                // plan = displayPlan (the grid's current state, including any local edits).
                const days = displayPlan
                  .map((lines, i) => ({
                    date: weekStartMs + i * DAY_MS,
                    items: lines.map((l) => ({ menuProductId: l.menuProductId, qty: l.qty })),
                  }))
                  .filter((d) => d.items.length > 0);
                try {
                  const r = await amendWeek({ subscriptionWeekId: week._id, days });
                  toast.success(
                    `Amended — top-up invoice for ${formatCurrency(r.deltaTotal)} created. Mark it paid to fund the credit.`,
                  );
                  setAmending(false);
                  setLocalDays(null);
                } catch (err) {
                  toast.error(getErrorMessage(err, "Failed to amend week"));
                }
              }}
            >
              Save amendments &rarr; bill top-up
            </Button>
          )}

          {/* Cancel amend */}
          {amending && (
            <Button variant="ghost" size="sm" className="text-xs" onClick={() => { setAmending(false); setLocalDays(null); }}>
              Cancel amend
            </Button>
          )}

          {/* Week total */}
          <div className="flex items-center gap-1.5 ml-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold tabular-nums">
              {formatCurrency(weekTotal)}
            </span>
          </div>
        </div>
      </div>

      {/* Empty state — no week seeded yet */}
      {week === null ? (
        <EmptyState
          icon={CalendarDays}
          title="Week not seeded yet"
          description="Choose a seed source above to create the schedule for this week."
        />
      ) : (
        <WeekCalendarGrid
          weekStart={weekStartMs}
          localDays={displayPlan}
          products={productOptions}
          unitPrice={unitPrice}
          locked={gridLocked}
          onChange={handleDayChange}
        />
      )}

      {/* Locked notice — hidden while amend mode is active */}
      {gridLocked && (
        <p className="text-xs text-muted-foreground text-center">
          This week is <span className="font-medium">{statusLabel}</span> and cannot be
          edited. Navigate to a planned week to make changes, or use &ldquo;Amend week&rdquo; above.
        </p>
      )}
    </div>
  );
}
