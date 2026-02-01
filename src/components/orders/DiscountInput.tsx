import { useState, useEffect, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface DiscountInputProps {
  subtotal: number;
  discountAmount: number;
  discountType: 'amount' | 'percentage';
  onChange: (amount: number, type: 'amount' | 'percentage') => void;
}

export function DiscountInput({
  subtotal,
  discountAmount,
  discountType: _discountType, // Currently unused but kept for API compatibility
  onChange,
}: DiscountInputProps) {
  // Note: _discountType is available for future use if needed
  // Local state for input values
  const [amountValue, setAmountValue] = useState(discountAmount.toString());
  const [percentValue, setPercentValue] = useState('0');

  // Track which field was last edited to prevent infinite loops
  const lastEditedRef = useRef<'amount' | 'percentage' | null>(null);

  // Debounce timer
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Calculate current percentage for warning
  const currentPercent = subtotal > 0 ? (discountAmount / subtotal) * 100 : 0;

  // Initialize percentage value when discount amount or subtotal changes
  useEffect(() => {
    if (subtotal > 0 && lastEditedRef.current !== 'percentage') {
      const calculatedPercent = (discountAmount / subtotal) * 100;
      setPercentValue(calculatedPercent.toFixed(2));
    }
    if (lastEditedRef.current !== 'amount') {
      setAmountValue(discountAmount.toString());
    }
  }, [discountAmount, subtotal]);

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setAmountValue(value);
    lastEditedRef.current = 'amount';

    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Debounce the onChange call
    debounceTimerRef.current = setTimeout(() => {
      const numValue = parseFloat(value) || 0;

      // Clamp amount between 0 and subtotal
      const clampedAmount = Math.max(0, Math.min(numValue, subtotal));

      // Update percentage display
      if (subtotal > 0) {
        const calculatedPercent = (clampedAmount / subtotal) * 100;
        setPercentValue(calculatedPercent.toFixed(2));
      }

      onChange(clampedAmount, 'amount');
    }, 300);
  };

  const handlePercentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setPercentValue(value);
    lastEditedRef.current = 'percentage';

    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Debounce the onChange call
    debounceTimerRef.current = setTimeout(() => {
      const numValue = parseFloat(value) || 0;

      // Clamp percentage between 0 and 100
      const clampedPercent = Math.max(0, Math.min(numValue, 100));

      // Calculate amount from percentage for display
      const calculatedAmount = subtotal * (clampedPercent / 100);

      // Update amount display
      setAmountValue(calculatedAmount.toFixed(0));

      // Pass the percentage value (not the calculated amount) when type is 'percentage'
      onChange(clampedPercent, 'percentage');
    }, 300);
  };

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  return (
    <div className="space-y-2">
      <Label>Order Discount</Label>
      <div className="flex items-center gap-2">
        <div className="flex items-center">
          <span className="text-sm text-muted-foreground mr-1">Rp</span>
          <Input
            type="number"
            value={amountValue}
            onChange={handleAmountChange}
            className="w-28"
            min={0}
            max={subtotal}
            step="1000"
          />
        </div>
        <span className="text-muted-foreground">or</span>
        <div className="flex items-center">
          <Input
            type="number"
            value={percentValue}
            onChange={handlePercentChange}
            className="w-20"
            min={0}
            max={100}
            step="0.1"
            disabled={subtotal === 0}
          />
          <span className="text-sm text-muted-foreground ml-1">%</span>
        </div>
      </div>

      {currentPercent > 30 && (
        <div className="flex items-start gap-2 p-3 rounded-md bg-amber-50 border border-amber-500">
          <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-amber-700">
            High discount ({currentPercent.toFixed(1)}%) - please confirm
          </p>
        </div>
      )}
    </div>
  );
}
