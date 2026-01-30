import { Copy, Check, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { OrderStatus } from '@/lib/types';

interface OrderWhatsAppPanelProps {
  status: OrderStatus;
  receiptText: string;
  shippingText: string;
  pickupText: string;
  copied: boolean;
  onReceiptChange: (text: string) => void;
  onShippingChange: (text: string) => void;
  onPickupChange: (text: string) => void;
  onCopy: (text: string) => void;
}

export function OrderWhatsAppPanel({
  status,
  receiptText,
  shippingText,
  pickupText,
  copied,
  onReceiptChange,
  onShippingChange,
  onPickupChange,
  onCopy,
}: OrderWhatsAppPanelProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />
          WhatsApp Messages
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Receipt */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Order Receipt</Label>
          <Textarea
            value={receiptText}
            onChange={(e) => onReceiptChange(e.target.value)}
            className="min-h-[100px] text-xs font-mono"
          />
          <Button
            variant="secondary"
            className="w-full justify-start"
            onClick={() => onCopy(receiptText)}
          >
            <Copy className="h-4 w-4 mr-2" />
            Copy Receipt
          </Button>
        </div>

        {/* Shipping Info */}
        {(status === 'WaitingShipment' || status === 'CompleteShipped') && (
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Shipping / Courier Info</Label>
            <Textarea
              value={shippingText}
              onChange={(e) => onShippingChange(e.target.value)}
              className="min-h-[100px] text-xs font-mono"
            />
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => onCopy(shippingText)}
            >
              <Copy className="h-4 w-4 mr-2" />
              Copy Info
            </Button>
          </div>
        )}

        {/* Pickup Ready */}
        {status === 'WaitingPickup' && (
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Pickup Ready</Label>
            <Textarea
              value={pickupText}
              onChange={(e) => onPickupChange(e.target.value)}
              className="min-h-[100px] text-xs font-mono"
            />
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => onCopy(pickupText)}
            >
              <Copy className="h-4 w-4 mr-2" />
              Copy Pickup Info
            </Button>
          </div>
        )}

        {copied && (
          <div className="flex items-center justify-center text-sm text-green-600 animate-in fade-in slide-in-from-bottom-2">
            <Check className="h-4 w-4 mr-1" />
            Copied to clipboard!
          </div>
        )}
      </CardContent>
    </Card>
  );
}
