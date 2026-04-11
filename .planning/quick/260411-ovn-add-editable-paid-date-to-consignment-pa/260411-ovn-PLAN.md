---
phase: 260411-ovn
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - convex/consignment/mutations.ts
  - src/components/salesAnalytics/SettlementTimeline.tsx
  - src/components/salesAnalytics/OutletCard.tsx
autonomous: true
requirements: [QT-260411-ovn]

must_haves:
  truths:
    - "Mark as Paid dialog shows a date picker defaulting to today"
    - "User can change the date to a past date before confirming"
    - "Selected date is stored as paidAt on the settlement"
    - "Paid badge still displays the correct paidAt date"
  artifacts:
    - path: "convex/consignment/mutations.ts"
      provides: "markAsPaid mutation with optional paidAt arg"
      contains: "v.optional(v.number())"
    - path: "src/components/salesAnalytics/SettlementTimeline.tsx"
      provides: "Date picker in Mark as Paid dialog"
      contains: 'type="date"'
    - path: "src/components/salesAnalytics/OutletCard.tsx"
      provides: "handleMarkPaid passes paidAt timestamp"
      contains: "paidAt"
  key_links:
    - from: "src/components/salesAnalytics/SettlementTimeline.tsx"
      to: "src/components/salesAnalytics/OutletCard.tsx"
      via: "onMarkPaid callback with paidAt timestamp"
      pattern: "onMarkPaid.*paidAt"
    - from: "src/components/salesAnalytics/OutletCard.tsx"
      to: "convex/consignment/mutations.ts"
      via: "markAsPaid mutation call with paidAt"
      pattern: "markAsPaid.*paidAt"
---

<objective>
Add an editable paid date to the consignment "Mark as Paid" flow. The confirmation dialog gets a date picker (defaulting to today) so users can record retroactive payment dates. The backend mutation accepts an optional paidAt timestamp, falling back to Date.now() if omitted.

Purpose: Payments are often recorded days after the actual transfer. This lets users record the real paid date.
Output: Updated mutation, dialog with date picker, paidAt passed through the full call chain.
</objective>

<execution_context>
@D:/Claude/Product Manager/product_master/.claude/get-shit-done/workflows/execute-plan.md
@D:/Claude/Product Manager/product_master/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@convex/consignment/mutations.ts (markAsPaid at ~line 300)
@src/components/salesAnalytics/SettlementTimeline.tsx (full file)
@src/components/salesAnalytics/OutletCard.tsx (handleMarkPaid at ~line 67)
@src/components/salesAnalytics/settlementUtils.ts (toLocalEpoch, fromEpochToDateString)
@src/components/shared/ConfirmDialog.tsx (supports children prop)

<interfaces>
<!-- Key contracts the executor needs -->

From src/components/salesAnalytics/settlementUtils.ts:
```typescript
export function toLocalEpoch(dateString: string): number;       // "YYYY-MM-DD" -> epoch ms at local midnight
export function fromEpochToDateString(epochMs: number): string;  // epoch ms -> "YYYY-MM-DD"
```

From src/components/shared/ConfirmDialog.tsx:
```typescript
interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => void;
  children?: React.ReactNode;  // <-- USE THIS for injecting date picker
}
```

From src/components/salesAnalytics/SettlementTimeline.tsx:
```typescript
interface SettlementTimelineProps {
  onMarkPaid: (settlement: SettlementData) => void;  // Will change to include paidAt
}
```

