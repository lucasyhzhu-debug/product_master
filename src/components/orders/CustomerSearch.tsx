import { useState, useEffect, useRef } from 'react';
import { Search, Plus, X, User, MapPin } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useCustomerSearch } from '@/hooks/convex';
import { CustomerLabel, type CustomerPickerOption } from './CustomerLabel';
import type { Id } from '../../../convex/_generated/dataModel';

interface CustomerSearchProps {
  onCustomerSelect: (customerId: Id<"customers">, name: string, phone?: string, defaultAddress?: string) => void;
  onNewCustomer: (name: string, phone?: string) => Promise<Id<"customers"> | undefined>;
}

export function CustomerSearch({ onCustomerSelect, onNewCustomer }: CustomerSearchProps) {
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [selected, setSelected] = useState<{ id: Id<"customers"> | null; name: string; phone?: string; defaultAddress?: string; customerType?: "direct_b2c" | "b2b_wholesale" | null; companyName?: string | null } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchText), 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  const customers = useCustomerSearch(debouncedSearch, 10);

  // Click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (customer: CustomerPickerOption) => {
    const id = customer._id as Id<"customers">;
    const defaultAddress = customer.defaultAddress ?? undefined;
    setSelected({ id, name: customer.name, phone: customer.phone ?? undefined, defaultAddress, customerType: customer.customerType, companyName: customer.companyName });
    setSearchText('');
    setShowDropdown(false);
    setShowNewForm(false);
    onCustomerSelect(id, customer.name, customer.phone ?? undefined, defaultAddress);
  };

  const handleCreateNew = () => {
    setShowNewForm(true);
    setShowDropdown(false);
    setNewName(searchText);
    setNewPhone('');
  };

  const handleSubmitNew = async () => {
    if (!newName.trim()) return;
    const name = newName.trim();
    const phone = newPhone.trim() || undefined;
    const customerId = await onNewCustomer(name, phone);
    setSearchText('');
    setShowNewForm(false);
    // Show the created customer as selected (use real ID if available)
    setSelected({ id: customerId ?? null, name, phone });
  };

  const handleChange = () => {
    setSelected(null);
    setSearchText('');
    setShowNewForm(false);
  };

  // Selected state
  if (selected) {
    return (
      <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
        <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <User className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">
            <CustomerLabel
              name={selected.name}
              companyName={selected.companyName}
              customerType={selected.customerType}
            />
          </p>
          {selected.phone && (
            <p className="text-xs text-muted-foreground">{selected.phone}</p>
          )}
          {selected.defaultAddress && (
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">{selected.defaultAddress}</span>
            </p>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={handleChange}>
          Change
        </Button>
      </div>
    );
  }

  // New customer inline form
  if (showNewForm) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Plus className="h-4 w-4 text-primary shrink-0" />
          <span className="text-sm font-medium">New Customer</span>
          <Button variant="ghost" size="icon" className="h-7 w-7 ml-auto" onClick={() => setShowNewForm(false)}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
        <Input
          placeholder="Customer name *"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          autoFocus
        />
        <Input
          placeholder="Phone (optional)"
          value={newPhone}
          onChange={(e) => setNewPhone(e.target.value)}
        />
        <Button size="sm" onClick={handleSubmitNew} disabled={!newName.trim()}>
          Add Customer
        </Button>
      </div>
    );
  }

  // Search state
  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search customer by name or phone..."
          value={searchText}
          onChange={(e) => {
            setSearchText(e.target.value);
            setShowDropdown(true);
          }}
          onFocus={() => { if (searchText) setShowDropdown(true); }}
          className="pl-9"
        />
      </div>

      {showDropdown && searchText && (
        <Card className="absolute z-50 w-full mt-1 shadow-lg max-h-60 overflow-auto">
          {customers && customers.length > 0 && customers.map((customer) => (
            <button
              key={customer._id}
              className="w-full px-4 py-3 text-left hover:bg-muted/50 text-sm border-b last:border-b-0 transition-colors"
              onClick={() => handleSelect(customer)}
            >
              <div className="font-medium">
                <CustomerLabel
                  name={customer.name}
                  companyName={customer.companyName}
                  customerType={customer.customerType}
                />
              </div>
              {customer.phone && (
                <div className="text-xs text-muted-foreground mt-0.5">{customer.phone}</div>
              )}
            </button>
          ))}
          <button
            className="w-full px-4 py-3 text-left hover:bg-primary/5 text-sm text-primary font-medium flex items-center gap-2"
            onClick={handleCreateNew}
          >
            <Plus className="h-4 w-4" />
            Create new customer &quot;{searchText}&quot;
          </button>
        </Card>
      )}
    </div>
  );
}
