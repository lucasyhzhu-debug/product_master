import { useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import {
  useCreateOrder,
  useCustomers,
  useProductSuggestions,
  useSellerSuggestions,
} from '@/hooks';
import type { OrderItemCreate, CustomerSummary, ProductSuggestion } from '@/lib/types';

const CHANNELS = ['IG', 'WA', 'Shopee', 'Tokopedia', 'Offline', 'Other'];

interface LineItem extends OrderItemCreate {
  id: string;
}

interface OrderFormProps {
  onSuccess?: () => void;
}

export function OrderForm({ onSuccess }: OrderFormProps) {
  // Customer state
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [isNewCustomer, setIsNewCustomer] = useState(false);

  // Order state
  const [channel, setChannel] = useState<string>('');
  const [soldBy, setSoldBy] = useState('');
  const [soldBySearch, setSoldBySearch] = useState('');
  const [showSoldByDropdown, setShowSoldByDropdown] = useState(false);
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');

  // Line items
  const [lineItems, setLineItems] = useState<LineItem[]>([
    {
      id: crypto.randomUUID(),
      product_name: '',
      quantity: 1,
      unit_price: 0,
      unit_cost: 0,
    },
  ]);

  // Queries
  const { data: customers } = useCustomers(customerSearch || undefined);
  const { data: productSuggestions } = useProductSuggestions();
  const { data: sellerSuggestions } = useSellerSuggestions();
  const createOrder = useCreateOrder();

  // Calculate totals
  const totals = lineItems.reduce(
    (acc, item) => {
      const lineTotal = item.quantity * item.unit_price;
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
  };

  const handleCreateNewCustomer = () => {
    setIsNewCustomer(true);
    setCustomerId(null);
    setNewCustomerName(customerSearch);
    setShowCustomerDropdown(false);
  };

  const handleSoldBySelect = (seller: string) => {
    setSoldBy(seller);
    setSoldBySearch(seller);
    setShowSoldByDropdown(false);
  };

  const handleProductSelect = (index: number, suggestion: ProductSuggestion) => {
    const updated = [...lineItems];
    updated[index] = {
      ...updated[index],
      product_name: suggestion.product_name,
      product_variant: suggestion.product_variant || undefined,
      unit_price: suggestion.last_unit_price,
      unit_cost: suggestion.last_unit_cost,
    };
    setLineItems(updated);
  };

  const updateLineItem = (index: number, field: keyof LineItem, value: string | number) => {
    const updated = [...lineItems];
    updated[index] = { ...updated[index], [field]: value };
    setLineItems(updated);
  };

  const addLineItem = () => {
    setLineItems([
      ...lineItems,
      {
        id: crypto.randomUUID(),
        product_name: '',
        quantity: 1,
        unit_price: 0,
        unit_cost: 0,
      },
    ]);
  };

  const removeLineItem = (index: number) => {
    if (lineItems.length > 1) {
      setLineItems(lineItems.filter((_, i) => i !== index));
    }
  };

  const handleSubmit = async () => {
    // Validation
    if (!isNewCustomer && !customerId) {
      alert('Please select or create a customer');
      return;
    }
    if (isNewCustomer && !newCustomerName.trim()) {
      alert('Please enter customer name');
      return;
    }
    if (lineItems.some((item) => !item.product_name.trim())) {
      alert('Please fill in all product names');
      return;
    }
    if (lineItems.some((item) => item.unit_price <= 0)) {
      alert('Please enter valid prices for all items');
      return;
    }

    const orderData = {
      customer_id: isNewCustomer ? null : customerId,
      new_customer: isNewCustomer
        ? { name: newCustomerName, phone: newCustomerPhone || null }
        : null,
      channel: channel || null,
      sold_by: soldBy || null,
      due_date: dueDate || null,
      notes: notes || null,
      items: lineItems.map(({ id, ...item }) => ({
        ...item,
        unit_cost: item.unit_cost || 0,
        discount_amount: 0,
      })),
    };

    try {
      await createOrder.mutateAsync(orderData);
      onSuccess?.();
    } catch (error) {
      // Error handled by mutation
    }
  };

  return (
    <div className="space-y-4">
      {/* Customer */}
      <div className="space-y-2">
        <Label>Customer *</Label>
        {isNewCustomer ? (
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input
                placeholder="Customer name"
                value={newCustomerName}
                onChange={(e) => setNewCustomerName(e.target.value)}
                className="flex-1"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => {
                  setIsNewCustomer(false);
                  setCustomerSearch('');
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <Input
              placeholder="Phone (optional)"
              value={newCustomerPhone}
              onChange={(e) => setNewCustomerPhone(e.target.value)}
            />
          </div>
        ) : (
          <div className="relative">
            <Input
              placeholder="Search customer..."
              value={customerSearch}
              onChange={(e) => {
                setCustomerSearch(e.target.value);
                setShowCustomerDropdown(true);
                setCustomerId(null);
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
      </div>

      {/* Channel & Sold By */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Channel</Label>
          <Select value={channel} onValueChange={setChannel}>
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
              value={soldBySearch}
              onChange={(e) => {
                setSoldBySearch(e.target.value);
                setSoldBy(e.target.value);
                setShowSoldByDropdown(true);
              }}
              onFocus={() => setShowSoldByDropdown(true)}
              onBlur={() => setTimeout(() => setShowSoldByDropdown(false), 200)}
            />
            {showSoldByDropdown && sellerSuggestions && sellerSuggestions.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-background border rounded-md shadow-lg max-h-32 overflow-auto">
                {sellerSuggestions
                  .filter((s) =>
                    s.sold_by.toLowerCase().includes(soldBySearch.toLowerCase())
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
          type="datetime-local"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
        />
      </div>

      {/* Line Items */}
      <div className="space-y-2">
        <Label>Items *</Label>
        <div className="space-y-3">
          {lineItems.map((item, index) => (
            <LineItemRow
              key={item.id}
              item={item}
              index={index}
              productSuggestions={productSuggestions}
              onUpdate={updateLineItem}
              onRemove={() => removeLineItem(index)}
              onProductSelect={(suggestion) => handleProductSelect(index, suggestion)}
              canRemove={lineItems.length > 1}
            />
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full mt-2"
          onClick={addLineItem}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Item
        </Button>
      </div>

      {/* Notes */}
      <div className="space-y-2">
        <Label>Notes</Label>
        <Textarea
          placeholder="Special instructions..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
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
    </div>
  );
}

interface LineItemRowProps {
  item: LineItem;
  index: number;
  productSuggestions?: ProductSuggestion[];
  onUpdate: (index: number, field: keyof LineItem, value: string | number) => void;
  onRemove: () => void;
  onProductSelect: (suggestion: ProductSuggestion) => void;
  canRemove: boolean;
}

function LineItemRow({
  item,
  index,
  productSuggestions,
  onUpdate,
  onRemove,
  onProductSelect,
  canRemove,
}: LineItemRowProps) {
  const [showSuggestions, setShowSuggestions] = useState(false);

  const filteredSuggestions = productSuggestions?.filter((s) =>
    s.product_name.toLowerCase().includes(item.product_name.toLowerCase())
  );

  return (
    <div className="border rounded-md p-3 space-y-2">
      <div className="flex gap-2">
        {/* Product Name with autocomplete */}
        <div className="relative flex-1">
          <Input
            placeholder="Product name"
            value={item.product_name}
            onChange={(e) => {
              onUpdate(index, 'product_name', e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          />
          {showSuggestions &&
            filteredSuggestions &&
            filteredSuggestions.length > 0 &&
            item.product_name && (
              <div className="absolute z-10 w-full mt-1 bg-background border rounded-md shadow-lg max-h-32 overflow-auto">
                {filteredSuggestions.slice(0, 5).map((suggestion) => (
                  <button
                    key={`${suggestion.product_name}-${suggestion.product_variant}`}
                    className="w-full px-3 py-2 text-left hover:bg-accent text-sm"
                    onClick={() => onProductSelect(suggestion)}
                  >
                    <div>{suggestion.product_name}</div>
                    <div className="text-xs text-muted-foreground">
                      Last: Rp {suggestion.last_unit_price.toLocaleString('id-ID')}
                    </div>
                  </button>
                ))}
              </div>
            )}
        </div>

        {canRemove && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onRemove}
            className="text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div>
          <Label className="text-xs">Qty</Label>
          <Input
            type="number"
            min="1"
            value={item.quantity}
            onChange={(e) => onUpdate(index, 'quantity', parseInt(e.target.value) || 1)}
          />
        </div>
        <div>
          <Label className="text-xs">Price</Label>
          <Input
            type="number"
            min="0"
            value={item.unit_price || ''}
            onChange={(e) => onUpdate(index, 'unit_price', parseFloat(e.target.value) || 0)}
            placeholder="0"
          />
        </div>
        <div>
          <Label className="text-xs">Cost</Label>
          <Input
            type="number"
            min="0"
            value={item.unit_cost || ''}
            onChange={(e) => onUpdate(index, 'unit_cost', parseFloat(e.target.value) || 0)}
            placeholder="0"
          />
        </div>
      </div>
    </div>
  );
}
