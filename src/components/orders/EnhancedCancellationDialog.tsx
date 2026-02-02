import * as React from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { AlertTriangle, ArrowLeft, ArrowRight, Package, ShoppingCart, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CancellationCategory } from '@/lib/types';

// ============================================
// Types
// ============================================

export interface CancellationImpact {
  itemCount: number;
  productionUnitsAffected: number;
  hasProductionStarted: boolean;
  totalAmount: number;
}

interface EnhancedCancellationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderNumber: string;
  impact: CancellationImpact;
  onConfirm: (data: { category: CancellationCategory; reason: string }) => void;
}

// ============================================
// Cancellation Categories
// ============================================

const CANCELLATION_CATEGORIES: {
  value: CancellationCategory;
  label: string;
  description: string;
}[] = [
  {
    value: 'customer_request',
    label: 'Customer Request',
    description: 'Customer asked to cancel the order',
  },
  {
    value: 'out_of_stock',
    label: 'Out of Stock',
    description: 'Unable to fulfill due to inventory',
  },
  {
    value: 'payment_issue',
    label: 'Payment Issue',
    description: 'Payment not received or failed',
  },
  {
    value: 'duplicate',
    label: 'Duplicate Order',
    description: 'Order was placed multiple times',
  },
  {
    value: 'other',
    label: 'Other',
    description: 'Other reason (please specify)',
  },
];

// ============================================
// Step Components
// ============================================

function StepIndicator({
  currentStep,
  totalSteps,
}: {
  currentStep: number;
  totalSteps: number;
}) {
  return (
    <div className="flex items-center justify-center gap-2">
      {Array.from({ length: totalSteps }, (_, i) => (
        <div
          key={i}
          className={cn(
            'h-2 w-2 rounded-full transition-colors',
            i < currentStep ? 'bg-primary' : 'bg-muted'
          )}
        />
      ))}
    </div>
  );
}

// Step 1: Select Category
function CategoryStep({
  category,
  onCategoryChange,
}: {
  category: CancellationCategory | null;
  onCategoryChange: (value: CancellationCategory) => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Please select the reason for cancellation:
      </p>

      <RadioGroup
        value={category || ''}
        onValueChange={(value: string) => onCategoryChange(value as CancellationCategory)}
        className="space-y-3"
      >
        {CANCELLATION_CATEGORIES.map((cat) => (
          <div
            key={cat.value}
            className={cn(
              // Mobile: larger padding for touch targets (min 44px height)
              'flex items-start gap-3 rounded-lg border p-4 sm:p-3 cursor-pointer transition-colors min-h-[56px] sm:min-h-[48px]',
              category === cat.value && 'border-primary bg-primary/5'
            )}
            onClick={() => onCategoryChange(cat.value)}
          >
            <RadioGroupItem value={cat.value} id={cat.value} className="mt-0.5 h-5 w-5 sm:h-4 sm:w-4" />
            <div className="flex-1">
              <Label htmlFor={cat.value} className="font-medium cursor-pointer text-base sm:text-sm">
                {cat.label}
              </Label>
              <p className="text-sm sm:text-xs text-muted-foreground">{cat.description}</p>
            </div>
          </div>
        ))}
      </RadioGroup>
    </div>
  );
}

