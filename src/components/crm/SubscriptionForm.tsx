/**
 * SubscriptionForm — creates a draft subscription for a CRM customer.
 *
 * Embeds ScheduleTemplateEditor for the weekly template.
 * Optional supply agreement attach (inline upload or select existing).
 * On submit: calls createSubscription → navigates to the new SubscriptionPage.
 *
 * Phase D: Task 4 of the subscription onboarding UI.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "convex/react";
import { useSessionMutation, useSessionQuery } from "convex-helpers/react/sessions";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import { ScheduleTemplateEditor, type TemplateDay } from "./ScheduleTemplateEditor";
import { AgreementUpload } from "./AgreementUpload";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns next Monday at local midnight as a Unix ms timestamp. */
function nextMonday(): number {
  const d = new Date();
  const day = d.getDay(); // 0=Sun, 1=Mon … 6=Sat
  const daysUntilMonday = day === 1 ? 7 : (8 - day) % 7;
  d.setDate(d.getDate() + daysUntilMonday);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function isPositiveInt(val: string): boolean {
  const n = Number(val);
  return Number.isInteger(n) && n > 0;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  customerId: Id<"customers">;
}

export function SubscriptionForm({ customerId }: Props) {
  const navigate = useNavigate();

  // Mutations
  const createSubscription = useSessionMutation(
    api.subscriptions.mutations.createSubscription,
  );
  const generateAgreementUploadUrl = useSessionMutation(
    api.crm.agreements.generateAgreementUploadUrl,
  );
  const createSupplyAgreement = useSessionMutation(
    api.crm.agreements.createSupplyAgreement,
  );

  // Public query — no sessionId; activeOnly matches SubscriptionSchedulePage pattern
  // rawProductsQuery is undefined while loading, [] when empty, array when ready (Mn3).
  const rawProductsQuery = useQuery(api.menuProducts.queries.list, { activeOnly: true });
  const products = (rawProductsQuery ?? []).map((p: { _id: Id<"menuProducts">; name: string }) => ({
    _id: p._id,
    name: p.name,
  }));

  // Agreements (optional — empty list means no existing ones on file)
  const agreements =
    (useSessionQuery(api.crm.agreements.listAgreementsByCustomer, {
      customerId,
    }) ?? []) as Array<{ _id: Id<"supplyAgreements">; fileName?: string }>;

  // ---------------------------------------------------------------------------
  // Form state
  // ---------------------------------------------------------------------------

  const [label, setLabel] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [baselineDailyQty, setBaselineDailyQty] = useState("");
  const [cogsBasis, setCogsBasis] = useState("");
  const [deliverByTime, setDeliverByTime] = useState("09:00");
  const [creditRolloverPolicy, setCreditRolloverPolicy] = useState<"expire" | "rollover">(
    "expire",
  );
  const [rolloverExpiryWeeks, setRolloverExpiryWeeks] = useState("");
  const [startDate] = useState<number>(nextMonday);
  const [agreementId, setAgreementId] = useState<Id<"supplyAgreements"> | undefined>();
  const [notes, setNotes] = useState("");
  const [days, setDays] = useState<TemplateDay[]>(() =>
    Array.from({ length: 7 }, (_, i) => ({ dayOfWeek: i, items: [] })),
  );
  const [submitting, setSubmitting] = useState(false);

  // ---------------------------------------------------------------------------
  // Preview
  // ---------------------------------------------------------------------------

  const weeklyQty = days.reduce(
    (s, d) => s + d.items.reduce((a, l) => a + l.qty, 0),
    0,
  );
  const weeklyCredit = formatCurrency(weeklyQty * (Number(unitPrice) || 0));

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  const isValid =
    label.trim().length > 0 &&
    isPositiveInt(unitPrice) &&
    isPositiveInt(baselineDailyQty) &&
    isPositiveInt(cogsBasis) &&
    /^([01]\d|2[0-3]):[0-5]\d$/.test(deliverByTime) &&
    // I3: blank rolloverExpiryWeeks is allowed (indefinite); but if typed, must be a positive int.
    (creditRolloverPolicy !== "rollover" || !rolloverExpiryWeeks || isPositiveInt(rolloverExpiryWeeks));

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid || submitting) return;

    setSubmitting(true);
    try {
      const id = await createSubscription({
        customerId,
        label: label.trim(),
        unitPrice: Number(unitPrice),
        confidentialPrice: true,
        baselineDailyQty: Number(baselineDailyQty),
        deliverByTime,
        creditRolloverPolicy,
        cogsBasis: Number(cogsBasis),
        startDate,
        scheduleTemplate: days,
        ...(creditRolloverPolicy === "rollover" && rolloverExpiryWeeks
          ? { rolloverExpiryWeeks: Number(rolloverExpiryWeeks) }
          : {}),
        ...(agreementId ? { agreementId } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      });
      navigate(`/crm/customers/${customerId}/subscriptions/${id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create subscription");
    } finally {
      setSubmitting(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* ── Terms ─────────────────────────────────────────────────────────── */}
      <div className="space-y-4">
        {/* Label */}
        <div className="space-y-1.5">
          <Label htmlFor="sub-label">Label</Label>
          <Input
            id="sub-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Morning Bundle A"
          />
        </div>

        {/* Unit price */}
        <div className="space-y-1.5">
          <Label htmlFor="sub-unitPrice">Unit price (whole IDR)</Label>
          <Input
            id="sub-unitPrice"
            type="number"
            min={1}
            step="1"
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
            placeholder="29000"
          />
        </div>

        {/* Baseline daily qty */}
        <div className="space-y-1.5">
          <Label htmlFor="sub-baselineDailyQty">Baseline daily qty (whole IDR)</Label>
          <Input
            id="sub-baselineDailyQty"
            type="number"
            min={1}
            step="1"
            value={baselineDailyQty}
            onChange={(e) => setBaselineDailyQty(e.target.value)}
            placeholder="150"
          />
        </div>

        {/* COGS basis */}
        <div className="space-y-1.5">
          <Label htmlFor="sub-cogsBasis">COGS basis (whole IDR)</Label>
          <Input
            id="sub-cogsBasis"
            type="number"
            min={1}
            step="1"
            value={cogsBasis}
            onChange={(e) => setCogsBasis(e.target.value)}
            placeholder="12000"
          />
        </div>

        {/* Deliver by */}
        <div className="space-y-1.5">
          <Label htmlFor="sub-deliverByTime">Deliver by</Label>
          <Input
            id="sub-deliverByTime"
            value={deliverByTime}
            onChange={(e) => setDeliverByTime(e.target.value)}
            placeholder="09:00"
            pattern="\d{2}:\d{2}"
          />
        </div>

        {/* Credit rollover policy */}
        <div className="space-y-1.5">
          <Label htmlFor="sub-rolloverPolicy">Credit rollover policy</Label>
          <Select
            value={creditRolloverPolicy}
            onValueChange={(v) =>
              setCreditRolloverPolicy(v as "expire" | "rollover")
            }
          >
            <SelectTrigger id="sub-rolloverPolicy">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="expire">Expire at week end</SelectItem>
              <SelectItem value="rollover">Rollover unused credit</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {creditRolloverPolicy === "rollover" && (
          <div className="space-y-1.5">
            <Label htmlFor="sub-rolloverExpiryWeeks">Rollover expiry (weeks)</Label>
            <Input
              id="sub-rolloverExpiryWeeks"
              type="number"
              min={1}
              step="1"
              value={rolloverExpiryWeeks}
              onChange={(e) => setRolloverExpiryWeeks(e.target.value)}
              placeholder="4"
            />
            <p className="text-xs text-muted-foreground">
              Leave blank for indefinite rollover.
            </p>
          </div>
        )}

        {/* Notes */}
        <div className="space-y-1.5">
          <Label htmlFor="sub-notes">Notes</Label>
          <Input
            id="sub-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes…"
          />
        </div>
      </div>

      {/* ── Weekly schedule template ───────────────────────────────────────── */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium">Weekly schedule template</h3>
        {rawProductsQuery === undefined && (
          <p className="text-xs text-muted-foreground">Loading products…</p>
        )}
        <ScheduleTemplateEditor days={days} products={products} onChange={setDays} />
      </div>

      {/* ── Preview ──────────────────────────────────────────────────────── */}
      <div className="rounded-md border p-3 space-y-1 text-sm bg-muted/30">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Weekly qty</span>
          <span data-testid="weekly-qty-preview" className="font-medium tabular-nums">
            {weeklyQty}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Weekly credit</span>
          <span data-testid="weekly-credit-preview" className="font-medium tabular-nums">
            {weeklyCredit}
          </span>
        </div>
      </div>

      {/* ── Supply agreement (optional) ───────────────────────────────────── */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium">Supply agreement <span className="text-muted-foreground font-normal">(optional)</span></h3>

        {agreements.length > 0 && (
          <Select
            value={agreementId ?? "none"}
            onValueChange={(v) =>
              setAgreementId(v && v !== "none" ? (v as Id<"supplyAgreements">) : undefined)
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Select existing agreement…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {agreements.map((ag) => (
                <SelectItem key={ag._id} value={ag._id}>
                  {ag.fileName ?? ag._id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {agreements.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No agreements on file — upload one below or attach later.
          </p>
        )}

        <AgreementUpload
          mode="create"
          generateUploadUrl={generateAgreementUploadUrl}
          onUploaded={async (storageId, fileName, lang, fileSize) => {
            try {
              const id = await createSupplyAgreement({
                customerId,
                fileStorageId: storageId,
                fileName,
                fileSize,
                status: "draft",
                lang,
              });
              setAgreementId(id);
            } catch {
              toast.error(
                "Agreement uploaded but could not be saved — you can attach it later.",
              );
            }
          }}
        />
      </div>

      {/* ── Submit ────────────────────────────────────────────────────────── */}
      <Button type="submit" disabled={!isValid || submitting} className="w-full">
        {submitting ? "Creating…" : "Create subscription"}
      </Button>
    </form>
  );
}
