import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Shared highlight styling (indigo glow)
// ---------------------------------------------------------------------------

export const HIGHLIGHT_CLASSES =
  "border-2 border-indigo-400 shadow-[0_0_0_4px_rgba(99,102,241,0.15),0_0_12px_rgba(99,102,241,0.08)] dark:shadow-[0_0_0_4px_rgba(99,102,241,0.25),0_0_12px_rgba(99,102,241,0.15)]";

// ---------------------------------------------------------------------------
// 1. MockFrame -- browser chrome wrapper
// ---------------------------------------------------------------------------

export function MockFrame({
  breadcrumb,
  children,
  "aria-label": ariaLabel = "Mock application panel",
}: {
  breadcrumb: string;
  children: ReactNode;
  "aria-label"?: string;
}) {
  return (
    <div
      className="rounded-lg border bg-card overflow-hidden"
      aria-label={ariaLabel}
    >
      {/* Title bar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 border-b">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
          <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
        </div>
        <span className="text-xs text-muted-foreground ml-2 truncate">
          {breadcrumb}
        </span>
      </div>
      {/* Body */}
      <div className="p-4">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. MockLabel -- form field label
// ---------------------------------------------------------------------------

export function MockLabel({ children }: { children: ReactNode }) {
  return (
    <span className="text-xs font-medium text-muted-foreground">
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// 3. MockInput -- fake text input
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
    <div className="flex flex-col gap-1">
      <MockLabel>{label}</MockLabel>
      <div
        className={cn(
          "rounded-md border px-3 py-1.5 text-sm bg-background",
          highlighted ? HIGHLIGHT_CLASSES : "border-input"
        )}
      >
        {value || <span className="text-muted-foreground">...</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 4. MockSelect -- fake dropdown
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
    <div className="flex flex-col gap-1">
      <MockLabel>{label}</MockLabel>
      <div
        className={cn(
          "rounded-md border px-3 py-1.5 text-sm bg-background flex items-center justify-between",
          highlighted ? HIGHLIGHT_CLASSES : "border-input"
        )}
      >
        <span>{value}</span>
        <span className="text-muted-foreground text-xs">&#9660;</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 5. MockButton -- fake button
// ---------------------------------------------------------------------------

export function MockButton({
  variant = "primary",
  children,
  highlighted,
}: {
  variant?: "primary" | "ghost" | "destructive";
  children: ReactNode;
  highlighted?: boolean;
}) {
  const base = "rounded-md px-4 py-1.5 text-sm font-medium inline-flex items-center justify-center";
  const variantClasses = {
    primary: "bg-primary text-primary-foreground",
    ghost: "border bg-background text-foreground",
    destructive: "bg-destructive text-destructive-foreground",
  };
  return (
    <div
      className={cn(
        base,
        variantClasses[variant],
        highlighted && HIGHLIGHT_CLASSES
      )}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 6. MockField -- label + input wrapper
// ---------------------------------------------------------------------------

export function MockField({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-1">{children}</div>;
}

// ---------------------------------------------------------------------------
// 7. MockRow -- grid row
// ---------------------------------------------------------------------------

export function MockRow({
  children,
  cols = 2,
}: {
  children: ReactNode;
  cols?: 2 | 3 | 4;
}) {
  const colsClass = {
    2: "grid-cols-2",
    3: "grid-cols-3",
    4: "grid-cols-4",
  };
  return (
    <div className={cn("grid gap-4", colsClass[cols])}>{children}</div>
  );
}

// ---------------------------------------------------------------------------
// 8. MockTable -- table with optional row highlight
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
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b">
            {headers.map((h) => (
              <th key={h} className="text-left py-1.5 px-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr
              key={ri}
              className={cn(
                "border-b",
                highlightRow === ri && HIGHLIGHT_CLASSES
              )}
            >
              {row.map((cell, ci) => (
                <td key={ci} className="py-1.5 px-2">
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
// 9. MockBadge -- small colored badge
// ---------------------------------------------------------------------------

export function MockBadge({
  variant,
  children,
}: {
  variant: "warning" | "error" | "info";
  children: ReactNode;
}) {
  const variantClasses = {
    warning: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    error: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    info: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
        variantClasses[variant]
      )}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// 10. MockUploadZone -- dashed upload area
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
        "rounded-lg border-2 border-dashed p-4 text-center",
        highlighted ? HIGHLIGHT_CLASSES : "border-muted-foreground/25"
      )}
    >
      {hasFile ? (
        <div className="flex items-center justify-center gap-2">
          <div className="w-10 h-10 rounded bg-muted flex items-center justify-center text-xs text-muted-foreground">
            IMG
          </div>
          <span className="text-xs text-muted-foreground">receipt.jpg</span>
        </div>
      ) : (
        <span className="text-xs text-muted-foreground">
          Drop file or click to upload
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 11. MockNavDropdown -- fake nav bar
// ---------------------------------------------------------------------------

export function MockNavDropdown({
  activeItem,
  highlighted,
}: {
  activeItem: string;
  highlighted?: boolean;
}) {
  const items = ["Expenses", "Reimburse", "Payroll", "Exp. Analytics"];
  return (
    <div
      className={cn(
        "rounded-md border bg-card p-2",
        highlighted && HIGHLIGHT_CLASSES
      )}
    >
      <div className="text-xs font-semibold text-muted-foreground mb-1 px-2">
        Financials
      </div>
      <div className="space-y-0.5">
        {items.map((item) => (
          <div
            key={item}
            className={cn(
              "px-2 py-1 rounded text-sm",
              item === activeItem
                ? "bg-primary/10 text-primary font-medium"
                : "text-muted-foreground"
            )}
          >
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}
