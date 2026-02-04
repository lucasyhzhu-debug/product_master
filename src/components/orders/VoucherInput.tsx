/**
 * VoucherInput - Voucher code input component for POS checkout
 * Allows applying voucher codes with real-time validation
 */
import { useState, useEffect } from "react";
import { Ticket, X, Check, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils";
import { useVoucherValidation } from "@/hooks/convex/useVouchers";
import type { Id } from "../../../convex/_generated/dataModel";

interface VoucherInputProps {
  subtotal: number;
  customerId?: Id<"customers">;
  appliedVoucher: AppliedVoucher | null;
  onApplyVoucher: (voucher: AppliedVoucher) => void;
  onRemoveVoucher: () => void;
  disabled?: boolean;
}

export interface AppliedVoucher {
  id: string;
  code: string;
  name: string;
  discountType: "amount" | "percentage";
  discountValue: number;
  calculatedDiscount: number;
}

export function VoucherInput({
  subtotal,
  customerId,
  appliedVoucher,
  onApplyVoucher,
  onRemoveVoucher,
  disabled = false,
}: VoucherInputProps) {
  const [code, setCode] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounce the code input for validation
  const [debouncedCode, setDebouncedCode] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedCode(code.trim().toUpperCase());
    }, 500);
    return () => clearTimeout(timer);
  }, [code]);

  // Validate voucher code in real-time
  const validationResult = useVoucherValidation(
    debouncedCode && !appliedVoucher ? debouncedCode : undefined,
    subtotal,
    customerId
  );

  // Update loading state based on validation
  useEffect(() => {
    if (debouncedCode && !appliedVoucher) {
      setIsValidating(validationResult === undefined);
    } else {
      setIsValidating(false);
    }
  }, [debouncedCode, validationResult, appliedVoucher]);

  // Clear error when code changes
  useEffect(() => {
    setError(null);
  }, [code]);

  const handleApply = () => {
    if (!validationResult) {
      setError("Please wait for validation");
      return;
    }

    if (!validationResult.valid) {
      setError(validationResult.error || "Invalid voucher");
      return;
    }

    if (!validationResult.voucher) {
      setError("Voucher data unavailable");
      return;
    }

    const voucher = validationResult.voucher;
    onApplyVoucher({
      id: voucher._id,
      code: voucher.code,
      name: voucher.name,
      discountType: voucher.discountType,
      discountValue: voucher.discountValue,
      calculatedDiscount: voucher.calculatedDiscount,
    });
    setCode("");
    setError(null);
  };

  const handleRemove = () => {
    onRemoveVoucher();
    setCode("");
    setError(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !disabled && validationResult?.valid) {
      e.preventDefault();
      handleApply();
    }
  };

  // If voucher is applied, show the applied state
  if (appliedVoucher) {
    return (
      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          <Ticket className="w-4 h-4" />
          Voucher Applied
        </Label>
        <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-md">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-green-600" />
            <div>
              <div className="font-medium text-green-700 dark:text-green-300">
                {appliedVoucher.code}
              </div>
              <div className="text-sm text-green-600 dark:text-green-400">
                {appliedVoucher.name}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="bg-green-100 text-green-700">
              -{formatCurrency(appliedVoucher.calculatedDiscount)}
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-100"
              onClick={handleRemove}
              disabled={disabled}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Show input state
  const isValid = validationResult?.valid === true;
  const showValidIndicator = debouncedCode && !isValidating && validationResult;

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-2">
        <Ticket className="w-4 h-4" />
        Voucher Code
      </Label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={handleKeyDown}
            placeholder="Enter code (e.g., PROMO-XXXX)"
            className={cn(
              "font-mono pr-10",
              isValid && "border-green-500 focus-visible:ring-green-500",
              error && "border-destructive"
            )}
            disabled={disabled}
          />
          {/* Status indicator */}
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            {isValidating && (
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            )}
            {showValidIndicator && isValid && (
              <Check className="w-4 h-4 text-green-500" />
            )}
            {showValidIndicator && !isValid && (
              <AlertCircle className="w-4 h-4 text-destructive" />
            )}
          </div>
        </div>
        <Button
          onClick={handleApply}
          disabled={disabled || !isValid || isValidating}
        >
          Apply
        </Button>
      </div>

      {/* Error or validation message */}
      {error && (
        <p className="text-sm text-destructive flex items-center gap-1">
          <AlertCircle className="w-3 h-3" />
          {error}
        </p>
      )}
      {showValidIndicator && !isValid && !error && validationResult?.error && (
        <p className="text-sm text-destructive flex items-center gap-1">
          <AlertCircle className="w-3 h-3" />
          {validationResult.error}
        </p>
      )}
      {showValidIndicator && isValid && validationResult?.voucher && (
        <p className="text-sm text-green-600 flex items-center gap-1">
          <Check className="w-3 h-3" />
          {validationResult.voucher.discountType === "percentage"
            ? `${validationResult.voucher.discountValue}% off`
            : formatCurrency(validationResult.voucher.discountValue) + " off"}{" "}
          - saves {formatCurrency(validationResult.voucher.calculatedDiscount)}
        </p>
      )}
    </div>
  );
}
