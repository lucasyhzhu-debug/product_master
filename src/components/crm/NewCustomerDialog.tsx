/**
 * NewCustomerDialog — create a CRM customer (atomic createCustomer), then
 * navigate to the customer hub. Manager+admin only (reached from /crm).
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSessionMutation } from "convex-helpers/react/sessions";
import { api } from "../../../convex/_generated/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const INITIAL_FORM = {
  name: "",
  companyName: "",
  keyContactName: "",
  keyContactRole: "",
  whatsapp: "",
  phone: "",
  email: "",
  billingAddress: "",
  deliveryAddress: "",
  storeAddress: "",
  notes: "",
};

export function NewCustomerDialog({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const createCustomer = useSessionMutation(api.crm.customers.createCustomer);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);

  function set(k: keyof typeof form, val: string) {
    setForm((f) => ({ ...f, [k]: val }));
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setForm(INITIAL_FORM);
      setSubmitting(false);
    }
    onOpenChange(nextOpen);
  }

  async function handleCreate() {
    if (!form.name.trim()) return;
    setSubmitting(true);
    try {
      // Drop empty strings so we don't write blank fields.
      const args = Object.fromEntries(
        Object.entries(form).filter(([, v]) => v.trim() !== ""),
      ) as { name: string } & Record<string, string>;
      const id = await createCustomer({ ...args, customerType: "b2b_wholesale" });
      onOpenChange(false);
      navigate(`/crm/customers/${id}`);
    } catch {
      toast.error("Could not create customer. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New customer</DialogTitle>
          <DialogDescription>
            Create a B2B customer record. You can add a subscription next.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label htmlFor="cust-name">Name *</Label>
            <Input id="cust-name" value={form.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div><Label htmlFor="cust-company">Company</Label>
            <Input id="cust-company" value={form.companyName} onChange={(e) => set("companyName", e.target.value)} /></div>
          <div><Label htmlFor="cust-contact">Key contact</Label>
            <Input id="cust-contact" value={form.keyContactName} onChange={(e) => set("keyContactName", e.target.value)} /></div>
          <div><Label htmlFor="cust-wa">WhatsApp</Label>
            <Input id="cust-wa" value={form.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} /></div>
          <div><Label htmlFor="cust-phone">Phone</Label>
            <Input id="cust-phone" value={form.phone} onChange={(e) => set("phone", e.target.value)} /></div>
          <div><Label htmlFor="cust-email">Email</Label>
            <Input id="cust-email" value={form.email} onChange={(e) => set("email", e.target.value)} /></div>
          <div><Label htmlFor="cust-billing">Billing address</Label>
            <Input id="cust-billing" value={form.billingAddress} onChange={(e) => set("billingAddress", e.target.value)} /></div>
          <div><Label htmlFor="cust-delivery">Delivery address</Label>
            <Input id="cust-delivery" value={form.deliveryAddress} onChange={(e) => set("deliveryAddress", e.target.value)} /></div>
          <div><Label htmlFor="cust-store">Store address</Label>
            <Input id="cust-store" value={form.storeAddress} onChange={(e) => set("storeAddress", e.target.value)} /></div>
          <div className="col-span-2"><Label htmlFor="cust-notes">Notes</Label>
            <Input id="cust-notes" value={form.notes} onChange={(e) => set("notes", e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={handleCreate} disabled={submitting || !form.name.trim()}>
            {submitting ? "Creating…" : "Create customer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
