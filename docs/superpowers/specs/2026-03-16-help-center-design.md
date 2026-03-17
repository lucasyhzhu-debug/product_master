# Help Center & Training Guide System — Design Spec

**Date:** 2026-03-16
**Status:** Approved
**Author:** Claude + Irfan

---

## 1. Overview

An in-app Help Center for Frollie Recipe Master that provides visual, step-by-step workflow guides and FAQ content for managers and admins. The first guide covers the full Expense, Reimbursement & Payroll system (v1.7).

**Design principles:**
- **Visual-first** — flowchart diagrams, step cards, and icons over walls of text
- **Friendly tone** — conversational language with "tip" and "watch out" callout boxes
- **Extensible** — data-driven guide registry; adding a new guide = one component + one registry entry
- **Native** — uses existing shadcn/ui components (Card, Accordion, Badge) so it feels like part of the app, not bolted on
- **Clean design** — solid accent colors, no gradients. Optimized for light mode; dark mode inherits existing app theme tokens.

**Audience:** Co-founders, managers, and admins. All authenticated roles can access the Help Center (no permission restriction), and content is unfiltered — everyone sees all guides.

---

## 2. Architecture

### New Files

| File | Purpose |
|------|---------|
| `src/pages/HelpCenter.tsx` | Landing page — search bar, guide card grid, popular questions |
| `src/pages/guides/ExpenseGuide.tsx` | First guide — full expense/reimbursement/payroll walkthrough |
| `src/pages/guides/GuideRouter.tsx` | Looks up `guideId` param in registry, renders component or 404 state |
| `src/lib/helpGuides.ts` | Guide registry — array of `{ id, title, icon, description, sections, component }` |
| `src/components/help/WorkflowDiagram.tsx` | Fixed-layout SVG flowchart with colored status nodes and directional arrows |
| `src/components/help/StepCard.tsx` | Numbered step with icon, title, description, optional tip/warning |
| `src/components/help/FaqAccordion.tsx` | Grouped collapsible Q&A sections using shadcn Accordion |
| `src/components/help/RoleTag.tsx` | Small badge showing which role performs a step (Manager, Admin, All Staff) |
| `src/components/help/CalloutBox.tsx` | Styled callout: "tip" (green), "warning" (amber), "important" (orange) |
| `src/components/help/GuideSection.tsx` | Section wrapper with anchor ID, title, and role tag |
| `src/components/help/GuideLayout.tsx` | Shared layout for all guides — sidebar TOC + content area |
| `src/components/help/index.ts` | Barrel export for help components |

### Modified Files

| File | Change |
|------|--------|
| `src/App.tsx` | Add `/help` and `/help/:guideId` routes. Use `<ProtectedRoute>` with no `requiredPermission` or `allowedRoles` props (auth-only gate). |
| `src/pages/HubPage.tsx` | Add "Help & Training" entry to the `HUB_AREAS` array (follows existing `AreaCard` interface pattern) |
| `src/components/layout/Header.tsx` | Add `/help` entry to `mainNavItems` array (consistent with existing nav pattern). Also add Help link to mobile sheet menu. |

### No Backend Changes

The Help Center is entirely frontend. No new Convex tables, queries, or mutations.

---

## 3. Help Center Landing Page (`/help`)

### Layout

```
┌─────────────────────────────────────────────────┐
│  Header (existing)               [Help] [User]  │
├─────────────────────────────────────────────────┤
│                                                 │
│       How can we help you?                      │
│       Step-by-step guides, visual walkthroughs  │
│       [🔍 Search guides and FAQs...   Ctrl K]  │
│                                                 │
├─────────────────────────────────────────────────┤
│  WORKFLOW GUIDES                                │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐     │
│  │ 💳       │  │ 🍞       │  │ 📦       │     │
│  │ Expenses │  │ Kitchen  │  │ Orders   │     │
│  │ Reimb &  │  │ & Prod   │  │ & Ship   │     │
│  │ Payroll  │  │          │  │          │     │
│  │ [NEW]    │  │ [SOON]   │  │ [SOON]   │     │
│  └──────────┘  └──────────┘  └──────────┘     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐     │
│  │ Inventory│  │ Recipes  │  │ Sales &  │     │
│  │ & Restock│  │ & Prods  │  │ Analytics│     │
│  │ [SOON]   │  │ [SOON]   │  │ [SOON]   │     │
│  └──────────┘  └──────────┘  └──────────┘     │
│                                                 │
├─────────────────────────────────────────────────┤
│  POPULAR QUESTIONS                              │
│  ● How do I submit an expense?                  │
│  ● Who can approve expenses?                    │
│  ● How does payroll work?                       │
│  ● Understanding the P&L                        │
└─────────────────────────────────────────────────┘
```

