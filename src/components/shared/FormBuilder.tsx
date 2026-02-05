import { useState } from 'react';
import { Save, Loader2 } from 'lucide-react';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// Field type definitions
export type FieldType =
  | 'text'
  | 'email'
  | 'number'
  | 'textarea'
  | 'select'
  | 'checkbox'
  | 'date'
  | 'currency'
  | 'phone'
  | 'custom';

export interface SelectOption {
  value: string;
  label: string;
}

export interface FormField<T = any> {
  name: keyof T;
  label: string;
  type: FieldType;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  helperText?: string;
  options?: SelectOption[]; // For select fields
  min?: number; // For number fields
  max?: number;
  step?: number;
  rows?: number; // For textarea
  validation?: (value: any) => string | null; // Custom validation
  transform?: (value: any) => any; // Transform before submit
  render?: (props: CustomFieldRenderProps<T>) => React.ReactNode; // Custom render
  defaultValue?: any;
  hideIf?: (formData: T) => boolean; // Conditional visibility
}

export interface CustomFieldRenderProps<T> {
  field: FormField<T>;
  value: any;
  onChange: (value: any) => void;
  error?: string;
  disabled?: boolean;
}

export interface FormSection<T> {
  title?: string;
  description?: string;
  fields: FormField<T>[];
  collapsible?: boolean;
  defaultExpanded?: boolean;
}

export interface FormBuilderProps<T extends Record<string, any>> {
  sections: FormSection<T>[];
  initialData?: Partial<T>;
  onSubmit: (data: T) => Promise<void>;
  onCancel?: () => void;
  submitLabel?: string;
  cancelLabel?: string;
  isSubmitting?: boolean;
  className?: string;
  validateOnChange?: boolean;
  showRequiredIndicator?: boolean;
}

