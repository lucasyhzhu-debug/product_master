/**
 * SubscriptionPage — /crm/customers/:customerId/subscriptions/:subId
 *
 * Read-only subscription detail page. Shows:
 *   - Breadcrumb trail: CRM / Customer / Subscription (A2).
 *   - Explicit back-link to parent customer page (A4 bidirectional).
 *   - Subscription metadata: label, status, billing model, schedule info.
 *   - Week selector — pick which week's credit ledger statement to view.
 *   - CreditLedgerStatement for the selected week (type, signed amount,
 *     week-scoped balanceAfter, per-entry links, createdBy, note).
 *
 * CRM design principles:
 *   A1: all references render as links (per-entry links in CreditLedgerStatement).
 *   A2: breadcrumbs mirror object hierarchy.
 *   A4: bidirectional — explicit parent customer link; statement entry links back.
 *   D11: manager+admin only (query roles match canAccessCrm, same as route).
 *   D12: designed loading / null / empty states.
 *
 * Pitfall #9: all hooks before early returns.
 * Pitfall #19: getSubscription + listWeeks + getCreditLedgerStatement all use
 *   roles: ["manager","admin"], matching canAccessCrm.
 *
 * Week selection strategy:
 *   listWeeks returns weeks ordered desc (most-recent first).
 *   Default to weeks[0] (latest week). Selector lets user pick any past week.
 *   getCreditLedgerStatement is called with the selected weekId.
 */

import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, CalendarDays, CreditCard, FileText } from "lucide-react";
import { useSessionQuery, useSessionMutation } from "convex-helpers/react/sessions";
import { toast } from "sonner";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { LoadingPage } from "@/components/shared/LoadingState";
import { Breadcrumbs } from "@/components/crm/Breadcrumbs";
import { CreditLedgerStatement } from "@/components/crm/CreditLedgerStatement";
import type { LedgerStatementRow } from "@/components/crm/CreditLedgerStatement";
import { WEEK_STATUS_BADGE, SUBSCRIPTION_STATUS_BADGE } from "@/lib/crmStatusBadges";
import { formatCurrency } from "@/lib/utils";
import { utcToWibDateStr, formatSubscriptionWeekLabel } from "@/lib/dateUtils";

// ---------------------------------------------------------------------------
// Types — mirror subscriptions + subscriptionWeeks schema shape
// ---------------------------------------------------------------------------

type SubscriptionDoc = {
  _id: Id<"subscriptions">;
  _creationTime: number;
  customerId: Id<"customers">;
  /** Joined by backend (getSubscription augmented in parallel — may be undefined until codegen). */
  customerName?: string | null;
  label: string;
  status: "draft" | "active" | "terminating" | "ended";
  billingModel: "prepaid_weekly_credit";
  unitPrice: number;
  confidentialPrice: boolean;
  baselineDailyQty: number;
  weeklyQty: number;
  deliverByTime: string;
  creditRolloverPolicy: "expire" | "rollover";
  rolloverExpiryWeeks?: number | null;
  changeCutoffHour: number;
  changeCutoffDayOffset: number;
  permanentChangeNoticeDays: number;
  terminationNoticeDays: number;
  cogsBasis: number;
  startDate: number;
  terminationNoticeDate?: number;
  endDate?: number;
  agreementId?: Id<"supplyAgreements"> | null;
  notes?: string | null;
  createdBy: Id<"users">;
};

type WeekDoc = {
  _id: Id<"subscriptionWeeks">;
  subscriptionId: Id<"subscriptions">;
  weekStart: number;
  weekEnd: number;
  status: string;
  creditIssued: number;
  creditConsumed: number;
  creditRemaining: number;
};

// ---------------------------------------------------------------------------
// WeekSelector — dropdown for picking which week's statement to view
// ---------------------------------------------------------------------------

interface WeekSelectorProps {
  weeks: WeekDoc[];
  selectedId: string;
  onChange: (id: string) => void;
}

