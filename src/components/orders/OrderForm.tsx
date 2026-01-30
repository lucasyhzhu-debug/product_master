import { useEffect, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';


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
  useCreateOrder,
  useSellerSuggestions,
} from '@/hooks/useOrders';
import { useCustomers } from '@/hooks/useCustomers';
import { menuProductApi } from '@/lib/api';
import type { CustomerSummary, MenuProduct, OrderCreate, OrderItemCreate } from '@/lib/types';

const CHANNELS = ['IG', 'WA', 'Shopee', 'Tokopedia', 'Offline', 'Other'];

interface OrderFormProps {
  onSuccess?: () => void;
}

export function OrderForm({ onSuccess }: OrderFormProps) {
  const createOrder = useCreateOrder();

  // Customer state
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [isNewCustomer, setIsNewCustomer] = useState(false);

  const [showSoldByDropdown, setShowSoldByDropdown] = useState(false);
  const [menuProducts, setMenuProducts] = useState<MenuProduct[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [productDropdownIndex, setProductDropdownIndex] = useState<number | null>(null);
  const [productSearches, setProductSearches] = useState<string[]>(['']);

  useEffect(() => {
    menuProductApi.list(true).then(setMenuProducts);
  }, []);

  const [formData, setFormData] = useState<OrderCreate>({
    customer_id: null,
    new_customer: null,
    channel: '',
    sold_by: '',
    due_date: new Date().toISOString().split('T')[0], // Default to today
    notes: '',
    delivery_type: 'Pickup',
    pickup_location: 'Goldfinch Legato',
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
  const { data: customers } = useCustomers(customerSearch || undefined);
  const { data: sellerSuggestions } = useSellerSuggestions();

  // Calculate totals
  const totals = formData.items.reduce(
    (acc, item) => {
      const lineTotal = item.quantity * item.unit_price - (item.discount_amount || 0);
      const lineCost = item.quantity * (item.unit_cost || 0);
      return {
        amount: acc.amount + lineTotal,
        cost: acc.cost + lineCost,
        margin: acc.margin + (lineTotal - lineCost),
      };
    },
    { amount: 0, cost: 0, margin: 0 }
  );

  const handleCustomerSelect = (customer: CustomerSummary) => {
    setCustomerId(customer.id);
    setCustomerSearch(customer.name);
    setIsNewCustomer(false);
    setShowCustomerDropdown(false);
    setFormData((prev) => ({ ...prev, customer_id: customer.id, new_customer: null }));
  };

  const handleCreateNewCustomer = () => {
    setIsNewCustomer(true);
    setCustomerId(null);
    setNewCustomerName(customerSearch);
    setShowCustomerDropdown(false);
    setFormData((prev) => ({
      ...prev,
      customer_id: null,
      new_customer: { name: customerSearch, phone: null },
    }));
  };

  const handleSoldBySelect = (seller: string) => {
    setFormData((prev) => ({ ...prev, sold_by: seller }));
  };

  const updateItem = (index: number, field: keyof OrderItemCreate, value: string | number) => {
    const updatedItems = [...formData.items];
    updatedItems[index] = { ...updatedItems[index], [field]: value };
    setFormData((prev) => ({ ...prev, items: updatedItems }));
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

    if (!isNewCustomer && !customerId) {
      newErrors.customer = 'Please select or create a customer';
    }
    if (isNewCustomer && !newCustomerName.trim()) {
      newErrors.customer = 'Please enter customer name';
    }
    if (formData.items.some((item) => !item.product_name.trim())) {
      newErrors.items = 'Please fill in all product names';
    }
    if (formData.items.some((item) => item.unit_price <= 0)) {
      newErrors.items = 'Please enter valid prices for all items';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    const orderData: OrderCreate = {
      ...formData,
      customer_id: isNewCustomer ? null : customerId,
      new_customer: isNewCustomer
        ? { name: newCustomerName, phone: newCustomerPhone || null }
        : null,
      items: formData.items.map((item) => ({
        ...item,
        unit_cost: item.unit_cost || 0,
      })),
    };

    try {
      await createOrder.mutateAsync(orderData);

      // Save any new custom products to the menu for future use
      for (const item of orderData.items) {
        const existingProduct = menuProducts.find(
          (p) => p.name.toLowerCase() === item.product_name.toLowerCase()
        );
        if (!existingProduct && item.product_name.trim() && item.unit_price > 0) {
          try {
            const newProduct = await menuProductApi.create({
              name: item.product_name,
              default_price: item.unit_price,
            });
            setMenuProducts((prev) => [...prev, newProduct]);
          } catch {
            // Ignore if product already exists or creation fails
          }
        }
      }

      onSuccess?.();
    } catch {
      // Error handled by mutation
    }
  };

  return (
    <div className="space-y-4 relative">
      {createOrder.isPending && (
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50 rounded-lg">
          <div className="text-center space-y-2">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
            <p className="text-sm text-muted-foreground">Creating order...</p>
          </div>
        </div>
      )}

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
        {errors.customer && (
          <p className="text-sm text-destructive mt-1">{errors.customer}</p>
        )}
      </div>

      {/* Channel & Sold By */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Channel</Label>
          <Select
            value={formData.channel || ''}
            onValueChange={(val) => setFormData((prev) => ({ ...prev, channel: val }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select channel" />
            </SelectTrigger>
            <SelectContent>
              {CHANNELS.map((ch) => (
                <SelectItem key={ch} value={ch}>
                  {ch}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
                  {getFilteredProducts(productSearches[index] || '').map((p) => (
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
                  ))}
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
                <Label className="text-xs">Discount</Label>
                <Input
                  type="number"
                  value={item.discount_amount || 0}
                  onChange={(e) => updateItem(index, 'discount_amount', parseInt(e.target.value) || 0)}
                  className="h-9"
                  placeholder="0"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Total</Label>
                <div className="h-9 flex items-center px-3 bg-muted rounded-md text-sm font-medium">
                  Rp {(item.quantity * item.unit_price - (item.discount_amount || 0)).toLocaleString('id-ID')}
                </div>
              </div>
            </div>
          </div>
        ))}

        {errors.items && (
          <p className="text-sm text-destructive">{errors.items}</p>
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
      <div className="bg-muted p-3 rounded-md space-y-1">
        <div className="flex justify-between text-sm">
          <span>Subtotal</span>
          <span>Rp {totals.amount.toLocaleString('id-ID')}</span>
        </div>
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>Total Discounts</span>
          <span>Rp {totals.cost.toLocaleString('id-ID')}</span>
        </div>
        <div className="flex justify-between font-semibold text-green-600">
          <span>Net Total</span>
          <span>Rp {totals.margin.toLocaleString('id-ID')}</span>
        </div>
      </div>

      {/* Submit */}
      <Button
        className="w-full"
        onClick={handleSubmit}
        disabled={createOrder.isPending}
      >
        {createOrder.isPending ? 'Creating...' : 'Create Order'}
      </Button>
    </div >
  );
}
