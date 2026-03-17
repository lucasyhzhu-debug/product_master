# Interactive Expense Walkthrough Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace 3 text-heavy expense guide sections (Submit, Approve, Reimburse) with click-through visual walkthroughs using mock UI panels.

**Architecture:** A generic `WalkthroughPlayer` component renders workflow tabs, a clickable step list, and mock UI panels with annotation callouts. Three workflow-specific mock components provide the visual content. The player is wired into `ExpenseGuide.tsx` replacing sections 2–4, while sections 1, 5–8 stay as text.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, Framer Motion, shadcn/ui theme tokens

**Spec:** `docs/superpowers/specs/2026-03-17-interactive-expense-walkthrough-design.md`

---

## File Map

### New Files

| File | Responsibility |
|------|---------------|
| `src/components/help/walkthrough/MockElements.tsx` | 11 reusable mock UI building blocks (MockFrame, MockInput, MockSelect, etc.) with theme-aware highlight styling |
| `src/components/help/walkthrough/SubmitMocks.tsx` | Mock panels for 4-step Submit Expense workflow |
| `src/components/help/walkthrough/ApproveMocks.tsx` | Mock panels for 3-step Approve Expense workflow |
| `src/components/help/walkthrough/ReimburseMocks.tsx` | Mock panels for 6-step Reimburse workflow |
| `src/components/help/walkthrough/types.ts` | Shared types: `WalkthroughStep`, `WalkthroughWorkflow`, `MockPanelProps` |
| `src/components/help/walkthrough/index.ts` | Barrel export |
| `src/components/help/WalkthroughPlayer.tsx` | Generic reusable walkthrough engine — tabs, step list, mock viewport, annotation, keyboard nav, AnimatePresence crossfade |

### Modified Files

| File | Change |
|------|--------|
| `src/components/help/index.ts` | Add `WalkthroughPlayer` export + re-export types |
| `src/pages/guides/ExpenseGuide.tsx` | Replace sections 2–4 with `WalkthroughPlayer`. Remove `SUBMITTING_FAQ`, `DOA_NODES/EDGES`, `BATCH_NODES/EDGES`. Migrate 2 FAQ items to `FULL_FAQ`. Add workflow data arrays. |
| `src/lib/helpGuides.ts` | Update sections (8→6), `POPULAR_QUESTIONS` anchors, `readTimeMinutes` (15→10) |
| `src/lib/__tests__/helpGuides.test.ts` | Update 4 tests for new section structure |

---

## Chunk 1: Foundation — Types, Mock Elements, WalkthroughPlayer

### Task 1: Create shared types

**Files:**
- Create: `src/components/help/walkthrough/types.ts`

- [ ] **Step 1: Create the types file**

```typescript
// src/components/help/walkthrough/types.ts
import type { ComponentType } from "react";

export interface WalkthroughStep {
  id: string;
  title: string;
  description: string;
  tip?: string;
  warning?: string;
}

export interface MockPanelProps {
  currentStep: number;
  breadcrumb: string;
}

export interface WalkthroughWorkflow {
  id: string;
  label: string;
  steps: WalkthroughStep[];
  mockComponent: ComponentType<MockPanelProps>;
}
```

- [ ] **Step 2: Run type check**

Run: `npm run type-check 2>&1 | tail -5`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/help/walkthrough/types.ts
git commit -m "feat(63): add walkthrough shared types"
```

---

### Task 2: Create MockElements

**Files:**
- Create: `src/components/help/walkthrough/MockElements.tsx`

All mock elements use Tailwind with `cn()` utility for conditional classes. The highlight style uses a shared class pattern: `highlighted` prop adds bright indigo border + glow.

- [ ] **Step 1: Create MockElements.tsx with all 11 primitives**

```typescript
// src/components/help/walkthrough/MockElements.tsx
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Highlight style (shared)
// ---------------------------------------------------------------------------

export const HIGHLIGHT_CLASSES =
  "border-2 border-indigo-400 dark:border-indigo-400 shadow-[0_0_0_4px_rgba(99,102,241,0.15),0_0_12px_rgba(99,102,241,0.08)] dark:shadow-[0_0_0_4px_rgba(99,102,241,0.25),0_0_12px_rgba(99,102,241,0.15)]";

// ---------------------------------------------------------------------------
// MockFrame — browser-like chrome wrapper
// ---------------------------------------------------------------------------

export function MockFrame({
  breadcrumb,
  children,
}: {
  breadcrumb: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl overflow-hidden border bg-card">
      {/* Titlebar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 border-b">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
          <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
        </div>
        <span className="text-xs text-muted-foreground ml-1">{breadcrumb}</span>
      </div>
      {/* Body */}
      <div className="p-4">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MockLabel
// ---------------------------------------------------------------------------

export function MockLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-xs text-muted-foreground mb-1">{children}</div>
  );
}

// ---------------------------------------------------------------------------
// MockInput
// ---------------------------------------------------------------------------

