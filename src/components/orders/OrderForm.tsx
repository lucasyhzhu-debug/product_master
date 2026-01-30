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
  };

  const removeItem = (index: number) => {
    if (formData.items.length > 1) {
      setFormData((prev) => ({
        ...prev,
        items: prev.items.filter((_, i) => i !== index),
      }));
    }
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
      <div className="space-y-2">
        <Label>Items *</Label>
        {formData.items.map((item, index) => (
          <div key={index} className="grid grid-cols-2 md:grid-cols-6 gap-2 border rounded-md p-3">
            <div className="space-y-2 col-span-2">
              <Label>Product Name</Label>
              <Select
                value={item.product_name}
                onValueChange={(val) => {
                  const selectedProduct = menuProducts.find((p) => p.name === val);
                  updateItem(index, 'product_name', val);
                  if (selectedProduct) {
                    updateItem(index, 'unit_price', selectedProduct.default_price);
                    updateItem(index, 'product_variant', '');
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select Product" />
                </SelectTrigger>
                <SelectContent>
                  {menuProducts.map((p) => (
                    <SelectItem key={p.id} value={p.name}>
                      {p.name} - Rp {p.default_price.toLocaleString('id-ID')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>



            <div className="space-y-2">
              <Label>Quantity</Label>
              <Input
                type="number"
                min="1"
                value={item.quantity}
                onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value) || 0)}
              />
            </div>

            <div className="space-y-2">
              <Label>Unit Price</Label>
              <Input
                type="number"
                value={item.unit_price}
                onChange={(e) => updateItem(index, 'unit_price', parseInt(e.target.value) || 0)}
              />
            </div>

            <div className="space-y-2">
              <Label>Discount</Label>
              <Input
                type="number"
                value={item.discount_amount || 0}
                onChange={(e) => updateItem(index, 'discount_amount', parseInt(e.target.value) || 0)}
              />
            </div>

            <div className="flex items-end pb-0.5">
              <Button
                type="button"
                variant="destructive"
                size="icon"
                onClick={() => removeItem(index)}
                disabled={formData.items.length === 1}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
        <Button type="button" variant="outline" onClick={addItem} className="w-full">
          <Plus className="mr-2 h-4 w-4" /> Add Item
        </Button>
        {errors.items && (
          <p className="text-sm text-destructive mt-1">{errors.items}</p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
            />
          </div>
        )}

        <div className="space-y-2">
          <Label>Contact WA</Label>
          <Input
            value={formData.contact_wa || ''}
            onChange={(e) => setFormData({ ...formData, contact_wa: e.target.value })}
            placeholder="0812..."
          />
        </div>
        <div className="space-y-2">
          <Label>Contact IG</Label>
          <Input
            value={formData.contact_ig || ''}
            onChange={(e) => setFormData({ ...formData, contact_ig: e.target.value })}
            placeholder="@username"
          />
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
          <span>Cost</span>
          <span>Rp {totals.cost.toLocaleString('id-ID')}</span>
        </div>
        <div className="flex justify-between font-semibold text-green-600">
          <span>Margin</span>
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
