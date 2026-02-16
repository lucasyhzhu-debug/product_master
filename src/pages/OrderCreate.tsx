import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Send, Loader2, Package, User, MapPin, Calendar, FileText, Ticket, ShieldCheck, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { CustomerSearch } from '@/components/orders/CustomerSearch';
import { DueDatePills } from '@/components/orders/DueDatePills';
import { QuickAddressButtons } from '@/components/orders/QuickAddressButtons';
import { ProductButtons, type ProductButtonProduct } from '@/components/orders/ProductButtons';
import { VoucherInput, type AppliedVoucher } from '@/components/orders/VoucherInput';
import { ManagerOverrideDialog } from '@/components/orders/ManagerOverrideDialog';
import { LowPriceWarningDialog } from '@/components/orders/LowPriceWarningDialog';
import {
  useConvexPosProducts,
  useConvexPackagingPosProducts,
  useConvexCreateOrder,
  useConvexUpdateOrderStatus,
  type OrderCreateInput,
} from '@/hooks/convex';
import { useAuth } from '@/contexts/AuthContext';
import { formatCurrency } from '@/lib/utils';
import { toast } from 'sonner';
import type { OrderLineItem } from '@/lib/types';
import type { Id } from '../../convex/_generated/dataModel';
import { PageHeader } from '@/components/layout';

// Low price threshold (Rp 20,000)
const LOW_PRICE_THRESHOLD = 20000;

