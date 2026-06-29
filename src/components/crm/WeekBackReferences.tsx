/**
 * WeekBackReferences — bidirectional back-links for a subscription week (CRM A4).
 *
 * Three sections:
 *   1. Orders that drew down this credit          → /orders/:id
 *   2. Ledger entries for this week               → /crm/customers/:cId/subscriptions/:subId
 *   3. Invoice that funded this top-up            → /invoices/:id
 *
 * CRM principles:
 *   A1: every object is a real link, never inert text.
 *   A4: cross-object links are bidirectional; this is the week-side view.
 *   D12: designed empty state per section.
 *
 * Auth: manager + admin only (page already route-gated; query enforces roles server-side).
 */

import { Link } from "react-router-dom";
import { ArrowUpRight, ShoppingCart, BookOpen, FileText } from "lucide-react";
import { useSessionQuery } from "convex-helpers/react/sessions";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface WeekBackReferencesProps {
  subscriptionWeekId: Id<"subscriptionWeeks">;
  customerId: Id<"customers">;
  subscriptionId: Id<"subscriptions">;
}

// ---------------------------------------------------------------------------
// Small sub-components
// ---------------------------------------------------------------------------

/** A single row rendered as a navigable link (A1). */
function RefLink({
  to,
  children,
}: {
  to: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground hover:underline transition-colors"
    >
      {children}
      <ArrowUpRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
    </Link>
  );
}

/** Section wrapper with heading and icon. */
function BackRefSection({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <h3 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {title}
      </h3>
      <div className="space-y-1 pl-1">{children}</div>
    </div>
  );
}

/** Empty state for a single section (D12). */
function SectionEmpty({ message }: { message: string }) {
  return (
    <p className="text-xs text-muted-foreground/60 italic py-1">{message}</p>
  );
}

// ---------------------------------------------------------------------------
// WeekBackReferences
// ---------------------------------------------------------------------------

export function WeekBackReferences({
  subscriptionWeekId,
  customerId,
  subscriptionId,
}: WeekBackReferencesProps) {
  const backRefs = useSessionQuery(api.crm.ledger.getWeekBackReferences, {
    subscriptionWeekId,
  });

  // D12: designed loading skeleton — three muted section blocks mirroring the
  // real layout (heading + a couple of rows) until data arrives.
  if (backRefs === undefined) {
    return (
      <div
        className="space-y-5 pt-2"
        data-testid="week-backref-skeleton"
        aria-hidden="true"
      >
        {[0, 1, 2].map((s) => (
          <div key={s} className="space-y-2">
            <div className="h-3.5 w-52 rounded bg-muted animate-pulse" />
            <div className="space-y-1 pl-1">
              <div className="h-4 w-36 rounded bg-muted/70 animate-pulse" />
              <div className="h-4 w-28 rounded bg-muted/70 animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const { orders, ledgerEntries, fundingInvoice } = backRefs;

  // Subscription statement URL — ledger entries link here (A4 bidirectional).
  const statementBase = `/crm/customers/${customerId}/subscriptions/${subscriptionId}`;

  return (
    <div className="space-y-5 pt-2">
      {/* ------------------------------------------------------------------ */}
      {/* 1. Orders that drew down this credit                               */}
      {/* ------------------------------------------------------------------ */}
      <BackRefSection icon={ShoppingCart} title="Orders that drew down this credit">
        {orders.length === 0 ? (
          <SectionEmpty message="No orders linked to this week." />
        ) : (
          orders.map((order) => {
            const isAdHocCredit = ((order as { subscriptionCreditApplied?: number }).subscriptionCreditApplied ?? 0) > 0;
            return (
              <RefLink key={order._id} to={`/orders/${order._id}`}>
                <span className="font-mono text-xs">{order.orderNumber}</span>
                <span className="text-xs opacity-70">· {order.status}</span>
                {isAdHocCredit && (
                  <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                    Top-up
                  </span>
                )}
              </RefLink>
            );
          })
        )}
      </BackRefSection>

      {/* ------------------------------------------------------------------ */}
      {/* 2. Ledger entries for this week                                     */}
      {/* ------------------------------------------------------------------ */}
      <BackRefSection icon={BookOpen} title="Ledger entries for this week">
        {ledgerEntries.length === 0 ? (
          <SectionEmpty message="No ledger entries recorded." />
        ) : (
          ledgerEntries.map((entry) => (
            <RefLink
              key={entry._id}
              to={`${statementBase}?weekId=${subscriptionWeekId}`}
            >
              <span className="capitalize text-xs">{entry.type}</span>
            </RefLink>
          ))
        )}
      </BackRefSection>

      {/* ------------------------------------------------------------------ */}
      {/* 3. Invoice that funded this top-up                                 */}
      {/* ------------------------------------------------------------------ */}
      <BackRefSection icon={FileText} title="Invoice that funded this top-up">
        {fundingInvoice === null ? (
          <SectionEmpty message="No invoice linked to this week." />
        ) : (
          <RefLink to={`/invoices/${fundingInvoice._id}`}>
            <span className="font-mono text-xs">
              {fundingInvoice.invoiceNumber ?? `···${fundingInvoice._id.slice(-6)}`}
            </span>
            <span className="text-xs opacity-70">· {fundingInvoice.status}</span>
          </RefLink>
        )}
      </BackRefSection>
    </div>
  );
}