// Step 2: Impact Review
function ImpactStep({ impact }: { impact: CancellationImpact }) {
  const formatCurrency = (amount: number) => {
    return `IDR ${amount.toLocaleString('id-ID')}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-amber-600">
        <AlertTriangle className="h-5 w-5" />
        <span className="font-medium">Review Cancellation Impact</span>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
        <div className="flex items-center gap-3">
          <ShoppingCart className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="font-medium">{impact.itemCount} item(s)</p>
            <p className="text-sm text-muted-foreground">will be cancelled</p>
          </div>
        </div>

        {impact.hasProductionStarted && (
          <div className="flex items-center gap-3">
            <Package className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="font-medium text-amber-700">
                Production has started
              </p>
              <p className="text-sm text-muted-foreground">
                {impact.productionUnitsAffected} production unit(s) affected
              </p>
            </div>
          </div>
        )}

        <div className="pt-2 border-t border-amber-200">
          <p className="text-sm">
            Order total: <span className="font-medium">{formatCurrency(impact.totalAmount)}</span>
          </p>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        This action cannot be undone. All production records will be marked as cancelled.
      </p>
    </div>
  );
}

// Step 3: Confirmation
function ConfirmationStep({
  category,
  reason,
  onReasonChange,
  confirmed,
  onConfirmedChange,
  orderNumber,
}: {
  category: CancellationCategory;
  reason: string;
  onReasonChange: (reason: string) => void;
  confirmed: boolean;
  onConfirmedChange: (confirmed: boolean) => void;
  orderNumber: string;
}) {
  const categoryLabel = CANCELLATION_CATEGORIES.find((c) => c.value === category)?.label;
  const requiresReason = category === 'other';

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-red-600">
        <X className="h-5 w-5" />
        <span className="font-medium">Final Confirmation</span>
      </div>

      <div className="rounded-lg border p-4 space-y-3">
        <div>
          <p className="text-sm text-muted-foreground">Order</p>
          <p className="font-medium">{orderNumber}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Reason</p>
          <p className="font-medium">{categoryLabel}</p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="reason">
          Additional Notes {requiresReason ? '(Required)' : '(Optional)'}
        </Label>
        <Textarea
          id="reason"
          value={reason}
          onChange={(e) => onReasonChange(e.target.value)}
          placeholder="Provide more details about the cancellation..."
          rows={3}
        />
      </div>

      <div
        className={cn(
          // Mobile: larger padding for touch targets
          'flex items-start gap-3 rounded-lg border p-4 sm:p-3 cursor-pointer transition-colors min-h-[56px] sm:min-h-[48px]',
          confirmed && 'border-red-500 bg-red-50'
        )}
        onClick={() => onConfirmedChange(!confirmed)}
      >
        <Checkbox
          id="confirm"
          checked={confirmed}
          onCheckedChange={(checked) => onConfirmedChange(checked === true)}
          className="h-5 w-5 sm:h-4 sm:w-4"
        />
        <Label htmlFor="confirm" className="text-base sm:text-sm cursor-pointer leading-relaxed">
          I understand this action is permanent and will cancel order{' '}
          <span className="font-medium">{orderNumber}</span> along with all associated
          production records.
        </Label>
      </div>
    </div>
  );
}

// ============================================
// Main Component
// ============================================

export function EnhancedCancellationDialog({
  open,
  onOpenChange,
  orderNumber,
  impact,
  onConfirm,
}: EnhancedCancellationDialogProps) {
  const [step, setStep] = React.useState(1);
  const [category, setCategory] = React.useState<CancellationCategory | null>(null);
  const [reason, setReason] = React.useState('');
  const [confirmed, setConfirmed] = React.useState(false);

  const totalSteps = 3;

  // Reset state when dialog closes
  React.useEffect(() => {
    if (!open) {
      setStep(1);
      setCategory(null);
      setReason('');
      setConfirmed(false);
    }
  }, [open]);

  // Validation for each step
  const canProceed = React.useMemo(() => {
    switch (step) {
      case 1:
        return category !== null;
      case 2:
        return true; // Always can proceed from impact review
      case 3:
        const requiresReason = category === 'other';
        return confirmed && (!requiresReason || reason.trim().length > 0);
      default:
        return false;
    }
  }, [step, category, reason, confirmed]);

  const handleNext = () => {
    if (step < totalSteps) {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const handleConfirm = () => {
    if (category) {
      onConfirm({ category, reason });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <X className="h-5 w-5" />
            Cancel Order
          </DialogTitle>
          <DialogDescription>
            Order #{orderNumber}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="py-2">
          <StepIndicator currentStep={step} totalSteps={totalSteps} />
        </div>

        {/* Step content */}
        <div className="py-4">
          {step === 1 && (
            <CategoryStep
              category={category}
              onCategoryChange={setCategory}
            />
          )}
          {step === 2 && <ImpactStep impact={impact} />}
          {step === 3 && category && (
            <ConfirmationStep
              category={category}
              reason={reason}
              onReasonChange={setReason}
              confirmed={confirmed}
              onConfirmedChange={setConfirmed}
              orderNumber={orderNumber}
            />
          )}
        </div>

        <DialogFooter className="flex-row gap-2 sm:gap-2">
          {step > 1 ? (
            <Button variant="outline" onClick={handleBack} className="gap-2 min-h-[44px] sm:min-h-[36px] text-base sm:text-sm">
              <ArrowLeft className="h-5 w-5 sm:h-4 sm:w-4" />
              Back
            </Button>
          ) : (
            <Button variant="outline" onClick={() => onOpenChange(false)} className="min-h-[44px] sm:min-h-[36px] text-base sm:text-sm">
              Cancel
            </Button>
          )}

          {step < totalSteps ? (
            <Button onClick={handleNext} disabled={!canProceed} className="gap-2 min-h-[44px] sm:min-h-[36px] text-base sm:text-sm">
              Next
              <ArrowRight className="h-5 w-5 sm:h-4 sm:w-4" />
            </Button>
          ) : (
            <Button
              variant="destructive"
              onClick={handleConfirm}
              disabled={!canProceed}
              className="min-h-[44px] sm:min-h-[36px] text-base sm:text-sm"
            >
              Confirm Cancellation
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default EnhancedCancellationDialog;
