import * as React from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown, CreditCard, QrCode, Banknote, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================
// Types
// ============================================

export type PaymentMethod = 'BCA' | 'QRIS' | 'Cash' | 'Other' | string;

interface PaymentMethodButtonsProps {
  value?: PaymentMethod | null;
  onChange: (method: PaymentMethod) => void;
  disabled?: boolean;
  className?: string;
}

// ============================================
// Payment Method Icons
// ============================================

const PAYMENT_ICONS: Record<string, React.ReactNode> = {
  BCA: <CreditCard className="h-4 w-4" />,
  QRIS: <QrCode className="h-4 w-4" />,
  Cash: <Banknote className="h-4 w-4" />,
};

// Primary payment methods (shown as buttons)
const PRIMARY_METHODS: PaymentMethod[] = ['BCA', 'QRIS', 'Cash'];

// Secondary payment methods (shown in dropdown)
const SECONDARY_METHODS: PaymentMethod[] = ['Mandiri', 'BNI', 'GoPay', 'OVO', 'Dana'];

// ============================================
// Main Component
// ============================================

export function PaymentMethodButtons({
  value,
  onChange,
  disabled = false,
  className,
}: PaymentMethodButtonsProps) {
  const [dropdownOpen, setDropdownOpen] = React.useState(false);

  // Check if current value is a secondary method
  const isSecondarySelected = value && !PRIMARY_METHODS.includes(value) && value !== 'Other';

  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {/* Primary payment method buttons */}
      {PRIMARY_METHODS.map((method) => (
        <Button
          key={method}
          type="button"
          variant={value === method ? 'default' : 'outline'}
          size="sm"
          disabled={disabled}
          onClick={() => onChange(method)}
          className={cn(
            'gap-2 min-w-[80px]',
            value === method && 'ring-2 ring-primary ring-offset-1'
          )}
        >
          {PAYMENT_ICONS[method]}
          {method}
        </Button>
      ))}

      {/* More dropdown for secondary methods */}
      <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant={isSecondarySelected ? 'default' : 'outline'}
            size="sm"
            disabled={disabled}
            className={cn(
              'gap-1 min-w-[80px]',
              isSecondarySelected && 'ring-2 ring-primary ring-offset-1'
            )}
          >
            {isSecondarySelected ? (
              value
            ) : (
              <>
                <MoreHorizontal className="h-4 w-4" />
                More
              </>
            )}
            <ChevronDown className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[120px]">
          {SECONDARY_METHODS.map((method) => (
            <DropdownMenuItem
              key={method}
              onClick={() => {
                onChange(method);
                setDropdownOpen(false);
              }}
              className={cn(
                'cursor-pointer',
                value === method && 'bg-accent font-medium'
              )}
            >
              {method}
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem
            onClick={() => {
              onChange('Other');
              setDropdownOpen(false);
            }}
            className={cn(
              'cursor-pointer',
              value === 'Other' && 'bg-accent font-medium'
            )}
          >
            Other...
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export default PaymentMethodButtons;