From src/components/salesAnalytics/OutletCard.tsx:
```typescript
// handleMarkPaid currently: markAsPaid({ settlementId: s._id })
// Must become: markAsPaid({ settlementId: s._id, paidAt: timestamp })
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Backend — add optional paidAt arg to markAsPaid mutation</name>
  <files>convex/consignment/mutations.ts</files>
  <action>
In `convex/consignment/mutations.ts`, find the `markAsPaid` mutation (~line 300).

1. Add `paidAt: v.optional(v.number())` to the args object (after `settlementId`).
2. Change `const now = Date.now();` to `const now = args.paidAt ?? Date.now();`.
3. The rest of the mutation stays the same — `paidAt: now` and `updatedAt: now` are already correct since `now` is now either the user-supplied value or current time.

Keep `updatedAt` always as `Date.now()` (actual mutation time, not user-chosen date). So the change is:
```typescript
const now = Date.now();
const paidAt = args.paidAt ?? now;
```
Then patch with `paidAt` (user-chosen or now) and `updatedAt: now` (always current).
  </action>
  <verify>
    <automated>npx tsc --noEmit 2>&1 | head -20</automated>
  </verify>
  <done>markAsPaid mutation accepts optional paidAt number arg; uses it when provided, falls back to Date.now(); updatedAt remains always current time</done>
</task>

<task type="auto">
  <name>Task 2: Frontend — date picker in Mark as Paid dialog + pass paidAt through call chain</name>
  <files>src/components/salesAnalytics/SettlementTimeline.tsx, src/components/salesAnalytics/OutletCard.tsx</files>
  <action>
**SettlementTimeline.tsx changes:**

1. Add imports: `Input` from `@/components/ui/input`, `Label` from `@/components/ui/label`, `fromEpochToDateString` and `toLocalEpoch` from `./settlementUtils`.

2. Change `onMarkPaid` prop type from `(settlement: SettlementData) => void` to `(settlement: SettlementData, paidAt: number) => void`.

3. Add state for paid date: `const [paidDate, setPaidDate] = useState<string>("")`.

4. When `confirmPaidId` is set (dialog opens), initialize `paidDate` to today. Use an effect or set it in the click handler. Simplest: in the button's onClick, call `setPaidDate(fromEpochToDateString(Date.now()))` alongside `setConfirmPaidId(s._id)`.

5. In the Mark as Paid `ConfirmDialog`, add a `children` block with a date picker:
```tsx
<ConfirmDialog
  open={!!confirmPaidId}
  onOpenChange={(v) => !v && setConfirmPaidId(null)}
  title="Mark as Paid"
  description={`Mark this ${formatCurrency(targetPaid.frolliePayment)} settlement as paid? This action cannot be undone.`}
  confirmLabel="Mark as Paid"
  onConfirm={() => {
    onMarkPaid(targetPaid, toLocalEpoch(paidDate));
    setConfirmPaidId(null);
  }}
>
  <div className="space-y-2 py-2">
    <Label htmlFor="paid-date">Paid Date</Label>
    <Input
      id="paid-date"
      type="date"
      value={paidDate}
      max={fromEpochToDateString(Date.now())}
      onChange={(e) => setPaidDate(e.target.value)}
    />
  </div>
</ConfirmDialog>
```
The `max` attribute prevents future dates.

**OutletCard.tsx changes:**

1. Update `handleMarkPaid` signature to accept a second arg: `async (s: SettlementData, paidAt: number)`.

2. Pass `paidAt` to the mutation: `await markAsPaid({ settlementId: s._id, paidAt })`.

No changes needed to useConsignment hook — `useProtectedMutation` auto-injects token, and Convex auto-types the new optional arg from the mutation definition.
  </action>
  <verify>
    <automated>npm run build 2>&1 | tail -5</automated>
  </verify>
  <done>Mark as Paid dialog shows date picker defaulting to today with max=today; selected date converts via toLocalEpoch and passes through onMarkPaid -> handleMarkPaid -> markAsPaid mutation as paidAt timestamp; build passes clean</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| client -> Convex mutation | paidAt timestamp from untrusted client input |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-ovn-01 | Tampering | markAsPaid mutation | accept | paidAt is optional number; Convex validates type via v.optional(v.number()). Future dates are blocked by frontend max attribute. Backend does not need future-date guard since this is an internal admin tool (manager/admin role required). |
| T-ovn-02 | Elevation | markAsPaid mutation | mitigate | Already guarded by requireRole(ctx, args.token, ["admin", "manager"]) — no change needed |
</threat_model>

<verification>
1. `npm run build` passes clean
2. Open consignment page, expand an outlet with a pending settlement
3. Click "Mark as Paid" — dialog shows date picker defaulting to today
4. Change date to a past date, confirm — settlement shows paid with the chosen date
5. Verify the Paid badge displays the user-chosen date (not today)
</verification>

<success_criteria>
- Mark as Paid dialog includes a date picker pre-filled with today's date
- Date picker does not allow future dates (max=today)
- Chosen date is persisted as paidAt on the settlement document
- Paid badge displays the user-selected date correctly
- `npm run build` passes
</success_criteria>

<output>
After completion, create `.planning/quick/260411-ovn-add-editable-paid-date-to-consignment-pa/260411-ovn-SUMMARY.md`
</output>
