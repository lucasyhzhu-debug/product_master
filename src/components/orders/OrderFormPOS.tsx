import { useState, useMemo } from 'react';
import { Clipboard, Send, X, Plus, Minus, Trash2, HelpCircle, Loader2 } from 'lucide-react';
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
import {
  useConvexFixedProducts,
  useConvexCreateOrder,
  useConvexCustomerSearch,
  type OrderCreateInput,
  type FixedProduct,
} from '@/hooks/convex';
import type { ParseResult } from '@/lib/orderTemplateParser';
import type { OrderLineItem } from '@/lib/types';
import type { Id } from '../../../convex/_generated/dataModel';
import { formatCurrency } from '@/lib/utils';
import { toast } from 'sonner';

interface OrderFormPOSProps {
  onSuccess?: (orderId: string) => void;
  onCancel?: () => void;
}

export function OrderFormPOS({ onSuccess, onCancel }: OrderFormPOSProps) {
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

  // Discount
  const [discountAmount, setDiscountAmount] = useState(0);
  const [discountType, setDiscountType] = useState<'amount' | 'percentage'>('amount');

  // Submission
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ============================================
  // Queries & Mutations
  // ============================================

  const { data: fixedProductsData, isLoading: productsLoading } = useConvexFixedProducts();
  const fixedProducts = fixedProductsData ?? [];

  const { data: customers } = useConvexCustomerSearch(customerSearch || '');

  const createOrder = useConvexCreateOrder();

  // ============================================
  // Calculated Values
  // ============================================

  const subtotal = useMemo(
    () => items.reduce((sum, item) => sum + item.lineTotal, 0),
    [items]
  );

  const discountValue = discountType === 'percentage'
    ? subtotal * (discountAmount / 100)
    : discountAmount;

  const total = subtotal - discountValue;

  const todayFormatted = new Date().toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  // ============================================
  // Handlers
  // ============================================

  const handleCopyTemplate = async () => {
    const template = `Halo! Mau makan Frollie snacks?

1. Original (80g) - Rp 50.000 [  ]
2. Bite Sized Single (45g) - Rp 35.000 [  ]
3. Bite Sized Double (90g = 2x45g) - Rp 70.000 [  ]
4. Bite Sized Triple (135g = 3x45g) - Rp 99.000 [  ]

---
Untuk customer baru:
No. WA:
Nama:
Alamat:

Isi jumlah yang diinginkan di dalam [ ]

---
Transfer ke: BCA 1234567890 a.n. Frollie`;

    try {
      await navigator.clipboard.writeText(template);
      toast.success('Template copied to clipboard');
    } catch {
      toast.error('Could not copy to clipboard');
    }
  };

  const handleParsed = (result: ParseResult) => {
    if (result.items.length > 0) {
      const newItems = result.items
        .map((item) => {
          const product = fixedProducts?.find((p) => p.code === item.productCode);
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
    product: FixedProduct,
    quantity: number
  ) => {
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
        // Include order-level discount if set
        orderLevelDiscount: discountAmount > 0 ? discountAmount : undefined,
        orderLevelDiscountType: discountAmount > 0 ? discountType : undefined,
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

      // Copy WhatsApp receipt to clipboard
      // Note: This would require fetching the WhatsApp message template
      // For now, we'll skip this feature or implement it in the parent component

      onSuccess?.(orderId as unknown as string);
    } catch (error) {
      console.error('Failed to create order:', error);
      toast.error('Failed to create order');
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
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              Template
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
            <Button variant="outline" size="sm" onClick={handleCopyTemplate}>
              <Clipboard className="h-4 w-4 mr-2" />
              Copy Clean Template
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <PasteTemplateBox onParsed={handleParsed} />
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
            products={fixedProducts}
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
                    className="flex items-center justify-between p-2 bg-muted rounded-md"
                  >
                    <div className="flex-1">
                      <span className="font-medium">{item.productName}</span>
                      <span className="text-sm text-muted-foreground ml-2">
                        ({item.grams}g)
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => updateItemQuantity(item.productId, -1)}
                        disabled={item.quantity <= 1}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-8 text-center font-medium">{item.quantity}</span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => updateItemQuantity(item.productId, 1)}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                      <span className="w-24 text-right font-medium">
                        {formatCurrency(item.lineTotal)}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => removeItem(item.productId)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
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
          7. Discount Section
          ============================================ */}
      <Card>
        <CardHeader>
          <CardTitle>Discount</CardTitle>
        </CardHeader>
        <CardContent>
          <DiscountInput
            subtotal={subtotal}
            discountAmount={discountAmount}
            discountType={discountType}
            onChange={(amount, type) => {
              setDiscountAmount(amount);
              setDiscountType(type);
            }}
          />
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

          {discountValue > 0 && (
            <div className="flex justify-between text-sm text-destructive">
              <span>Discount</span>
              <span>- {formatCurrency(discountValue)}</span>
            </div>
          )}

          <Separator />

          <div className="flex justify-between font-semibold text-lg text-primary">
            <span>Order Total</span>
            <span>{formatCurrency(total)}</span>
          </div>
        </CardContent>
      </Card>

      {/* ============================================
          9. Submit Section
          ============================================ */}
      <div className="flex gap-2">
        {onCancel && (
          <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
        )}
        <Button
          className="flex-1 gap-2"
          onClick={handleSubmit}
          disabled={isSubmitting}
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
    </div>
  );
}
