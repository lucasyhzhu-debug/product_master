/**
 * CustomerDashboard — /crm/customers/:customerId
 *
 * Two-pane customer hub:
 *   LEFT PANE  — Identity: contact links, addresses, notes, agreement link.
 *   RIGHT PANE — Financial story: gauge slot (T26), subscriptions list,
 *                invoices & funding action, "View activity timeline →" (D2).
 *
 * Quick actions in header: Plan schedule (deep-link to B scheduler),
 *   Mark invoice paid → fund (deep-link to funding dashboard), Settings (edit form).
 *
 * CRM design principles:
 *   A1: all references render as links.
 *   A2: breadcrumbs mirror object hierarchy.
 *   A3: hub/router — not a scroll-dump.
 *   A4: bidirectional links (subscriptions ↔ this page).
 *   D11: server-side role strip (roles: ["manager","admin"] on the query).
 *   D12: designed loading / null / empty states.
 *
 * Pitfall #9: all hooks before early returns.
 * Pitfall #19: query uses roles: ["manager","admin"] — matches canAccessCrm.
 */
import { useState } from "react";
import { useParams } from "react-router-dom";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  CalendarDays,
  CreditCard,
  Edit2,
  MapPin,
  Plus,
  StickyNote,
  Users,
} from "lucide-react";
import { useSessionQuery, useSessionMutation } from "convex-helpers/react/sessions";
import { toast } from "sonner";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/shared/EmptyState";
import { LoadingPage } from "@/components/shared/LoadingState";
import { Breadcrumbs } from "@/components/crm/Breadcrumbs";
import { ContactLinks } from "@/components/crm/ContactLinks";
import { DraftWhatsAppButton } from "@/components/crm/DraftWhatsAppButton";
import { LinkableObject } from "@/components/crm/LinkableObject";
import { CreditGauge } from "@/components/crm/CreditGauge";
import type { CreditPoolShape } from "@/components/crm/CreditGauge";
import { SubscriptionSelector } from "@/components/crm/SubscriptionSelector";
import { DrawdownChart } from "@/components/crm/DrawdownChart";
import { getErrorMessage, formatCurrency } from "@/lib/utils";
import { formatSubscriptionWeekLabel } from "@/lib/dateUtils";
import { SUBSCRIPTION_STATUS_BADGE } from "@/lib/crmStatusBadges";

// ---------------------------------------------------------------------------
// Types — mirror getCustomerRecord return shape
// ---------------------------------------------------------------------------

type CustomerDoc = {
  _id: Id<"customers">;
  _creationTime: number;
  name: string;
  phone?: string | null;
  email?: string | null;
  whatsapp?: string | null;
  altPhone?: string | null;
  instagram?: string | null;
  otherSocials?: { platform: string; handle: string; url?: string }[];
  deliveryAddress?: string | null;
  storeAddress?: string | null;
  otherAddresses?: string[];
  notes?: string | null;
  keyContactName?: string | null;
  keyContactRole?: string | null;
};

type SubscriptionDoc = {
  _id: Id<"subscriptions">;
  customerId: Id<"customers">;
  status: string;
  label?: string | null;
  agreementId?: Id<"supplyAgreements"> | null;
};

type AgreementDoc = {
  _id: Id<"supplyAgreements">;
  customerId: Id<"customers">;
  status: string;
};

type WeekPool = {
  week: { _id: Id<"subscriptionWeeks">; weekStart: number; status: string };
  pool: CreditPoolShape;
} | null;

type UnpaidInvoiceDoc = {
  _id: Id<"invoices">;
  paymentStatus: string;
  invoiceNumber?: string | null;
  finalTotal: number;
};

type CustomerRecord = {
  customer: CustomerDoc;
  subscriptions: SubscriptionDoc[];
  agreements: AgreementDoc[];
  currentWeekPoolBySubscription: Record<string, WeekPool>;
  unpaidInvoices: UnpaidInvoiceDoc[];
};

// ---------------------------------------------------------------------------
// CRM-fields edit form (dialog)
// ---------------------------------------------------------------------------

/** Fields the CRM edit dialog may write — all optional strings, never null. */
type CrmEditableFields = {
  customerId: Id<"customers">;
  keyContactName?: string;
  keyContactRole?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  instagram?: string;
  deliveryAddress?: string;
  storeAddress?: string;
  notes?: string;
};

interface EditFormProps {
  customer: CustomerDoc;
  onClose: () => void;
  onSave: (fields: CrmEditableFields) => Promise<void>;
}

