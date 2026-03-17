/**
 * Business Settings page -- admin-only page for configuring company identity.
 *
 * 5 stacked sections:
 * 1. Brand Identity (name + logo)
 * 2. Contact Information (address, phone, email)
 * 3. Tax Information (NPWP)
 * 4. Default Bank Account (radio card selector)
 * 5. Invoice Header Preview (live preview of current form state)
 */
import { useState, useEffect, useCallback } from "react";
import { Save, Loader2 } from "lucide-react";
import type { Id } from "../../convex/_generated/dataModel";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  useBusinessSettings,
  useUpsertBusinessSettings,
  useBusinessSettingsUploadUrl,
  useBankAccounts,
} from "@/hooks/convex";
import type { BankAccount } from "@/hooks/convex/useBankAccounts";
import { LogoUploader } from "@/components/settings/LogoUploader";
import { BankAccountSelector } from "@/components/settings/BankAccountSelector";
import { InvoiceHeaderPreview } from "@/components/settings/InvoiceHeaderPreview";

interface FormState {
  businessName: string;
  address: string;
  phone: string;
  email: string;
  npwp: string;
  logoStorageId: Id<"_storage"> | undefined;
  logoUrl: string | null;
  defaultBankAccountId: Id<"bankAccounts"> | undefined;
}

const EMPTY_FORM: FormState = {
  businessName: "",
  address: "",
  phone: "",
  email: "",
  npwp: "",
  logoStorageId: undefined,
  logoUrl: null,
  defaultBankAccountId: undefined,
};

export function BusinessSettings() {
  const settings = useBusinessSettings();
  const bankAccounts = useBankAccounts(true);
  const { mutateAsync: upsert } = useUpsertBusinessSettings();
  const generateUploadUrl = useBusinessSettingsUploadUrl();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Initialize form from loaded settings (once)
  useEffect(() => {
    if (settings !== undefined && !initialized) {
      if (settings) {
        setForm({
          businessName: settings.businessName ?? "",
          address: settings.address ?? "",
          phone: settings.phone ?? "",
          email: settings.email ?? "",
          npwp: settings.npwp ?? "",
          logoStorageId: settings.logoStorageId ?? undefined,
          logoUrl: settings.logoUrl ?? null,
          defaultBankAccountId: settings.defaultBankAccountId ?? undefined,
        });
      }
      setInitialized(true);
    }
  }, [settings, initialized]);

  const updateField = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setIsDirty(true);
  }, []);

  // Find the selected bank account for the preview
  const selectedBankAccount = bankAccounts && form.defaultBankAccountId
    ? bankAccounts.find((a) => a._id === form.defaultBankAccountId) ?? null
    : null;

  async function handleSave() {
    if (!form.businessName.trim()) return;

    setSaving(true);
    try {
      await upsert({
        businessName: form.businessName.trim(),
        // Always include optional fields so clearing them persists via ctx.db.patch
        // (Convex removes fields set to undefined)
        address: form.address.trim() || undefined,
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        npwp: form.npwp.trim() || undefined,
        logoStorageId: form.logoStorageId ?? undefined,
        defaultBankAccountId: form.defaultBankAccountId ?? undefined,
      });
      setIsDirty(false);
    } finally {
      setSaving(false);
    }
  }

  // Loading state
  if (settings === undefined || bankAccounts === undefined) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Business Settings"
        description="Configure your company identity for invoices and receipts"
      />

      {/* Section 1: Brand Identity */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Brand Identity</CardTitle>
          <CardDescription>Your company name and logo as they appear on invoices</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="businessName">
              Business Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="businessName"
              placeholder="e.g. PT Malo Group Bahagia"
              value={form.businessName}
              onChange={(e) => updateField("businessName", e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Company Logo</Label>
            <LogoUploader
              logoUrl={form.logoUrl}
              onUpload={(storageId) => {
                updateField("logoStorageId", storageId);
                // Clear the URL preview immediately when removing; new URL will come from next query
                if (!storageId) {
                  updateField("logoUrl", null);
                }
              }}
              generateUploadUrl={generateUploadUrl}
            />
          </div>
        </CardContent>
      </Card>

      {/* Section 2: Contact Information */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contact Information</CardTitle>
          <CardDescription>Address and contact details displayed on invoices</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="address">Address</Label>
            <Textarea
              id="address"
              placeholder="Business address"
              rows={3}
              value={form.address}
              onChange={(e) => updateField("address", e.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                placeholder="+62 xxx xxxx xxxx"
                value={form.phone}
                onChange={(e) => updateField("phone", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="billing@company.com"
                value={form.email}
                onChange={(e) => updateField("email", e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section 3: Tax Information */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tax Information</CardTitle>
          <CardDescription>Tax identification for invoice compliance</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="npwp">NPWP</Label>
            <Input
              id="npwp"
              placeholder="XX.XXX.XXX.X-XXX.XXX"
              value={form.npwp}
              onChange={(e) => updateField("npwp", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Optional for non-PKP UMKM businesses
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Section 4: Default Bank Account */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Default Bank Account</CardTitle>
          <CardDescription>Bank account shown on invoices for payment transfers</CardDescription>
        </CardHeader>
        <CardContent>
          <BankAccountSelector
            bankAccounts={bankAccounts as BankAccount[]}
            selectedId={form.defaultBankAccountId}
            onSelect={(id) => updateField("defaultBankAccountId", id)}
          />
        </CardContent>
      </Card>

      {/* Section 5: Invoice Header Preview */}
      <InvoiceHeaderPreview
        businessName={form.businessName}
        address={form.address}
        phone={form.phone}
        email={form.email}
        npwp={form.npwp}
        logoUrl={form.logoUrl}
        bankAccount={
          selectedBankAccount
            ? {
                bankName: selectedBankAccount.bankName,
                accountNumber: selectedBankAccount.accountNumber,
                name: selectedBankAccount.name,
              }
            : null
        }
      />

      {/* Save button */}
      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={!isDirty || saving || !form.businessName.trim()}
          className="min-w-[120px]"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Save Settings
        </Button>
      </div>
    </div>
  );
}
