import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Clipboard,
  Send,
  X,
  Plus,
  Minus,
  Trash2,
  Sparkles,
  Loader2,
  Package,
  User,
  MapPin,
  Calendar,
  FileText,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Ticket
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ProductButtons, type ProductButtonProduct } from './ProductButtons';
import { PasteTemplateBox } from './PasteTemplateBox';
import { DeliveryToggle } from './DeliveryToggle';
import { VoucherInput, type AppliedVoucher } from './VoucherInput';
import { ManagerOverrideDialog } from './ManagerOverrideDialog';
import { LowPriceWarningDialog } from './LowPriceWarningDialog';
import {
  usePosProducts,
  usePackagingPosProducts,
  useCreateOrder,
  useReplaceOrderItems,
  useOrder,
  useCustomerSearch,
  useOrderTemplate,
  type OrderCreateInput,
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
  editOrderId?: string;
}

// Animation variants
const fadeIn = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 },
};

const slideIn = {
  initial: { opacity: 0, x: -20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 20 },
};

const scaleIn = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.95 },
};

export function OrderFormPOS({ onSuccess, editOrderId }: OrderFormPOSProps) {
  const isEditMode = !!editOrderId;

  // ============================================
  // State Management
  // ============================================

  // Items
  const [items, setItems] = useState<OrderLineItem[]>([]);
  const [editInitialized, setEditInitialized] = useState(false);

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

  // Voucher
  const [appliedVoucher, setAppliedVoucher] = useState<AppliedVoucher | null>(null);

  // Manager Override Dialog
  const [showManagerOverride, setShowManagerOverride] = useState(false);

  // Low Price Warning Dialog
  const [showLowPriceWarning, setShowLowPriceWarning] = useState(false);
  const [lowPriceConfirmed, setLowPriceConfirmed] = useState(false);

  // Submission
  const [isSubmitting, setIsSubmitting] = useState(false);

  // UI State
  const [showTemplateBox, setShowTemplateBox] = useState(false);

  // ============================================
  // Queries & Mutations
  // ============================================

  const { data: posProductsData, isLoading: productsLoading } = usePosProducts();
  const posProducts = posProductsData ?? [];

  const { data: packagingProductsData } = usePackagingPosProducts();
  const packagingProducts = packagingProductsData ?? [];

  const customers = useCustomerSearch(customerSearch || '');

  const { data: orderTemplate, isLoading: templateLoading } = useOrderTemplate();

  const createOrder = useCreateOrder();
  const replaceOrderItems = useReplaceOrderItems();

  // Edit mode: load existing order
  const { data: editOrder } = useOrder(
    editOrderId ? editOrderId as Id<"orders"> : undefined
  );

  // Pre-fill form from existing order (once)
  if (isEditMode && editOrder && !editInitialized && posProducts.length > 0) {
    const orderItems: OrderLineItem[] = editOrder.items.map((item) => {
      // Try to match with a POS product for the productId
      const matchedProduct = posProducts.find(
        (p) => p.name.toLowerCase() === item.product_name.toLowerCase()
      );
      return {
        productId: matchedProduct?._id ?? String(item.id),
        productCode: matchedProduct?.code ?? '',
        productName: item.product_name,
        grams: matchedProduct?.grams ?? 0,
        quantity: item.quantity,
        // gap#2: unit_price/line_total are number|undefined (stripped for non-managers
        // on subscription orders). This edit path only handles normal orders, where
        // the values are always present — coalesce to satisfy the OrderLineItem shape.
        unitPrice: item.unit_price ?? 0,
        unitCost: item.unit_cost || 0,
        lineTotal: item.line_total ?? 0,
      };
    });
    setItems(orderItems);

    // Pre-fill customer: try as existing customer first, fall back to new
    if (editOrder.customer_id) {
      // customer_id is actually a Convex Id<"customers"> cast to number
      setSelectedCustomerId(editOrder.customer_id as unknown as Id<"customers">);
      setCustomerSearch(editOrder.customer_name || '');
      setIsNewCustomer(false);
    } else if (editOrder.customer_name) {
      setCustomerName(editOrder.customer_name);
      setCustomerSearch(editOrder.customer_name);
      setIsNewCustomer(true);
    }
    if (editOrder.customer_phone) {
      setCustomerPhone(editOrder.customer_phone);
    }
    if (editOrder.delivery_type === 'Delivery') {
      setDeliveryType('Delivery');
      setDeliveryAddress(editOrder.delivery_address || '');
    }
    if (editOrder.due_date) {
      setDueDate(new Date(editOrder.due_date).toISOString().split('T')[0]);
    }
    if (editOrder.notes) {
      setNotes(editOrder.notes);
    }

    // Pre-fill voucher if one was applied
    if (editOrder.voucher_code && editOrder.voucher_discount_value) {
      setAppliedVoucher({
        id: '',
        code: editOrder.voucher_code,
        name: editOrder.voucher_code,
        discountType: 'amount',
        discountValue: editOrder.voucher_discount_value,
        calculatedDiscount: editOrder.voucher_discount_value,
      });
    }

    setEditInitialized(true);
  }

  const { hasPermission } = useAuth();
  const canCreateOverride = hasPermission("canCreateOverrideVoucher");

  // ============================================
  // Calculated Values
  // ============================================

  const subtotal = useMemo(
    () => items.reduce((sum, item) => sum + item.lineTotal, 0),
    [items]
  );

  // Voucher discount (only discount method now)
  const totalDiscountValue = appliedVoucher?.calculatedDiscount ?? 0;

  const total = subtotal - totalDiscountValue;

  // Check if order total is below threshold
  const isLowPrice = total > 0 && total < LOW_PRICE_THRESHOLD;

  const todayFormatted = new Date().toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  // Form completion state
  const hasItems = items.length > 0;
  const hasCustomer = (isNewCustomer && customerName.trim()) || (!isNewCustomer && selectedCustomerId);
  const completionSteps = [
    { label: 'Products', complete: hasItems },
    { label: 'Customer', complete: hasCustomer },
    { label: 'Ready', complete: hasItems && hasCustomer },
  ];

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
      toast.success('Template copied! Send to customer via WhatsApp');
    } catch {
      toast.error('Could not copy to clipboard');
    }
  };

  const handleParsed = (result: ParseResult) => {
    if (result.items.length > 0) {
      const newItems = result.items
        .map((item) => {
          // Match by product name (case-insensitive) for dynamic product support
          const product = posProducts?.find(
            (p) => p.name.toLowerCase() === item.productName.toLowerCase()
          );
          if (!product) return null;
          return {
            productId: product._id,
            productCode: product.code,
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
      setShowTemplateBox(false);
      toast.success(`${newItems.length} products added from template`);
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
    product: ProductButtonProduct,
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
          grams: product.grams ?? 0,
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

  const handleCustomerSelect = (customer: { _id: string; name: string; phone?: string | null; customerType?: string | null; companyName?: string | null }) => {
    const convexId = customer._id as Id<"customers">;
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
      if (isEditMode && editOrderId) {
        // Edit mode: replace items on existing order
        await replaceOrderItems.mutate({
          orderId: editOrderId as Id<"orders">,
          items: items.map((item) => ({
            productName: item.productName,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            unitCost: item.unitCost || 0,
            menuProductId: item.productId as Id<"menuProducts">,
          })),
        });
        toast.success('Order updated successfully!');
        onSuccess?.(editOrderId);
      } else {
        // Create mode
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

        const orderId = await createOrder.mutateAsync(orderData);
        toast.success('Order created successfully!');
        onSuccess?.(orderId as unknown as string);
      }
    } catch (error) {
      console.error(`Failed to ${isEditMode ? 'update' : 'create'} order:`, error);
      const message = error instanceof Error ? error.message : `Failed to ${isEditMode ? 'update' : 'create'} order`;
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
    <div className="space-y-6">
      {/* Header with Progress */}
      <motion.div
        className="space-y-4"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-3xl font-bold text-foreground">
            {isEditMode && editOrder
              ? `Editing - Order for ${editOrder.customer_name} ${editOrder.order_number}`
              : isEditMode
                ? 'Loading Order...'
                : 'New Order'}
          </h2>
          <div className="flex items-center gap-2">
            {completionSteps.map((step, index) => (
              <div key={step.label} className="flex items-center gap-2">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: index * 0.1 }}
                  className="flex items-center gap-2"
                >
                  {step.complete ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : (
                    <div className="h-4 w-4 rounded-full border-2 border-border" />
                  )}
                  <span className={`text-sm ${step.complete ? 'text-green-600 font-medium' : 'text-muted-foreground'}`}>
                    {step.label}
                  </span>
                </motion.div>
                {index < completionSteps.length - 1 && (
                  <ChevronRight className="h-3 w-3 text-muted-foreground" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Quick Template Access */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <button
            onClick={() => setShowTemplateBox(!showTemplateBox)}
            className="group w-full p-4 rounded-xl bg-gradient-to-br from-[var(--color-brand)]/10 to-[var(--color-brand)]/5 border border-[var(--color-brand)]/20 hover:border-[var(--color-brand)]/40 transition-all duration-300"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-[var(--color-brand)]/10 flex items-center justify-center group-hover:bg-[var(--color-brand)]/20 transition-colors">
                  <Sparkles className="h-5 w-5 text-[var(--color-brand)]" />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-sm text-foreground">Quick Start with WhatsApp Template</p>
                  <p className="text-xs text-muted-foreground">Copy template → Send to customer → Paste their reply</p>
                </div>
              </div>
              <motion.div
                animate={{ rotate: showTemplateBox ? 180 : 0 }}
                transition={{ duration: 0.3 }}
              >
                <Plus className="h-5 w-5 text-[var(--color-brand)]" />
              </motion.div>
            </div>
          </button>
        </motion.div>

        <AnimatePresence>
          {showTemplateBox && (
            <motion.div
              {...fadeIn}
              transition={{ duration: 0.3 }}
              className="overflow-hidden rounded-xl border border-[var(--color-brand)]/20 bg-card"
            >
              <div className="p-4 bg-gradient-to-r from-[var(--color-brand)]/5 to-transparent border-b border-[var(--color-brand)]/10">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm">WhatsApp Order Template</h3>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopyTemplate}
                    disabled={templateLoading}
                    className="gap-2"
                  >
                    {templateLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Clipboard className="h-4 w-4" />
                    )}
                    Copy Template
                  </Button>
                </div>
              </div>
              <div className="p-4">
                <PasteTemplateBox onParsed={handleParsed} initialValue={orderTemplate ?? ''} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Products & Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Products Section */}
          <motion.div
            {...fadeIn}
            transition={{ delay: 0.3 }}
          >
            <Card className="overflow-hidden border-2 border-border">
              <div className="p-6 bg-gradient-to-br from-muted/50 to-card">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-10 w-10 rounded-full bg-[var(--color-brand)]/10 flex items-center justify-center">
                    <Package className="h-5 w-5 text-[var(--color-brand)]" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-foreground">Products</h3>
                    <p className="text-xs text-muted-foreground">Select items for this order</p>
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

                <AnimatePresence>
                  {items.length > 0 && (
                    <motion.div
                      {...fadeIn}
                      className="mt-6 space-y-3"
                    >
                      <Separator className="my-4" />
                      <div className="flex items-center justify-between mb-3">
                        <Label className="text-sm font-semibold text-foreground/80">Order Items</Label>
                        <Badge variant="secondary" className="text-xs">
                          {items.length} {items.length === 1 ? 'item' : 'items'}
                        </Badge>
                      </div>
                      {items.map((item, index) => (
                        <motion.div
                          key={item.productId}
                          {...slideIn}
                          transition={{ delay: index * 0.05 }}
                          className="group p-4 rounded-lg bg-gradient-to-br from-muted/50 to-card border border-border hover:border-[var(--color-brand)]/30 hover:shadow-md transition-all duration-300"
                        >
                          <div className="flex items-center justify-between gap-4 mb-3">
                            <div className="flex-1">
                              <p className="font-semibold text-sm text-foreground">{item.productName}</p>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                {item.grams > 0 && <span>{item.grams}g</span>}
                                {item.quantity > 1 && (
                                  <span className="text-muted-foreground">@ {formatCurrency(item.unitPrice)}</span>
                                )}
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => removeItem(item.productId)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8 rounded-full"
                                onClick={() => updateItemQuantity(item.productId, -1)}
                                disabled={item.quantity <= 1}
                              >
                                <Minus className="h-3 w-3" />
                              </Button>
                              <span className="w-12 text-center font-bold text-lg text-foreground">
                                {item.quantity}
                              </span>
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8 rounded-full"
                                onClick={() => updateItemQuantity(item.productId, 1)}
                              >
                                <Plus className="h-3 w-3" />
                              </Button>
                            </div>
                            <span className="font-bold text-lg text-[var(--color-brand)]">
                              {formatCurrency(item.lineTotal)}
                            </span>
                          </div>
                        </motion.div>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>

                {items.length === 0 && (
                  <motion.div
                    {...fadeIn}
                    className="mt-6 p-8 text-center rounded-lg border-2 border-dashed border-border"
                  >
                    <Package className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">No products added yet</p>
                    <p className="text-xs text-muted-foreground mt-1">Click the buttons above to add products</p>
                  </motion.div>
                )}
              </div>
            </Card>
          </motion.div>

          {/* Customer Section */}
          <motion.div
            {...fadeIn}
            transition={{ delay: 0.4 }}
          >
            <Card className="overflow-visible border-2 border-border">
              <div className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-10 w-10 rounded-full bg-[var(--color-status-info-bg)] flex items-center justify-center">
                    <User className="h-5 w-5 text-[var(--color-status-info)]" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-foreground">Customer</h3>
                    <p className="text-xs text-muted-foreground">Who is this order for?</p>
                  </div>
                </div>

                {isNewCustomer ? (
                  <div className="space-y-3">
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
                    <AnimatePresence>
                      {showCustomerDropdown && customerSearch && (
                        <motion.div
                          {...scaleIn}
                          transition={{ duration: 0.2 }}
                          className="absolute z-10 w-full mt-2 bg-card border-2 border-border rounded-lg shadow-xl max-h-48 overflow-auto"
                        >
                          {customers?.map((customer) => (
                            <button
                              key={customer._id}
                              className="w-full px-4 py-3 text-left hover:bg-muted/50 text-sm border-b last:border-b-0 transition-colors"
                              onClick={() => handleCustomerSelect(customer)}
                            >
                              <div className="font-medium text-foreground">
                                {customer.customerType === 'b2b_wholesale' && (
                                  <span className="text-xs font-semibold text-blue-600 mr-1">[B2B]</span>
                                )}
                                {customer.name}
                                {customer.companyName && (
                                  <span className="text-muted-foreground font-normal"> — {customer.companyName}</span>
                                )}
                              </div>
                              {customer.phone && (
                                <div className="text-xs text-muted-foreground mt-1">{customer.phone}</div>
                              )}
                            </button>
                          ))}
                          <button
                            className="w-full px-4 py-3 text-left hover:bg-[var(--color-status-info-bg)] text-sm text-[var(--color-status-info)] font-medium flex items-center gap-2"
                            onClick={handleCreateNewCustomer}
                          >
                            <Plus className="h-4 w-4" />
                            Create new customer "{customerSearch}"
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            </Card>
          </motion.div>

          {/* Delivery Section */}
          <motion.div
            {...fadeIn}
            transition={{ delay: 0.5 }}
          >
            <Card className="overflow-hidden border-2 border-border">
              <div className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-10 w-10 rounded-full bg-[var(--color-status-info-bg)] flex items-center justify-center">
                    <MapPin className="h-5 w-5 text-[var(--color-status-info)]" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-foreground">Delivery</h3>
                    <p className="text-xs text-muted-foreground">Pickup or delivery?</p>
                  </div>
                </div>

                <DeliveryToggle value={deliveryType} onChange={setDeliveryType} />

                <AnimatePresence>
                  {deliveryType === 'Delivery' && (
                    <motion.div
                      {...fadeIn}
                      transition={{ duration: 0.3 }}
                      className="mt-4 space-y-2"
                    >
                      <Label className="text-sm">Delivery Address</Label>
                      <Textarea
                        value={deliveryAddress}
                        onChange={(e) => setDeliveryAddress(e.target.value)}
                        placeholder="Enter delivery address..."
                        rows={2}
                        className="resize-none"
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </Card>
          </motion.div>

          {/* Dates & Notes Section */}
          <motion.div
            {...fadeIn}
            transition={{ delay: 0.6 }}
          >
            <Card className="overflow-hidden border-2 border-border">
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <Label className="text-sm">Order Date</Label>
                    </div>
                    <Input value={todayFormatted} disabled className="bg-muted/50" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <Label className="text-sm">Due Date</Label>
                    </div>
                    <Input
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <Label className="text-sm">Notes (Optional)</Label>
                  </div>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Special instructions..."
                    rows={2}
                    className="resize-none"
                  />
                </div>
              </div>
            </Card>
          </motion.div>
        </div>

        {/* Right Column - Summary */}
        <div className="lg:col-span-1">
          <motion.div
            {...fadeIn}
            transition={{ delay: 0.7 }}
            className="sticky top-6"
          >
            <Card className="overflow-hidden border-2 border-border">
              <div className="p-6 bg-foreground text-background">
                <h3 className="text-2xl font-bold mb-1">Order Summary</h3>
                <p className="text-sm text-muted-foreground">Review before submitting</p>
              </div>

              <div className="p-6 space-y-4">
                {/* Voucher Section */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Ticket className="h-4 w-4 text-[var(--color-brand)]" />
                    <Label className="text-sm font-semibold text-foreground">Voucher</Label>
                  </div>
                  <VoucherInput
                    subtotal={subtotal}
                    customerId={selectedCustomerId ?? undefined}
                    appliedVoucher={appliedVoucher}
                    onApplyVoucher={handleApplyVoucher}
                    onRemoveVoucher={handleRemoveVoucher}
                    disabled={isSubmitting || subtotal === 0}
                  />

                  {/* Manager Override Button */}
                  {canCreateOverride && !appliedVoucher && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full mt-3 border-[var(--color-brand)] text-[var(--color-brand)] hover:bg-[var(--color-brand)]/10"
                      onClick={() => setShowManagerOverride(true)}
                      disabled={subtotal === 0}
                    >
                      <ShieldCheck className="h-4 w-4 mr-2" />
                      Manager Override
                    </Button>
                  )}
                </div>

                <Separator />

                {/* Totals */}
                <div className="space-y-3">
                  {totalDiscountValue > 0 && appliedVoucher && (
                    <>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Subtotal</span>
                        <span className="font-semibold text-foreground">{formatCurrency(subtotal)}</span>
                      </div>

                      <div className="flex justify-between text-sm text-emerald-600">
                        <span>Voucher ({appliedVoucher.code})</span>
                        <span className="font-semibold">- {formatCurrency(totalDiscountValue)}</span>
                      </div>

                      <Separator />
                    </>
                  )}

                  <div className="flex justify-between">
                    <span className="text-xl font-bold text-foreground">Total</span>
                    <span className={`text-2xl font-bold ${isLowPrice ? 'text-amber-600' : 'text-[var(--color-brand)]'}`}>
                      {formatCurrency(total)}
                    </span>
                  </div>

                  {isLowPrice && (
                    <p className="text-xs text-amber-600">
                      Order total is below Rp 20,000. Confirmation will be required.
                    </p>
                  )}
                </div>

                <Separator />

                {/* Validation Warnings */}
                <AnimatePresence>
                  {(!hasItems || !hasCustomer) && (
                    <motion.div
                      {...fadeIn}
                      className="p-3 rounded-lg bg-[var(--color-status-warning-bg)] border border-[var(--color-status-warning)]/30 flex items-start gap-2"
                    >
                      <AlertCircle className="h-4 w-4 text-[var(--color-status-warning)] mt-0.5 shrink-0" />
                      <div className="text-xs text-[var(--color-status-warning)]">
                        {!hasItems && <p>• Add at least one product</p>}
                        {!hasCustomer && <p>• Select or create a customer</p>}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Submit Button */}
                <Button
                  className="w-full h-12 text-base font-semibold bg-gradient-to-r from-[var(--color-brand)] to-[var(--color-brand-dark)] hover:from-[var(--color-brand-dark)] hover:to-[var(--color-brand-darker)] shadow-lg hover:shadow-xl transition-all duration-300"
                  onClick={handleSubmit}
                  disabled={isSubmitting || !hasItems || !hasCustomer || total <= 0}
                  size="lg"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin mr-2" />
                      {isEditMode ? 'Saving...' : 'Creating Order...'}
                    </>
                  ) : (
                    <>
                      <Send className="h-5 w-5 mr-2" />
                      {isEditMode ? 'Save Order' : 'Create Order'}
                    </>
                  )}
                </Button>
              </div>
            </Card>
          </motion.div>
        </div>
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
