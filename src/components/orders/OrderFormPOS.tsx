import { useState, useMemo } from 'react';
import { Clipboard, Send, X, Plus, Minus, Trash2, HelpCircle, Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Textarea } from '@/components/ui/textarea';
import { ProductButtons } from './ProductButtons';
import { PasteTemplateBox } from './PasteTemplateBox';
import { DiscountInput } from './DiscountInput';
import { DeliveryToggle } from './DeliveryToggle';
import { VoucherInput, type AppliedVoucher } from './VoucherInput';
import { ManagerOverrideDialog } from './ManagerOverrideDialog';
import { LowPriceWarningDialog } from './LowPriceWarningDialog';
import {
  useConvexPosProducts,
  useConvexCreateOrder,
  useConvexCustomerSearch,
  useConvexOrderTemplate,
  type OrderCreateInput,
  type PosProduct,
} from '@/hooks/convex';
import { useAuth } from '@/contexts/AuthContext';
import type { ParseResult } from '@/lib/orderTemplateParser';
import type { OrderLineItem } from '@/lib/types';
import type { Id } from '../../../convex/_generated/dataModel';
import { formatCurrency } from '@/lib/utils';
import { toast } from 'sonner';

// Low price threshold (Rp 20,000)
const LOW_PRICE_THRESHOLD = 20000;

interface OrderFormPOSProps {
  onSuccess?: (orderId: string) => void;
  onCancel?: () => void;
}

