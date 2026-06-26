# Subscription Creation & Onboarding UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a manager/admin onboard a B2B customer end-to-end from `/crm` — create a customer, create a subscription (draft) with terms + a weekly schedule template + an optional agreement, then activate it.

**Architecture:** Almost entirely frontend. One additive backend mutation (`crm.customers.createCustomer`) provides atomic rich-customer creation; everything else composes existing manager+admin mutations (`createSubscription`, `updateSubscription`, `linkAgreementToSubscription`). New React surfaces hang off the existing `canAccessCrm`-gated `/crm` routes.

**Tech Stack:** Convex (serverless), React 19 + TypeScript + Vite, shadcn/ui, `convex-helpers` sessions (`useSessionQuery`/`useSessionMutation`), Vitest + @testing-library/react, convex-test.

**Spec:** `docs/superpowers/specs/2026-06-26-subscription-creation-onboarding-design.md`
**Spec staffreview:** `docs/reviews/staffreview-subscription-creation-onboarding-spec-2026-06-26.md`

## Global Constraints

- **Access:** every surface is reachable only under `<ProtectedRoute requiredPermission="canAccessCrm">` (manager+admin). The new backend mutation is `roles:["manager","admin"]` (Pitfall #19 — never a narrower role on a CRM-reachable mount).
- **Money:** integer IDR everywhere; format with `formatCurrency` from `@/lib/utils` (never hand-roll).
- **Convex hooks:** session queries/mutations use `useSessionQuery`/`useSessionMutation` from `convex-helpers/react/sessions`. EXCEPTION: `api.menuProducts.queries.list` is a **public `query`** — call it with plain `useQuery` from `convex/react` and `{ activeOnly: true }` (no `sessionId`), exactly as `SubscriptionSchedulePage.tsx:122` does.
- **dayOfWeek convention:** subscription `scheduleTemplate` uses **0=Mon … 6=Sun** (`convex/subscriptions/mutations.ts:5`), NOT JS Sun=0.
- **weeklyQty is derived, never re-keyed:** `createSubscription` calls `deriveWeeklyQty(scheduleTemplate)` server-side. The form's weekly-qty/credit numbers are display-only (compute inline as Σ line qty; do NOT import the server helper into the bundle).
- **No schema change.** Only additive code + one additive mutation. Re-run `npx convex codegen` after Task 1 and commit `_generated/`.
- **Commit discipline:** one commit per task (TDD: failing test → impl → passing test → commit).

---

## Task List

| ID | Title | Files touched | Wave | Depends-on |
|----|-------|---------------|------|------------|
| T1 | Backend `crm.customers.createCustomer` (atomic) + codegen | `convex/crm/customers.ts`, `convex/crm/__tests__/customers.test.ts`, `convex/_generated/*` | 0 | — |
| T2 | `ScheduleTemplateEditor` component (7 day rows × product+qty) | `src/components/crm/ScheduleTemplateEditor.tsx` + test | 1 | — |
| T3 | `NewCustomerDialog` + "New customer" button on CrmHome | `src/components/crm/NewCustomerDialog.tsx` + test, `src/pages/crm/CrmHome.tsx` | 1 | T1 |
| T4 | `SubscriptionForm` (terms + schedule + agreement + preview + validation) | `src/components/crm/SubscriptionForm.tsx` + test | 2 | T2 |
| T5 | `NewSubscriptionPage` + route + "Add subscription" button & Draft badge | `src/pages/crm/NewSubscriptionPage.tsx`, `src/App.tsx`, `src/pages/crm/CustomerDashboard.tsx` | 3 | T4 |
| T6 | Activate action + guard on `SubscriptionPage` | `src/pages/crm/SubscriptionPage.tsx` + test update | 2 | — |
| T7 | Verification — code-auditor, full test + build | (no source) | 4 | T1–T6 |

---

## Execution Strategy — multi-agent, wave-gated

**Wave dispatch map** (parallelize within a wave; hard barrier between waves):
- **Wave 0 (solo):** T1. Touches `convex/_generated/*` via codegen — must land alone so no other task races the generated files. Re-run `npx convex codegen` once at the end of T1 on the merged tree; commit `_generated/`.
- **Wave 1 (parallel ×2):** T2, T3. Disjoint files (`ScheduleTemplateEditor.tsx` vs `NewCustomerDialog.tsx` + `CrmHome.tsx`). T3 consumes T1's `createCustomer` ref (present after Wave 0).
- **Wave 2 (parallel ×2):** T4 (consumes T2's component), T6 (independent — `SubscriptionPage.tsx`, touched by no one else). Disjoint files.
- **Wave 3 (solo):** T5 — consumes T4's `SubscriptionForm`; wires `App.tsx` route + `CustomerDashboard.tsx` button/badge. Solo because it's the integration seam.
- **Wave 4 (sequential):** T7 verification.

**Shared / generated-file serialization:** No two tasks modify the same source file. The only generated artifact (`convex/_generated/api.d.ts`) is written solely by T1 in Wave 0 — re-run codegen once there. `App.tsx`, `CrmHome.tsx`, `CustomerDashboard.tsx`, `SubscriptionPage.tsx` are each touched by exactly one task.

**Critical path:** T1 → T2 → T4 → T5 → T7 (sets minimum wall-clock). T3 and T6 are off the critical path.

**Headless-impossible steps:** the full create-customer → create-subscription(draft) → activate → appears-on-kanban journey and the live agreement upload need a running app + Convex. These are NOT headless-claimable: the close-out persona-UAT runs against a live env (`npx convex dev` + `npm run dev` + reseed) or is flagged `pending: needs live env`.

**Close-out (main session, never a background agent):** `/triple-review` → `/simplify xhigh` → `/persona-uat` (this plan reshapes FE journeys — new screens + activate flow). Executor sub-skill: `superpowers:subagent-driven-development`.

---

## File Structure

- `convex/crm/customers.ts` — **add** `createCustomer` mutation (alongside existing `updateCustomerCrmFields`/`getCustomerRecord`).
- `src/components/crm/ScheduleTemplateEditor.tsx` — **new**; 7 day-of-week rows, each with product+qty lines; emits `ScheduleTemplate`.
- `src/components/crm/NewCustomerDialog.tsx` — **new**; customer form → `createCustomer`.
- `src/components/crm/SubscriptionForm.tsx` — **new**; sectioned terms + embedded `ScheduleTemplateEditor` + agreement attach + live preview + validation → `createSubscription`.
- `src/pages/crm/NewSubscriptionPage.tsx` — **new**; route host for `SubscriptionForm`.
- `src/pages/crm/CrmHome.tsx` — **modify**; add "New customer" button + dialog.
- `src/pages/crm/CustomerDashboard.tsx` — **modify**; "Add subscription" button + "Draft" badge in the subscriptions list.
- `src/pages/crm/SubscriptionPage.tsx` — **modify**; Activate action + guard for `draft` subscriptions.
- `src/App.tsx` — **modify**; add lazy route `crm/customers/:customerId/subscriptions/new` BEFORE the `:subId` route.

---

### Task 1: Backend `crm.customers.createCustomer` (atomic) + codegen

**Files:**
- Modify: `convex/crm/customers.ts` (add after `updateCustomerCrmFields`, ~line 53)
- Test: `convex/crm/__tests__/customers.test.ts` (add cases)
- Regenerate: `convex/_generated/*`

**Interfaces:**
- Produces: `api.crm.customers.createCustomer({ name, phone?, source?, notes?, defaultAddress?, companyName?, npwp?, billingAddress?, keyContactName?, keyContactRole?, whatsapp?, email?, instagram?, otherSocials?, deliveryAddress?, storeAddress?, otherAddresses?, altPhone?, customerType? }) => Id<"customers">` — `roles:["manager","admin"]`.

- [ ] **Step 1: Write the failing test**

Add to `convex/crm/__tests__/customers.test.ts` (reuse the file's existing `convexTest`/`createSession` helpers and `anyApi`):

```ts
const createCustomerRef = anyApi.crm.customers.createCustomer;

describe("createCustomer", () => {
  it("inserts a customer with the full CRM field union in one call", async () => {
    const t = convexTest(schema, modules);
    const sessionId = await createSession(t, "manager");
    const id = await t.mutation(createCustomerRef, {
      sessionId,
      name: "UAT Cafe B2B",
      companyName: "UAT Cafe Pte",
      keyContactName: "Bu Sri",
      whatsapp: "6281234560099",
      email: "sri@uatcafe.id",
      deliveryAddress: "Jl. Mawar 1",
      storeAddress: "Jl. Melati 2",
    });
    const doc = await t.run(async (ctx) => ctx.db.get(id));
    expect(doc?.name).toBe("UAT Cafe B2B");
    expect(doc?.companyName).toBe("UAT Cafe Pte");
    expect(doc?.keyContactName).toBe("Bu Sri");
    expect(doc?.whatsapp).toBe("6281234560099");
    expect(doc?.deliveryAddress).toBe("Jl. Mawar 1");
    expect(doc?.createdBy).toBeTruthy();
  });

  it("rejects a non-manager caller", async () => {
    const t = convexTest(schema, modules);
    const sessionId = await createSession(t, "order_staff");
    await expect(
      t.mutation(createCustomerRef, { sessionId, name: "Nope" }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run convex/crm/__tests__/customers.test.ts -t createCustomer`
Expected: FAIL — `createCustomer` is not a function / ref unresolved.

- [ ] **Step 3: Write minimal implementation**

In `convex/crm/customers.ts`, after `updateCustomerCrmFields` (the file already imports `v`, `protectedMutation`):

```ts
// ---------------------------------------------------------------------------
// createCustomer — atomic create with the full CRM field union (one insert).
// No single existing mutation carries all fields: customers.create lacks the
// Phase-57 + Phase-A CRM fields; updateCustomerCrmFields lacks companyName/npwp/
// billingAddress. This avoids the multi-call partial-write seam.
// ---------------------------------------------------------------------------

export const createCustomer = protectedMutation({
  roles: ["manager", "admin"],
  args: {
    name: v.string(),
    phone: v.optional(v.string()),
    source: v.optional(v.string()),
    notes: v.optional(v.string()),
    defaultAddress: v.optional(v.string()),
    companyName: v.optional(v.string()),
    npwp: v.optional(v.string()),
    billingAddress: v.optional(v.string()),
    keyContactName: v.optional(v.string()),
    keyContactRole: v.optional(v.string()),
    whatsapp: v.optional(v.string()),
    email: v.optional(v.string()),
    instagram: v.optional(v.string()),
    otherSocials: v.optional(
      v.array(
        v.object({
          platform: v.string(),
          handle: v.string(),
          url: v.optional(v.string()),
        }),
      ),
    ),
    deliveryAddress: v.optional(v.string()),
    storeAddress: v.optional(v.string()),
    otherAddresses: v.optional(v.array(v.string())),
    altPhone: v.optional(v.string()),
    customerType: v.optional(
      v.union(v.literal("direct_b2c"), v.literal("b2b_wholesale")),
    ),
  },
  handler: async (ctx, args) => {
    // Insert only provided fields (drop undefined) + server-set createdBy.
    const provided = Object.fromEntries(
      Object.entries(args).filter(([, val]) => val !== undefined),
    );
    return await ctx.db.insert("customers", {
      ...(provided as { name: string } & Record<string, unknown>),
      createdBy: ctx.user.name,
    });
  },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run convex/crm/__tests__/customers.test.ts -t createCustomer`
Expected: PASS (both cases).

- [ ] **Step 5: Regenerate Convex types**

Run: `npx convex codegen`
Expected: `convex/_generated/api.d.ts` now lists `crm.customers.createCustomer`. (No schema delta — additive function only.)

- [ ] **Step 6: Commit**

```bash
git add convex/crm/customers.ts convex/crm/__tests__/customers.test.ts convex/_generated
git commit -m "feat(crm): atomic createCustomer mutation for CRM onboarding"
```

---

### Task 2: `ScheduleTemplateEditor` component

**Files:**
- Create: `src/components/crm/ScheduleTemplateEditor.tsx`
- Test: `src/components/crm/__tests__/ScheduleTemplateEditor.test.tsx`

**Interfaces:**
- Consumes: `MenuProductOption` (`{ _id: Id<"menuProducts">; name: string }`).
- Produces: types + component
  - `export interface TemplateLine { menuProductId: Id<"menuProducts">; qty: number }`
  - `export interface TemplateDay { dayOfWeek: number; items: TemplateLine[] }` (dayOfWeek 0=Mon…6=Sun)
  - `export function ScheduleTemplateEditor(props: { days: TemplateDay[]; products: MenuProductOption[]; onChange: (days: TemplateDay[]) => void }): JSX.Element`

- [ ] **Step 1: Write the failing test**

`src/components/crm/__tests__/ScheduleTemplateEditor.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { ScheduleTemplateEditor, type TemplateDay } from "../ScheduleTemplateEditor";
import type { Id } from "../../../../convex/_generated/dataModel";

const products = [
  { _id: "p1" as Id<"menuProducts">, name: "Original" },
  { _id: "p2" as Id<"menuProducts">, name: "Jumbo" },
];

function emptyDays(): TemplateDay[] {
  return Array.from({ length: 7 }, (_, i) => ({ dayOfWeek: i, items: [] }));
}

describe("ScheduleTemplateEditor", () => {
  it("renders 7 day-of-week rows Mon..Sun", () => {
    render(<ScheduleTemplateEditor days={emptyDays()} products={products} onChange={() => {}} />);
    expect(screen.getByText("Mon")).toBeInTheDocument();
    expect(screen.getByText("Sun")).toBeInTheDocument();
  });

  it("adds a product line to a day on '+ add product'", () => {
    const onChange = vi.fn();
    render(<ScheduleTemplateEditor days={emptyDays()} products={products} onChange={onChange} />);
    const monRow = screen.getByTestId("template-day-0");
    fireEvent.click(within(monRow).getByRole("button", { name: /add product/i }));
    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls[0][0] as TemplateDay[];
    expect(next[0].items).toHaveLength(1);
    expect(next[0].items[0].qty).toBe(1);
  });

  it("removes a product line", () => {
    const onChange = vi.fn();
    const days = emptyDays();
    days[0].items = [{ menuProductId: "p1" as Id<"menuProducts">, qty: 3 }];
    render(<ScheduleTemplateEditor days={days} products={products} onChange={onChange} />);
    const monRow = screen.getByTestId("template-day-0");
    fireEvent.click(within(monRow).getByRole("button", { name: /remove line/i }));
    const next = onChange.mock.calls[0][0] as TemplateDay[];
    expect(next[0].items).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/crm/__tests__/ScheduleTemplateEditor.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

`src/components/crm/ScheduleTemplateEditor.tsx`:

```tsx
/**
 * ScheduleTemplateEditor — the weekly default pattern for a subscription.
 * 7 day-of-week rows (0=Mon..6=Sun); each holds product+qty lines.
 * Carries only { menuProductId, qty } — no per-line price/date (the
 * subscription's confidential unitPrice is applied later at seed/confirm).
 */
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Id } from "../../../convex/_generated/dataModel";

export interface MenuProductOption {
  _id: Id<"menuProducts">;
  name: string;
}
export interface TemplateLine {
  menuProductId: Id<"menuProducts">;
  qty: number;
}
export interface TemplateDay {
  dayOfWeek: number; // 0=Mon..6=Sun
  items: TemplateLine[];
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface Props {
  days: TemplateDay[];
  products: MenuProductOption[];
  onChange: (days: TemplateDay[]) => void;
}

export function ScheduleTemplateEditor({ days, products, onChange }: Props) {
  const firstProduct = products[0]?._id;

  function updateDay(dayIdx: number, items: TemplateLine[]) {
    onChange(days.map((d, i) => (i === dayIdx ? { ...d, items } : d)));
  }

  return (
    <div className="space-y-2">
      {days.map((day, dayIdx) => (
        <div
          key={day.dayOfWeek}
          data-testid={`template-day-${day.dayOfWeek}`}
          className="rounded-md border border-border p-2"
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium w-10">{DAY_LABELS[dayIdx]}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              disabled={!firstProduct}
              onClick={() =>
                firstProduct &&
                updateDay(dayIdx, [
                  ...day.items,
                  { menuProductId: firstProduct, qty: 1 },
                ])
              }
            >
              <Plus className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
              Add product
            </Button>
          </div>

          {day.items.length === 0 ? (
            <p className="text-xs text-muted-foreground pl-10">No deliveries</p>
          ) : (
            <div className="space-y-1.5">
              {day.items.map((line, lineIdx) => (
                <div key={lineIdx} className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <Select
                      value={line.menuProductId}
                      onValueChange={(val) =>
                        updateDay(
                          dayIdx,
                          day.items.map((l, i) =>
                            i === lineIdx
                              ? { ...l, menuProductId: val as Id<"menuProducts"> }
                              : l,
                          ),
                        )
                      }
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Select product…" />
                      </SelectTrigger>
                      <SelectContent>
                        {products.map((p) => (
                          <SelectItem key={p._id} value={p._id} className="text-xs">
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Input
                    type="number"
                    min={1}
                    value={line.qty}
                    aria-label="Quantity"
                    className="w-16 h-8 text-xs text-center"
                    onChange={(e) =>
                      updateDay(
                        dayIdx,
                        day.items.map((l, i) =>
                          i === lineIdx
                            ? { ...l, qty: Math.max(1, Number(e.target.value) || 1) }
                            : l,
                        ),
                      )
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                    aria-label="Remove line"
                    onClick={() =>
                      updateDay(
                        dayIdx,
                        day.items.filter((_, i) => i !== lineIdx),
                      )
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/crm/__tests__/ScheduleTemplateEditor.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/crm/ScheduleTemplateEditor.tsx src/components/crm/__tests__/ScheduleTemplateEditor.test.tsx
git commit -m "feat(crm): ScheduleTemplateEditor for subscription weekly template"
```

---

### Task 3: `NewCustomerDialog` + "New customer" button on CrmHome

**Files:**
- Create: `src/components/crm/NewCustomerDialog.tsx`
- Test: `src/components/crm/__tests__/NewCustomerDialog.test.tsx`
- Modify: `src/pages/crm/CrmHome.tsx`

**Interfaces:**
- Consumes: `api.crm.customers.createCustomer` (Task 1) via `useSessionMutation`.
- Produces: `export function NewCustomerDialog(props: { open: boolean; onOpenChange: (o: boolean) => void }): JSX.Element` — on success navigates to `/crm/customers/:id`.

- [ ] **Step 1: Write the failing test**

`src/components/crm/__tests__/NewCustomerDialog.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const mockCreate = vi.fn();
const mockNavigate = vi.fn();
vi.mock("convex-helpers/react/sessions", () => ({
  useSessionMutation: () => mockCreate,
}));
vi.mock("react-router-dom", async (orig) => ({
  ...(await orig<typeof import("react-router-dom")>()),
  useNavigate: () => mockNavigate,
}));

import { NewCustomerDialog } from "../NewCustomerDialog";

beforeEach(() => {
  mockCreate.mockReset();
  mockNavigate.mockReset();
});

describe("NewCustomerDialog", () => {
  it("blocks submit when name is empty", () => {
    render(<MemoryRouter><NewCustomerDialog open onOpenChange={() => {}} /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: /create customer/i }));
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("creates and navigates to the new customer hub", async () => {
    mockCreate.mockResolvedValue("cust123");
    render(<MemoryRouter><NewCustomerDialog open onOpenChange={() => {}} /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText(/^name/i), { target: { value: "UAT Cafe" } });
    fireEvent.change(screen.getByLabelText(/whatsapp/i), { target: { value: "628111" } });
    fireEvent.click(screen.getByRole("button", { name: /create customer/i }));
    await waitFor(() => expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ name: "UAT Cafe", whatsapp: "628111" }),
    ));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/crm/customers/cust123"));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/crm/__tests__/NewCustomerDialog.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

`src/components/crm/NewCustomerDialog.tsx`:

```tsx
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

export function NewCustomerDialog({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const createCustomer = useSessionMutation(api.crm.customers.createCustomer);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
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
  });

  function set(k: keyof typeof form, val: string) {
    setForm((f) => ({ ...f, [k]: val }));
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
    <Dialog open={open} onOpenChange={onOpenChange}>
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
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={handleCreate} disabled={submitting || !form.name.trim()}>
            {submitting ? "Creating…" : "Create customer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

> NOTE for the implementer: confirm `@/components/ui/dialog` exports `DialogFooter` (it does). Confirm the project's `toast` import (grep an existing CRM component, e.g. `AgreementUpload.tsx`, for the exact toast import — `sonner` vs a local wrapper — and match it).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/crm/__tests__/NewCustomerDialog.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire the button into CrmHome**

In `src/pages/crm/CrmHome.tsx`: add `const [newCustomerOpen, setNewCustomerOpen] = useState(false);`, render a primary "New customer" button in the page header, and `<NewCustomerDialog open={newCustomerOpen} onOpenChange={setNewCustomerOpen} />`. (Read the file first; match its header layout + existing button styles.)

- [ ] **Step 6: Run the CrmHome test (if present) + typecheck**

Run: `npx vitest run src/pages/crm/__tests__/CrmHome.test.tsx` (if it exists) and `npm run type-check`
Expected: PASS / no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/crm/NewCustomerDialog.tsx src/components/crm/__tests__/NewCustomerDialog.test.tsx src/pages/crm/CrmHome.tsx
git commit -m "feat(crm): New customer dialog + CrmHome entry point"
```

---

### Task 4: `SubscriptionForm` (terms + schedule + agreement + preview + validation)

**Files:**
- Create: `src/components/crm/SubscriptionForm.tsx`
- Test: `src/components/crm/__tests__/SubscriptionForm.test.tsx`

**Interfaces:**
- Consumes: `ScheduleTemplateEditor` + `TemplateDay`/`MenuProductOption` (Task 2); `api.menuProducts.queries.list` (public `useQuery`); `api.subscriptions.mutations.createSubscription` + `api.crm.agreements.listAgreementsByCustomer` (`useSessionQuery`/`useSessionMutation`); `formatCurrency` from `@/lib/utils`.
- Produces: `export function SubscriptionForm(props: { customerId: Id<"customers"> }): JSX.Element` — creates the draft and navigates to its `SubscriptionPage`.

- [ ] **Step 1: Write the failing test**

`src/components/crm/__tests__/SubscriptionForm.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { Id } from "../../../../convex/_generated/dataModel";

const mockCreateSub = vi.fn();
const mockNavigate = vi.fn();
vi.mock("convex/react", () => ({
  useQuery: () => [
    { _id: "p1", name: "Original" },
    { _id: "p2", name: "Jumbo" },
  ],
}));
vi.mock("convex-helpers/react/sessions", () => ({
  useSessionQuery: () => [], // listAgreementsByCustomer → none
  useSessionMutation: () => mockCreateSub,
}));
vi.mock("react-router-dom", async (orig) => ({
  ...(await orig<typeof import("react-router-dom")>()),
  useNavigate: () => mockNavigate,
}));

import { SubscriptionForm } from "../SubscriptionForm";
const customerId = "cust1" as Id<"customers">;

beforeEach(() => { mockCreateSub.mockReset(); mockNavigate.mockReset(); });

describe("SubscriptionForm", () => {
  it("blocks submit with empty label", () => {
    render(<MemoryRouter><SubscriptionForm customerId={customerId} /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: /create subscription/i }));
    expect(mockCreateSub).not.toHaveBeenCalled();
  });

  it("previews weekly qty and credit from the template + unit price", () => {
    render(<MemoryRouter><SubscriptionForm customerId={customerId} /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText(/unit price/i), { target: { value: "29000" } });
    const mon = screen.getByTestId("template-day-0");
    fireEvent.click(within(mon).getByRole("button", { name: /add product/i }));
    fireEvent.change(within(mon).getByLabelText("Quantity"), { target: { value: "150" } });
    expect(screen.getByTestId("weekly-qty-preview")).toHaveTextContent("150");
    // 150 * 29000 = 4.350.000
    expect(screen.getByTestId("weekly-credit-preview")).toHaveTextContent("4.350.000");
  });

  it("creates a draft with correctly shaped args and navigates", async () => {
    mockCreateSub.mockResolvedValue("sub99");
    render(<MemoryRouter><SubscriptionForm customerId={customerId} /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText(/label/i), { target: { value: "Morning Bundle A" } });
    fireEvent.change(screen.getByLabelText(/unit price/i), { target: { value: "29000" } });
    fireEvent.change(screen.getByLabelText(/baseline daily qty/i), { target: { value: "150" } });
    fireEvent.change(screen.getByLabelText(/cogs basis/i), { target: { value: "12000" } });
    const mon = screen.getByTestId("template-day-0");
    fireEvent.click(within(mon).getByRole("button", { name: /add product/i }));
    fireEvent.click(screen.getByRole("button", { name: /create subscription/i }));
    await waitFor(() => expect(mockCreateSub).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId,
        label: "Morning Bundle A",
        unitPrice: 29000,
        confidentialPrice: true,
        baselineDailyQty: 150,
        cogsBasis: 12000,
        creditRolloverPolicy: "expire",
        scheduleTemplate: expect.arrayContaining([
          expect.objectContaining({ dayOfWeek: 0, items: expect.any(Array) }),
        ]),
      }),
    ));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith(
      `/crm/customers/${customerId}/subscriptions/sub99`,
    ));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/crm/__tests__/SubscriptionForm.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

`src/components/crm/SubscriptionForm.tsx` — implement:
- Local state for all terms (defaults: `confidentialPrice=true`, `creditRolloverPolicy="expire"`, `deliverByTime="09:00"`, `startDate` = next Monday at local midnight ms via a small inline helper; numbers stored as strings in inputs, parsed on submit).
- `days` state = `Array.from({length:7}, (_,i) => ({ dayOfWeek:i, items:[] }))`; render `<ScheduleTemplateEditor days={days} products={products} onChange={setDays} />`.
- `products = useQuery(api.menuProducts.queries.list, { activeOnly: true }) ?? []` mapped to `{ _id, name }`.
- **Agreement (optional)** — `agreements = useSessionQuery(api.crm.agreements.listAgreementsByCustomer, { customerId })`; a `<Select>` to pick an existing `agreementId`. For inline upload, reuse `AgreementUpload` with its **real contract** (`src/components/crm/AgreementUpload.tsx:41` — it has NO `customerId` prop and `onUploaded` returns a `storageId`, NOT an agreementId):

```tsx
const generateAgreementUploadUrl = useSessionMutation(api.crm.agreements.generateAgreementUploadUrl);
const createSupplyAgreement = useSessionMutation(api.crm.agreements.createSupplyAgreement);
// ...
<AgreementUpload
  mode="create"
  generateUploadUrl={generateAgreementUploadUrl}
  onUploaded={async (storageId, fileName, lang, fileSize) => {
    try {
      const id = await createSupplyAgreement({
        customerId, fileStorageId: storageId, fileName, fileSize, status: "draft", lang,
      });
      setAgreementId(id);
    } catch {
      toast.error("Agreement uploaded but could not be saved — you can attach it later.");
    }
  }}
/>
```
  `createSupplyAgreement` (`convex/crm/agreements.ts:32`) returns the new agreement id; args = `{ customerId, fileStorageId, fileName, fileSize, status, lang, subscriptionId?, keyTerms?, ... }`. If `agreements` is empty, show the empty hint + this upload path. The agreement is optional — a `createSupplyAgreement` failure must NOT block subscription creation.
- **Preview:** `const weeklyQty = days.reduce((s,d)=>s+d.items.reduce((a,l)=>a+l.qty,0),0);` render in `data-testid="weekly-qty-preview"`; credit = `formatCurrency(weeklyQty * (Number(unitPrice)||0))` in `data-testid="weekly-credit-preview"`.
- **Validation (submit-blocking):** `label` non-empty; `unitPrice`,`baselineDailyQty`,`cogsBasis` are positive integers; `deliverByTime` matches `/^\d{2}:\d{2}$/`. (Schedule may be empty at create — draft.) Disable the submit button when invalid.
- On submit: call `createSubscription` with the parsed args (rollover branch: include `rolloverExpiryWeeks` only when policy==="rollover"; clear otherwise), `agreementId` only when set, then `navigate(\`/crm/customers/${customerId}/subscriptions/${id}\`)`. Wrap in try/catch → `toast.error` on failure; disable button while submitting.

Use the same `Select`/`Input`/`Label`/`Button` shadcn imports as Task 3. Match labels to the test's `getByLabelText` (case-insensitive substrings: "Label", "Unit price", "Baseline daily qty", "COGS basis"). Read `AgreementUpload.tsx` for its exact props before wiring the upload path.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/crm/__tests__/SubscriptionForm.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/crm/SubscriptionForm.tsx src/components/crm/__tests__/SubscriptionForm.test.tsx
git commit -m "feat(crm): SubscriptionForm — terms + schedule template + agreement + preview"
```

---

### Task 5: `NewSubscriptionPage` + route + "Add subscription" button & Draft badge

**Files:**
- Create: `src/pages/crm/NewSubscriptionPage.tsx`
- Modify: `src/App.tsx` (lazy import + route BEFORE `:subId`)
- Modify: `src/pages/crm/CustomerDashboard.tsx` (button + Draft badge)

**Interfaces:**
- Consumes: `SubscriptionForm` (Task 4); `useParams` for `customerId`.

- [ ] **Step 1: Create the page**

`src/pages/crm/NewSubscriptionPage.tsx`:

```tsx
/**
 * NewSubscriptionPage — /crm/customers/:customerId/subscriptions/new
 * Hosts SubscriptionForm; breadcrumb back to the customer hub.
 */
import { useParams } from "react-router-dom";
import type { Id } from "../../../convex/_generated/dataModel";
import { Breadcrumbs } from "@/components/crm/Breadcrumbs";
import { SubscriptionForm } from "@/components/crm/SubscriptionForm";

export function NewSubscriptionPage() {
  const { customerId } = useParams<{ customerId: string }>();
  if (!customerId) return null;
  return (
    <div className="p-6 space-y-6">
      <Breadcrumbs
        trail={[
          { label: "CRM", to: "/crm" },
          { label: "Customer", to: `/crm/customers/${customerId}` },
          { label: "New subscription" },
        ]}
      />
      <h1 className="text-2xl font-semibold tracking-tight">New subscription</h1>
      <SubscriptionForm customerId={customerId as Id<"customers">} />
    </div>
  );
}
```

- [ ] **Step 2: Wire the route in App.tsx**

Add a lazy import next to the other CRM imports:

```tsx
const NewSubscriptionPage = lazyWithPreload(() =>
  import('./pages/crm/NewSubscriptionPage').then(m => ({ default: m.NewSubscriptionPage }))
);
```

Add the route **immediately before** the `crm/customers/:customerId/subscriptions/:subId` route (static `new` outranks `:subId`, but place it first for clarity):

```tsx
<Route
  path="crm/customers/:customerId/subscriptions/new"
  element={
    <ProtectedRoute requiredPermission="canAccessCrm">
      <NewSubscriptionPage />
    </ProtectedRoute>
  }
/>
```

- [ ] **Step 3: Add the button + Draft badge in CustomerDashboard**

Read `src/pages/crm/CustomerDashboard.tsx`, find the subscriptions-list section. Add an "Add subscription" link/button (`<Link to={\`/crm/customers/${customerId}/subscriptions/new\`}>`) in that section's header, and render a "Draft" badge next to any subscription whose `status === "draft"` (reuse the `Badge` component + the `STATUS_BADGE` pattern from `SubscriptionPage.tsx`).

- [ ] **Step 4: Verify routing + typecheck**

Run: `npm run type-check`
Expected: no errors. (Optionally add a smoke test asserting `/crm/customers/:id/subscriptions/new` renders the form heading, mirroring existing page tests.)

- [ ] **Step 5: Commit**

```bash
git add src/pages/crm/NewSubscriptionPage.tsx src/App.tsx src/pages/crm/CustomerDashboard.tsx
git commit -m "feat(crm): new-subscription route + Add subscription entry + Draft badge"
```

---

### Task 6: Activate action + guard on `SubscriptionPage`

**Files:**
- Modify: `src/pages/crm/SubscriptionPage.tsx`
- Test: `src/pages/crm/__tests__/SubscriptionPage.test.tsx` (add cases)

**Interfaces:**
- Consumes: `api.subscriptions.mutations.updateSubscription`, `api.crm.agreements.linkAgreementToSubscription` (`useSessionMutation`).

- [ ] **Step 1: Write the failing test**

Add to `src/pages/crm/__tests__/SubscriptionPage.test.tsx` (reuse its ref-identity mock harness; set `mockSubscription` to a draft):

```tsx
it("shows Activate for a draft and blocks it when weeklyQty is 0", () => {
  mockSubscription = { /* ...draft doc... */ status: "draft", weeklyQty: 0, label: "X",
    unitPrice: 29000, baselineDailyQty: 150, cogsBasis: 12000, deliverByTime: "09:00", startDate: 1 };
  // render via the test's existing renderSubscriptionPage() helper
  // Activate button present but disabled (weeklyQty 0 → not schedulable)
  expect(screen.getByRole("button", { name: /activate/i })).toBeDisabled();
});

it("activates a complete draft", async () => {
  mockSubscription = { status: "draft", weeklyQty: 1050, label: "X", unitPrice: 29000,
    baselineDailyQty: 150, cogsBasis: 12000, deliverByTime: "09:00", startDate: 1 };
  // render; click Activate
  fireEvent.click(screen.getByRole("button", { name: /activate/i }));
  await waitFor(() => expect(mockMutateFn).toHaveBeenCalledWith(
    expect.objectContaining({ status: "active" }),
  ));
});
```

(Match the file's existing mock variable names — `mockSubscription`, `mockMutateFn` — and its render helper. Read the test file first.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/pages/crm/__tests__/SubscriptionPage.test.tsx -t Activate`
Expected: FAIL — no Activate button.

- [ ] **Step 3: Implement Activate**

In `SubscriptionPage.tsx`, add near the header (only when `subscription.status === "draft"`):

```tsx
const updateSubscription = useSessionMutation(api.subscriptions.mutations.updateSubscription);
const linkAgreement = useSessionMutation(api.crm.agreements.linkAgreementToSubscription);
const [activating, setActivating] = useState(false);

// Schedulable iff terms complete + at least one scheduled unit (weeklyQty > 0).
const activationBlockedReason =
  !subscription.label?.trim() ? "Label required"
  : subscription.unitPrice <= 0 ? "Unit price required"
  : subscription.baselineDailyQty <= 0 ? "Baseline qty required"
  : subscription.cogsBasis <= 0 ? "COGS basis required"
  : !/^\d{2}:\d{2}$/.test(subscription.deliverByTime) ? "Deliver-by time required"
  : !subscription.startDate ? "Start date required"
  : subscription.weeklyQty <= 0 ? "Add at least one scheduled product"
  : null;

async function handleActivate() {
  setActivating(true);
  try {
    await updateSubscription({ subscriptionId: subscription._id, status: "active" });
    if (subscription.agreementId) {
      await linkAgreement({ agreementId: subscription.agreementId, subscriptionId: subscription._id });
    }
    toast.success("Subscription activated");
  } catch {
    toast.error("Could not activate. Check the schedule and terms.");
  } finally {
    setActivating(false);
  }
}
```

Render in the header actions block:

```tsx
{subscription.status === "draft" && (
  <div className="flex flex-col items-end gap-1">
    <Button size="sm" onClick={handleActivate} disabled={activating || activationBlockedReason !== null}>
      {activating ? "Activating…" : "Activate"}
    </Button>
    {activationBlockedReason && (
      <span className="text-xs text-muted-foreground">{activationBlockedReason}</span>
    )}
  </div>
)}
```

Add `useState` to the existing React import and the `useSessionMutation` import (already importing `useSessionQuery` from the same module). Confirm `linkAgreementToSubscription`'s exact arg names against `convex/crm/agreements.ts:119` before wiring. Confirm the `toast` import matches the project's (grep an existing CRM page).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/pages/crm/__tests__/SubscriptionPage.test.tsx`
Expected: PASS (existing + new cases).

- [ ] **Step 5: Commit**

```bash
git add src/pages/crm/SubscriptionPage.tsx src/pages/crm/__tests__/SubscriptionPage.test.tsx
git commit -m "feat(crm): Activate draft subscription with schedulability guard"
```

---

### Task 7: Verification

**Files:** none (gate).

- [ ] **Step 1: Type-check + lint**

Run: `npm run type-check && npm run lint`
Expected: no errors.

- [ ] **Step 2: Full unit/component test run**

Run: `npx vitest run convex/crm src/components/crm src/pages/crm`
Expected: all pass (new + existing).

- [ ] **Step 3: code-auditor pass**

Dispatch the `code-auditor` agent: verify (a) every new/edited surface is `canAccessCrm`-gated; (b) no new `protectedQuery`/`protectedMutation` with `roles` narrower than manager+admin on a CRM-reachable mount (Pitfall #19); (c) `createCustomer` is `roles:["manager","admin"]`; (d) `api.menuProducts.queries.list` is called via plain `useQuery` (not session); (e) no money as float; (f) no placeholder/`DialogFooter` typo remains.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: success (watch the vendor-bundle cap — Pitfall #16; no heavy deps added here, so it should be unaffected).

- [ ] **Step 5: Commit any fixes**

```bash
git add -A && git commit -m "chore(crm): verification fixes for subscription onboarding"
```

---

## Documentation Updates (at execution/merge time)
- [ ] `docs/CHANGELOG.md` — subscription creation/onboarding UI.
- [ ] `docs/FILE_MAP.md` — CRM creation surfaces + permission rows.
- [ ] `docs/ROADMAP.md` — remove this slice from the forward queue on merge.
- [ ] `docs/API_REFERENCE.md` — `crm.customers.createCustomer`.

## Success Criteria
- [ ] `npm run type-check`, `npm run lint`, `npx vitest run`, `npm run build` all pass.
- [ ] A manager creates a customer, creates a subscription (draft), and activates it entirely from `/crm`.
- [ ] Weekly qty/credit preview equals the backend-derived `weeklyQty × unitPrice`.
- [ ] Activate is blocked until terms + ≥1 scheduled product are present.
- [ ] All surfaces manager+admin only; confidential price never leaves the gated route.

## Verify-first list (for the execution session — confirm against real code before coding)
All items below were CONFIRMED at plan-staffreview time (2026-06-26); re-confirm if `main` moved.
1. ✅ `crm.agreements.linkAgreementToSubscription({ agreementId, subscriptionId })` (`convex/crm/agreements.ts:119`).
2. ✅ `AgreementUpload` props = `{ generateUploadUrl, onUploaded(storageId, fileName, lang, fileSize), mode, disabled }` — NO `customerId`; mint the agreement via `createSupplyAgreement` (see Task 4). `createSupplyAgreement` returns the agreement id.
3. ✅ Toast = `import { toast } from "sonner"` (project standard across CRM pages).
4. ✅ `@/components/ui/dialog` exports `DialogFooter`, `DialogDescription`.
5. `SubscriptionPage.test.tsx` mock harness variable names + render helper (Task 6 reuses them) — read the file first.
6. ✅ `api.menuProducts.queries.list({ activeOnly: true })` is a public `query` (plain `useQuery`); returns full `menuProducts` docs → map to `{ _id, name }`.
7. ✅ React Router v6 ranks the static `new` segment above `:subId` (no route collision).