export function MockInput({
  label,
  value,
  highlighted,
}: {
  label: string;
  value?: string;
  highlighted?: boolean;
}) {
  return (
    <div>
      <MockLabel>{label}</MockLabel>
      <div
        className={cn(
          "h-8 rounded-md border bg-background px-2.5 flex items-center text-sm",
          highlighted ? HIGHLIGHT_CLASSES : "border-input"
        )}
      >
        {value && <span>{value}</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MockSelect
// ---------------------------------------------------------------------------

export function MockSelect({
  label,
  value,
  highlighted,
}: {
  label: string;
  value: string;
  highlighted?: boolean;
}) {
  return (
    <div>
      <MockLabel>{label}</MockLabel>
      <div
        className={cn(
          "h-8 rounded-md border bg-background px-2.5 flex items-center justify-between text-sm",
          highlighted ? HIGHLIGHT_CLASSES : "border-input"
        )}
      >
        <span>{value}</span>
        <span className="text-xs text-muted-foreground">&#9660;</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MockButton
// ---------------------------------------------------------------------------

export function MockButton({
  variant = "ghost",
  children,
  highlighted,
}: {
  variant?: "primary" | "ghost" | "destructive";
  children: ReactNode;
  highlighted?: boolean;
}) {
  const base = "px-3 py-1.5 rounded-md text-sm font-medium inline-flex items-center";
  const variants = {
    primary: "bg-green-600 text-white",
    ghost: "bg-muted border border-input text-muted-foreground",
    destructive: "bg-destructive text-destructive-foreground",
  };
  return (
    <div
      className={cn(base, variants[variant], highlighted && HIGHLIGHT_CLASSES)}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MockField — generic wrapper
// ---------------------------------------------------------------------------

export function MockField({ children }: { children: ReactNode }) {
  return <div>{children}</div>;
}

// ---------------------------------------------------------------------------
// MockRow — 2-column grid
// ---------------------------------------------------------------------------

export function MockRow({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>;
}

// ---------------------------------------------------------------------------
// MockTable
// ---------------------------------------------------------------------------

export function MockTable({
  headers,
  rows,
  highlightRow,
}: {
  headers: string[];
  rows: string[][];
  highlightRow?: number;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b">
            {headers.map((h) => (
              <th key={h} className="text-left py-1.5 px-2 font-medium text-xs">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              className={cn(
                "border-b",
                highlightRow === i && HIGHLIGHT_CLASSES
              )}
            >
              {row.map((cell, j) => (
                <td key={j} className="py-1.5 px-2 text-xs">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MockBadge
// ---------------------------------------------------------------------------

export function MockBadge({
  variant,
  children,
}: {
  variant: "warning" | "error" | "info";
  children: ReactNode;
}) {
  const colors = {
    warning: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    error: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    info: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  };
  return (
    <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded", colors[variant])}>
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// MockUploadZone
// ---------------------------------------------------------------------------

export function MockUploadZone({
  hasFile,
  highlighted,
}: {
  hasFile?: boolean;
  highlighted?: boolean;
}) {
  return (
    <div
      className={cn(
        "border-2 border-dashed rounded-lg p-4 text-center",
        highlighted ? HIGHLIGHT_CLASSES : "border-muted-foreground/25"
      )}
    >
      {hasFile ? (
        <div className="flex items-center gap-2 justify-center">
          <div className="w-10 h-10 rounded bg-muted flex items-center justify-center text-xs text-muted-foreground">
            IMG
          </div>
          <span className="text-xs text-muted-foreground">receipt-photo.jpg</span>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Drop receipt image here or click to upload
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MockNavDropdown
// ---------------------------------------------------------------------------

export function MockNavDropdown({
  activeItem,
  highlighted,
}: {
  activeItem: string;
  highlighted?: boolean;
}) {
  const items = ["Expenses", "Reimburse", "Payroll", "Exp. Analytics", "Income Statement"];
  return (
    <div className="border rounded-lg bg-card overflow-hidden">
      <div className="px-3 py-1.5 bg-muted/50 border-b text-xs font-medium">
        Financials
      </div>
      {items.map((item) => {
        const isActive = item === activeItem;
        return (
          <div
            key={item}
            className={cn(
              "px-3 py-1.5 text-xs",
              isActive && highlighted
                ? "bg-indigo-500/15 text-indigo-400 font-medium " + HIGHLIGHT_CLASSES
                : isActive
                  ? "bg-accent font-medium"
                  : "text-muted-foreground"
            )}
          >
            {item}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Run type check**

Run: `npm run type-check 2>&1 | tail -5`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/help/walkthrough/MockElements.tsx
git commit -m "feat(63): add mock UI element primitives"
```

---

### Task 3: Create WalkthroughPlayer

**Files:**
- Create: `src/components/help/WalkthroughPlayer.tsx`
- Modify: `src/components/help/index.ts`

**References to check:**
- `src/components/help/GuideLayout.tsx` — the `MobileTabs` component for mobile pill pattern reference
- `src/index.css` — theme variable names

- [ ] **Step 1: Create WalkthroughPlayer.tsx**

```typescript
// src/components/help/WalkthroughPlayer.tsx
import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { CalloutBox } from "./CalloutBox";
import type { WalkthroughWorkflow } from "./walkthrough/types";

interface WalkthroughPlayerProps {
  workflows: WalkthroughWorkflow[];
  defaultWorkflow?: string;
}

export function WalkthroughPlayer({
  workflows,
  defaultWorkflow,
}: WalkthroughPlayerProps) {
  const [activeWorkflowId, setActiveWorkflowId] = useState(
    defaultWorkflow ?? workflows[0]?.id ?? ""
  );
  const [activeStep, setActiveStep] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const workflow = workflows.find((w) => w.id === activeWorkflowId) ?? workflows[0];
  const step = workflow?.steps[activeStep];
  const MockComponent = workflow?.mockComponent;

  // Reset step when switching workflow
  const switchWorkflow = useCallback(
    (id: string) => {
      setActiveWorkflowId(id);
      setActiveStep(0);
    },
    []
  );

  // Keyboard navigation
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (!workflow) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setActiveStep((s) => Math.min(s + 1, workflow.steps.length - 1));
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setActiveStep((s) => Math.max(s - 1, 0));
      }
    }

    el.addEventListener("keydown", handleKeyDown);
    return () => el.removeEventListener("keydown", handleKeyDown);
  }, [workflow]);

  if (!workflow || !step || !MockComponent) return null;

  return (
    <div ref={containerRef} tabIndex={-1} className="outline-none">
      {/* Workflow Tabs */}
      <div
        role="tablist"
        className="flex gap-1 bg-muted rounded-lg p-1 mb-6"
      >
        {workflows.map((w) => (
          <button
            key={w.id}
            role="tab"
            aria-selected={w.id === activeWorkflowId}
            onClick={() => switchWorkflow(w.id)}
            className={cn(
              "flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors",
              w.id === activeWorkflowId
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {w.label}
            <span className="ml-1.5 text-xs text-muted-foreground">
              {w.steps.length} steps
            </span>
          </button>
        ))}
      </div>

      {/* Main content: Step List + Mock Panel */}
      <div className="flex gap-6">
        {/* Step List — desktop sidebar */}
        <div role="list" className="hidden md:block w-52 shrink-0 space-y-1">
          {workflow.steps.map((s, i) => {
            const isCompleted = i < activeStep;
            const isActive = i === activeStep;
            return (
              <button
                key={s.id}
                role="listitem"
                aria-current={isActive ? "step" : undefined}
                onClick={() => setActiveStep(i)}
                className={cn(
                  "w-full flex items-start gap-2.5 px-3 py-2 rounded-lg text-left transition-colors border border-transparent",
                  isActive && "bg-indigo-500/10 border-indigo-500/25",
                  !isActive && "hover:bg-muted/50"
                )}
              >
                <div
                  className={cn(
                    "w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 mt-0.5",
                    isCompleted && "bg-green-600 text-white",
                    isActive && "bg-indigo-500 text-white",
                    !isCompleted && !isActive && "bg-muted text-muted-foreground"
                  )}
                >
                  {isCompleted ? <Check className="w-3 h-3" /> : i + 1}
                </div>
                <span
                  className={cn(
                    "text-sm leading-snug",
                    isActive ? "text-foreground font-medium" : "text-muted-foreground"
                  )}
                >
                  {s.title}
                </span>
              </button>
            );
          })}
        </div>

        {/* Step List — mobile pills */}
        <MobileStepPills
          steps={workflow.steps}
          activeStep={activeStep}
          onStepClick={setActiveStep}
        />

        {/* Mock Panel + Annotation */}
        <div className="flex-1 min-w-0">
          {/* Mock UI with crossfade */}
          <AnimatePresence mode="wait">
            <motion.div
              key={`${activeWorkflowId}-${activeStep}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              role="region"
              aria-live="polite"
            >
              <MockComponent
                currentStep={activeStep}
                breadcrumb={getBreadcrumb(workflow.id, activeStep)}
              />
            </motion.div>
          </AnimatePresence>

          {/* Annotation */}
          <div className="mt-3 bg-indigo-500/5 border-l-[3px] border-indigo-500 rounded-r-lg p-3" aria-live="polite">
            <div className="text-xs font-semibold text-indigo-400 dark:text-indigo-300 mb-1">
              Step {activeStep + 1}: {step.title}
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {step.description}
            </p>
            {step.tip && (
              <div className="mt-2">
                <CalloutBox type="tip">{step.tip}</CalloutBox>
              </div>
            )}
            {step.warning && (
              <div className="mt-2">
                <CalloutBox type="warning">{step.warning}</CalloutBox>
              </div>
            )}
          </div>

          {/* Keyboard hint */}
          <p className="text-xs text-muted-foreground text-center mt-3">
            Use{" "}
            <kbd className="px-1.5 py-0.5 bg-muted rounded text-[11px]">&#8592;</kbd>{" "}
            <kbd className="px-1.5 py-0.5 bg-muted rounded text-[11px]">&#8594;</kbd>{" "}
            arrow keys or click steps to navigate
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mobile step pills (shown < md, hidden on desktop)
// ---------------------------------------------------------------------------

function MobileStepPills({
  steps,
  activeStep,
  onStepClick,
}: {
  steps: { id: string; title: string }[];
  activeStep: number;
  onStepClick: (i: number) => void;
}) {
  return (
    <div className="md:hidden overflow-x-auto whitespace-nowrap flex gap-2 pb-2 mb-4 -mx-4 px-4">
      {steps.map((s, i) => {
        const isActive = i === activeStep;
        const isCompleted = i < activeStep;
        return (
          <button
            key={s.id}
            onClick={() => onStepClick(i)}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs shrink-0 flex items-center gap-1.5",
              isActive && "bg-indigo-500 text-white",
              isCompleted && !isActive && "bg-green-600/15 text-green-600",
              !isActive && !isCompleted && "bg-muted text-muted-foreground"
            )}
          >
            {isCompleted ? <Check className="w-3 h-3" /> : null}
            {s.title}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Breadcrumb helper
// ---------------------------------------------------------------------------

function getBreadcrumb(workflowId: string, step: number): string {
  const breadcrumbs: Record<string, string[]> = {
    submit: [
      "Financials > Expenses",
      "Financials > Expenses > New Expense",
      "Financials > Expenses > New Expense",
      "Financials > Expenses > New Expense",
    ],
    approve: [
      "Financials > Expenses > Approval",
      "Financials > Expenses > Approval > Detail",
      "Financials > Expenses > Approval > Detail",
    ],
    reimburse: [
      "Financials > Reimburse",
      "Financials > Reimburse",
      "Financials > Reimburse > New Batch",
      "Financials > Reimburse > Batch RMB-0315-001",
      "Financials > Reimburse > Batch RMB-0315-001",
      "Financials > Reimburse > Batch RMB-0315-001",
    ],
  };
  return breadcrumbs[workflowId]?.[step] ?? "Financials";
}
```

- [ ] **Step 2: Add WalkthroughPlayer export to help barrel**

In `src/components/help/index.ts`, add after the existing exports:

```typescript
export { WalkthroughPlayer } from "./WalkthroughPlayer";
export type {
  WalkthroughStep,
  WalkthroughWorkflow,
  MockPanelProps,
} from "./walkthrough/types";
```

- [ ] **Step 3: Run type check**

Run: `npm run type-check 2>&1 | tail -5`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/components/help/WalkthroughPlayer.tsx src/components/help/index.ts
git commit -m "feat(63): add WalkthroughPlayer reusable component"
```

---

---

## Chunk 2: Mock UI Components

### Task 5: Create SubmitMocks

**Files:**
- Create: `src/components/help/walkthrough/SubmitMocks.tsx`

**Content reference:** Spec Section 6.1 — Submit Expense (4 steps)

- [ ] **Step 1: Create SubmitMocks.tsx**

```typescript
// src/components/help/walkthrough/SubmitMocks.tsx
import {
  MockFrame,
  MockInput,
  MockSelect,
  MockButton,
  MockRow,
  MockUploadZone,
  MockNavDropdown,
} from "./MockElements";
import type { MockPanelProps } from "./types";

export function SubmitExpenseMock({ currentStep, breadcrumb }: MockPanelProps) {
  // Step 0: Navigate to Expenses
  if (currentStep === 0) {
    return (
      <MockFrame breadcrumb={breadcrumb}>
        <div className="flex gap-4">
          <MockNavDropdown activeItem="Expenses" highlighted />
          <div className="flex-1 space-y-3">
            <div className="text-sm font-semibold">My Expenses</div>
            <div className="text-xs text-muted-foreground">
              3 expenses this month
            </div>
            <MockButton variant="primary" highlighted>
              + New Expense
            </MockButton>
          </div>
        </div>
      </MockFrame>
    );
  }

  // Steps 1-3: New Expense form
  const hl = (step: number) => currentStep === step;

  return (
    <MockFrame breadcrumb={breadcrumb}>
      <div className="text-sm font-semibold mb-3">New Expense</div>

      <div className="space-y-3">
        <MockInput
          label="Description"
          value="Office supplies for March production"
          highlighted={hl(1)}
        />

        <MockRow>
          <MockInput
            label="Amount (IDR)"
            value="Rp 150,000"
            highlighted={hl(1)}
          />
          <MockSelect
            label="GL Category"
            value="6500 General OpEx"
            highlighted={hl(1)}
          />
        </MockRow>

        <MockRow>
          <MockInput
            label="Expense Date"
            value="2026-03-15"
            highlighted={hl(1)}
          />
          <MockInput
            label="Vendor"
            value="Toko Sukses"
            highlighted={hl(1)}
          />
        </MockRow>

        <MockSelect
          label="Payment Method"
          value="Personal Cash"
          highlighted={false}
        />

        {/* Receipt upload — visible at steps 2+ */}
        {currentStep >= 2 && (
          <div className="mt-2">
            <MockUploadZone
              hasFile={currentStep >= 2}
              highlighted={hl(2)}
            />
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2 justify-end pt-2">
          <MockButton variant="ghost" highlighted={hl(3)}>
            Save Draft
          </MockButton>
          <MockButton variant="primary" highlighted={hl(3)}>
            Submit
          </MockButton>
        </div>
      </div>
    </MockFrame>
  );
}
```

- [ ] **Step 2: Run type check**

Run: `npm run type-check 2>&1 | tail -5`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/help/walkthrough/SubmitMocks.tsx
git commit -m "feat(63): add Submit Expense mock panels"
```

---

### Task 6: Create ApproveMocks

**Files:**
- Create: `src/components/help/walkthrough/ApproveMocks.tsx`

**Content reference:** Spec Section 6.2 — Approve Expense (3 steps)

- [ ] **Step 1: Create ApproveMocks.tsx**

```typescript
// src/components/help/walkthrough/ApproveMocks.tsx
import {
  MockFrame,
  MockTable,
  MockBadge,
  MockButton,
  MockInput,
  MockNavDropdown,
  HIGHLIGHT_CLASSES,
} from "./MockElements";
import type { MockPanelProps } from "./types";

export function ApproveExpenseMock({ currentStep, breadcrumb }: MockPanelProps) {
  // Step 0: Approval queue
  if (currentStep === 0) {
    return (
      <MockFrame breadcrumb={breadcrumb}>
        {/* Tab selector */}
        <div className="flex gap-1 mb-3">
          <div className="px-3 py-1 rounded text-xs text-muted-foreground">
            My Expenses
          </div>
          <div className="px-3 py-1 rounded text-xs bg-indigo-500/15 text-indigo-400 font-medium border-2 border-indigo-400 shadow-[0_0_0_4px_rgba(99,102,241,0.15)]">
            Approval (3)
          </div>
        </div>

        <MockTable
          headers={["Date", "Employee", "Amount", "Category", "Flags"]}
          rows={[
            ["Mar 14", "Sari", "Rp 150,000", "6500 OpEx", ""],
            ["Mar 13", "Budi", "Rp 85,000", "5100 Materials", "Late"],
            ["Mar 12", "Sari", "Rp 200,000", "6500 OpEx", "Duplicate"],
          ]}
          highlightRow={0}
        />
      </MockFrame>
    );
  }

  // Step 1: Expense detail
  if (currentStep === 1) {
    return (
      <MockFrame breadcrumb={breadcrumb}>
        <div className="space-y-3 border-2 border-indigo-400 dark:border-indigo-400 rounded-lg p-3 shadow-[0_0_0_4px_rgba(99,102,241,0.15)]">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">Expense Detail</div>
            <MockBadge variant="warning">Late Submission</MockBadge>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-muted-foreground">Amount:</span>{" "}
              <span className="font-medium">Rp 150,000</span>
            </div>
            <div>
              <span className="text-muted-foreground">GL Category:</span>{" "}
              <span>6500 General OpEx</span>
            </div>
            <div>
              <span className="text-muted-foreground">Vendor:</span>{" "}
              <span>Toko Sukses</span>
            </div>
            <div>
              <span className="text-muted-foreground">Date:</span>{" "}
              <span>2026-03-14</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded bg-muted flex items-center justify-center text-[10px] text-muted-foreground">
              IMG
            </div>
            <span className="text-xs text-muted-foreground">receipt.jpg</span>
          </div>
        </div>
      </MockFrame>
    );
  }

  // Step 2: Approve/Reject actions
  return (
    <MockFrame breadcrumb={breadcrumb}>
      <div className="space-y-3">
        {/* Condensed detail */}
        <div className="text-xs text-muted-foreground">
          Sari &middot; Rp 150,000 &middot; 6500 General OpEx
        </div>

        {/* Reject reason textarea */}
        <div>
          <div className="text-xs text-muted-foreground mb-1">
            Rejection reason (required if rejecting)
          </div>
          <div className="h-16 rounded-md border border-input bg-background p-2 text-xs text-muted-foreground/50 border-2 border-indigo-400 shadow-[0_0_0_4px_rgba(99,102,241,0.15)]">
            Enter reason...
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 justify-end border-2 border-indigo-400 rounded-lg p-2 shadow-[0_0_0_4px_rgba(99,102,241,0.15)]">
          <MockButton variant="destructive" highlighted>
            Reject
          </MockButton>
          <MockButton variant="primary" highlighted>
            Approve
          </MockButton>
        </div>
      </div>
    </MockFrame>
  );
}
```

- [ ] **Step 2: Run type check**

Run: `npm run type-check 2>&1 | tail -5`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/help/walkthrough/ApproveMocks.tsx
git commit -m "feat(63): add Approve Expense mock panels"
```

---

### Task 7: Create ReimburseMocks

**Files:**
- Create: `src/components/help/walkthrough/ReimburseMocks.tsx`

**Content reference:** Spec Section 6.3 — Reimburse (6 steps)

- [ ] **Step 1: Create ReimburseMocks.tsx**

```typescript
// src/components/help/walkthrough/ReimburseMocks.tsx
import {
  MockFrame,
  MockInput,
  MockSelect,
  MockButton,
  MockRow,
  MockNavDropdown,
  HIGHLIGHT_CLASSES,
} from "./MockElements";
import { Check } from "lucide-react";
import type { MockPanelProps } from "./types";

export function ReimburseMock({ currentStep, breadcrumb }: MockPanelProps) {
  const hl = "border-2 border-indigo-400 dark:border-indigo-400 shadow-[0_0_0_4px_rgba(99,102,241,0.15)] dark:shadow-[0_0_0_4px_rgba(99,102,241,0.25)]";

  // Step 0: Navigate to Reimburse
  if (currentStep === 0) {
    return (
      <MockFrame breadcrumb={breadcrumb}>
        <div className="flex gap-4">
          <MockNavDropdown activeItem="Reimburse" highlighted />
          <div className="flex-1">
            <div className="text-sm font-semibold">Reimbursement Manager</div>
            <div className="text-xs text-muted-foreground mt-1">
              Admin only &middot; 2 employees with pending expenses
            </div>
          </div>
        </div>
      </MockFrame>
    );
  }

  // Step 1: Pending expenses grouped by employee
  if (currentStep === 1) {
    return (
      <MockFrame breadcrumb={breadcrumb}>
        <div className="text-sm font-semibold mb-3">Pending Reimbursements</div>
        <div className="space-y-2">
          <EmployeeGroup name="Sari" count={3} total="Rp 450,000" highlighted />
          <EmployeeGroup name="Budi" count={1} total="Rp 150,000" />
        </div>
      </MockFrame>
    );
  }

  // Step 2: Create batch
  if (currentStep === 2) {
    return (
      <MockFrame breadcrumb={breadcrumb}>
        <div className="text-sm font-semibold mb-3">Sari — 3 Pending Expenses</div>
        <div className="space-y-2 mb-3">
          {[
            { desc: "Office supplies", amount: "Rp 150,000" },
            { desc: "Transport to warehouse", amount: "Rp 85,000" },
            { desc: "Packaging samples", amount: "Rp 215,000" },
          ].map((e) => (
            <div
              key={e.desc}
              className={`flex items-center gap-2 px-2 py-1.5 rounded border ${hl}`}
            >
              <div className="w-4 h-4 rounded border-2 border-indigo-400 bg-indigo-500 flex items-center justify-center">
                <Check className="w-2.5 h-2.5 text-white" />
              </div>
              <span className="text-xs flex-1">{e.desc}</span>
              <span className="text-xs font-medium">{e.amount}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            Batch code: <span className="font-mono font-medium">RMB-0315-001</span>
          </div>
          <MockButton variant="primary" highlighted>
            Create Batch
          </MockButton>
        </div>
      </MockFrame>
    );
  }

  // Step 3: Transfer instruction
  if (currentStep === 3) {
    return (
      <MockFrame breadcrumb={breadcrumb}>
        <div className={`rounded-lg border p-3 space-y-2 ${hl}`}>
          <div className="text-sm font-semibold">Transfer Required</div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-muted-foreground">Recipient:</span> Sari
            </div>
            <div>
              <span className="text-muted-foreground">Amount:</span>{" "}
              <span className="font-medium">Rp 450,000</span>
            </div>
            <div>
              <span className="text-muted-foreground">Reference:</span>{" "}
              <span className="font-mono">RMB-0315-001</span>
            </div>
            <div>
              <span className="text-muted-foreground">Expenses:</span> 3 items
            </div>
          </div>
          <div className="bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded p-2 text-xs">
            Open BCA Mobile and transfer Rp 450,000 to Sari. Use RMB-0315-001 in the transfer notes.
          </div>
        </div>
      </MockFrame>
    );
  }

  // Step 4: Confirm batch
  if (currentStep === 4) {
    return (
      <MockFrame breadcrumb={breadcrumb}>
        <div className="text-sm font-semibold mb-3">Confirm Batch RMB-0315-001</div>
        <div className="space-y-3">
          <MockInput
            label="BCA Reference Number"
            value="TRF-2026031500142"
            highlighted
          />
          <MockRow>
            <MockSelect
              label="Source Account"
              value="BCA 123-456-789"
              highlighted
            />
            <MockInput
              label="Transfer Date"
              value="2026-03-15"
              highlighted
            />
          </MockRow>
          <div className="flex justify-end">
            <MockButton variant="primary" highlighted>
              Confirm Batch
            </MockButton>
          </div>
        </div>
      </MockFrame>
    );
  }

  // Step 5: Done
  return (
    <MockFrame breadcrumb={breadcrumb}>
      <div className="text-center py-6 space-y-3 border-2 border-green-500 rounded-lg p-4 shadow-[0_0_0_4px_rgba(34,197,94,0.15)]">
        <div className="w-12 h-12 rounded-full bg-green-600 flex items-center justify-center mx-auto">
          <Check className="w-6 h-6 text-white" />
        </div>
        <div className="text-sm font-semibold">Batch Complete</div>
        <div className="text-xs text-muted-foreground">
          3 expenses marked <span className="text-green-600 font-medium">Reimbursed</span>
        </div>
        <div className="text-xs text-muted-foreground">
          Sari &middot; Rp 450,000 &middot; RMB-0315-001
        </div>
      </div>
    </MockFrame>
  );
}

// ---------------------------------------------------------------------------
// Employee group card (used in step 1)
// ---------------------------------------------------------------------------

function EmployeeGroup({
  name,
  count,
  total,
  highlighted,
}: {
  name: string;
  count: number;
  total: string;
  highlighted?: boolean;
}) {
  const hl = highlighted
    ? "border-2 border-indigo-400 dark:border-indigo-400 shadow-[0_0_0_4px_rgba(99,102,241,0.15)]"
    : "border";
  return (
    <div className={`rounded-lg p-3 ${hl}`}>
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">{name}</div>
        <div className="text-sm font-semibold">{total}</div>
      </div>
      <div className="text-xs text-muted-foreground mt-0.5">
        {count} expense{count !== 1 ? "s" : ""} pending
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run type check**

Run: `npm run type-check 2>&1 | tail -5`
Expected: No errors (all exports now exist)

- [ ] **Step 3: Run build**

Run: `npm run build 2>&1 | tail -10`
Expected: Build succeeds (all new files are self-contained, no integration yet)

- [ ] **Step 4: Commit**

```bash
git add src/components/help/walkthrough/ReimburseMocks.tsx
git commit -m "feat(63): add Reimburse mock panels"
```

---

### Task 8: Create walkthrough barrel export

**Files:**
- Create: `src/components/help/walkthrough/index.ts`

- [ ] **Step 1: Create barrel**

```typescript
// src/components/help/walkthrough/index.ts
export type { WalkthroughStep, WalkthroughWorkflow, MockPanelProps } from "./types";
export { HIGHLIGHT_CLASSES } from "./MockElements";
export { SubmitExpenseMock } from "./SubmitMocks";
export { ApproveExpenseMock } from "./ApproveMocks";
export { ReimburseMock } from "./ReimburseMocks";
```

- [ ] **Step 2: Run type check**

Run: `npm run type-check 2>&1 | tail -5`
Expected: No errors (all exports now exist)

- [ ] **Step 3: Run build**

Run: `npm run build 2>&1 | tail -10`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/components/help/walkthrough/index.ts
git commit -m "feat(63): add walkthrough barrel export"
```

---

## Chunk 3: Integration — Wire into ExpenseGuide, update registry and tests

### Task 9: Update helpGuides.ts registry

**Files:**
- Modify: `src/lib/helpGuides.ts`

- [ ] **Step 1: Update sections array**

In `src/lib/helpGuides.ts`, replace the expenses sections array (lines 59-67):

```typescript
// Before
      { id: "overview", title: "Overview" },
      { id: "submitting", title: "Submitting Expenses", role: "all" },
      { id: "approving", title: "Approving Expenses", role: "manager" },
      { id: "reimbursement", title: "Reimbursement Workflow", role: "admin" },
      { id: "payroll", title: "Payroll Integration", role: "admin" },
      { id: "analytics", title: "Expense Analytics", role: "manager" },
      { id: "pnl", title: "P&L Impact", role: "admin" },
      { id: "faq", title: "FAQ" },

// After
      { id: "overview", title: "Overview" },
      { id: "walkthrough", title: "Interactive Walkthroughs" },
      { id: "payroll", title: "Payroll Integration", role: "admin" },
      { id: "analytics", title: "Expense Analytics", role: "manager" },
      { id: "pnl", title: "P&L Impact", role: "admin" },
      { id: "faq", title: "FAQ" },
```

- [ ] **Step 2: Update readTimeMinutes**

Change `readTimeMinutes: 15` to `readTimeMinutes: 10` (line 69).

- [ ] **Step 3: Update POPULAR_QUESTIONS anchors**

Change the two anchors that reference removed sections (lines 140-147):

```typescript
// "How do I submit an expense?" — anchor: "submitting" → "walkthrough"
// "Who can approve expenses?" — anchor: "approving" → "walkthrough"
```

- [ ] **Step 4: Run type check**

Run: `npm run type-check 2>&1 | tail -5`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/lib/helpGuides.ts
git commit -m "feat(63): update help registry — 8 sections to 6, walkthrough replaces submit/approve/reimburse"
```

---

### Task 10: Update helpGuides tests

**Files:**
- Modify: `src/lib/__tests__/helpGuides.test.ts`

- [ ] **Step 1: Update the "matches a section title" test**

The test at line 24-33 searches for "Submitting" and expects `anchor: "submitting"`. That section no longer exists. Replace with a test for the new walkthrough section:

```typescript
  it("matches a section title and includes anchor", () => {
    const results = searchGuides("Walkthrough");
    const sectionMatch = results.find(
      (r) => r.type === "section" && r.anchor === "walkthrough"
    );
    expect(sectionMatch).toBeDefined();
    expect(sectionMatch!.guideId).toBe("expenses");
    expect(sectionMatch!.label).toBe("Interactive Walkthroughs");
    expect(sectionMatch!.anchor).toBe("walkthrough");
  });
```

- [ ] **Step 2: Update the FAQ anchor assertion**

The test at line 35-42 expects `anchor: "submitting"` for the FAQ question. After the registry change, the popular question anchor is now "walkthrough":

```typescript
  it("matches a FAQ question and includes guideId and anchor", () => {
    const results = searchGuides("submit an expense");
    const faqMatch = results.find((r) => r.type === "faq");
    expect(faqMatch).toBeDefined();
    expect(faqMatch!.guideId).toBe("expenses");
    expect(faqMatch!.label).toBe("How do I submit an expense?");
    expect(faqMatch!.anchor).toBe("walkthrough");
  });
```

- [ ] **Step 3: Update the "returns all matches" test**

The test at line 64-76 asserts `results.length > 3`. After the change, "expense" matches: 1 guide title + 1 section ("Expense Analytics") + 1 FAQ = 3 results. Change the assertion:

```typescript
    expect(results.length).toBeGreaterThanOrEqual(3);
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/__tests__/helpGuides.test.ts --reporter=verbose 2>&1 | tail -30`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/lib/__tests__/helpGuides.test.ts
git commit -m "test(63): update helpGuides tests for walkthrough section changes"
```

---

### Task 11: Update ExpenseGuide.tsx

**Files:**
- Modify: `src/pages/guides/ExpenseGuide.tsx`

This is the largest change. We:
1. Remove sections 2-4 JSX and their data constants
2. Add workflow data arrays for the 3 walkthroughs
3. Add a `WalkthroughPlayer` in a new `GuideSection id="walkthrough"`
4. Migrate 2 FAQ items from `SUBMITTING_FAQ` to `FULL_FAQ`

- [ ] **Step 1: Add imports at top of file**

Add to the import block at the top of `ExpenseGuide.tsx`:

```typescript
import { WalkthroughPlayer } from "@/components/help";
import type { WalkthroughWorkflow } from "@/components/help";
import { SubmitExpenseMock } from "@/components/help/walkthrough";
import { ApproveExpenseMock } from "@/components/help/walkthrough";
import { ReimburseMock } from "@/components/help/walkthrough";
```

- [ ] **Step 2: Delete data constants for sections 2-4**

Remove these constants entirely:
- `SUBMITTING_FAQ` (lines 46-67) — but first migrate 2 items to FULL_FAQ in step 4
- `DOA_NODES` (lines 73-81)
- `DOA_EDGES` (lines 83-91)
- `BATCH_NODES` (lines 97-105)
- `BATCH_EDGES` (lines 107-114)

- [ ] **Step 3: Add workflow data arrays**

Add after the remaining data constants (after `FULL_FAQ`), before the component function:

```typescript
// ---------------------------------------------------------------------------
// Walkthrough workflow data
// ---------------------------------------------------------------------------

const EXPENSE_WORKFLOWS: WalkthroughWorkflow[] = [
  {
    id: "submit",
    label: "Submit an Expense",
    steps: [
      {
        id: "go-to-expenses",
        title: "Go to Expenses",
        description:
          "Open the Financials dropdown in the top menu, then click Expenses. Tap the New Expense button to start.",
      },
      {
        id: "fill-details",
        title: "Fill in the details",
        description:
          "Enter a description, amount in IDR, GL category, expense date, and vendor name. The payment method determines whether this goes through reimbursement (personal) or is recorded directly (company card).",
        tip: "Use 6990 Miscellaneous OpEx if unsure about the GL category.",
      },
      {
        id: "attach-receipt",
        title: "Attach a receipt",
        description:
          "Take a photo or upload an image of the receipt. Required for amounts over Rp 50,000.",
        warning:
          "Expenses over Rp 50,000 without a receipt may be rejected.",
      },
      {
        id: "save-or-submit",
        title: "Save or submit",
        description:
          "Save Draft keeps the expense editable. Submit sends it to the approval queue — you cannot edit after submitting.",
        tip: "Need to fix something after submitting? Ask your approver to reject it so you can revise and resubmit.",
      },
    ],
    mockComponent: SubmitExpenseMock,
  },
  {
    id: "approve",
    label: "Approve an Expense",
    steps: [
      {
        id: "open-queue",
        title: "Open approval queue",
        description:
          "Open the Financials dropdown, click Expenses. The Approval tab shows expenses waiting for your review. Managers and admins only — you won't see expenses you submitted yourself.",
      },
      {
        id: "review-expense",
        title: "Review the expense",
        description:
          "Check the amount, receipt, GL category, and vendor. Look for fraud badges: Duplicate Warning, Late Submission, or high rejection count.",
        warning:
          "A comment is required when approving expenses of Rp 500,000 or more.",
      },
      {
        id: "approve-or-reject",
        title: "Approve or reject",
        description:
          "Approve moves the expense forward. Reject requires a reason the submitter will see. They can revise and resubmit.",
        tip: "See a Duplicate Warning badge? Check the linked expense before approving — it might be a genuine separate purchase.",
      },
    ],
    mockComponent: ApproveExpenseMock,
  },
  {
    id: "reimburse",
    label: "Reimburse",
    steps: [
      {
        id: "open-reimburse",
        title: "Open Reimbursement",
        description:
          "Open the Financials dropdown, click Reimburse. This page is admin only.",
      },
      {
        id: "review-pending",
        title: "Review pending",
        description:
          "Approved personal expenses are grouped by employee with running totals. Review the amounts before creating a batch.",
      },
      {
        id: "create-batch",
        title: "Create batch",
        description:
          "Select expenses for one employee and click Create Batch. The system generates a batch code (RMB-MMDD-NNN) for bank transfer tracking.",
      },
      {
        id: "transfer",
        title: "Transfer via bank",
        description:
          "Open BCA mobile and transfer the batch total to the employee. Use the RMB code in the transfer notes so you can match it later.",
      },
      {
        id: "confirm-batch",
        title: "Confirm batch",
        description:
          "Back in the app, enter the BCA reference number, select the source bank account, and set the transfer date.",
      },
      {
        id: "done",
        title: "Done",
        description:
          "All linked expenses in the batch are marked Reimbursed. The employee can see the status update immediately.",
        tip: "If the bank transfer fails, you can void the entire batch — this returns all expenses to Approved so they can be re-batched.",
      },
    ],
    mockComponent: ReimburseMock,
  },
];
```

- [ ] **Step 4: Migrate 2 FAQ items from SUBMITTING_FAQ to FULL_FAQ**

In the `FULL_FAQ` constant, find the `"Submission"` group (currently has 3 items). Add these 2 items to it:

```typescript
      {
        question: "How do I pick the right GL category?",
        answer:
          "Choose the category that best describes the expense. For example, use 5100 for raw materials, 6100 for rent, or 6500 for general operating expenses. If nothing fits, use 6990 Miscellaneous OpEx and your approver can ask you to correct it.",
      },
      {
        question: "Do I always need a receipt?",
        answer:
          "Receipts are required for any expense over Rp 50,000. For smaller amounts a receipt is optional but recommended. Digital photos of paper receipts are accepted.",
      },
```

- [ ] **Step 5: Replace sections 2-4 JSX with WalkthroughPlayer**

Remove the 3 `<GuideSection>` blocks for `id="submitting"`, `id="approving"`, and `id="reimbursement"` (approximately lines 407-572 in the original file).

Insert in their place:

```tsx
      {/* ================================================================= */}
      {/* Section 2: Interactive Walkthroughs (replaces Submit/Approve/Reimburse) */}
      {/* ================================================================= */}
      <GuideSection id="walkthrough" title="Interactive Walkthroughs">
        <p className="text-muted-foreground mb-6">
          Click through each workflow step by step. The mock screens show
          exactly what you will see in the app.
        </p>
        <WalkthroughPlayer workflows={EXPENSE_WORKFLOWS} />
      </GuideSection>
```

- [ ] **Step 6: Run type check**

Run: `npm run type-check 2>&1 | tail -5`
Expected: No errors

- [ ] **Step 7: Run full build**

Run: `npm run build 2>&1 | tail -10`
Expected: Build succeeds

- [ ] **Step 8: Run all tests**

Run: `npm run test 2>&1 | tail -20`
Expected: All tests pass

- [ ] **Step 9: Commit**

```bash
git add src/pages/guides/ExpenseGuide.tsx
git commit -m "feat(63): wire WalkthroughPlayer into ExpenseGuide, replace text sections 2-4"
```

---

## Chunk 4: Documentation Updates

### Task 12: Update documentation

**Files:**
- Modify: `docs/superpowers/specs/2026-03-16-help-center-design.md`
- Modify: `docs/UI_BRAND_REFERENCE.md`
- Modify: `docs/CODE_STYLE.md`
- Modify: `CLAUDE.md`
- Modify: `docs/CHANGELOG.md`

- [ ] **Step 1: Add Interactive Walkthroughs section to help center spec**

Append to `docs/superpowers/specs/2026-03-16-help-center-design.md`:

```markdown
---

## 11. Interactive Walkthroughs (Phase 63)

### WalkthroughPlayer Component

Generic reusable walkthrough engine. Import from `@/components/help`:

```typescript
import { WalkthroughPlayer } from "@/components/help";
import type { WalkthroughWorkflow, WalkthroughStep, MockPanelProps } from "@/components/help";
```

**Props:** `workflows: WalkthroughWorkflow[]`, `defaultWorkflow?: string`

**Internal layout:** Tab bar (workflow selector) → Step list sidebar (clickable, free navigation) → Mock UI panel (crossfade animation) → Annotation callout below.

### Mock Element Primitives

Located in `src/components/help/walkthrough/MockElements.tsx`. Styled divs that mimic the real app UI without importing actual components. All use theme CSS variables for light/dark mode.

Available: `MockFrame`, `MockLabel`, `MockInput`, `MockSelect`, `MockButton`, `MockField`, `MockRow`, `MockTable`, `MockBadge`, `MockUploadZone`, `MockNavDropdown`.

### Adding a New Walkthrough Guide

1. Create mock component(s) in `src/components/help/walkthrough/` using `MockElements`
2. Define `WalkthroughWorkflow[]` with step data and mock component references
3. Render `<WalkthroughPlayer workflows={...} />` inside a `<GuideSection>`
4. Export mock from `walkthrough/index.ts`
```

- [ ] **Step 2: Add Tutorial Walkthrough Patterns to UI Brand Reference**

Append a new section to `docs/UI_BRAND_REFERENCE.md`:

```markdown
---

## Tutorial Walkthrough Patterns

### Field Highlights

Active-step fields use indigo highlights. Do NOT use brand teal for walkthrough highlights — indigo distinguishes tutorial annotations from interactive UI.

| Mode | Border | Shadow |
|------|--------|--------|
| Light | `border-2 border-indigo-500` | `shadow-[0_0_0_4px_rgba(99,102,241,0.15),0_0_12px_rgba(99,102,241,0.08)]` |
| Dark | `border-2 border-indigo-400` | `shadow-[0_0_0_4px_rgba(99,102,241,0.25),0_0_12px_rgba(99,102,241,0.15)]` |

### Annotation Callout

- Left border: `border-l-[3px] border-indigo-500`
- Background: `bg-indigo-500/5`
- Title: `text-xs font-semibold text-indigo-400` (dark) / `text-indigo-600` (light)

### Step States

| State | Circle | Text |
|-------|--------|------|
| Completed | `bg-green-600 text-white` (checkmark icon) | `text-muted-foreground` |
| Active | `bg-indigo-500 text-white` (step number) | `text-foreground font-medium` |
| Future | `bg-muted text-muted-foreground` (step number) | `text-muted-foreground` |
```

- [ ] **Step 3: Add mock element convention to CODE_STYLE.md**

Find the "Frontend Patterns" section in `docs/CODE_STYLE.md` and add:

```markdown
### Mock UI Elements (Tutorial Walkthroughs)

Tutorial walkthroughs use **styled div mock components** (`src/components/help/walkthrough/MockElements.tsx`), NOT real shadcn/ui components. This keeps walkthroughs decoupled from the actual UI — they won't break when real components change props.

- Import mock elements from `@/components/help/walkthrough/MockElements`
- Use the `highlighted` prop (not custom border classes) for step-active highlights
- One mock component per workflow, receiving `currentStep` to conditionally render
```

- [ ] **Step 4: Add Quick File Finder row to CLAUDE.md**

Add a row to the Quick File Finder table in `CLAUDE.md`:

```markdown
| **Tutorial walkthroughs** | `src/components/help/walkthrough/`, `src/components/help/WalkthroughPlayer.tsx` | -- |
```

- [ ] **Step 5: Add CHANGELOG entry**

Add Phase 63 entry to `docs/CHANGELOG.md`:

```markdown
## Phase 63: Interactive Visual Expense Tutorials (2026-03-17)

### Added
- `WalkthroughPlayer` — generic reusable click-through walkthrough component with tab selector, step list, mock UI panels, annotation callouts, and keyboard navigation
- Mock UI element primitives (`MockFrame`, `MockInput`, `MockSelect`, `MockButton`, `MockTable`, `MockBadge`, `MockUploadZone`, `MockNavDropdown`, etc.)
- 3 interactive walkthroughs: Submit Expense (4 steps), Approve Expense (3 steps), Reimburse (6 steps)
- AnimatePresence crossfade transitions between steps
- Mobile responsive: step list becomes horizontal pill bar on small screens

### Changed
- Expense guide sections reduced from 8 to 6 (Submit, Approve, Reimburse replaced by single "Interactive Walkthroughs" section)
- `POPULAR_QUESTIONS` anchors updated from `#submitting`/`#approving` to `#walkthrough`
- 2 FAQ items migrated from inline section FAQ to main FAQ accordion
- `readTimeMinutes` updated from 15 to 10

### Breaking
- Deep links `#submitting`, `#approving`, `#reimbursement` no longer resolve (replaced by `#walkthrough`)
- Search for "Submitting Expenses" no longer returns a section match
```

- [ ] **Step 6: Commit documentation updates**

```bash
git add docs/superpowers/specs/2026-03-16-help-center-design.md docs/UI_BRAND_REFERENCE.md docs/CODE_STYLE.md CLAUDE.md docs/CHANGELOG.md
git commit -m "docs(63): update help center spec, UI brand ref, code style, CLAUDE.md, and CHANGELOG"
```

---

## Final Verification

- [ ] **Run full type check:** `npm run type-check`
- [ ] **Run full build:** `npm run build`
- [ ] **Run all tests:** `npm run test`
- [ ] **Visual check:** Navigate to `/help/expenses` — walkthrough tabs render, clicking steps updates mock panels, text sections below are unchanged
- [ ] **Mobile check:** Resize to < 768px — step pills render horizontally
- [ ] **Keyboard check:** Focus walkthrough area, press left/right arrows — steps change
- [ ] **Deep link check:** Navigate to `/help/expenses#walkthrough` — scrolls to walkthrough section
