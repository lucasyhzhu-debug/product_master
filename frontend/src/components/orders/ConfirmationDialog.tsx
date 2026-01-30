import { Copy, Check, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import type { OrderStatus } from '@/lib/types';

interface ConfirmationDialogProps {
  open: boolean;
  orderStatus?: OrderStatus;
  whatsappSent: boolean;
  paymentConfirmed: boolean;
  whatsappText: string;
  onOpenChange: (open: boolean) => void;
  onWhatsappSentChange: (sent: boolean) => void;
  onPaymentConfirmedChange: (confirmed: boolean) => void;
  onWhatsappTextChange: (text: string) => void;
  onCopyWhatsapp: () => void;
  onConfirm: () => void;
}

export function ConfirmationDialog({
  open,
  orderStatus,
  whatsappSent,
  paymentConfirmed,
  whatsappText,
  onOpenChange,
  onWhatsappSentChange,
  onPaymentConfirmedChange,
  onWhatsappTextChange,
  onCopyWhatsapp,
  onConfirm,
}: ConfirmationDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-blue-500" />
            {orderStatus === 'AwaitingPayment' ? 'Confirm Payment' : 'Send Order to Customer'}
          </DialogTitle>
          <DialogDescription>
            {orderStatus === 'AwaitingPayment'
              ? 'Verify payment before starting production.'
              : 'Send the order details and wait for customer confirmation.'}
          </DialogDescription>
        </DialogHeader>

        {/* Visual Stepper - Only show for Draft status */}
        {orderStatus === 'Draft' && (
          <div className="flex items-center justify-between mb-6 px-4">
            {/* Step 1: WhatsApp */}
            <div className="flex flex-col items-center">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                whatsappSent
                  ? "bg-green-500 text-white"
                  : "bg-muted text-muted-foreground"
              }`}>
                {whatsappSent ? <Check className="h-5 w-5" /> : "1"}
              </div>
              <span className="text-xs mt-1 text-muted-foreground">Send WA</span>
            </div>

            {/* Connector Line */}
            <div className={`flex-1 h-0.5 mx-2 ${
              whatsappSent ? "bg-green-500" : "bg-muted"
            }`} />

            {/* Step 2: Payment */}
            <div className="flex flex-col items-center">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                paymentConfirmed
                  ? "bg-green-500 text-white"
                  : whatsappSent
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
              }`}>
                {paymentConfirmed ? <Check className="h-5 w-5" /> : "2"}
              </div>
              <span className="text-xs mt-1 text-muted-foreground">Payment</span>
            </div>
          </div>
        )}

        <div className="space-y-4 py-2">
          {/* WhatsApp Message Preview - Only show for Draft → AwaitingPayment */}
          {orderStatus === 'Draft' && (
            <>
              <div className="space-y-2">
                <Label className="text-sm font-medium">WhatsApp Message to Send</Label>
                <Textarea
                  value={whatsappText}
                  onChange={(e) => onWhatsappTextChange(e.target.value)}
                  className="min-h-[180px] text-xs font-mono"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full"
                  onClick={onCopyWhatsapp}
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Copy Message
                </Button>
              </div>
              <Separator />
            </>
          )}

          {/* Checkboxes */}
          <div className="space-y-4">
            {/* WhatsApp checkbox - Only for Draft status */}
            {orderStatus === 'Draft' && (
              <div className="flex items-start space-x-3">
                <Checkbox
                  id="whatsapp-sent"
                  checked={whatsappSent}
                  onCheckedChange={(checked) => onWhatsappSentChange(checked === true)}
                />
                <div className="grid gap-1.5 leading-none">
                  <label
                    htmlFor="whatsapp-sent"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    I have sent this message to the customer
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Make sure the customer receives the order details and payment info
                  </p>
                </div>
              </div>
            )}

            {/* Payment checkbox - For AwaitingPayment → Confirmed or Direct confirmation */}
            {(orderStatus === 'AwaitingPayment' || (orderStatus === 'Draft' && whatsappSent)) && (
              <div className="flex items-start space-x-3">
                <Checkbox
                  id="payment-confirmed"
                  checked={paymentConfirmed}
                  onCheckedChange={(checked) => onPaymentConfirmedChange(checked === true)}
                />
                <div className="grid gap-1.5 leading-none">
                  <label
                    htmlFor="payment-confirmed"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Payment has been confirmed
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Customer has paid or confirmed payment arrangement
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={
              orderStatus === 'Draft'
                ? !whatsappSent  // Draft: just need WhatsApp sent to move to AwaitingPayment
                : !paymentConfirmed  // AwaitingPayment: just need payment confirmed
            }
          >
            <CheckCircle2 className="h-4 w-4 mr-2" />
            {orderStatus === 'AwaitingPayment' ? 'Confirm Payment' : 'Send to Customer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
