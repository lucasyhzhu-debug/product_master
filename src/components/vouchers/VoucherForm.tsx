/**
 * VoucherForm - Create/edit voucher form with discount type, validity, and usage settings.
 */
import type { VoucherFormState } from "./voucherUtils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { RefreshCw, Percent, Hash } from "lucide-react";

interface VoucherFormProps {
  form: VoucherFormState;
  setForm: React.Dispatch<React.SetStateAction<VoucherFormState>>;
  isEditing: boolean;
  isGeneratingCode: boolean;
  onGenerateCode: () => void;
  menuProducts: Array<{ id: string; name: string; code: string }>;
}

export function VoucherForm({
  form,
  setForm,
  isEditing,
  isGeneratingCode,
  onGenerateCode,
  menuProducts,
}: VoucherFormProps) {
  return (
    <div className="space-y-4 py-4">
      {/* Code */}
      <div className="space-y-2">
        <Label htmlFor="code">Voucher Code</Label>
        <div className="flex gap-2">
          <Input
            id="code"
            value={form.code}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                code: e.target.value.toUpperCase().replace(/\s+/g, "-"),
              }))
            }
            placeholder="PROMO-XXXX-XXXX"
            className="font-mono"
            disabled={isEditing}
          />
          {!isEditing && (
            <Button
              type="button"
              variant="outline"
              onClick={onGenerateCode}
              disabled={isGeneratingCode}
            >
              <RefreshCw
                className={cn("w-4 h-4", isGeneratingCode && "animate-spin")}
              />
            </Button>
          )}
        </div>
        {isEditing && (
          <p className="text-xs text-muted-foreground">
            Code cannot be changed after creation
          </p>
        )}
      </div>

      {/* Name */}
      <div className="space-y-2">
        <Label htmlFor="name">Name *</Label>
        <Input
          id="name"
          value={form.name}
          onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
          placeholder="Summer Sale 2026"
        />
      </div>

      {/* Description */}
      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={form.description}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, description: e.target.value }))
          }
          placeholder="Optional description for internal reference"
          rows={2}
        />
      </div>

      {/* Discount Type & Value */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Discount Type</Label>
          <Select
            value={form.discountType}
            onValueChange={(value: "amount" | "percentage") =>
              setForm((prev) => ({
                ...prev,
                discountType: value,
                // Reset linked product if switching away from fixed amount
                applicableMenuProductId: value === "percentage" ? "" : prev.applicableMenuProductId,
              }))
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="percentage">
                <div className="flex items-center gap-2">
                  <Percent className="w-4 h-4" />
                  Percentage
                </div>
              </SelectItem>
              <SelectItem value="amount">
                <div className="flex items-center gap-2">
                  <Hash className="w-4 h-4" />
                  Fixed Amount
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="discountValue">
            Discount Value *{" "}
            {form.discountType === "percentage" ? "(%)" : "(Rp)"}
          </Label>
          <Input
            id="discountValue"
            type="number"
            value={form.discountValue}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, discountValue: e.target.value }))
            }
            placeholder={form.discountType === "percentage" ? "10" : "50000"}
            min="0"
            max={form.discountType === "percentage" ? "100" : undefined}
          />
        </div>
      </div>

      {/* Linked Product (only for fixed amount discount) */}
      {form.discountType === "amount" && (
        <div className="space-y-2">
          <Label>Linked Product (optional)</Label>
          <Select
            value={form.applicableMenuProductId}
            onValueChange={(value) =>
              setForm((prev) => ({ ...prev, applicableMenuProductId: value }))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="No product link (applies to whole order)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">No product link (applies to whole order)</SelectItem>
              {menuProducts.map((product) => (
                <SelectItem key={product.id} value={product.id}>
                  {product.name} ({product.code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {form.applicableMenuProductId && (
            <p className="text-xs text-muted-foreground">
              {form.discountValue ? `Rp ${parseFloat(form.discountValue).toLocaleString("id-ID")}` : "..."} will be deducted from each unit of this product in the order
            </p>
          )}
        </div>
      )}

      {/* Constraints */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="minimumOrderAmount">Minimum Order (Rp)</Label>
          <Input
            id="minimumOrderAmount"
            type="number"
            value={form.minimumOrderAmount}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, minimumOrderAmount: e.target.value }))
            }
            placeholder="100000"
            min="0"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="maximumDiscount">Maximum Discount (Rp)</Label>
          <Input
            id="maximumDiscount"
            type="number"
            value={form.maximumDiscount}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, maximumDiscount: e.target.value }))
            }
            placeholder="50000"
            min="0"
          />
          <p className="text-xs text-muted-foreground">
            Cap for percentage discounts
          </p>
        </div>
      </div>

      {/* Validity Period */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="validFrom">Valid From</Label>
          <Input
            id="validFrom"
            type="date"
            value={form.validFrom}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, validFrom: e.target.value }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="validUntil">Valid Until</Label>
          <Input
            id="validUntil"
            type="date"
            value={form.validUntil}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, validUntil: e.target.value }))
            }
          />
        </div>
      </div>

      {/* Usage Limits */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="usageLimit">Total Usage Limit</Label>
          <Input
            id="usageLimit"
            type="number"
            value={form.usageLimit}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, usageLimit: e.target.value }))
            }
            placeholder="100"
            min="1"
          />
          <p className="text-xs text-muted-foreground">
            Leave empty for unlimited
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="usagePerCustomer">Usage Per Customer</Label>
          <Input
            id="usagePerCustomer"
            type="number"
            value={form.usagePerCustomer}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, usagePerCustomer: e.target.value }))
            }
            placeholder="1"
            min="1"
          />
          <p className="text-xs text-muted-foreground">
            Leave empty for unlimited
          </p>
        </div>
      </div>

      {/* Active Status */}
      <div className="flex items-center justify-between pt-2 border-t">
        <div>
          <Label htmlFor="isActive">Active</Label>
          <p className="text-xs text-muted-foreground">
            Inactive vouchers cannot be used
          </p>
        </div>
        <Switch
          id="isActive"
          checked={form.isActive}
          onCheckedChange={(checked: boolean) =>
            setForm((prev) => ({ ...prev, isActive: checked }))
          }
        />
      </div>
    </div>
  );
}
