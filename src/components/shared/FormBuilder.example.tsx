/**
 * FormBuilder Usage Examples
 *
 * This file contains practical examples of using the FormBuilder component
 * for various common scenarios in the Frollie Recipe Master application.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FormBuilder, type FormSection } from './FormBuilder';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import type { Id } from '../../../convex/_generated/dataModel';

// ============================================================================
// Example 1: Simple Customer Form
// ============================================================================

interface CustomerFormData {
  name: string;
  email: string;
  phone: string;
  notes: string;
}

export function CustomerFormExample() {
  const navigate = useNavigate();

  const sections: FormSection<CustomerFormData>[] = [
    {
      title: 'Customer Information',
      description: 'Enter the customer details below',
      fields: [
        {
          name: 'name',
          label: 'Customer Name',
          type: 'text',
          required: true,
          placeholder: 'e.g., John Doe',
        },
        {
          name: 'email',
          label: 'Email',
          type: 'email',
          required: true,
          placeholder: 'customer@example.com',
          helperText: 'We will send receipts to this email',
        },
        {
          name: 'phone',
          label: 'Phone Number',
          type: 'phone',
          required: true,
          placeholder: '08123456789',
        },
        {
          name: 'notes',
          label: 'Notes',
          type: 'textarea',
          rows: 4,
          placeholder: 'Any special notes about this customer...',
          helperText: 'Optional',
        },
      ],
    },
  ];

  const handleSubmit = async (data: CustomerFormData) => {
    // Your Convex mutation call here
    console.log('Submitting customer:', data);
    toast.success('Customer created successfully!');
    navigate('/customers');
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <FormBuilder
        sections={sections}
        onSubmit={handleSubmit}
        onCancel={() => navigate('/customers')}
        submitLabel="Create Customer"
      />
    </div>
  );
}

// ============================================================================
// Example 2: Product Form with Conditional Fields
// ============================================================================

interface ProductFormData {
  name: string;
  code: string;
  price: number;
  cost: number;
  stockTracking: boolean;
  currentStock: number;
  minStock: number;
  category: string;
  description: string;
}

export function ProductFormExample() {
  const sections: FormSection<ProductFormData>[] = [
    {
      title: 'Basic Information',
      fields: [
        {
          name: 'code',
          label: 'Product Code',
          type: 'text',
          placeholder: 'e.g., MP001',
          helperText: 'Internal reference code',
        },
        {
          name: 'name',
          label: 'Product Name',
          type: 'text',
          required: true,
          placeholder: 'e.g., Pistachio Crunch',
        },
        {
          name: 'category',
          label: 'Category',
          type: 'select',
          required: true,
          options: [
            { value: 'snacks', label: 'Snacks' },
            { value: 'beverages', label: 'Beverages' },
            { value: 'desserts', label: 'Desserts' },
          ],
        },
        {
          name: 'description',
          label: 'Description',
          type: 'textarea',
          placeholder: 'Describe the product...',
          rows: 3,
        },
      ],
    },
    {
      title: 'Pricing & Costs',
      fields: [
        {
          name: 'price',
          label: 'Selling Price',
          type: 'currency',
          required: true,
          min: 0,
          helperText: 'Price in IDR',
        },
        {
          name: 'cost',
          label: 'Unit Cost',
          type: 'currency',
          required: true,
          min: 0,
          helperText: 'COGS per unit',
        },
      ],
    },
    {
      title: 'Inventory',
      fields: [
        {
          name: 'stockTracking',
          label: 'Enable Stock Tracking',
          type: 'checkbox',
          placeholder: 'Track inventory levels for this product',
          defaultValue: false,
        },
        {
          name: 'currentStock',
          label: 'Current Stock',
          type: 'number',
          min: 0,
          defaultValue: 0,
          // Only show if stock tracking is enabled
          hideIf: (data) => !data.stockTracking,
        },
        {
          name: 'minStock',
          label: 'Minimum Stock Level',
          type: 'number',
          min: 0,
          defaultValue: 10,
          helperText: 'Alert when stock falls below this level',
          hideIf: (data) => !data.stockTracking,
        },
      ],
    },
  ];

  const handleSubmit = async (data: ProductFormData) => {
    console.log('Submitting product:', data);
    toast.success('Product created successfully!');
  };

  return (
    <div className="max-w-3xl mx-auto p-6">
      <FormBuilder
        sections={sections}
        onSubmit={handleSubmit}
        submitLabel="Create Product"
        validateOnChange={true}
      />
    </div>
  );
}

// ============================================================================
// Example 3: Custom Field Rendering with Tags
// ============================================================================

interface RecipeFormData {
  name: string;
  estimatedYield: number;
  tagIds: Id<"tags">[];
  isReusable: boolean;
  description: string;
}

export function RecipeFormWithCustomFields() {
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  // Mock tags data - in real app, fetch from Convex
  const availableTags = [
    { _id: 'tag1', name: 'Snack' },
    { _id: 'tag2', name: 'Extruded' },
    { _id: 'tag3', name: 'Baked' },
  ];

  const sections: FormSection<RecipeFormData>[] = [
    {
      title: 'Recipe Details',
      fields: [
        {
          name: 'name',
          label: 'Recipe Name',
          type: 'text',
          required: true,
          placeholder: 'e.g., Chocolate Chip Cookies',
        },
        {
          name: 'description',
          label: 'Description',
          type: 'textarea',
          placeholder: 'Describe the recipe...',
          rows: 3,
        },
        {
          name: 'estimatedYield',
          label: 'Estimated Yield (grams)',
          type: 'number',
          required: true,
          min: 1,
          step: 1,
          helperText: 'Total weight of finished product',
        },
        {
          name: 'isReusable',
          label: 'Reusable Component',
          type: 'checkbox',
          placeholder: 'Can be used as component in other recipes',
          helperText: 'Enable this if recipe should appear in component selection',
        },
        {
          name: 'tagIds',
          label: 'Tags',
          type: 'custom',
          render: ({ onChange }) => (
            <div className="flex flex-wrap gap-2">
              {availableTags.map((tag) => (
                <Badge
                  key={tag._id}
                  variant={selectedTags.includes(tag._id) ? 'default' : 'outline'}
                  className="cursor-pointer"
                  onClick={() => {
                    const newTags = selectedTags.includes(tag._id)
                      ? selectedTags.filter((t) => t !== tag._id)
                      : [...selectedTags, tag._id];
                    setSelectedTags(newTags);
                    onChange(newTags as Id<"tags">[]);
                  }}
                >
                  {tag.name}
                </Badge>
              ))}
            </div>
          ),
        },
      ],
    },
  ];

  const handleSubmit = async (data: RecipeFormData) => {
    console.log('Submitting recipe:', data);
    toast.success('Recipe created successfully!');
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <FormBuilder
        sections={sections}
        onSubmit={handleSubmit}
        submitLabel="Create Recipe"
      />
    </div>
  );
}

// ============================================================================
// Example 4: Form with Custom Validation
// ============================================================================

interface OrderFormData {
  customerName: string;
  orderDate: string;
  dueDate: string;
  totalAmount: number;
  advancePayment: number;
  deliveryType: 'Pickup' | 'Delivery' | '';
  deliveryAddress: string;
}

export function OrderFormWithValidation() {
  const sections: FormSection<OrderFormData>[] = [
    {
      fields: [
        {
          name: 'customerName',
          label: 'Customer Name',
          type: 'text',
          required: true,
        },
        {
          name: 'orderDate',
          label: 'Order Date',
          type: 'date',
          required: true,
          defaultValue: new Date().toISOString().split('T')[0],
        },
        {
          name: 'dueDate',
          label: 'Due Date',
          type: 'date',
          required: true,
          validation: (value) => {
            // Custom validation: due date must be after order date
            const form = document.querySelector('form');
            if (form) {
              const orderDateInput = form.querySelector('[name="orderDate"]') as HTMLInputElement;
              if (orderDateInput?.value && value < orderDateInput.value) {
                return 'Due date must be on or after order date';
              }
            }
            return null;
          },
        },
        {
          name: 'totalAmount',
          label: 'Total Amount',
          type: 'currency',
          required: true,
          min: 0,
        },
        {
          name: 'advancePayment',
          label: 'Advance Payment',
          type: 'currency',
          min: 0,
          defaultValue: 0,
          validation: (value) => {
            // Custom validation: advance payment cannot exceed total
            const form = document.querySelector('form');
            if (form) {
              const totalInput = form.querySelector('[name="totalAmount"]') as HTMLInputElement;
              const total = parseFloat(totalInput?.value || '0');
              if (value > total) {
                return 'Advance payment cannot exceed total amount';
              }
            }
            return null;
          },
          helperText: 'Amount paid upfront',
        },
        {
          name: 'deliveryType',
          label: 'Delivery Type',
          type: 'select',
          required: true,
          options: [
            { value: 'Pickup', label: 'Pickup' },
            { value: 'Delivery', label: 'Delivery' },
          ],
        },
        {
          name: 'deliveryAddress',
          label: 'Delivery Address',
          type: 'textarea',
          required: true,
          rows: 3,
          hideIf: (data) => data.deliveryType !== 'Delivery',
          placeholder: 'Enter delivery address...',
        },
      ],
    },
  ];

  const handleSubmit = async (data: OrderFormData) => {
    console.log('Submitting order:', data);
    toast.success('Order created successfully!');
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <FormBuilder
        sections={sections}
        onSubmit={handleSubmit}
        submitLabel="Create Order"
        validateOnChange={true}
      />
    </div>
  );
}

// ============================================================================
// Example 5: Form with Data Transformation
// ============================================================================

interface VoucherFormData {
  code: string;
  discountPercent: number;
  maxUsage: number;
  expiryDate: string;
  isActive: boolean;
}

export function VoucherFormExample() {
  const sections: FormSection<VoucherFormData>[] = [
    {
      title: 'Voucher Details',
      fields: [
        {
          name: 'code',
          label: 'Voucher Code',
          type: 'text',
          required: true,
          placeholder: 'e.g., SAVE20',
          // Transform to uppercase before submit
          transform: (value) => value.toUpperCase(),
        },
        {
          name: 'discountPercent',
          label: 'Discount Percentage',
          type: 'number',
          required: true,
          min: 1,
          max: 100,
          step: 1,
          helperText: 'Enter value between 1-100',
        },
        {
          name: 'maxUsage',
          label: 'Maximum Usage Count',
          type: 'number',
          required: true,
          min: 1,
          defaultValue: 1,
          helperText: 'How many times this voucher can be used',
        },
        {
          name: 'expiryDate',
          label: 'Expiry Date',
          type: 'date',
          required: true,
          // Transform to timestamp before submit
          transform: (value) => new Date(value).getTime(),
        },
        {
          name: 'isActive',
          label: 'Active',
          type: 'checkbox',
          placeholder: 'Make this voucher active immediately',
          defaultValue: true,
        },
      ],
    },
  ];

  const handleSubmit = async (data: VoucherFormData) => {
    console.log('Submitting voucher:', data);
    // Data will have code as uppercase and expiryDate as timestamp
    toast.success('Voucher created successfully!');
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <FormBuilder
        sections={sections}
        onSubmit={handleSubmit}
        submitLabel="Create Voucher"
      />
    </div>
  );
}
