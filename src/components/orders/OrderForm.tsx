import { useState } from 'react';
import { Plus, Trash2, X, Info, Loader2, Pencil, Check } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import {
  useCreateOrder,
  useSellerSuggestions,
  type OrderCreateInput,
  type OrderItemInput,
} from '@/hooks/convex/useOrders';
import { useCustomer, useCustomerSearch, useUpdateCustomer } from '@/hooks/convex/useCustomers';
import { useMenuProducts, useCreateMenuProduct } from '@/hooks/convex/useMenuProducts';
import type { Id } from '../../../convex/_generated/dataModel';
import type { MenuProduct } from '@/lib/types';
import { getChannelOptions } from '@/lib/channels';
import { ChannelBadge } from './ChannelBadge';
import { CustomerLabel, type CustomerPickerOption } from './CustomerLabel';
import { cn } from '@/lib/utils';

// Internal form state types (snake_case for form compatibility)
interface FormOrderItem {
  product_name: string;
  product_variant: string;
  quantity: number;
  unit_price: number;
  discount_amount: number;
  unit_cost: number;
}

interface FormOrderCreate {
  customer_id: Id<"customers"> | null;
  new_customer: { name: string; phone: string | null } | null;
  channel: string;
  sold_by: string;
  due_date: string;
  notes: string;
  delivery_type: 'Pickup' | 'Delivery';
  pickup_location: string;
  delivery_address: string;
  contact_wa: string;
  contact_ig: string;
  items: FormOrderItem[];
}

interface OrderFormProps {
  onSuccess?: () => void;
}

