import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { OrderStatus, PaymentStatus } from '@/lib/types';

const STATUS_OPTIONS: OrderStatus[] = [
  'Draft',
  'AwaitingPayment',
  'Confirmed',
  'InProduction',       // PRD-7: Kitchen actively producing
  'ProductionComplete', // DEPRECATED: Use Packaging instead
  'Packaging',
  'WaitingShipment',
  'CompleteShipped',
  'WaitingPickup',
  'PickedUp',
  'Cancelled',
];

const PAYMENT_OPTIONS: PaymentStatus[] = ['Unpaid', 'Partial', 'Paid'];
const PAYMENT_METHODS = ['BCA', 'QRIS', 'Cash', 'Other'];

interface OrderStatusPanelProps {
  currentStatus: OrderStatus;
  currentPaymentStatus: PaymentStatus;
  currentPaymentMethod: string | null;
  onStatusChange: (status: string) => void;
  onPaymentStatusChange: (status: string) => void;
  onPaymentMethodChange: (method: string) => void;
}

export function OrderStatusPanel({
  currentStatus,
  currentPaymentStatus,
  currentPaymentMethod,
  onStatusChange,
  onPaymentStatusChange,
  onPaymentMethodChange,
}: OrderStatusPanelProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Update Status</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm text-muted-foreground">Order Status</label>
          <Select value={currentStatus} onValueChange={onStatusChange}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((status) => (
                <SelectItem key={status} value={status}>
                  {status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-sm text-muted-foreground">Payment Status</label>
          <Select value={currentPaymentStatus} onValueChange={onPaymentStatusChange}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAYMENT_OPTIONS.map((status) => (
                <SelectItem key={status} value={status}>
                  {status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-sm text-muted-foreground">Payment Method</label>
          <Select
            value={currentPaymentMethod || ''}
            onValueChange={onPaymentMethodChange}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select method" />
            </SelectTrigger>
            <SelectContent>
              {PAYMENT_METHODS.map((method) => (
                <SelectItem key={method} value={method}>
                  {method}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}