export function OrderFormPOS({ onSuccess }: OrderFormPOSProps) {
  // ============================================
  // State Management
  // ============================================

  // Items
  const [items, setItems] = useState<OrderLineItem[]>([]);

  // Customer
  const [selectedCustomerId, setSelectedCustomerId] = useState<Id<"customers"> | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [isNewCustomer, setIsNewCustomer] = useState(false);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

  // Delivery
  const [deliveryType, setDeliveryType] = useState<'Pickup' | 'Delivery'>('Pickup');
  const [deliveryAddress, setDeliveryAddress] = useState('');

  // Dates
  const [dueDate, setDueDate] = useState(
    new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );

  // Notes
  const [notes, setNotes] = useState('');

  // Manual Discount (order-level discount entered manually)
  const [discountAmount, setDiscountAmount] = useState(0);
  const [discountType, setDiscountType] = useState<'amount' | 'percentage'>('amount');

  // Voucher
  const [appliedVoucher, setAppliedVoucher] = useState<AppliedVoucher | null>(null);

  // Manager Override Dialog
  const [showManagerOverride, setShowManagerOverride] = useState(false);

  // Low Price Warning Dialog
  const [showLowPriceWarning, setShowLowPriceWarning] = useState(false);
  const [lowPriceConfirmed, setLowPriceConfirmed] = useState(false);

  // Submission
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ============================================
  // Queries & Mutations
  // ============================================

  const { data: posProductsData, isLoading: productsLoading } = useConvexPosProducts();
  const posProducts = posProductsData ?? [];

  const { data: customers } = useConvexCustomerSearch(customerSearch || '');

  const { data: orderTemplate, isLoading: templateLoading } = useConvexOrderTemplate();

  const createOrder = useConvexCreateOrder();

  const { hasPermission } = useAuth();
  const canCreateOverride = hasPermission("canCreateOverrideVoucher");

  // ============================================
  // Calculated Values
  // ============================================

  const subtotal = useMemo(
    () => items.reduce((sum, item) => sum + item.lineTotal, 0),
    [items]
  );

  // Manual discount (percentage or fixed amount)
  const manualDiscountValue = discountType === 'percentage'
    ? subtotal * (discountAmount / 100)
    : discountAmount;

  // Voucher discount (already calculated in the voucher object)
  const voucherDiscountValue = appliedVoucher?.calculatedDiscount ?? 0;

  // Total discount (manual + voucher - but typically you'd use one or the other)
  // Business rule: voucher replaces manual discount when applied
  const totalDiscountValue = appliedVoucher ? voucherDiscountValue : manualDiscountValue;

  const total = subtotal - totalDiscountValue;

  const todayFormatted = new Date().toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  // Check if order total is below threshold
  const isLowPrice = total > 0 && total < LOW_PRICE_THRESHOLD;

  // ============================================
  // Handlers
  // ============================================

  const handleCopyTemplate = async () => {
    if (!orderTemplate) {
      toast.error('Template loading...');
      return;
    }
    if (orderTemplate.trim() === '') {
      toast.error('No POS products configured. Add products in Menu Products Manager.');
      return;
    }
    try {
      await navigator.clipboard.writeText(orderTemplate);
      toast.success('Template copied to clipboard');
    } catch {
      toast.error('Could not copy to clipboard');
    }
  };

  const handleParsed = (result: ParseResult) => {
    if (result.items.length > 0) {
      const newItems = result.items
        .map((item) => {
          const product = posProducts?.find((p) => p.code === item.productCode);
          if (!product) return null;
          return {
            productId: product._id,
            productCode: item.productCode,
            productName: product.name,
            grams: product.grams,
            quantity: item.quantity,
            unitPrice: product.defaultPrice,
            unitCost: product.unitCost || 0,
            lineTotal: product.defaultPrice * item.quantity,
          } as OrderLineItem;
        })
        .filter((item): item is OrderLineItem => item !== null);
      setItems(newItems);
      // Clear voucher when items change
      setAppliedVoucher(null);
      setLowPriceConfirmed(false);
    }

    if (result.customer) {
      if (result.customer.name) {
        setCustomerName(result.customer.name);
        setIsNewCustomer(true);
      }
      if (result.customer.phone) {
        setCustomerPhone(result.customer.phone);
      }
      if (result.customer.address) {
        setDeliveryAddress(result.customer.address);
        setDeliveryType('Delivery');
      }
    }
  };

  const handleAddProduct = (
    product: PosProduct,
    quantity: number
  ) => {
    // Clear voucher when items change (order modified)
    setAppliedVoucher(null);
    setLowPriceConfirmed(false);

    const existing = items.find((i) => i.productId === product._id);
    if (existing) {
      setItems(
        items.map((i) =>
          i.productId === product._id
            ? {
                ...i,
                quantity: i.quantity + quantity,
                lineTotal: (i.quantity + quantity) * i.unitPrice,
              }
            : i
        )
      );
    } else {
      setItems([
        ...items,
        {
          productId: product._id,
          productCode: product.code,
          productName: product.name,
          grams: product.grams,
          quantity,
          unitPrice: product.defaultPrice,
          unitCost: product.unitCost || 0,
          lineTotal: product.defaultPrice * quantity,
        },
      ]);
    }
  };

  const updateItemQuantity = (productId: string, delta: number) => {
    // Clear voucher when items change (order modified)
    setAppliedVoucher(null);
    setLowPriceConfirmed(false);

    setItems(
      items.map((item) => {
        if (item.productId === productId) {
          const newQty = Math.max(1, item.quantity + delta);
          return { ...item, quantity: newQty, lineTotal: newQty * item.unitPrice };
        }
        return item;
      })
    );
  };

  const removeItem = (productId: string) => {
    // Clear voucher when items change (order modified)
    setAppliedVoucher(null);
    setLowPriceConfirmed(false);

    setItems(items.filter((item) => item.productId !== productId));
  };

  const handleCustomerSelect = (customer: { id: number; _id?: string; name: string; phone?: string | null }) => {
    const convexId = (customer._id ?? customer.id) as unknown as Id<"customers">;
    setSelectedCustomerId(convexId);
    setCustomerSearch(customer.name);
    setIsNewCustomer(false);
    setShowCustomerDropdown(false);
  };

  const handleCreateNewCustomer = () => {
    setIsNewCustomer(true);
    setSelectedCustomerId(null);
    setCustomerName(customerSearch);
    setShowCustomerDropdown(false);
  };

  // Voucher handlers
  const handleApplyVoucher = (voucher: AppliedVoucher) => {
    setAppliedVoucher(voucher);
    // Clear manual discount when voucher is applied
    setDiscountAmount(0);
    setDiscountType('amount');
    setLowPriceConfirmed(false);
  };

  const handleRemoveVoucher = () => {
    setAppliedVoucher(null);
    setLowPriceConfirmed(false);
  };

  // Manager override handler
  const handleOverrideCreated = (voucher: {
    id: string;
    code: string;
    discountType: "amount" | "percentage";
    discountValue: number;
    calculatedDiscount: number;
  }) => {
    // Apply the override voucher
    setAppliedVoucher({
      id: voucher.id,
      code: voucher.code,
      name: "Manager Override",
      discountType: voucher.discountType,
      discountValue: voucher.discountValue,
      calculatedDiscount: voucher.calculatedDiscount,
    });
    // Clear manual discount
    setDiscountAmount(0);
    setDiscountType('amount');
    setLowPriceConfirmed(false);
  };

  // Submit handler
  const handleSubmit = async () => {
    // Validation
    if (items.length === 0) {
      toast.error('Add at least one product');
      return;
    }
    if (!isNewCustomer && !selectedCustomerId && !customerName.trim()) {
      toast.error('Customer name is required');
      return;
    }

    // Check for low price and show warning if not confirmed
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
      const orderData: OrderCreateInput = {
        customerId: !isNewCustomer ? selectedCustomerId ?? undefined : undefined,
        newCustomer:
          isNewCustomer || (!selectedCustomerId && customerName)
            ? { name: customerName || customerSearch, phone: customerPhone || undefined }
            : undefined,
        deliveryType,
        deliveryAddress: deliveryType === 'Delivery' ? deliveryAddress : undefined,
        dueDate: new Date(dueDate).getTime(),
        notes: notes || undefined,
        // Include order-level discount (manual or from voucher)
        orderLevelDiscount: appliedVoucher
          ? undefined // Voucher handles its own discount
          : (discountAmount > 0 ? discountAmount : undefined),
        orderLevelDiscountType: appliedVoucher
          ? undefined
          : (discountAmount > 0 ? discountType : undefined),
        // Include voucher code if applied
        voucherCode: appliedVoucher?.code,
        // Include low price confirmation flag
        lowPriceConfirmed: lowPriceConfirmed || undefined,
        items: items.map((item) => ({
          productName: item.productName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          unitCost: item.unitCost || 0,
          // Include menuProductId for Kitchen View ball tracking
          menuProductId: item.productId as Id<"menuProducts">,
        })),
      };

      const orderId = await createOrder.mutateAsync(orderData);
      toast.success('Order created!');

      onSuccess?.(orderId as unknown as string);
    } catch (error) {
      console.error('Failed to create order:', error);
      const message = error instanceof Error ? error.message : 'Failed to create order';
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
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ============================================
          1. Template Section
          ============================================ */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2">
              Send Order Sheet to Customer
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="text-sm">
                      1. Copy the template to your clipboard
                      <br />
                      2. Send to customer via WhatsApp
                      <br />
                      3. When they reply with filled quantities, paste it here
                      <br />
                      4. Click "Parse & Fill" to auto-populate the order
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyTemplate}
              disabled={templateLoading}
              className="shrink-0"
            >
              {templateLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Clipboard className="h-4 w-4 mr-2" />
              )}
              Copy Template
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <PasteTemplateBox onParsed={handleParsed} initialValue={orderTemplate ?? ''} />
        </CardContent>
      </Card>

      {/* ============================================
          2. Products Section
          ============================================ */}
      <Card>
        <CardHeader>
          <CardTitle>Products</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ProductButtons
            products={posProducts}
            onAddProduct={handleAddProduct}
          />

          {items.length > 0 && (
            <>
              <Separator />
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Line Items</Label>
                {items.map((item) => (
                  <div
                    key={item.productId}
                    className="p-3 bg-muted rounded-md space-y-2"
                  >
                    {/* Row 1: Product name and delete button */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium">
                        {item.productName}
                        <span className="text-sm text-muted-foreground ml-1">
                          ({item.grams}g)
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive shrink-0"
                        onClick={() => removeItem(item.productId)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                    {/* Row 2: Quantity controls and price */}
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => updateItemQuantity(item.productId, -1)}
                          disabled={item.quantity <= 1}
                        >
                          <Minus className="h-4 w-4" />
                        </Button>
                        <span className="w-10 text-center font-semibold text-lg">{item.quantity}</span>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => updateItemQuantity(item.productId, 1)}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                      <span className="font-semibold text-lg">
                        {formatCurrency(item.lineTotal)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ============================================
          3. Customer Section
          ============================================ */}
      <Card>
        <CardHeader>
          <CardTitle>Customer</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {isNewCustomer ? (
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input
                  placeholder="Customer name"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setIsNewCustomer(false);
                    setCustomerSearch('');
                    setCustomerName('');
                    setCustomerPhone('');
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <Input
                placeholder="Phone (optional)"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
              />
            </div>
          ) : (
            <div className="relative">
              <Input
                placeholder="Search customer..."
                value={customerSearch || ''}
                onChange={(e) => {
                  setCustomerSearch(e.target.value);
                  setShowCustomerDropdown(true);
                  setSelectedCustomerId(null);
                }}
                onFocus={() => setShowCustomerDropdown(true)}
              />
              {showCustomerDropdown && customerSearch && (
                <div className="absolute z-10 w-full mt-1 bg-background border rounded-md shadow-lg max-h-48 overflow-auto">
                  {customers?.map((customer) => (
                    <button
                      key={customer.id}
                      className="w-full px-3 py-2 text-left hover:bg-accent text-sm"
                      onClick={() => handleCustomerSelect(customer)}
                    >
                      <div className="font-medium">{customer.name}</div>
                      {customer.phone && (
                        <div className="text-xs text-muted-foreground">{customer.phone}</div>
                      )}
                    </button>
                  ))}
                  <button
                    className="w-full px-3 py-2 text-left hover:bg-accent text-sm border-t text-primary"
                    onClick={handleCreateNewCustomer}
                  >
                    <Plus className="inline h-3 w-3 mr-1" />
                    Create "{customerSearch}"
                  </button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ============================================
          4. Delivery Section
          ============================================ */}
      <Card>
        <CardHeader>
          <CardTitle>Delivery</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <DeliveryToggle value={deliveryType} onChange={setDeliveryType} />

          {deliveryType === 'Delivery' && (
            <div className="space-y-2">
              <Label>Delivery Address</Label>
              <Textarea
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
                placeholder="Enter delivery address..."
                rows={2}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* ============================================
          5. Dates Section
          ============================================ */}
      <Card>
        <CardHeader>
          <CardTitle>Dates</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Order Date</Label>
            <Input value={todayFormatted} disabled className="bg-muted" />
          </div>

          <div className="space-y-2">
            <Label>Due Date</Label>
            <Input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* ============================================
          6. Notes Section
          ============================================ */}
      <Card>
        <CardHeader>
          <CardTitle>Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Special instructions..."
            rows={2}
          />
        </CardContent>
      </Card>

      {/* ============================================
          7. Discount & Voucher Section
          ============================================ */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Discount & Voucher</CardTitle>
            {canCreateOverride && !appliedVoucher && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowManagerOverride(true)}
                disabled={subtotal === 0}
              >
                <ShieldCheck className="h-4 w-4 mr-2" />
                Manager Override
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Voucher Input */}
          <VoucherInput
            subtotal={subtotal}
            customerId={selectedCustomerId ?? undefined}
            appliedVoucher={appliedVoucher}
            onApplyVoucher={handleApplyVoucher}
            onRemoveVoucher={handleRemoveVoucher}
            disabled={isSubmitting || subtotal === 0}
          />

          {/* Manual Discount (hidden when voucher is applied) */}
          {!appliedVoucher && (
            <>
              <Separator />
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">
                  Or enter manual discount
                </Label>
                <DiscountInput
                  subtotal={subtotal}
                  discountAmount={discountAmount}
                  discountType={discountType}
                  onChange={(amount, type) => {
                    setDiscountAmount(amount);
                    setDiscountType(type);
                    setLowPriceConfirmed(false);
                  }}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ============================================
          8. Totals Section
          ============================================ */}
      <Card>
        <CardHeader>
          <CardTitle>Order Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="font-medium">{formatCurrency(subtotal)}</span>
          </div>

          {totalDiscountValue > 0 && (
            <div className="flex justify-between text-sm text-destructive">
              <span>
                {appliedVoucher
                  ? `Voucher (${appliedVoucher.code})`
                  : 'Discount'}
              </span>
              <span>- {formatCurrency(totalDiscountValue)}</span>
            </div>
          )}

          <Separator />

          <div className="flex justify-between font-semibold text-lg text-primary">
            <span>Order Total</span>
            <span className={isLowPrice ? 'text-amber-600' : ''}>
              {formatCurrency(total)}
            </span>
          </div>

          {isLowPrice && (
            <p className="text-xs text-amber-600">
              Order total is below Rp 20,000. Confirmation will be required.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ============================================
          9. Submit Section
          ============================================ */}
      <div className="flex pt-2">
        <Button
          className="w-full gap-2"
          onClick={handleSubmit}
          disabled={isSubmitting || total <= 0}
          size="lg"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Creating Order...
            </>
          ) : (
            <>
              <Send className="h-4 w-4" />
              Create Order
            </>
          )}
        </Button>
      </div>

      {/* ============================================
          Dialogs
          ============================================ */}
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