### Behavior

- **Search** — case-insensitive `String.includes` match across guide titles, section headings, and FAQ question text. Sufficient for v1 since the corpus is small (static text). Results shown as a dropdown list with deep links (e.g., `/help/expenses#submitting`). `Ctrl+K` focuses the search input.
- **Guide cards** — accent color top-bar animates on hover (scaleX from 0 to 1, left origin). "Coming Soon" cards are dimmed (opacity 0.5) and non-interactive.
- **Popular Questions** — deep-link to the relevant guide section using anchor IDs (e.g., `/help/expenses#submitting`). The `GuideSection` component's `id` prop maps to these anchors.
- **Responsive** — grid collapses to 1 column on mobile, 2 on tablet, 3 on desktop.
- **Animation** — staggered fade-up on page load using Framer Motion (existing dependency).
- **Empty/error states** — N/A for landing page (static content, no data fetching).

---

## 4. Guide Registry (`src/lib/helpGuides.ts`)

```typescript
import { CreditCard, ChefHat, Package, Wallet, UtensilsCrossed, BarChart3 } from "lucide-react";
import type { ComponentType } from "react";

export interface GuideSection {
  id: string;
  title: string;
  role?: "all" | "manager" | "admin";
}

export interface GuideConfig {
  id: string;
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  accentColor: string;        // Tailwind color class (e.g., "orange")
  sections: GuideSection[];
  readTimeMinutes: number;
  status: "live" | "coming-soon";
  isNew?: boolean;
  component?: ComponentType;   // guide page component (eagerly imported — guide pages are lightweight static JSX, no Convex queries)
}

export const HELP_GUIDES: GuideConfig[] = [
  {
    id: "expenses",
    title: "Expenses, Reimbursements & Payroll",
    description: "Submit claims, approve expenses, batch reimbursements, record payroll, and see how it all flows to the P&L.",
    icon: CreditCard,
    accentColor: "orange",
    sections: [
      { id: "overview", title: "Overview", role: "all" },
      { id: "submitting", title: "Submitting an Expense", role: "all" },
      { id: "approving", title: "Approving Expenses", role: "manager" },
      { id: "reimbursement", title: "Reimbursement Batching", role: "admin" },
      { id: "payroll", title: "Payroll", role: "admin" },
      { id: "analytics", title: "Expense Analytics", role: "manager" },
      { id: "pnl", title: "How It Connects to the P&L", role: "manager" },
      { id: "faq", title: "FAQ", role: "all" },
    ],
    readTimeMinutes: 15,
    status: "live",
    isNew: true,
  },
  // Future guides registered here with status: "coming-soon"
  {
    id: "kitchen",
    title: "Kitchen & Production",
    description: "Ball production, tray tracking, packaging workflows, and order fulfillment.",
    icon: ChefHat,
    accentColor: "green",
    sections: [],
    readTimeMinutes: 0,
    status: "coming-soon",
  },
  // ... more coming-soon entries
];
```

**Design notes:**
- `sectionCount` is derived from `sections.length` at render time (no redundant field).
- Guide components are eagerly imported (not lazy) since guide pages are purely static JSX with no Convex queries. If guides grow to include data fetching in future, switch to `lazy(() => import(...))`.
- Adding a guide = (1) create component file, (2) update registry entry. `GuideRouter` auto-discovers via ID lookup.

---

## 5. Expense Guide Content (`src/pages/guides/ExpenseGuide.tsx`)

### Guide Layout