export function FormBuilder<T extends Record<string, any>>({
  sections,
  initialData = {},
  onSubmit,
  onCancel,
  submitLabel = 'Save',
  cancelLabel = 'Cancel',
  isSubmitting: externalIsSubmitting = false,
  className,
  validateOnChange = false,
  showRequiredIndicator = true,
}: FormBuilderProps<T>) {
  // Initialize form data with defaults
  const [formData, setFormData] = useState<T>(() => {
    const initial: any = { ...initialData };
    sections.forEach((section) => {
      section.fields.forEach((field) => {
        if (initial[field.name] === undefined && field.defaultValue !== undefined) {
          initial[field.name] = field.defaultValue;
        }
      });
    });
    return initial as T;
  });

  const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({});
  const [internalIsSubmitting, setInternalIsSubmitting] = useState(false);
  const isSubmitting = externalIsSubmitting || internalIsSubmitting;

  // Get all fields from all sections
  const allFields = sections.flatMap((section) => section.fields);

  // Validate single field
  const validateField = (field: FormField<T>, value: any): string | null => {
    // Required validation
    if (field.required && (value === null || value === undefined || value === '')) {
      return `${field.label} is required`;
    }

    // Type-specific validation
    if (field.type === 'email' && value) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(value)) {
        return 'Invalid email address';
      }
    }

    if (field.type === 'number' && value !== null && value !== undefined && value !== '') {
      const num = Number(value);
      if (isNaN(num)) {
        return 'Must be a valid number';
      }
      if (field.min !== undefined && num < field.min) {
        return `Must be at least ${field.min}`;
      }
      if (field.max !== undefined && num > field.max) {
        return `Must be at most ${field.max}`;
      }
    }

    // Custom validation
    if (field.validation) {
      return field.validation(value);
    }

    return null;
  };

  // Validate all fields
  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof T, string>> = {};

    allFields.forEach((field) => {
      // Skip validation for hidden fields
      if (field.hideIf && field.hideIf(formData)) {
        return;
      }

      const error = validateField(field, formData[field.name]);
      if (error) {
        newErrors[field.name] = error;
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Update field value
  const updateField = (name: keyof T, value: any) => {
    const newFormData = { ...formData, [name]: value };
    setFormData(newFormData);

    // Validate on change if enabled
    if (validateOnChange) {
      const field = allFields.find((f) => f.name === name);
      if (field) {
        const error = validateField(field, value);
        setErrors((prev) => ({
          ...prev,
          [name]: error || undefined,
        }));
      }
    } else if (errors[name]) {
      // Clear error for this field
      setErrors((prev) => {
        const { [name]: _, ...rest } = prev;
        return rest as Partial<Record<keyof T, string>>;
      });
    }
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate form
    if (!validateForm()) {
      const firstError = Object.values(errors)[0];
      if (firstError) {
        toast.error(firstError);
      }
      return;
    }

    // Transform data if needed
    const transformedData = { ...formData };
    allFields.forEach((field) => {
      if (field.transform && transformedData[field.name] !== undefined) {
        transformedData[field.name] = field.transform(transformedData[field.name]);
      }
    });

    setInternalIsSubmitting(true);
    try {
      await onSubmit(transformedData);
    } catch (error) {
      console.error('Form submission error:', error);
      toast.error('Failed to submit form');
    } finally {
      setInternalIsSubmitting(false);
    }
  };

  // Render individual field
  const renderField = (field: FormField<T>) => {
    // Skip if conditionally hidden
    if (field.hideIf && field.hideIf(formData)) {
      return null;
    }

    const value = formData[field.name];
    const error = errors[field.name];
    const fieldId = `field-${String(field.name)}`;

    // Custom render
    if (field.type === 'custom' && field.render) {
      return (
        <div key={String(field.name)} className="space-y-2">
          {field.render({
            field,
            value,
            onChange: (val) => updateField(field.name, val),
            error,
            disabled: field.disabled || isSubmitting,
          })}
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>
      );
    }

    const commonProps = {
      id: fieldId,
      disabled: field.disabled || isSubmitting,
      className: error ? 'border-destructive' : '',
    };

    return (
      <div key={String(field.name)} className="space-y-2">
        <Label htmlFor={fieldId}>
          {field.label}
          {showRequiredIndicator && field.required && (
            <span className="text-destructive ml-1">*</span>
          )}
        </Label>

        {/* Text input */}
        {field.type === 'text' && (
          <Input
            {...commonProps}
            type="text"
            value={value || ''}
            onChange={(e) => updateField(field.name, e.target.value)}
            placeholder={field.placeholder}
          />
        )}

        {/* Email input */}
        {field.type === 'email' && (
          <Input
            {...commonProps}
            type="email"
            value={value || ''}
            onChange={(e) => updateField(field.name, e.target.value)}
            placeholder={field.placeholder}
          />
        )}

        {/* Number input */}
        {field.type === 'number' && (
          <Input
            {...commonProps}
            type="number"
            value={value ?? ''}
            onChange={(e) => updateField(field.name, e.target.value ? Number(e.target.value) : '')}
            placeholder={field.placeholder}
            min={field.min}
            max={field.max}
            step={field.step}
          />
        )}

        {/* Currency input (special number input with IDR formatting) */}
        {field.type === 'currency' && (
          <Input
            {...commonProps}
            type="number"
            value={value ?? ''}
            onChange={(e) => updateField(field.name, e.target.value ? Number(e.target.value) : '')}
            placeholder={field.placeholder || 'e.g., 15000'}
            min={0}
            step={field.step || 1}
          />
        )}

        {/* Phone input */}
        {field.type === 'phone' && (
          <Input
            {...commonProps}
            type="tel"
            value={value || ''}
            onChange={(e) => updateField(field.name, e.target.value)}
            placeholder={field.placeholder || 'e.g., 08123456789'}
          />
        )}

        {/* Date input */}
        {field.type === 'date' && (
          <Input
            {...commonProps}
            type="date"
            value={value || ''}
            onChange={(e) => updateField(field.name, e.target.value)}
          />
        )}

        {/* Textarea */}
        {field.type === 'textarea' && (
          <Textarea
            {...commonProps}
            value={value || ''}
            onChange={(e) => updateField(field.name, e.target.value)}
            placeholder={field.placeholder}
            rows={field.rows || 3}
          />
        )}

        {/* Select */}
        {field.type === 'select' && (
          <Select
            value={value || ''}
            onValueChange={(val) => updateField(field.name, val)}
            disabled={field.disabled || isSubmitting}
          >
            <SelectTrigger className={error ? 'border-destructive' : ''}>
              <SelectValue placeholder={field.placeholder || 'Select an option'} />
            </SelectTrigger>
            <SelectContent>
              {field.options?.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Checkbox */}
        {field.type === 'checkbox' && (
          <div className="flex items-center space-x-2">
            <Checkbox
              id={fieldId}
              checked={value || false}
              onCheckedChange={(checked) => updateField(field.name, checked)}
              disabled={field.disabled || isSubmitting}
            />
            <Label
              htmlFor={fieldId}
              className="text-sm font-normal cursor-pointer"
            >
              {field.placeholder || field.label}
            </Label>
          </div>
        )}

        {/* Helper text */}
        {field.helperText && !error && (
          <p className="text-xs text-muted-foreground">{field.helperText}</p>
        )}

        {/* Error message */}
        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}
      </div>
    );
  };

  return (
    <form onSubmit={handleSubmit} className={cn('space-y-6', className)}>
      {sections.map((section, sectionIndex) => (
        <div key={sectionIndex}>
          {section.title && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{section.title}</CardTitle>
                {section.description && (
                  <p className="text-sm text-muted-foreground">{section.description}</p>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                {section.fields.map((field) => renderField(field))}
              </CardContent>
            </Card>
          )}

          {!section.title && (
            <div className="space-y-4">
              {section.fields.map((field) => renderField(field))}
            </div>
          )}

          {sectionIndex < sections.length - 1 && <Separator className="my-6" />}
        </div>
      ))}

      {/* Form actions */}
      <div className="flex justify-end gap-3">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            {cancelLabel}
          </Button>
        )}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              {submitLabel}
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