function CrmFieldsEditDialog({ customer, onClose, onSave }: EditFormProps) {
  const [saving, setSaving] = useState(false);
  const [keyContactName, setKeyContactName] = useState(
    customer.keyContactName ?? "",
  );
  const [keyContactRole, setKeyContactRole] = useState(
    customer.keyContactRole ?? "",
  );
  const [phone, setPhone] = useState(customer.phone ?? "");
  const [whatsapp, setWhatsapp] = useState(customer.whatsapp ?? "");
  const [email, setEmail] = useState(customer.email ?? "");
  const [instagram, setInstagram] = useState(customer.instagram ?? "");
  const [deliveryAddress, setDeliveryAddress] = useState(
    customer.deliveryAddress ?? "",
  );
  const [storeAddress, setStoreAddress] = useState(customer.storeAddress ?? "");
  const [notes, setNotes] = useState(customer.notes ?? "");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        customerId: customer._id,
        keyContactName: keyContactName || undefined,
        keyContactRole: keyContactRole || undefined,
        phone: phone || undefined,
        whatsapp: whatsapp || undefined,
        email: email || undefined,
        instagram: instagram || undefined,
        deliveryAddress: deliveryAddress || undefined,
        storeAddress: storeAddress || undefined,
        notes: notes || undefined,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit CRM fields</DialogTitle>
          <DialogDescription>
            Update this customer's contact and CRM details.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="keyContactName">Key contact name</Label>
              <Input
                id="keyContactName"
                value={keyContactName}
                onChange={(e) => setKeyContactName(e.target.value)}
                placeholder="e.g. Budi"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="keyContactRole">Key contact role</Label>
              <Input
                id="keyContactRole"
                value={keyContactRole}
                onChange={(e) => setKeyContactRole(e.target.value)}
                placeholder="e.g. Owner"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+62…"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="whatsapp">WhatsApp</Label>
              <Input
                id="whatsapp"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                placeholder="+62…"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="instagram">Instagram</Label>
            <Input
              id="instagram"
              value={instagram}
              onChange={(e) => setInstagram(e.target.value)}
              placeholder="@handle"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="deliveryAddress">Delivery address</Label>
            <Input
              id="deliveryAddress"
              value={deliveryAddress}
              onChange={(e) => setDeliveryAddress(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="storeAddress">Store address</Label>
            <Input
              id="storeAddress"
              value={storeAddress}
              onChange={(e) => setStoreAddress(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Internal notes about this customer…"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Left pane — identity
// ---------------------------------------------------------------------------

interface LeftPaneProps {
  customer: CustomerDoc;
  agreements: AgreementDoc[];
}

function IdentityPane({ customer, agreements }: LeftPaneProps) {
  return (
    <div className="space-y-5">
      {/* Contact links — A1 */}
      <section aria-label="Contact">
        {/* ContactLinks needs the full Doc shape; cast is safe — same fields */}
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <ContactLinks customer={customer as any} />
      </section>

      {/* Key contact */}
      {(customer.keyContactName ?? customer.keyContactRole) && (
        <section aria-label="Key contact" className="space-y-0.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Key contact
          </p>
          <p className="text-sm font-medium">
            {customer.keyContactName}
            {customer.keyContactRole && (
              <span className="font-normal text-muted-foreground">
                {" "}· {customer.keyContactRole}
              </span>
            )}
          </p>
        </section>
      )}

      {/* Addresses */}
      {(customer.deliveryAddress ??
        customer.storeAddress ??
        (customer.otherAddresses?.length ?? 0) > 0) && (
        <section aria-label="Addresses" className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
            Addresses
          </p>
          <div className="space-y-1">
            {customer.deliveryAddress && (
              <p className="text-sm">
                <span className="text-muted-foreground text-xs">Delivery: </span>
                {customer.deliveryAddress}
              </p>
            )}
            {customer.storeAddress && (
              <p className="text-sm">
                <span className="text-muted-foreground text-xs">Store: </span>
                {customer.storeAddress}
              </p>
            )}
            {customer.otherAddresses?.map((addr, i) => (
              <p key={i} className="text-sm text-muted-foreground">
                {addr}
              </p>
            ))}
          </div>
        </section>
      )}

      {/* Notes */}
      {customer.notes && (
        <section aria-label="Notes" className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
            <StickyNote className="h-3.5 w-3.5" aria-hidden="true" />
            Notes
          </p>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
            {customer.notes}
          </p>
        </section>
      )}

      {/* Agreements — A1, A4 */}
      {agreements.length > 0 && (
        <section aria-label="Agreements" className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Agreement{agreements.length !== 1 ? "s" : ""}
          </p>
          <div className="space-y-1">
            {agreements.map((agr) => (
              <Link
                key={agr._id}
                to={`/crm/customers/${customer._id}/agreements`}
                className="text-sm hover:underline flex items-center gap-0.5 text-muted-foreground hover:text-foreground"
              >
                Supply Agreement
                <Badge
                  className={`ml-1 text-xs ${
                    agr.status === "active"
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {agr.status}
                </Badge>
                <ArrowUpRight className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Right pane — financial story
// ---------------------------------------------------------------------------

interface RightPaneProps {
  customerId: Id<"customers">;
  customerName: string;
  customerPhone: string | null;
  subscriptions: SubscriptionDoc[];
  currentWeekPoolBySubscription: Record<string, WeekPool>;
  unpaidInvoices: UnpaidInvoiceDoc[];
  /** Selected subscription for the drawdown chart (T27). */
  selectedSubscriptionId: Id<"subscriptions"> | undefined;
  onSelectSubscription: (id: Id<"subscriptions">) => void;
}

function FinancialPane({
  customerId,
  customerName,
  customerPhone,
  subscriptions,
  currentWeekPoolBySubscription,
  unpaidInvoices,
  selectedSubscriptionId,
  onSelectSubscription,
}: RightPaneProps) {
  // Derive effective selected subscription (fallback to first if unset).
  const effectiveSelectedId = selectedSubscriptionId ?? subscriptions[0]?._id;
  const selectedSub = subscriptions.find((s) => s._id === effectiveSelectedId);

  return (
    <div className="space-y-6">
      {/* Credit gauge — T26: per-subscription pool gauge */}
      <div data-slot="gauge-t26" className="space-y-3">
        {subscriptions.map((sub) => (
          <CreditGauge
            key={sub._id}
            pool={currentWeekPoolBySubscription[sub._id]?.pool ?? null}
            subscriptionLabel={sub.label}
          />
        ))}
      </div>

      {/* Subscriptions list — A1, A4 */}
      <section aria-label="Subscriptions" className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Subscriptions
          </h2>
          <Button size="sm" variant="outline" asChild className="text-xs">
            <Link to={`/crm/customers/${customerId}/subscriptions/new`}>
              <Plus className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
              Add subscription
            </Link>
          </Button>
        </div>

        {subscriptions.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No subscriptions yet"
            description="Add a subscription to get started."
          />
        ) : (
          <div className="space-y-2">
            {subscriptions.map((sub) => {
              const pool = currentWeekPoolBySubscription[sub._id];
              const weekStatus = pool?.week.status ?? null;
              const weekLabel = pool
                ? formatSubscriptionWeekLabel(pool.week.weekStart)
                : null;
              return (
                <Card key={sub._id} className="overflow-hidden">
                  <CardContent className="p-3 flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      {/* Subscription link — A1 */}
                      <Link
                        to={`/crm/customers/${customerId}/subscriptions/${sub._id}`}
                        className="text-sm font-medium hover:underline inline-flex items-center gap-0.5"
                      >
                        {sub.label ?? `···${sub._id.slice(-6)}`}
                        <ArrowUpRight className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                      </Link>
                      {weekStatus && weekLabel && (
                        <div className="text-xs text-muted-foreground mt-0.5 flex items-center flex-wrap gap-x-1">
                          <span>Current week: {weekLabel}</span>
                          <Badge
                            className="ml-1.5 text-xs bg-amber-100 text-amber-700"
                          >
                            {weekStatus}
                          </Badge>
                        </div>
                      )}
                    </div>
                    <Badge
                      className={`text-xs shrink-0 ${
                        SUBSCRIPTION_STATUS_BADGE[sub.status] ?? "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {sub.status}
                    </Badge>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* Credit drawdown chart — T27: one subscription at a time, no roll-up (C4) */}
      {subscriptions.length > 0 && effectiveSelectedId !== undefined && (
        <section aria-label="Credit drawdown" className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Credit drawdown
          </h2>
          <SubscriptionSelector
            subscriptions={subscriptions}
            value={effectiveSelectedId}
            onChange={onSelectSubscription}
          />
          <DrawdownChart
            subscriptionId={effectiveSelectedId}
            subscriptionLabel={selectedSub?.label}
            customerId={customerId}
          />
        </section>
      )}

      {/* Unpaid invoices — each invoice is its own actionable row (A1) */}
      {unpaidInvoices.length > 0 && (
        <section aria-label="Unpaid invoices" className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Unpaid invoices
          </h2>
          <div className="space-y-1.5">
            {unpaidInvoices.map((inv) => {
              const displayNum = inv.invoiceNumber ?? `···${inv._id.slice(-6)}`;
              return (
                <Card key={inv._id}>
                  <CardContent className="p-3 flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      <CreditCard className="h-4 w-4 text-amber-500 shrink-0" aria-hidden="true" />
                      {/* Link to the specific invoice page (A1) */}
                      <Link
                        to={`/invoices/${inv._id}`}
                        className="text-sm font-medium hover:underline inline-flex items-center gap-0.5"
                      >
                        {displayNum}
                        <ArrowUpRight className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                      </Link>
                      <span className="text-sm text-muted-foreground tabular-nums">
                        {formatCurrency(inv.finalTotal)}
                      </span>
                    </div>
                    {/* Draft WhatsApp reminder per invoice — T23 */}
                    <DraftWhatsAppButton
                      phone={customerPhone}
                      customerId={customerId}
                      invoiceId={inv._id}
                      customerName={customerName}
                    />
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {/* Activity timeline — T22 */}
      <section aria-label="Activity timeline" className="pt-1">
        <LinkableObject to={`/crm/customers/${customerId}/activity`}>
          View activity timeline →
        </LinkableObject>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function CustomerDashboard() {
  const { customerId } = useParams<{ customerId: string }>();
  const [editOpen, setEditOpen] = useState(false);
  // T27: selected subscription for the drawdown chart. Undefined = fallback to first sub.
  // useState before early returns (Pitfall #9).
  const [selectedSubscriptionId, setSelectedSubscriptionId] = useState<
    Id<"subscriptions"> | undefined
  >(undefined);

  // All hooks before any early returns (Pitfall #9).
  const record = useSessionQuery(
    api.crm.customers.getCustomerRecord,
    customerId ? { customerId: customerId as Id<"customers"> } : "skip",
  );
  const updateCrmFields = useSessionMutation(
    api.crm.customers.updateCustomerCrmFields,
  );

  // D12: loading guard.
  if (record === undefined) {
    return <LoadingPage />;
  }

  // D12: not-found state.
  if (record === null) {
    return (
      <div className="p-6 space-y-4">
        <Breadcrumbs
          trail={[{ label: "CRM", to: "/crm" }, { label: "Customer not found" }]}
        />
        <p className="text-sm text-muted-foreground">
          Customer not found. It may have been removed or the link is incorrect.
        </p>
      </div>
    );
  }

  const { customer, subscriptions, agreements, currentWeekPoolBySubscription, unpaidInvoices } =
    record as CustomerRecord;

  async function handleSaveCrmFields(fields: CrmEditableFields) {
    try {
      await updateCrmFields(fields);
      toast.success("Customer updated.");
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to save changes"));
      throw err; // re-throw so dialog's finally runs correctly
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Breadcrumbs — A2 */}
      <Breadcrumbs
        trail={[
          { label: "CRM", to: "/crm" },
          { label: customer.name },
        ]}
      />

      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{customer.name}</h1>
          {customer.keyContactRole && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {customer.keyContactRole}
            </p>
          )}
        </div>

        {/* Quick actions */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Plan schedule — deep-link to B scheduler if subscription exists */}
          {subscriptions[0] && (
            <Button size="sm" variant="outline" asChild className="text-xs">
              <Link
                to={`/crm/customers/${customer._id}/subscriptions/${subscriptions[0]._id}/week`}
              >
                <CalendarDays className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                Plan schedule
              </Link>
            </Button>
          )}

          {/* Settings (edit form) */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setEditOpen(true)}
            aria-label="Settings"
            className="text-xs"
          >
            <Edit2 className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
            Settings
          </Button>
        </div>
      </div>

      {/* Two-pane layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* LEFT — identity */}
        <div>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                Identity
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <IdentityPane customer={customer} agreements={agreements} />
            </CardContent>
          </Card>
        </div>

        {/* RIGHT — financial story */}
        <div>
          <FinancialPane
            customerId={customer._id}
            customerName={customer.name}
            customerPhone={customer.whatsapp ?? customer.phone ?? null}
            subscriptions={subscriptions}
            currentWeekPoolBySubscription={currentWeekPoolBySubscription}
            unpaidInvoices={unpaidInvoices}
            selectedSubscriptionId={selectedSubscriptionId}
            onSelectSubscription={setSelectedSubscriptionId}
          />
        </div>
      </div>

      {/* CRM-fields edit dialog */}
      {editOpen && (
        <CrmFieldsEditDialog
          customer={customer}
          onClose={() => setEditOpen(false)}
          onSave={handleSaveCrmFields}
        />
      )}
    </div>
  );
}
