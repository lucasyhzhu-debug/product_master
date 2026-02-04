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
  Tag,
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

  // UI State
  const [showTemplateBox, setShowTemplateBox] = useState(false);

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
      toast.success('Order created successfully!');

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
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;600;700&family=Inter:wght@400;500;600&display=swap');

        .order-form-heading {
          font-family: 'Playfair Display', serif;
          letter-spacing: -0.02em;
        }

        .order-form-body {
          font-family: 'Inter', sans-serif;
        }
      `}</style>

      {/* Header with Progress */}
      <motion.div
        className="space-y-4"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="flex items-center justify-between">
          <h2 className="order-form-heading text-3xl font-bold text-[#2D3748]">
            New Order
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
                    <div className="h-4 w-4 rounded-full border-2 border-gray-300" />
                  )}
                  <span className={`text-sm ${step.complete ? 'text-green-600 font-medium' : 'text-gray-400'}`}>
                    {step.label}
                  </span>
                </motion.div>
                {index < completionSteps.length - 1 && (
                  <ChevronRight className="h-3 w-3 text-gray-300" />
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
            className="group w-full p-4 rounded-xl bg-gradient-to-br from-[#E07856]/10 to-[#E07856]/5 border border-[#E07856]/20 hover:border-[#E07856]/40 transition-all duration-300"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-[#E07856]/10 flex items-center justify-center group-hover:bg-[#E07856]/20 transition-colors">
                  <Sparkles className="h-5 w-5 text-[#E07856]" />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-sm text-[#2D3748]">Quick Start with WhatsApp Template</p>
                  <p className="text-xs text-gray-500">Copy template → Send to customer → Paste their reply</p>
                </div>
              </div>
              <motion.div
                animate={{ rotate: showTemplateBox ? 180 : 0 }}
                transition={{ duration: 0.3 }}
              >
                <Plus className="h-5 w-5 text-[#E07856]" />
              </motion.div>
            </div>
          </button>
        </motion.div>

        <AnimatePresence>
          {showTemplateBox && (
            <motion.div
              {...fadeIn}
              transition={{ duration: 0.3 }}
              className="overflow-hidden rounded-xl border border-[#E07856]/20 bg-white"
            >
              <div className="p-4 bg-gradient-to-r from-[#E07856]/5 to-transparent border-b border-[#E07856]/10">
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
            <Card className="overflow-hidden border-2 border-gray-100">
              <div className="p-6 bg-gradient-to-br from-gray-50 to-white">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-10 w-10 rounded-full bg-[#E07856]/10 flex items-center justify-center">
                    <Package className="h-5 w-5 text-[#E07856]" />
                  </div>
                  <div>
                    <h3 className="order-form-heading text-xl font-semibold text-[#2D3748]">Products</h3>
                    <p className="text-xs text-gray-500">Select items for this order</p>
                  </div>
                </div>

                <ProductButtons
                  products={posProducts}
                  onAddProduct={handleAddProduct}
                />

                <AnimatePresence>
                  {items.length > 0 && (
                    <motion.div
                      {...fadeIn}
                      className="mt-6 space-y-3"
                    >
                      <Separator className="my-4" />
                      <div className="flex items-center justify-between mb-3">
                        <Label className="text-sm font-semibold text-gray-700">Order Items</Label>
                        <Badge variant="secondary" className="text-xs">
                          {items.length} {items.length === 1 ? 'item' : 'items'}
                        </Badge>
                      </div>
                      {items.map((item, index) => (
                        <motion.div
                          key={item.productId}
                          {...slideIn}
                          transition={{ delay: index * 0.05 }}
                          className="group p-4 rounded-lg bg-gradient-to-br from-gray-50 to-white border border-gray-200 hover:border-[#E07856]/30 hover:shadow-md transition-all duration-300"
                        >
                          <div className="flex items-center justify-between gap-4 mb-3">
                            <div className="flex-1">
                              <p className="font-semibold text-sm text-[#2D3748]">{item.productName}</p>
                              <p className="text-xs text-gray-500">{item.grams}g</p>
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
                              <span className="w-12 text-center font-bold text-lg text-[#2D3748]">
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
                            <span className="font-bold text-lg text-[#E07856]">
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
                    className="mt-6 p-8 text-center rounded-lg border-2 border-dashed border-gray-200"
                  >
                    <Package className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                    <p className="text-sm text-gray-500">No products added yet</p>
                    <p className="text-xs text-gray-400 mt-1">Click the buttons above to add products</p>
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
            <Card className="overflow-hidden border-2 border-gray-100">
              <div className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-10 w-10 rounded-full bg-blue-50 flex items-center justify-center">
                    <User className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="order-form-heading text-xl font-semibold text-[#2D3748]">Customer</h3>
                    <p className="text-xs text-gray-500">Who is this order for?</p>
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
                          className="absolute z-10 w-full mt-2 bg-white border-2 border-gray-100 rounded-lg shadow-xl max-h-48 overflow-auto"
                        >
                          {customers?.map((customer) => (
                            <button
                              key={customer.id}
                              className="w-full px-4 py-3 text-left hover:bg-gray-50 text-sm border-b last:border-b-0 transition-colors"
                              onClick={() => handleCustomerSelect(customer)}
                            >
                              <div className="font-medium text-[#2D3748]">{customer.name}</div>
                              {customer.phone && (
                                <div className="text-xs text-gray-500 mt-1">{customer.phone}</div>
                              )}
                            </button>
                          ))}
                          <button
                            className="w-full px-4 py-3 text-left hover:bg-blue-50 text-sm text-blue-600 font-medium flex items-center gap-2"
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
            <Card className="overflow-hidden border-2 border-gray-100">
              <div className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-10 w-10 rounded-full bg-purple-50 flex items-center justify-center">
                    <MapPin className="h-5 w-5 text-purple-600" />
                  </div>
                  <div>
                    <h3 className="order-form-heading text-xl font-semibold text-[#2D3748]">Delivery</h3>
                    <p className="text-xs text-gray-500">Pickup or delivery?</p>
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
            <Card className="overflow-hidden border-2 border-gray-100">
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Calendar className="h-4 w-4 text-gray-400" />
                      <Label className="text-sm">Order Date</Label>
                    </div>
                    <Input value={todayFormatted} disabled className="bg-gray-50" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Calendar className="h-4 w-4 text-gray-400" />
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
                    <FileText className="h-4 w-4 text-gray-400" />
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
            <Card className="overflow-hidden border-2 border-gray-100">
              <div className="p-6 bg-gradient-to-br from-[#2D3748] to-[#1A202C] text-white">
                <h3 className="order-form-heading text-2xl font-bold mb-1">Order Summary</h3>
                <p className="text-sm text-gray-300">Review before submitting</p>
              </div>

              <div className="p-6 space-y-4">
                {/* Voucher Section */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Ticket className="h-4 w-4 text-[#E07856]" />
                    <Label className="text-sm font-semibold text-[#2D3748]">Voucher</Label>
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
                      className="w-full mt-3 border-[#E07856] text-[#E07856] hover:bg-[#E07856]/10"
                      onClick={() => setShowManagerOverride(true)}
                      disabled={subtotal === 0}
                    >
                      <ShieldCheck className="h-4 w-4 mr-2" />
                      Manager Override
                    </Button>
                  )}
                </div>

                {/* Manual Discount Section (hidden when voucher is applied) */}
                {!appliedVoucher && (
                  <>
                    <Separator />
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <Tag className="h-4 w-4 text-[#E07856]" />
                        <Label className="text-sm font-semibold text-[#2D3748]">Manual Discount</Label>
                      </div>
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

                <Separator />

                {/* Totals */}
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Subtotal</span>
                    <span className="font-semibold text-gray-900">{formatCurrency(subtotal)}</span>
                  </div>

                  {totalDiscountValue > 0 && (
                    <div className="flex justify-between text-sm text-red-600">
                      <span>
                        {appliedVoucher
                          ? `Voucher (${appliedVoucher.code})`
                          : 'Discount'}
                      </span>
                      <span className="font-semibold">- {formatCurrency(totalDiscountValue)}</span>
                    </div>
                  )}

                  <Separator />

                  <div className="flex justify-between">
                    <span className="order-form-heading text-xl font-bold text-[#2D3748]">Total</span>
                    <span className={`order-form-heading text-2xl font-bold ${isLowPrice ? 'text-amber-600' : 'text-[#E07856]'}`}>
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
                      className="p-3 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-2"
                    >
                      <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                      <div className="text-xs text-amber-800">
                        {!hasItems && <p>• Add at least one product</p>}
                        {!hasCustomer && <p>• Select or create a customer</p>}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Submit Button */}
                <Button
                  className="w-full h-12 text-base font-semibold bg-gradient-to-r from-[#E07856] to-[#D66A4A] hover:from-[#D66A4A] hover:to-[#C55A3A] shadow-lg hover:shadow-xl transition-all duration-300"
                  onClick={handleSubmit}
                  disabled={isSubmitting || !hasItems || !hasCustomer || total <= 0}
                  size="lg"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin mr-2" />
                      Creating Order...
                    </>
                  ) : (
                    <>
                      <Send className="h-5 w-5 mr-2" />
                      Create Order
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