function WeekSelector({ weeks, selectedId, onChange }: WeekSelectorProps) {
  return (
    <select
      value={selectedId}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      aria-label="Select week"
    >
      {weeks.map((w) => (
        <option key={w._id} value={w._id}>
          {formatSubscriptionWeekLabel(w.weekStart)} — {w.status}
        </option>
      ))}
    </select>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function SubscriptionPage() {
  const { customerId, subId } = useParams<{
    customerId: string;
    subId: string;
  }>();

  // Honour ?weekId= from URL (e.g. week-entry back-links from CreditLedgerStatement).
  const [searchParams] = useSearchParams();
  const weekIdFromParam = searchParams.get("weekId");

  // Week selector state — initialised from ?weekId if present, otherwise null (→ weeks[0]).
  const [selectedWeekId, setSelectedWeekId] = useState<string | null>(weekIdFromParam);

  // All hooks before any early returns (Pitfall #9).
  const subscription = useSessionQuery(
    api.subscriptions.queries.getSubscription,
    subId ? { subscriptionId: subId as Id<"subscriptions"> } : "skip",
  ) as SubscriptionDoc | null | undefined;

  const weeks = useSessionQuery(
    api.subscriptions.scheduling.queries.listWeeks,
    subId ? { subscriptionId: subId as Id<"subscriptions"> } : "skip",
  ) as WeekDoc[] | undefined;

  // Resolve which week to show the statement for.
  // Prefer the user-selected week; fall back to the most-recent week (weeks[0]).
  const resolvedWeekId = selectedWeekId ?? (weeks && weeks.length > 0 ? weeks[0]._id : null);

  const statement = useSessionQuery(
    api.crm.ledger.getCreditLedgerStatement,
    resolvedWeekId
      ? { subscriptionWeekId: resolvedWeekId as Id<"subscriptionWeeks"> }
      : "skip",
  ) as { rows: LedgerStatementRow[] } | undefined;

  // Activate — only available for draft subscriptions (Pitfall #9: hooks before returns).
  const updateSubscription = useSessionMutation(api.subscriptions.mutations.updateSubscription);
  const linkAgreement = useSessionMutation(api.crm.agreements.linkAgreementToSubscription);
  const [activating, setActivating] = useState(false);

  // D12: loading guard.
  if (subscription === undefined) {
    return <LoadingPage />;
  }

  // D12: not-found state.
  if (subscription === null) {
    return (
      <div className="p-6 space-y-4">
        <Breadcrumbs
          trail={[
            { label: "CRM", to: "/crm" },
            { label: "Customer", to: customerId ? `/crm/customers/${customerId}` : "/crm" },
            { label: "Subscription" },
          ]}
        />
        <EmptyState
          icon={FileText}
          title="Subscription not found"
          description="This subscription does not exist or you don't have access to it."
        />
      </div>
    );
  }

  // Schedulability guard — all terms must be set and at least one product scheduled.
  const activationBlockedReason =
    !subscription.label?.trim() ? "Label required"
    : subscription.unitPrice <= 0 ? "Unit price required"
    : subscription.baselineDailyQty <= 0 ? "Baseline qty required"
    : subscription.cogsBasis <= 0 ? "COGS basis required"
    : !/^([01]\d|2[0-3]):[0-5]\d$/.test(subscription.deliverByTime) ? "Deliver-by time required"
    : !subscription.startDate ? "Start date required"
    : subscription.weeklyQty <= 0 ? "Add at least one scheduled product"
    : null;

  async function handleActivate() {
    setActivating(true);
    const { _id: subscriptionId, agreementId } = subscription!;
    try {
      await updateSubscription({ subscriptionId, status: "active" });
      toast.success("Subscription activated");
      if (agreementId) {
        try {
          await linkAgreement({ agreementId, subscriptionId });
        } catch (err) {
          console.error("[handleActivate] linkAgreement", err);
          toast.warning("Activated — but the agreement link failed. Link it from the agreement page.");
        }
      }
    } catch (err) {
      console.error("[handleActivate] updateSubscription", err);
      toast.error("Could not activate. Check the schedule and terms.");
    } finally {
      setActivating(false);
    }
  }

  const customerIdTyped = customerId as Id<"customers">;
  const weekList = weeks ?? [];
  // Week whose metadata + statement we show: the resolved week, falling back to
  // the most-recent. undefined only when weekList is empty.
  const selectedWeek = weekList.find((w) => w._id === resolvedWeekId) ?? weekList[0];

  return (
    <div className="p-6 space-y-6">
      {/* A2: Breadcrumbs mirror object hierarchy; customerName from backend join (C) */}
      <Breadcrumbs
        trail={[
          { label: "CRM", to: "/crm" },
          {
            label: subscription.customerName ?? "Customer",
            to: `/crm/customers/${customerId}`,
          },
          { label: subscription.label || "Subscription" },
        ]}
      />

      {/* A4: Explicit parent-customer back-link */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          asChild
          className="-ml-2 text-xs text-muted-foreground"
        >
          <Link to={`/crm/customers/${customerIdTyped}`}>
            <ArrowLeft className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
            Back to customer
          </Link>
        </Button>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {subscription.label}
          </h1>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={`text-xs ${SUBSCRIPTION_STATUS_BADGE[subscription.status]}`}>
              {subscription.status}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {subscription.billingModel === "prepaid_weekly_credit"
                ? "Prepaid weekly credit"
                : subscription.billingModel}
            </span>
          </div>
        </div>
        <div className="flex items-start gap-2">
          {/* Activate — draft only */}
          {subscription.status === "draft" && (
            <div className="flex flex-col items-end gap-1">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    size="sm"
                    disabled={activating || activationBlockedReason !== null}
                  >
                    {activating ? "Activating…" : "Activate"}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Activate subscription?</AlertDialogTitle>
                    <AlertDialogDescription>
                      <strong>{subscription.label}</strong> will start on{" "}
                      {utcToWibDateStr(subscription.startDate)}. Weekly credit:{" "}
                      {formatCurrency(subscription.weeklyQty * subscription.unitPrice)}.
                      This will begin generating weekly delivery cycles.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleActivate} aria-label="Confirm activation">
                      Activate
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              {activationBlockedReason && (
                <span className="text-xs text-muted-foreground">
                  {activationBlockedReason}
                </span>
              )}
            </div>
          )}
          {/* Quick link: schedule calendar */}
          <Button variant="outline" size="sm" asChild>
            <Link
              to={`/crm/customers/${customerIdTyped}/subscriptions/${subId}/week`}
            >
              <CalendarDays className="h-4 w-4 mr-2" aria-hidden="true" />
              Schedule
            </Link>
          </Button>
        </div>
      </div>

      {/* D3: Draft callout */}
      {subscription.status === "draft" && (
        <div className="rounded-md border border-muted bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          Draft subscriptions don&apos;t generate delivery weeks yet. Activate to start weekly cycles.
        </div>
      )}

      {/* Subscription info */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wider">
            Weekly qty
          </p>
          <p className="text-sm font-medium">{subscription.weeklyQty} items</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wider">
            Deliver by
          </p>
          <p className="text-sm font-medium">{subscription.deliverByTime} WIB</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wider">
            {subscription.startDate > Date.now() ? "STARTS" : "STARTED"}
          </p>
          <p className="text-sm font-medium">
            {utcToWibDateStr(subscription.startDate)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wider">
            Rollover
          </p>
          <p className="text-sm font-medium">
            {subscription.creditRolloverPolicy === "rollover" ? "Rollover" : "Expire"}
          </p>
        </div>
      </div>

      {/* Credit ledger statement */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              Credit Ledger Statement
            </CardTitle>

            {/* D12: only show selector when weeks are available */}
            {weekList.length > 0 ? (
              <WeekSelector
                weeks={weekList}
                selectedId={resolvedWeekId ?? weekList[0]._id}
                onChange={(id) => setSelectedWeekId(id)}
              />
            ) : null}
          </div>

          {/* Show selected week metadata */}
          {weekList.length > 0 && selectedWeek && (
            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
              <span>{formatSubscriptionWeekLabel(selectedWeek.weekStart)}</span>
              <Badge className={`text-xs ${WEEK_STATUS_BADGE[selectedWeek.status] ?? "bg-gray-100 text-gray-600"}`}>
                {selectedWeek.status}
              </Badge>
              <span>Issued: {formatCurrency(selectedWeek.creditIssued)}</span>
              <span>Consumed: {formatCurrency(selectedWeek.creditConsumed)}</span>
              <span>Remaining: {formatCurrency(selectedWeek.creditRemaining)}</span>
            </div>
          )}
        </CardHeader>

        <CardContent>
          {/* D12: empty state when no weeks */}
          {weekList.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="No weeks found"
              description="No subscription weeks have been created yet for this subscription."
            />
          ) : statement === undefined ? (
            // Loading the statement.
            <div className="py-6 text-center text-sm text-muted-foreground">
              Loading ledger…
            </div>
          ) : (
            <CreditLedgerStatement
              rows={statement.rows}
              customerId={customerIdTyped}
              subscriptionId={subId ?? ""}
              weekStart={selectedWeek?.weekStart ?? 0}
            />
          )}
        </CardContent>
      </Card>

      {/* Agreement back-reference (A4) */}
      {subscription.agreementId && (
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5">
              Supply Agreement
            </p>
            <Link
              to={`/crm/customers/${customerIdTyped}/agreements`}
              className="text-sm hover:underline inline-flex items-center gap-0.5 text-muted-foreground hover:text-foreground"
            >
              View agreement
              <ArrowLeft className="h-3 w-3 rotate-180" aria-hidden="true" />
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