```
┌─────────────────────────────────────────────────┐
│  ← Back to Help Center                          │
│  Expenses, Reimbursements & Payroll              │
│  8 sections · 15 min read                        │
├────────────┬────────────────────────────────────┤
│ TABLE OF   │                                    │
│ CONTENTS   │  Section content                   │
│            │                                    │
│ 1. Overview│  (scrolls independently)           │
│ 2. Submit  │                                    │
│ 3. Approve │                                    │
│ 4. Reimb   │                                    │
│ 5. Payroll │                                    │
│ 6. Analyti │                                    │
│ 7. P&L     │                                    │
│ 8. FAQ     │                                    │
│            │                                    │
│ (sticky    │                                    │
│  sidebar)  │                                    │
└────────────┴────────────────────────────────────┘
```

- **Sidebar TOC** — sticky on desktop, collapses to a horizontal scroll bar on mobile. Active section highlighted based on scroll position (Intersection Observer).
- **Back link** — `← Back to Help Center` navigates to `/help`.
- **Sections** — each wrapped in `<GuideSection>` with anchor ID for deep linking. `scroll-margin-top` set to account for sticky header height.

### Section 1: Overview

**Content:**
- One paragraph: "The expense system lets anyone on the team submit expense claims, which managers and admins approve. Approved personal expenses get batched into reimbursement transfers. Payroll records staff and contractor payments. Everything auto-generates accounting entries that flow to the P&L."
- **Full lifecycle flowchart** (WorkflowDiagram component):

```
[Draft] → [Submitted] → [Approved] ─┬→ [Awaiting Payment] → [Reimbursed]
                │                     └→ Terminal (company card)
                └→ [Rejected] → (Revise) → [Submitted]

Any non-terminal → [Voided]
```

Nodes color-coded: gray (Draft), blue (Submitted), green (Approved/Reimbursed), amber (Awaiting Payment), red (Rejected/Voided).

- **Role summary table** — who does what:

| Action | Kitchen | Order Staff | Manager | Admin |
|--------|---------|-------------|---------|-------|
| Submit expenses | Yes | Yes | Yes | Yes |
| Approve (up to 500K) | — | — | Yes | Yes |
| Approve (over 500K) | — | — | — | Yes |
| Reimbursement batching | — | — | — | Yes |
| Payroll entry | — | — | — | Yes |
| View analytics | — | — | Yes | Yes |

### Section 2: Submitting an Expense (All Staff)

**Step cards (StepCard component):**

1. **Go to Expenses** — Open the **Financials** dropdown in the top menu, click **Expenses**. Then tap the "New Expense" button.
2. **Fill in the details** — Description, amount (IDR), GL category, expense date, vendor name, payment method (personal cash, personal transfer, or company card)
3. **Attach a receipt** — Take a photo or upload an image. Required for amounts over Rp 50,000.
4. **Save as draft or submit** — Save Draft keeps it editable. Submit sends it to the approval queue.

**Callout boxes:**
- **Tip:** "If you're not sure about the GL category, use '6990 Miscellaneous OpEx' — your approver can ask you to correct it."
- **Warning:** "Expenses submitted more than 14 days after the expense date get flagged as 'Late Submission.' Still allowed, but your approver will see the flag."
- **Important:** "Once submitted, you can't edit. If you need to change something, ask your approver to reject it so you can resubmit."

**FAQ mini-section:**
- "What GL category should I pick?" — Quick reference of the 11 OpEx categories with examples
- "Can I submit without a receipt?" — Yes if under Rp 50,000. No if over.
- "What happens if I submit a duplicate?" — Soft warning shown, but submission still goes through. Approver sees the flag.

### Section 3: Approving Expenses (Manager / Admin)

**Workflow diagram:**
```
[Submitted Expense arrives in queue]
        │
   ┌────┴────┐
   │ ≤ 500K? │
   └────┬────┘
    Yes │     No
   ┌────┴──┐  ┌──────┐
   │Manager│  │Admin │
   │or     │  │only  │
   │Admin  │  │      │
   └───┬───┘  └──┬───┘
       └────┬────┘
            │
     [Review + Approve/Reject]
            │
   ┌────────┴────────┐
   │ Payment method?  │
   └────────┬────────┘
   Personal │  Company Card
       │           │
  [Awaiting    [Approved]
   Payment]    (terminal)
```