export function OrderForm({ onSuccess }: OrderFormProps) {
  const createOrder = useCreateOrder();
  const createMenuProduct = useCreateMenuProduct();

  // Customer state
  const [customerId, setCustomerId] = useState<Id<"customers"> | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [isNewCustomer, setIsNewCustomer] = useState(false);

  const [editingPhone, setEditingPhone] = useState(false);
  const [phoneEdit, setPhoneEdit] = useState('');
  const [isSavingPhone, setIsSavingPhone] = useState(false);

  const [showSoldByDropdown, setShowSoldByDropdown] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [productDropdownIndex, setProductDropdownIndex] = useState<number | null>(null);
  const [productSearches, setProductSearches] = useState<string[]>(['']);

  // Convex queries
  const { data: menuProductsData, isLoading: productsLoading } = useMenuProducts(true);
  const menuProducts: MenuProduct[] = menuProductsData ?? [];

  const [formData, setFormData] = useState<FormOrderCreate>({
    customer_id: null,
    new_customer: null,
    channel: '',
    sold_by: '',
    due_date: new Date().toISOString().split('T')[0], // Default to today
    notes: '',
    delivery_type: 'Pickup',
    pickup_location: 'Legato Gelato - Goldfinch',
    delivery_address: '',
    contact_wa: '',
    contact_ig: '',
    items: [
      {
        product_name: '',
        product_variant: '',
        quantity: 1,
        unit_price: 0,
        discount_amount: 0,
        unit_cost: 0,
      },
    ],
  });

  // Queries
  const customers = useCustomerSearch(customerSearch || '');
  const { data: sellerSuggestions } = useSellerSuggestions();
  const selectedCustomer = useCustomer(customerId ?? undefined);
  const updateCustomer = useUpdateCustomer();

  // Calculate totals
  const totals = formData.items.reduce(
    (acc, item) => {
      const discountedUnitPrice = item.unit_price - (item.discount_amount || 0);
      const lineTotal = item.quantity * discountedUnitPrice;
      const lineCost = item.quantity * (item.unit_cost || 0);
      const totalItemDiscount = item.quantity * (item.discount_amount || 0);
      return {
        amount: acc.amount + lineTotal,
        cost: acc.cost + lineCost,
        margin: acc.margin + (lineTotal - lineCost),
        totalDiscount: acc.totalDiscount + totalItemDiscount,
      };
    },
    { amount: 0, cost: 0, margin: 0, totalDiscount: 0 }
  );

  const handleCustomerSelect = (customer: CustomerPickerOption) => {
    const convexId = customer._id as Id<"customers">;
    setCustomerId(convexId);
    setCustomerSearch(customer.name);
    setIsNewCustomer(false);
    setShowCustomerDropdown(false);
    setEditingPhone(false);
    setPhoneEdit('');
    setFormData((prev) => ({ ...prev, customer_id: convexId, new_customer: null }));
  };

  const handleCreateNewCustomer = () => {
    setIsNewCustomer(true);
    setCustomerId(null);
    setNewCustomerName(customerSearch);
    setShowCustomerDropdown(false);
    setEditingPhone(false);
    setPhoneEdit('');
    setFormData((prev) => ({
      ...prev,
      customer_id: null,
      new_customer: { name: customerSearch, phone: null },
    }));
  };

  const handleSavePhone = async () => {
    if (!customerId) return;
    setIsSavingPhone(true);
    try {
      await updateCustomer.mutateAsync({ id: customerId, phone: phoneEdit || undefined });
      setEditingPhone(false);
    } finally {
      setIsSavingPhone(false);
    }
  };

  const handleSoldBySelect = (seller: string) => {
    setFormData((prev) => ({ ...prev, sold_by: seller }));
  };

  const updateItem = (index: number, field: keyof FormOrderItem, value: string | number) => {
    setFormData((prev) => {
      const updatedItems = [...prev.items];
      updatedItems[index] = { ...updatedItems[index], [field]: value };
      return { ...prev, items: updatedItems };
    });
  };

  const addItem = () => {
    setFormData((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          product_name: '',
          product_variant: '',
          quantity: 1,
          unit_price: 0,
          discount_amount: 0,
          unit_cost: 0,
        },
      ],
    }));
    setProductSearches((prev) => [...prev, '']);
  };

  const removeItem = (index: number) => {
    if (formData.items.length > 1) {
      setFormData((prev) => ({
        ...prev,
        items: prev.items.filter((_, i) => i !== index),
      }));
      setProductSearches((prev) => prev.filter((_, i) => i !== index));
    }
  };

  const handleProductSelect = (index: number, product: MenuProduct) => {
    updateItem(index, 'product_name', product.name);
    updateItem(index, 'unit_price', product.default_price);
    setProductSearches((prev) => {
      const updated = [...prev];
      updated[index] = product.name;
      return updated;
    });
    setProductDropdownIndex(null);
  };

  const handleProductInputChange = (index: number, value: string) => {
    setProductSearches((prev) => {
      const updated = [...prev];
      updated[index] = value;
      return updated;
    });
    updateItem(index, 'product_name', value);
    setProductDropdownIndex(index);
  };

  const handleProductBlur = (index: number) => {
    // Delay to allow click on dropdown item
    setTimeout(() => {
      if (productDropdownIndex === index) {
        setProductDropdownIndex(null);
      }
    }, 200);
  };

  const getFilteredProducts = (searchText: string) => {
    if (!searchText) return menuProducts;
    const lower = searchText.toLowerCase();
    return menuProducts.filter((p) => p.name.toLowerCase().includes(lower));
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    // Customer validation
    if (!isNewCustomer && !customerId) {
      newErrors.customer = 'Please select an existing customer or create a new one';
    }
    if (isNewCustomer && !newCustomerName.trim()) {
      newErrors.customer = 'Customer name is required';
    }

    // Items validation
    if (formData.items.length === 0) {
      newErrors.items = 'At least one item is required';
    }
    if (formData.items.some((item) => !item.product_name.trim())) {
      newErrors.items = 'Product name is required for all items';
    }
    if (formData.items.some((item) => item.quantity <= 0)) {
      newErrors.items = 'Quantity must be greater than 0 for all items';
    }
    if (formData.items.some((item) => item.unit_price < 0)) {
      newErrors.items = 'Price cannot be negative';
    }
    if (formData.items.some((item) => item.unit_price === 0)) {
      newErrors.items = 'Please enter a price for all items';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    // Validate form
    if (!validateForm()) {
      const errorList = Object.values(errors);
      toast.error(errorList[0] || 'Please fix the errors above');
      return;
    }

    // Transform form data to Convex format (camelCase)
    const orderData: OrderCreateInput = {
      customerId: isNewCustomer ? undefined : (customerId ?? undefined),
      newCustomer: isNewCustomer
        ? { name: newCustomerName, phone: newCustomerPhone || undefined }
        : undefined,
      soldBy: formData.sold_by || undefined,
      dueDate: formData.due_date ? new Date(formData.due_date).getTime() : undefined,
      notes: formData.notes || undefined,
      deliveryType: formData.delivery_type,
      pickupLocation: formData.pickup_location || undefined,
      deliveryAddress: formData.delivery_address || undefined,
      contactWa: formData.contact_wa || undefined,
      contactIg: formData.contact_ig || undefined,
      items: formData.items.map((item): OrderItemInput => ({
        productName: item.product_name,
        productVariant: item.product_variant || undefined,
        quantity: item.quantity,
        unitPrice: item.unit_price,
        unitCost: item.unit_cost || 0,
        discountAmount: item.discount_amount || undefined,
      })),
    };

    setIsSubmitting(true);
    try {
      // Create the order
      toast.loading(`Creating order for ${isNewCustomer ? newCustomerName : customerSearch}...`, { id: 'create-order' });

      await createOrder.mutateAsync(orderData);

      // Save any new custom products to the menu for future use
      const newProductItems = formData.items.filter((item) => {
        const existingProduct = menuProducts.find(
          (p) => p.name.toLowerCase() === item.product_name.toLowerCase()
        );
        return !existingProduct && item.product_name.trim() && item.unit_price > 0;
      });

      // Create menu products in background
      for (const item of newProductItems) {
        try {
          await createMenuProduct.mutateAsync({
            name: item.product_name,
            defaultPrice: item.unit_price,
          });
        } catch {
          // Ignore if product already exists or creation fails
        }
      }

      toast.success('Order created successfully!', { id: 'create-order' });

      // Reset form and notify parent
      onSuccess?.();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create order';
      toast.error(`Error: ${errorMessage}`, { id: 'create-order' });
      console.error('Order creation error:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 relative">

      {/* Customer */}
      <div className="space-y-2">
        <Label htmlFor="customer">
          Customer <span className="text-destructive">*</span>
        </Label>
        {isNewCustomer ? (
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input
                id="customer"
                aria-required="true"
                placeholder="Customer name"
                value={newCustomerName}
                onChange={(e) => {
                  setNewCustomerName(e.target.value);
                  setFormData((prev) => ({
                    ...prev,
                    new_customer: {
                      name: e.target.value,
                      phone: prev.new_customer?.phone ?? '',
                    },
                  }));
                }}
                className="flex-1"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => {
                  setIsNewCustomer(false);
                  setCustomerSearch('');
                  setNewCustomerName('');
                  setNewCustomerPhone('');
                  setFormData((prev) => ({ ...prev, customer_id: null, new_customer: null }));
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <Input
              placeholder="Phone (optional)"
              value={newCustomerPhone}
              onChange={(e) => {
                setNewCustomerPhone(e.target.value);
                setFormData((prev) => ({
                  ...prev,
                  new_customer: {
                    name: prev.new_customer?.name ?? '',
                    phone: e.target.value
                  },
                }));
              }}
            />
          </div>
        ) : (
          <>
            <div className="relative">
              <Input
                id="customer"
                aria-required="true"
                placeholder="Search customer..."
                value={customerSearch || ''}
                onChange={(e) => {
                  setCustomerSearch(e.target.value);
                  setShowCustomerDropdown(true);
                  setCustomerId(null);
                  setFormData((prev) => ({ ...prev, customer_id: null, new_customer: null }));
                }}
                onFocus={() => setShowCustomerDropdown(true)}
              />
              {showCustomerDropdown && customerSearch && (
                <div className="absolute z-10 w-full mt-1 bg-background border rounded-md shadow-lg max-h-48 overflow-auto">
                  {customers?.map((customer) => (
                    <button
                      key={customer._id}
                      className="w-full px-3 py-2 text-left hover:bg-accent text-sm"
                      onClick={() => handleCustomerSelect(customer)}
                    >
                      <div className="font-medium">
                        <CustomerLabel
                          name={customer.name}
                          companyName={customer.companyName}
                          customerType={customer.customerType}
                        />
                      </div>
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
            {customerId && (
              <div className="flex items-center gap-2 mt-1.5">
                {editingPhone ? (
                  <>
                    <Input
                      autoFocus
                      value={phoneEdit}
                      onChange={(e) => setPhoneEdit(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSavePhone();
                        if (e.key === 'Escape') setEditingPhone(false);
                      }}
                      placeholder="Phone number"
                      className="h-8 text-sm flex-1"
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 shrink-0"
                      onClick={handleSavePhone}
                      disabled={isSavingPhone}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="text-sm text-muted-foreground flex-1">
                      {selectedCustomer?.phone
                        ? `Phone: ${selectedCustomer.phone}`
                        : 'No phone on record'}
                    </span>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 shrink-0"
                      onClick={() => {
                        setPhoneEdit(selectedCustomer?.phone ?? '');
                        setEditingPhone(true);
                      }}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                  </>
                )}
              </div>
            )}
          </>
        )}
        {errors.customer && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/20">
            <Info className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
            <p className="text-sm text-destructive">{errors.customer}</p>
          </div>
        )}
      </div>

      {/* Channel & Sold By */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Channel</Label>
          <div className="flex flex-wrap gap-2">
            {getChannelOptions().map(({ value }) => (
              <button
                key={value}
                type="button"
                onClick={() => setFormData((prev) => ({ ...prev, channel: value }))}
                className={cn(
                  'transition-all rounded-md',
                  formData.channel === value && 'ring-2 ring-offset-2 ring-primary'
                )}
              >
                <ChannelBadge channel={value} size="sm" />
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Sold By</Label>
          <div className="relative">
            <Input
              placeholder="Salesperson"
              value={formData.sold_by || ''}
              onChange={(e) => {
                setFormData((prev) => ({ ...prev, sold_by: e.target.value }));
                setShowSoldByDropdown(true);
              }}
              onFocus={() => setShowSoldByDropdown(true)}
              onBlur={() => setTimeout(() => setShowSoldByDropdown(false), 200)}
            />
            {showSoldByDropdown && sellerSuggestions && sellerSuggestions.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-background border rounded-md shadow-lg max-h-32 overflow-auto">
                {sellerSuggestions
                  .filter((s) =>
                    s.sold_by.toLowerCase().includes((formData.sold_by || '').toLowerCase())
                  )
                  .map((seller) => (
                    <button
                      key={seller.sold_by}
                      className="w-full px-3 py-2 text-left hover:bg-accent text-sm"
                      onClick={() => handleSoldBySelect(seller.sold_by)}
                    >
                      {seller.sold_by}
                      <span className="text-xs text-muted-foreground ml-2">
                        ({seller.order_count} orders)
                      </span>
                    </button>
                  ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Due Date */}
      <div className="space-y-2">
        <Label>Due Date</Label>
        <Input
          type="date"
          value={formData.due_date || ''}
          onChange={(e) => setFormData((prev) => ({ ...prev, due_date: e.target.value }))}
        />
      </div>

      {/* Line Items */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Items <span className="text-destructive">*</span></Label>
          <Button type="button" variant="outline" size="sm" onClick={addItem}>
            <Plus className="mr-1 h-3 w-3" /> Add
          </Button>
        </div>

        {formData.items.map((item, index) => (
          <div key={index} className="border rounded-lg p-3 space-y-3 bg-card">
            {/* Header with item number and delete */}
            <div className="flex items-center justify-between pb-2 border-b">
              <span className="text-sm font-medium text-muted-foreground">
                Item {index + 1}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeItem(index)}
                disabled={formData.items.length === 1}
                className="h-7 w-7 p-0"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* Product Name - Full width with combobox */}
            <div className="space-y-1.5 relative">
              <Label className="text-xs">Product Name</Label>
              <Input
                value={productSearches[index] || item.product_name}
                onChange={(e) => handleProductInputChange(index, e.target.value)}
                onFocus={() => setProductDropdownIndex(index)}
                onBlur={() => handleProductBlur(index)}
                placeholder="Type or select product..."
                className="h-9"
              />
              {productDropdownIndex === index && (
                <div className="absolute z-20 w-full mt-1 bg-background border rounded-md shadow-lg max-h-48 overflow-auto">
                  {productsLoading ? (
                    <div className="px-3 py-2 text-xs text-muted-foreground">
                      Loading products...
                    </div>
                  ) : getFilteredProducts(productSearches[index] || '').length > 0 ? (
                    getFilteredProducts(productSearches[index] || '').map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className="w-full px-3 py-2 text-left hover:bg-accent text-sm"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => handleProductSelect(index, p)}
                      >
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs text-muted-foreground">
                          Rp {p.default_price.toLocaleString('id-ID')}
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-xs text-muted-foreground">
                      {menuProducts.length === 0
                        ? 'No products available. Type to create custom product.'
                        : 'No products match your search.'}
                    </div>
                  )}
                  {productSearches[index] && !menuProducts.some((p) => p.name.toLowerCase() === productSearches[index].toLowerCase()) && (
                    <div className="px-3 py-2 text-xs text-muted-foreground border-t">
                      <Plus className="inline h-3 w-3 mr-1" />
                      Custom: "{productSearches[index]}" (set price below)
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Quantity & Price - 2 columns */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Qty</Label>
                <Input
                  type="number"
                  min="1"
                  value={item.quantity}
                  onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value) || 0)}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Price</Label>
                <Input
                  type="number"
                  value={item.unit_price}
                  onChange={(e) => updateItem(index, 'unit_price', parseInt(e.target.value) || 0)}
                  className="h-9"
                  placeholder="0"
                />
              </div>
            </div>

            {/* Discount & Line Total - 2 columns */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <div className="flex items-center gap-1">
                  <Label className="text-xs">Discount per Unit</Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs">
                        <p>Discount applied per unit. Line total = Qty × (Unit Price - Discount)</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Input
                  type="number"
                  value={item.discount_amount || 0}
                  onChange={(e) => updateItem(index, 'discount_amount', parseInt(e.target.value) || 0)}
                  className="h-9"
                  placeholder="0"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Line Total</Label>
                <div className="h-9 flex items-center px-3 bg-muted rounded-md text-sm font-medium">
                  Rp {(item.quantity * (item.unit_price - (item.discount_amount || 0))).toLocaleString('id-ID')}
                </div>
              </div>
            </div>
          </div>
        ))}

        {errors.items && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/20">
            <Info className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
            <p className="text-sm text-destructive">{errors.items}</p>
          </div>
        )}
      </div>

      {/* Delivery */}
      <div className="space-y-3">
        <div className="space-y-2">
          <Label>Delivery Type</Label>
          <Select
            value={formData.delivery_type}
            onValueChange={(val: 'Pickup' | 'Delivery') =>
              setFormData({ ...formData, delivery_type: val })
            }
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Pickup">Pickup</SelectItem>
              <SelectItem value="Delivery">Delivery</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {formData.delivery_type === 'Pickup' ? (
          <div className="space-y-2">
            <Label>Pickup Location</Label>
            <Input
              value={formData.pickup_location || ''}
              onChange={(e) =>
                setFormData({ ...formData, pickup_location: e.target.value })
              }
            />
          </div>
        ) : (
          <div className="space-y-2">
            <Label>Delivery Address</Label>
            <Textarea
              value={formData.delivery_address || ''}
              onChange={(e) => setFormData({ ...formData, delivery_address: e.target.value })}
              rows={2}
            />
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Contact WA</Label>
            <Input
              value={formData.contact_wa || ''}
              onChange={(e) => setFormData({ ...formData, contact_wa: e.target.value })}
              placeholder="0812..."
            />
          </div>
          <div className="space-y-2">
            <Label>Contact IG (Optional)</Label>
            <Input
              value={formData.contact_ig || ''}
              onChange={(e) => setFormData({ ...formData, contact_ig: e.target.value })}
              placeholder="@username"
            />
          </div>
        </div>
      </div>

      {/* Notes */}
      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          placeholder="Special instructions..."
          value={formData.notes || ''}
          onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
          rows={2}
        />
      </div>

      {/* Totals */}
      <div className="bg-muted p-3 rounded-md space-y-2 border">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Subtotal (before discounts)</span>
          <span className="font-medium">Rp {formData.items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0).toLocaleString('id-ID')}</span>
        </div>
        {totals.totalDiscount > 0 && (
          <div className="flex justify-between text-sm text-destructive">
            <span>Total Discounts</span>
            <span>- Rp {totals.totalDiscount.toLocaleString('id-ID')}</span>
          </div>
        )}
        <div className="border-t pt-2 flex justify-between font-semibold text-primary">
          <span>Order Total</span>
          <span>Rp {totals.amount.toLocaleString('id-ID')}</span>
        </div>
      </div>

      {/* Submit */}
      <div className="flex gap-2">
        <Button
          className="flex-1 gap-2"
          onClick={handleSubmit}
          disabled={isSubmitting || productsLoading}
          size="lg"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Creating Order...
            </>
          ) : (
            'Create Order'
          )}
        </Button>
      </div>
    </div >
  );
}
