import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const SHIPPING_AGENCIES = [
  'Gojek',
  'GrabSend',
  'JNE',
  'J&T',
  'SiCepat',
  'AnterAja',
  'Paxel',
  'Lalamove',
  'Other',
];

interface ShippingDialogProps {
  open: boolean;
  shippingAgency: string;
  shippingNumber: string;
  onOpenChange: (open: boolean) => void;
  onShippingAgencyChange: (agency: string) => void;
  onShippingNumberChange: (number: string) => void;
  onSave: () => void;
}

export function ShippingDialog({
  open,
  shippingAgency,
  shippingNumber,
  onOpenChange,
  onShippingAgencyChange,
  onShippingNumberChange,
  onSave,
}: ShippingDialogProps) {
  const isCustomAgency = !SHIPPING_AGENCIES.slice(0, -1).includes(shippingAgency) || shippingAgency === 'Other';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update Shipping Info</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Agency / Courier</Label>
            <Select onValueChange={onShippingAgencyChange}>
              <SelectTrigger>
                <SelectValue placeholder={shippingAgency || "Select courier"} />
              </SelectTrigger>
              <SelectContent>
                {SHIPPING_AGENCIES.map((agency) => (
                  <SelectItem key={agency} value={agency}>
                    {agency}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isCustomAgency && (
              <Input
                className="mt-2"
                value={shippingAgency === 'Other' ? '' : shippingAgency}
                onChange={(e) => onShippingAgencyChange(e.target.value)}
                placeholder="Enter courier name"
              />
            )}
          </div>
          <div className="space-y-2">
            <Label>Tracking / Reference Number</Label>
            <Input
              value={shippingNumber}
              onChange={(e) => onShippingNumberChange(e.target.value)}
              placeholder="Receipt number"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onSave}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
