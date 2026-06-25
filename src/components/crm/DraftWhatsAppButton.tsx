/**
 * DraftWhatsAppButton — T23 CRM Draft WhatsApp affordance.
 *
 * Opens a wa.me deep-link pre-filled with a dunning message on click,
 * and logs a `whatsapp_drafted` customerActivity row.
 *
 * IMPORTANT: The label reads "Draft WhatsApp reminder" — NOT "Send" or "Sent".
 * This component NEVER claims the message was delivered; it only prepares the draft.
 *
 * Disabled with tooltip when no phone is available (graceful guard).
 */

import { MessageCircle } from "lucide-react";
import { useSessionMutation } from "convex-helpers/react/sessions";
import { toast } from "sonner";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { buildWaMeUrl } from "@/lib/contactLinks";
import { getErrorMessage } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DraftWhatsAppButtonProps {
  phone?: string | null;
  customerId: Id<"customers">;
  invoiceId?: Id<"invoices">;
  customerName?: string | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DraftWhatsAppButton({
  phone,
  customerId,
  invoiceId,
  customerName,
}: DraftWhatsAppButtonProps) {
  const logCustomerInteraction = useSessionMutation(
    api.crm.timeline.logCustomerInteraction,
  );

  // Build the prefilled wa.me URL — null when no phone.
  const baseUrl = buildWaMeUrl(phone);
  const dunningMessage = [
    `Halo${customerName ? ` ${customerName}` : ""}!`,
    "Kami dari Frollie ingin mengingatkan bahwa Anda memiliki tagihan yang belum dibayar.",
    "Mohon segera lakukan pembayaran agar pesanan dapat diproses.",
    "Terima kasih banyak!",
  ].join(" ");
  const url = baseUrl
    ? `${baseUrl}?text=${encodeURIComponent(dunningMessage)}`
    : null;

  async function handleClick() {
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
    // The draft window is already open; logging is best-effort. Surface a clear
    // error toast on mutation rejection instead of an unhandled promise rejection.
    try {
      await logCustomerInteraction({
        customerId,
        type: "whatsapp_drafted",
        invoiceId,
        summary: "Drafted WhatsApp payment reminder",
      });
      toast.success("WhatsApp draft opened");
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to log WhatsApp draft"));
    }
  }

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={handleClick}
      disabled={!url}
      title={!url ? "No phone number on file" : undefined}
      className="text-xs"
    >
      <MessageCircle className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
      Draft WhatsApp reminder
    </Button>
  );
}