**Step cards:**
1. **Open approval queue** — Open the **Financials** dropdown, click **Expenses**. The approval tab shows pending expenses. (Managers and admins only; you won't see expenses you submitted yourself.)
2. **Review the expense** — Check amount, receipt, GL category, vendor. Look for fraud badges (duplicate, late, rejection count).
3. **Approve or reject** — Approve moves it forward. Reject requires a reason the submitter will see.

**Callout boxes:**
- **Important:** "You cannot approve your own expenses. The system blocks this automatically."
- **Warning:** "For expenses Rp 500,000 or above, you must add an approval comment explaining why it's approved."
- **Tip:** "If you see a 'Duplicate Warning' badge, check the referenced expense before approving. It might be a legitimate repeat purchase."

### Section 4: Reimbursement Batching (Admin)

**Workflow diagram:**
```
[Approved expenses pool]
        │
  [Group by employee]
        │
  [Create batch → RMB-MMDD-NNN]
        │
  [Transfer via BCA mobile]
        │
  [Enter bank reference + transfer date]
        │
  [Confirm batch]
        │
  [Expenses → Reimbursed ✓]
```

**Step cards:**
1. **Open Reimbursement Manager** — Open the **Financials** dropdown, click **Reimburse** (admin only).
2. **Review pending expenses** — Grouped by employee with running totals
3. **Create a batch** — Select expenses for one employee, click "Create Batch"
4. **Transfer via bank** — Open BCA mobile, transfer the batch total. Use the RMB code in the transfer notes.
5. **Confirm the batch** — Enter the BCA reference number, select the source bank account, set the transfer date
6. **Done** — All linked expenses are marked Reimbursed

**Callout boxes:**
- **Tip:** "If a bank transfer fails, void the batch. The expenses return to the pending pool and you can re-batch them."
- **Important:** "You can't void individual expenses that have already been reimbursed. You must void the entire batch."

### Section 5: Payroll (Admin)

**Step cards:**
1. **Open Payroll** — Open the **Financials** dropdown, click **Payroll** (admin only).
2. **Fill in the form** — Recipient name (free text — the person doesn't need a Frollie account), employee type (staff/contractor), frequency (weekly/monthly), amount, period start & end dates, description
3. **Review the journal entry preview** — Shows DR 6100 Salaries & Wages, CR 1100 Cash
4. **Confirm & create** — Entry is recorded and journal entry is created immediately

**Callout boxes:**
- **Important:** "Payroll records what you paid — it does NOT calculate pro-rata or deduct leave. You must calculate the amount yourself before entering it."
- **Tip:** "For pro-rata calculation: (Monthly salary ÷ working days in month) × days worked. Deduct any unpaid leave days from days worked."
- **Warning:** "Payroll entries cannot be edited after creation. If you entered the wrong amount, void the entry and create a new one."

**FAQ mini-section:**
- "Do I need a Frollie user account for each staff member to use payroll?" — No. Payroll entries are just financial records. You type the recipient's name directly. They don't need a Frollie account. Frollie accounts are only needed for people who log into the system.
- "Are payroll accounts and expense accounts separate?" — Yes, completely. Payroll (account 6100 Salaries & Wages) is a direct recording by an admin. Expenses are claim-based with an approval workflow. They're independent systems that both feed into the P&L.
- "How do I handle leave or partial months?" — Calculate the pro-rata amount yourself: (monthly rate ÷ working days) × actual days worked. Enter that final number as the amount.
- "Can I attach a payroll slip?" — Yes, there's an optional attachment upload for PDFs or images.

### Section 6: Expense Analytics (Manager / Admin)

**Visual tour** — brief description of each dashboard card:

| Card | What it shows |
|------|--------------|
| **Total OpEx** | Sum of all operating expenses for the selected period, with pie chart by GL category |
| **Pending Reimbursement** | Total amount awaiting bank transfer + count of pending expenses |
| **Avg Approval Time** | Average days from submission to approval |
| **Monthly Trend** | 6-month line chart of total OpEx |
| **Spend by Employee** | Table of who spent how much in the period |
| **Fraud Flags** | Active warnings (see below) |

**Step cards:**
1. **Open Expense Analytics** — Open the **Financials** dropdown, click **Exp. Analytics** (managers and admins only).
2. **Select a period** — Use the month picker or switch to custom date range.
3. **Review the dashboard** — Each card auto-updates in real-time.

**Fraud flags explained:**
- **Split Detection** — "Same person, same category, multiple expenses within 48 hours totaling over Rp 500K. Could be splitting a large expense to avoid approval limits."
- **Approver Concentration** — "One approver handles over 80% of one employee's expenses. Could indicate favoritism or collusion."
- **Unfamiliar Vendor** — "A vendor name that hasn't appeared in the system in the last 90 days. Worth a second look."

**Callout:** "Fraud flags are warnings, not accusations. Always investigate before drawing conclusions."

### Section 7: How It Connects to the P&L

**Diagram:**
```
[You submit an expense]
        │
[Manager approves it]
        │
[System auto-creates a Journal Entry]
   DR 6500 Office & Supplies    Rp 150,000
   CR 2200 Reimb Payable        Rp 150,000
        │
[Shows up on Financial Statement]
   Operating Expenses
     → Office & Supplies: Rp 150,000
        │
[Reduces EBIT and Net Income]
```

**Plain-language explanation:** "Every approved expense automatically creates an accounting entry. You don't need to do anything — it just shows up on the P&L under Operating Expenses. The same happens for payroll entries. This is how the system tracks where money is going."

**Step cards:**
1. **View the P&L** — Open the **Financials** dropdown, click **Income Statement**.
2. **Scroll to Operating Expenses** — Below Gross Profit, you'll see each OpEx category with the period total.
3. **Check EBIT and Net Income** — These are calculated automatically from Revenue - COGS - OpEx.

### Section 8: FAQ

Full accordion FAQ covering:

**General:**
- "Do I need a Frollie Pro account to have a payroll account, or are they separate?" — There is no "Frollie Pro." All features are available to all users based on their role (kitchen, order_staff, manager, admin). Payroll is a feature only admins can access. No separate account needed.
- "Who can see my expenses?" — You can always see your own. Managers and admins see submitted expenses in the approval queue. Admins can see all expenses.
- "What does 'voided' mean?" — It means the entry has been cancelled and its accounting impact reversed. The original entry stays in the system for audit purposes but has no financial effect.
- "Can I delete an expense?" — No. You can void it (admin only), which reverses its accounting impact. Deletion is not supported for audit trail integrity.

**Submission:**
- "What payment method should I choose?" — Personal Cash or Personal Transfer if you paid from your own money (you'll be reimbursed). Company Card if you used the company's bank card (no reimbursement needed).
- "I forgot to submit an expense from 3 weeks ago, is it too late?" — No, you can still submit it. It will get a "Late Submission" flag that your approver will see, but submission is not blocked.
- "Can I submit expenses in foreign currency?" — Not yet. All amounts must be in IDR. Convert to IDR using the exchange rate on the day of the expense.

**Approval:**
- "Why can't I see some expenses in my approval queue?" — Managers can only approve expenses up to Rp 500,000. Higher amounts require admin approval. Also, you can never approve your own expenses.
- "What do the fraud warning badges mean?" — See the Expense Analytics section above for detailed explanations of each flag.
- "I rejected an expense by mistake. What do I do?" — The submitter can revise and resubmit. You'll see the full rejection history when reviewing the resubmission.

**Reimbursement:**
- "What if the bank transfer fails?" — Void the batch in Frollie. This creates a reversing accounting entry and returns the expenses to the pending pool. You can then re-batch and try again.
- "Can I combine expenses from different employees in one batch?" — No. Each batch is for one employee. The system enforces this.
- "How does the submitter know they've been reimbursed?" — Their expense status changes to "Reimbursed" in the Expenses page (real-time update).

**Payroll:**
- "Do staff members need Frollie accounts?" — No. Payroll entries are financial records entered by admins. The recipient name is free text. Only people who need to log into Frollie need accounts.
- "How do I handle pro-rata pay?" — Calculate it yourself: (monthly salary ÷ working days in month) × days actually worked. Deduct any unpaid leave. Enter the final amount.
- "What's the difference between Staff and Contractor?" — It's a classification for reporting. Staff = permanent/full-time employees. Contractor = freelancers, part-time, or project-based workers. Both create the same journal entry (DR 6100, CR 1100).

---

## 6. Reusable Components

### WorkflowDiagram

Renders a **fixed-layout** SVG flowchart per usage (not a general-purpose graph renderer). Each diagram is a purpose-built SVG with hardcoded node positions, keeping implementation simple and predictable.

```typescript
interface FlowNode {
  id: string;
  label: string;
  color: "gray" | "blue" | "green" | "amber" | "red" | "orange";
  description?: string;
}

interface FlowEdge {
  from: string;
  to: string;
  label?: string;
  style?: "solid" | "dashed";
}

interface WorkflowDiagramProps {
  nodes: FlowNode[];
  edges: FlowEdge[];
}
```

- Nodes are rounded rectangles with color-coded backgrounds (matching shadcn theme tokens)
- Edges are SVG paths with arrowheads
- Labels on edges for decision branches
- **Vertical layout only** — simpler to implement and works on all screen sizes
- Entrance animation: nodes fade in sequentially, then edges draw themselves (stroke-dashoffset animation)
- Each guide defines its own diagram layouts as static SVG — no auto-layout algorithm needed

### StepCard

```typescript
interface StepCardProps {
  step: number;
  title: string;
  description: string;
  icon?: ComponentType<{ className?: string }>;
  tip?: string;
  warning?: string;
}
```

- Numbered circle on the left, title + description on the right
- Optional tip (green border-left) or warning (amber border-left) below the description
- Connected by a vertical dotted line between steps

### CalloutBox

```typescript
interface CalloutBoxProps {
  type: "tip" | "warning" | "important";
  children: React.ReactNode;
}
```

| Type | Icon | Border Color | Background (light / dark) |
|------|------|-------------|--------------------------|
| tip | Lightbulb | green-500 | green-50 / dark:green-950 |
| warning | AlertTriangle | amber-500 | amber-50 / dark:amber-950 |
| important | Info | orange-500 | orange-50 / dark:orange-950 |

### FaqAccordion

Uses shadcn `Accordion` with grouped sections:

```typescript
interface FaqItem {
  question: string;
  answer: string | React.ReactNode;
}

interface FaqGroup {
  title: string;
  items: FaqItem[];
}

interface FaqAccordionProps {
  groups: FaqGroup[];
}
```

### RoleTag

Small inline badge showing which role performs a step:

```typescript
interface RoleTagProps {
  role: "all" | "manager" | "admin";
}
```

| Role | Label | Color |
|------|-------|-------|
| all | All Staff | gray |
| manager | Manager+ | blue |
| admin | Admin Only | orange |

### GuideSection

Wrapper providing anchor ID, section title with role tag, and scroll-margin for sticky header offset:

```typescript
interface GuideSectionProps {
  id: string;
  title: string;
  role?: "all" | "manager" | "admin";
  children: React.ReactNode;
}
```

Renders with `scroll-margin-top: 80px` (accounting for sticky header height) so anchor links scroll to the correct position.

### GuideLayout

Shared layout for all guide pages:

```typescript
interface GuideLayoutProps {
  title: string;
  description?: string;
  sections: { id: string; title: string }[];
  children: React.ReactNode;
}
```

- Sticky sidebar TOC on desktop (left side, 200px width)
- Horizontal scrollable section tabs on mobile
- Active section tracking via Intersection Observer
- Back link to `/help`

---

## 7. Navigation Integration

### HubPage Card

Add a new entry to the `HUB_AREAS` array in `src/pages/HubPage.tsx`, following the existing `AreaCard` interface:

```typescript
{
  title: "Help & Training",
  description: "Step-by-step guides and FAQs for using Frollie.",
  icon: BookOpen,
  color: "text-sky-500",
  primaryPath: "/help",
  links: [
    { label: "All Guides", path: "/help" },
    { label: "Expenses Guide", path: "/help/expenses" },
  ],
  visible: () => true,  // All authenticated roles
}
```

Also add `BookOpen` to the Lucide import and `"All Guides": BookOpen, "Expenses Guide": CreditCard` to the `LINK_ICONS` map.

### Header Nav

Add `/help` as a new entry in `mainNavItems` (consistent with existing pattern):

```typescript
{ path: '/help', label: 'Help', icon: CircleHelp }
// No permission prop — visible to all authenticated roles
```

Also add the Help link to the mobile sheet menu so mobile users can discover it.

### Routes

```typescript
// In App.tsx
<Route path="/help" element={<ProtectedRoute><HelpCenter /></ProtectedRoute>} />
<Route path="/help/:guideId" element={<ProtectedRoute><GuideRouter /></ProtectedRoute>} />
```

`<ProtectedRoute>` is used with **no** `requiredPermission` or `allowedRoles` props, which means it only checks that the user is authenticated (existing behavior per `ProtectedRoute.tsx` lines 36-47).

`GuideRouter` (`src/pages/guides/GuideRouter.tsx`) reads the `guideId` URL param, looks it up in `HELP_GUIDES`, and renders the matching component. For invalid IDs, it renders a "Guide not found" state: centered icon, "Guide not found" heading, "Back to Help Center" link.

---

## 8. Visual Style

- **Theme:** Follows existing app theme (Tailwind CSS with shadcn/ui tokens). Dark mode inherits existing `dark:` class tokens. Design is optimized for light mode.
- **No gradients** — solid backgrounds, solid accent colors throughout.
- **Accent colors per guide:** orange (expenses), green (kitchen), blue (orders), purple (inventory), rose (recipes), amber (analytics). Used for card top-bar, icon backgrounds, and section accents.
- **Typography:** Same as app (system font stack via Tailwind). Guide content uses slightly larger body text (text-base / 16px) for readability.
- **Animations:** Framer Motion (existing dependency) for staggered card fade-in, section reveal on scroll, and flowchart node entrance. Keep animations subtle — 200-400ms durations.
- **Spacing:** Generous padding in guide content (prose-like reading experience). Max content width 720px within the guide layout.

---

## 9. Adding Future Guides

To add a new guide (e.g., Kitchen & Production):

1. Create `src/pages/guides/KitchenGuide.tsx` using the reusable help components
2. Update the matching entry in `src/lib/helpGuides.ts`: change `status` to `"live"`, add `sections` array, set `component` to the imported component
3. That's it — HelpCenter grid auto-renders live guides, GuideRouter auto-discovers by ID

The only file that grows is `helpGuides.ts` (one import + one registry entry per guide). No changes to HelpCenter.tsx, GuideRouter.tsx, App.tsx, or shared components.

---

## 10. Out of Scope (Deferred)

| Feature | Notes |
|---------|-------|
| **Print/PDF export** | Guides are web-only for now. Users can use browser print if needed. |
| **Versioning** | Guide content is hardcoded in React components. Updated via code changes, versioned by git. No CMS. |
| **Contextual `?` buttons** | Per-page help buttons that deep-link to relevant guide sections. Good future enhancement. |
| **Accessibility audit** | shadcn/ui Accordion (Radix-based) provides keyboard nav and ARIA attributes out of the box. WorkflowDiagram SVGs should include `role="img"` and `aria-label`. |

---

## 11. Testing

### Unit Tests

- `GuideLayout` renders TOC from sections prop
- `WorkflowDiagram` renders correct number of nodes and edges
- `FaqAccordion` expands/collapses items
- `CalloutBox` renders correct icon and styling per type
- `StepCard` renders step number, title, description
- Search filters guides and FAQ questions correctly

### E2E Tests

- Navigate to `/help` — all guide cards visible
- Click expense guide card — navigates to `/help/expenses`
- TOC sidebar shows all 8 sections
- Click TOC item — scrolls to section
- FAQ accordion expands/collapses
- Back link returns to `/help`
- HubPage "Help & Training" card links to `/help`
- Header help nav item links to `/help`
- Invalid guide ID (`/help/nonexistent`) shows "Guide not found" state

---

## 12. Success Criteria

- [ ] `npm run type-check` passes
- [ ] `npm run build` succeeds
- [ ] `/help` page renders with guide cards grid
- [ ] `/help/expenses` renders full guide with all 8 sections
- [ ] Flowchart diagrams render correctly in both light and dark mode
- [ ] FAQ accordion works (expand/collapse)
- [ ] TOC sidebar tracks active section on scroll
- [ ] HubPage card links to `/help`
- [ ] Header nav item links to `/help` (desktop and mobile)
- [ ] All authenticated roles can access `/help` (no permission restriction)
- [ ] "Coming Soon" cards are visually dimmed and not clickable
- [ ] Mobile responsive — single column layout, horizontal TOC tabs
- [ ] `/help/nonexistent` shows "Guide not found" state