export function OrderCreate() {
  const navigate = useNavigate();
  const { hasPermission, user } = useAuth();
  const canCreateOverride = hasPermission("canCreateOverrideVoucher");

  // ============================================
  // State
  // ============================================

  // Customer
  const [customerId, setCustomerId] = useState<Id<"customers"> | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [isNewCustomer, setIsNewCustomer] = useState(false);
  const [customerSet, setCustomerSet] = useState(false);

  // Due date
  const [dueDate, setDueDate] = useState<number | undefined>(undefined);

  // Delivery
  const [deliveryAddress, setDeliveryAddress] = useState('');

  // Items
  const [items, setItems] = useState<OrderLineItem[]>([]);

  // Voucher
  const [appliedVoucher, setAppliedVoucher] = useState<AppliedVoucher | null>(null);

  // Notes
  const [notes, setNotes] = useState('');

  // Low price
  const [showLowPriceWarning, setShowLowPriceWarning] = useState(false);
  const [lowPriceConfirmed, setLowPriceConfirmed] = useState(false);

  // Manager override
  const [showManagerOverride, setShowManagerOverride] = useState(false);

  // Submission
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Auto-save draft ID (for future use when auto-save is implemented)
  const [draftOrderId] = useState<Id<"orders"> | null>(null);

  // ============================================
  // Queries & Mutations
  // ============================================

  const { data: posProductsData, isLoading: productsLoading } = useConvexPosProducts();
  const posProducts = posProductsData ?? [];

  const { data: packagingProductsData } = useConvexPackagingPosProducts();
  const packagingProducts = packagingProductsData ?? [];

  const createOrder = useConvexCreateOrder();
  const updateOrderStatus = useConvexUpdateOrderStatus();

  // ============================================
  // Calculated Values
  // ============================================

  const subtotal = useMemo(
    () => items.reduce((sum, item) => sum + item.lineTotal, 0),
    [items]
  );

  const totalDiscountValue = appliedVoucher?.calculatedDiscount ?? 0;
  const total = subtotal - totalDiscountValue;
  const isLowPrice = total > 0 && total < LOW_PRICE_THRESHOLD;
  const hasItems = items.length > 0;

  // ============================================
  // Handlers
  // ============================================

  const handleCustomerSelect = useCallback((id: Id<"customers">, name: string, phone?: string) => {
    setCustomerId(id);
    setCustomerName(name);
    setCustomerPhone(phone ?? '');
    setIsNewCustomer(false);
    setCustomerSet(true);
  }, []);

  const handleNewCustomer = useCallback((name: string, phone?: string) => {
    setCustomerId(null);
    setCustomerName(name);
    setCustomerPhone(phone ?? '');
    setIsNewCustomer(true);
    setCustomerSet(true);
  }, []);

  const handleAddProduct = useCallback((product: ProductButtonProduct, quantity: number) => {
    setAppliedVoucher(null);
    setLowPriceConfirmed(false);

    setItems((prev) => {
      const existing = prev.find((i) => i.productId === product._id);
      if (existing) {
        return prev.map((i) =>
          i.productId === product._id
            ? { ...i, quantity: i.quantity + quantity, lineTotal: (i.quantity + quantity) * i.unitPrice }
            : i
        );
      }
      return [
        ...prev,
        {
          productId: product._id,
          productCode: product.code,
          productName: product.name,
          grams: product.grams ?? 0,
          quantity,
          unitPrice: product.defaultPrice,
          unitCost: product.unitCost || 0,
          lineTotal: product.defaultPrice * quantity,
        },
      ];
    });
  }, []);

  const updateItemQuantity = useCallback((productId: string, delta: number) => {
    setAppliedVoucher(null);
    setLowPriceConfirmed(false);
    setItems((prev) =>
      prev.map((item) => {
        if (item.productId === productId) {
          const newQty = Math.max(1, item.quantity + delta);
          return { ...item, quantity: newQty, lineTotal: newQty * item.unitPrice };
        }
        return item;
      })
    );
  }, []);

  const removeItem = useCallback((productId: string) => {
    setAppliedVoucher(null);
    setLowPriceConfirmed(false);
    setItems((prev) => prev.filter((item) => item.productId !== productId));
  }, []);

  const handleQuickAddress = useCallback((address: string, _type: string) => {
    setDeliveryAddress(address);
  }, []);

  const handleApplyVoucher = useCallback((voucher: AppliedVoucher) => {
    setAppliedVoucher(voucher);
    setLowPriceConfirmed(false);
  }, []);

  const handleRemoveVoucher = useCallback(() => {
    setAppliedVoucher(null);
    setLowPriceConfirmed(false);
  }, []);

  const handleOverrideCreated = useCallback((voucher: {
    id: string;
    code: string;
    discountType: "amount" | "percentage";
    discountValue: number;
    calculatedDiscount: number;
  }) => {
    setAppliedVoucher({
      id: voucher.id,
      code: voucher.code,
      name: "Manager Override",
      discountType: voucher.discountType,
      discountValue: voucher.discountValue,
      calculatedDiscount: voucher.calculatedDiscount,
    });
    setLowPriceConfirmed(false);
  }, []);

  const handleSubmit = async () => {
    if (!hasItems) {
      toast.error('Add at least one product');
      return;
    }
    if (!customerSet) {
      toast.error('Select or create a customer first');
      return;
    }
    if (isLowPrice && !lowPriceConfirmed) {
      setShowLowPriceWarning(true);
      return;
    }
    await executeSubmit();
  };

  const handleLowPriceConfirm = async () => {
    setLowPriceConfirmed(true);
    setShowLowPriceWarning(false);
    await executeSubmit();
  };

  const executeSubmit = async () => {
    setIsSubmitting(true);
    try {
      // If we already have a draft, submit it (move to AwaitingPayment)
      if (draftOrderId) {
        await updateOrderStatus.mutate({
          orderId: draftOrderId,
          status: 'AwaitingPayment',
          userId: user?.userId as Id<"users"> | undefined,
        });
        toast.success('Order submitted');
        navigate(`/orders?open=${draftOrderId}`);
        return;
      }

      // Create new order as Draft, then submit
      const orderData: OrderCreateInput = {
        customerId: !isNewCustomer && customerId ? customerId : undefined,
        newCustomer: isNewCustomer ? { name: customerName, phone: customerPhone || undefined } : undefined,
        deliveryAddress: deliveryAddress || undefined,
        dueDate: dueDate || undefined,
        notes: notes || undefined,
        voucherCode: appliedVoucher?.code,
        lowPriceConfirmed: lowPriceConfirmed || undefined,
        items: items.map((item) => ({
          productName: item.productName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          unitCost: item.unitCost || 0,
          menuProductId: item.productId as Id<"menuProducts">,
        })),
      };

      const orderId = await createOrder.mutateAsync({
        ...orderData,
        createdByUserId: user?.userId as Id<"users"> | undefined,
        createdBy: user?.name ?? "admin",
      });
      const orderIdTyped = orderId as unknown as Id<"orders">;

      // Move to AwaitingPayment
      await updateOrderStatus.mutate({
        orderId: orderIdTyped,
        status: 'AwaitingPayment',
        userId: user?.userId as Id<"users"> | undefined,
      });

      toast.success('Order submitted');
      // Navigate with open param to auto-open slide-over for the new order
      navigate(`/orders?open=${orderIdTyped}`);
    } catch (error) {
      console.error('Failed to submit order:', error);
      const message = error instanceof Error ? error.message : 'Failed to submit order';
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ============================================
  // Render
  // ============================================

  if (productsLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <PageHeader title="New Order" description="Create a new order" backTo="/orders" backLabel="Orders" />

      {/* 1. Customer Section (TOP) */}
      <Card className="p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-9 w-9 rounded-full bg-blue-50 flex items-center justify-center">
            <User className="h-4 w-4 text-blue-600" />
          </div>
          <div>
            <h3 className="text-base font-semibold">Customer</h3>
            <p className="text-xs text-muted-foreground">Who is this order for?</p>
          </div>
        </div>
        <CustomerSearch
          onCustomerSelect={handleCustomerSelect}
          onNewCustomer={handleNewCustomer}
        />
      </Card>

      {/* 2. Due Date Section */}
      <Card className="p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-9 w-9 rounded-full bg-amber-50 flex items-center justify-center">
            <Calendar className="h-4 w-4 text-amber-600" />
          </div>
          <div>
            <h3 className="text-base font-semibold">Due Date</h3>
            <p className="text-xs text-muted-foreground">When should this order be ready?</p>
          </div>
        </div>
        <DueDatePills value={dueDate} onChange={setDueDate} />
      </Card>

      {/* 3. Delivery / Pickup Section */}
      <Card className="p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-9 w-9 rounded-full bg-purple-50 flex items-center justify-center">
            <MapPin className="h-4 w-4 text-purple-600" />
          </div>
          <div>
            <h3 className="text-base font-semibold">Delivery / Pickup</h3>
            <p className="text-xs text-muted-foreground">Where should this order go?</p>
          </div>
        </div>

        <div className="space-y-3">
          <input
            type="text"
            value={deliveryAddress}
            onChange={(e) => setDeliveryAddress(e.target.value)}
            placeholder="Enter delivery address or pickup location..."
            className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />

          <QuickAddressButtons onSelect={handleQuickAddress} />
        </div>
      </Card>

      {/* 4. Items Section (POS Grid) */}
      <Card className="p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-9 w-9 rounded-full bg-[var(--color-brand)]/10 flex items-center justify-center">
            <Package className="h-4 w-4 text-[var(--color-brand)]" />
          </div>
          <div>
            <h3 className="text-base font-semibold">Products</h3>
            <p className="text-xs text-muted-foreground">Tap to add, long-press for quantity</p>
          </div>
        </div>

        <ProductButtons
          products={posProducts}
          onAddProduct={handleAddProduct}
          label={packagingProducts.length > 0 ? "Food" : undefined}
        />

        {packagingProducts.length > 0 && (
          <div className="mt-4">
            <ProductButtons
              products={packagingProducts.map((p) => ({
                _id: p._id,
                code: p.code,
                name: p.name,
                defaultPrice: p.defaultPrice,
                unitCost: p.unitCost,
              }))}
              onAddProduct={handleAddProduct}
              label="Packaging"
            />
          </div>
        )}

        {/* Order Items List */}
        {items.length > 0 && (
          <div className="mt-5 space-y-2">
            <Separator />
            <div className="flex items-center justify-between mt-3 mb-2">
              <Label className="text-sm font-semibold text-foreground/80">Order Items</Label>
              <Badge variant="secondary" className="text-xs">
                {items.length} {items.length === 1 ? 'item' : 'items'}
              </Badge>
            </div>
            {items.map((item) => (
              <div
                key={item.productId}
                className="group flex items-center justify-between p-3 rounded-lg border bg-muted/30 hover:border-primary/30 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{item.productName}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.quantity} x {formatCurrency(item.unitPrice)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => updateItemQuantity(item.productId, -1)}
                      disabled={item.quantity <= 1}
                    >
                      -
                    </Button>
                    <span className="w-8 text-center text-sm font-bold">{item.quantity}</span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => updateItemQuantity(item.productId, 1)}
                    >
                      +
                    </Button>
                  </div>
                  <span className="text-sm font-bold text-primary min-w-[80px] text-right">
                    {formatCurrency(item.lineTotal)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive opacity-0 group-hover:opacity-100"
                    onClick={() => removeItem(item.productId)}
                  >
                    x
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {items.length === 0 && (
          <div className="mt-5 p-6 text-center rounded-lg border-2 border-dashed border-border">
            <Package className="h-10 w-10 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No products added yet</p>
            <p className="text-xs text-muted-foreground mt-1">Click the buttons above to add products</p>
          </div>
        )}
      </Card>

      {/* 5. Voucher Section */}
      <Card className="p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-9 w-9 rounded-full bg-emerald-50 flex items-center justify-center">
            <Ticket className="h-4 w-4 text-emerald-600" />
          </div>
          <div>
            <h3 className="text-base font-semibold">Voucher</h3>
            <p className="text-xs text-muted-foreground">Apply discount code</p>
          </div>
        </div>

        <VoucherInput
          subtotal={subtotal}
          customerId={customerId ?? undefined}
          appliedVoucher={appliedVoucher}
          onApplyVoucher={handleApplyVoucher}
          onRemoveVoucher={handleRemoveVoucher}
          disabled={isSubmitting || subtotal === 0}
        />

        {canCreateOverride && !appliedVoucher && subtotal > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="w-full mt-3 border-primary text-primary hover:bg-primary/10"
            onClick={() => setShowManagerOverride(true)}
          >
            <ShieldCheck className="h-4 w-4 mr-2" />
            Manager Override
          </Button>
        )}
      </Card>

      {/* 6. Notes Section */}
      <Card className="p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-9 w-9 rounded-full bg-slate-100 flex items-center justify-center">
            <FileText className="h-4 w-4 text-slate-600" />
          </div>
          <div>
            <h3 className="text-base font-semibold">Notes</h3>
            <p className="text-xs text-muted-foreground">Special instructions (optional)</p>
          </div>
        </div>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Any special instructions..."
          rows={2}
          className="resize-none"
        />
      </Card>

      {/* 7. Summary + Submit */}
      <Card className="p-5 border-2">
        <h3 className="text-lg font-bold mb-3">Order Summary</h3>

        {totalDiscountValue > 0 && appliedVoucher && (
          <>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-semibold">{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm text-emerald-600 mb-2">
              <span>Voucher ({appliedVoucher.code})</span>
              <span className="font-semibold">- {formatCurrency(totalDiscountValue)}</span>
            </div>
            <Separator className="my-2" />
          </>
        )}

        <div className="flex justify-between items-center mb-4">
          <span className="text-lg font-bold">Total</span>
          <span className={`text-2xl font-bold ${isLowPrice ? 'text-amber-600' : 'text-primary'}`}>
            {formatCurrency(total)}
          </span>
        </div>

        {isLowPrice && (
          <p className="text-xs text-amber-600 mb-3">
            Order total is below Rp 20,000. Confirmation will be required.
          </p>
        )}

        {/* Validation warnings */}
        {(!hasItems || !customerSet) && (
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-2 mb-4">
            <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <div className="text-xs text-amber-800">
              {!hasItems && <p>Add at least one product</p>}
              {!customerSet && <p>Select or create a customer</p>}
            </div>
          </div>
        )}

        <Button
          className="w-full h-12 text-base font-semibold"
          onClick={handleSubmit}
          disabled={isSubmitting || !hasItems || !customerSet || total <= 0}
          size="lg"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Submitting...
            </>
          ) : (
            <>
              <Send className="h-5 w-5 mr-2" />
              Submit Order
            </>
          )}
        </Button>
      </Card>

      {/* Dialogs */}
      <ManagerOverrideDialog
        open={showManagerOverride}
        onOpenChange={setShowManagerOverride}
        subtotal={subtotal}
        onOverrideCreated={handleOverrideCreated}
      />

      <LowPriceWarningDialog
        open={showLowPriceWarning}
        onOpenChange={setShowLowPriceWarning}
        finalPrice={total}
        originalPrice={subtotal}
        discountAmount={totalDiscountValue}
        onConfirm={handleLowPriceConfirm}
        isSubmitting={isSubmitting}
      />
    </div>
  );
}
