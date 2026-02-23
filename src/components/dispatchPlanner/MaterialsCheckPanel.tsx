/**
 * MaterialsCheckPanel - Combined packaging + ingredient simulation panel.
 *
 * Shows a "Simulate" button that triggers the simulateInventory query.
 * Displays day-by-day packaging and ingredient shortages, plus a
 * 7-day ingredient resupply forecast table.
 */

import { useState, useMemo } from "react";
import { Calculator, CheckCircle2, AlertTriangle, XCircle, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useDispatchSimulateInventory } from "@/hooks/convex";

// ============================================
// Types (matching backend response shape)
// ============================================

interface DayResult {
  date: string;
  status: "ok" | "low" | "out";
  shortages: Array<{
    componentTypeName: string;
    required: number;
    available: number;
    deficit: number;
  }>;
  ingredientShortages: Array<{
    ingredientName: string;
    required: number;
    available: number;
    deficit: number;
    runsOutDate: string | null;
  }>;
}

interface IngredientStatusItem {
  ingredientName: string;
  currentStock: number;
  totalRequired7Days: number;
  runsOutDate: string | null;
}

// ============================================
// Helper: format date string to day name
// ============================================

function dateToDayName(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00+07:00");
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    timeZone: "Asia/Jakarta",
  });
}

function dateToShortLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00+07:00");
  const dayName = d.toLocaleDateString("en-US", {
    weekday: "short",
    timeZone: "Asia/Jakarta",
  });
  const dateLabel = d.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Jakarta",
  });
  return `${dayName} ${dateLabel}`;
}

// ============================================
// Status icon component
// ============================================

function StatusIcon({ status }: { status: "ok" | "low" | "out" }) {
  if (status === "ok") {
    return <CheckCircle2 className="h-4 w-4 text-green-600" />;
  }
  if (status === "low") {
    return <AlertTriangle className="h-4 w-4 text-amber-500" />;
  }
  return <XCircle className="h-4 w-4 text-red-600" />;
}

// ============================================
// Section header (collapsible)
// ============================================

function SectionHeader({
  title,
  isOpen,
  onToggle,
  hasIssues,
}: {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  hasIssues: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex items-center gap-2 w-full py-2 px-3 text-left text-sm font-semibold hover:bg-muted/50 rounded transition-colors"
    >
      {isOpen ? (
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      ) : (
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      )}
      <span>{title}</span>
      {hasIssues && (
        <AlertTriangle className="h-3.5 w-3.5 text-amber-500 ml-1" />
      )}
    </button>
  );
}

// ============================================
// Day shortage row
// ============================================

function DayRow({
  day,
  shortages,
  label,
}: {
  day: DayResult;
  shortages: Array<{
    name: string;
    required: number;
    available: number;
    deficit: number;
  }>;
  label: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 py-2 px-3 border-b last:border-b-0",
        day.status === "out" && "bg-red-50/50 dark:bg-red-900/10",
        day.status === "low" && "bg-amber-50/50 dark:bg-amber-900/10"
      )}
    >
      <div className="flex items-center gap-2 min-w-[120px] pt-0.5">
        <StatusIcon status={shortages.length > 0 ? (shortages.some(s => s.deficit > 0) ? "out" : "low") : "ok"} />
        <span className="text-sm font-medium">{label}</span>
      </div>
      <div className="flex-1">
        {shortages.length === 0 ? (
          <span className="text-xs text-green-600">Sufficient</span>
        ) : (
          <div className="space-y-0.5">
            {shortages.map((s, i) => (
              <div key={i} className="text-xs">
                <span className="font-medium">{s.name}</span>
                {s.deficit > 0 ? (
                  <span className="text-red-600 ml-1">
                    need {s.required.toLocaleString()}, have {s.available.toLocaleString()}, deficit {s.deficit.toLocaleString()}
                  </span>
                ) : (
                  <span className="text-amber-600 ml-1">
                    low ({s.available.toLocaleString()} available, {s.required.toLocaleString()} needed)
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// Main component
// ============================================

interface MaterialsCheckPanelProps {
  startDate: string;
}

export function MaterialsCheckPanel({ startDate }: MaterialsCheckPanelProps) {
  const [simulateDate, setSimulateDate] = useState("");
  const [packagingOpen, setPackagingOpen] = useState(true);
  const [ingredientOpen, setIngredientOpen] = useState(true);

  const { data: simulationData, isLoading } = useDispatchSimulateInventory(simulateDate);

  const handleSimulate = () => {
    setSimulateDate(startDate);
  };

  // Parse simulation results
  const days: DayResult[] = useMemo(() => {
    if (!simulationData) return [];
    return (simulationData.days ?? []) as DayResult[];
  }, [simulationData]);

  const ingredientStatus: IngredientStatusItem[] = useMemo(() => {
    if (!simulationData) return [];
    return (simulationData.ingredientStatus ?? []) as IngredientStatusItem[];
  }, [simulationData]);

  const hasSimulated = simulateDate === startDate && days.length > 0;

  // Check if there are any issues
  const hasPackagingIssues = days.some((d) => d.shortages.length > 0);
  const hasIngredientIssues = days.some(
    (d) => d.ingredientShortages && d.ingredientShortages.length > 0
  );

  return (
    <div className="rounded-lg border bg-card shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div>
          <h3 className="text-sm font-semibold">Materials Check</h3>
          <p className="text-xs text-muted-foreground">
            Packaging and ingredient sufficiency for the planned week
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleSimulate}
          disabled={isLoading && simulateDate === startDate}
          className="gap-2"
        >
          <Calculator className="h-4 w-4" />
          {isLoading && simulateDate === startDate ? "Simulating..." : "Simulate"}
        </Button>
      </div>

      {/* Content */}
      <div className="p-4">
        {!hasSimulated ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            Click Simulate to check material sufficiency for the planned week.
          </div>
        ) : (
          <div className="space-y-4">
            {/* Unlinked ingredients warning */}
            {simulationData?.unlinkedIngredients && (simulationData.unlinkedIngredients as string[]).length > 0 && (
              <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-700 p-3 text-sm text-amber-800 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>
                  {(simulationData.unlinkedIngredients as string[]).length} ingredient{(simulationData.unlinkedIngredients as string[]).length > 1 ? "s" : ""} not linked to inventory tracking — forecasts may be incomplete.{" "}
                  <span className="font-medium">
                    {(simulationData.unlinkedIngredients as string[]).join(", ")}
                  </span>
                </span>
              </div>
            )}
            {/* Packaging Materials section */}
            <div className="rounded border">
              <SectionHeader
                title="Packaging Materials"
                isOpen={packagingOpen}
                onToggle={() => setPackagingOpen(!packagingOpen)}
                hasIssues={hasPackagingIssues}
              />
              {packagingOpen && (
                <div>
                  {days.map((day) => (
                    <DayRow
                      key={`pkg-${day.date}`}
                      day={day}
                      shortages={day.shortages.map((s) => ({
                        name: s.componentTypeName,
                        required: s.required,
                        available: s.available,
                        deficit: s.deficit,
                      }))}
                      label={dateToShortLabel(day.date)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Ingredient Materials section */}
            <div className="rounded border">
              <SectionHeader
                title="Ingredient Materials"
                isOpen={ingredientOpen}
                onToggle={() => setIngredientOpen(!ingredientOpen)}
                hasIssues={hasIngredientIssues}
              />
              {ingredientOpen && (
                <div>
                  {days.map((day) => (
                    <DayRow
                      key={`ing-${day.date}`}
                      day={day}
                      shortages={(day.ingredientShortages ?? []).map((s) => ({
                        name: s.ingredientName,
                        required: Math.round(s.required * 100) / 100,
                        available: Math.round(s.available * 100) / 100,
                        deficit: Math.round(s.deficit * 100) / 100,
                      }))}
                      label={dateToShortLabel(day.date)}
                    />
                  ))}

                  {/* Ingredient Resupply Forecast table */}
                  {ingredientStatus.length > 0 && (
                    <div className="px-3 py-3 border-t">
                      <h4 className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wider">
                        Ingredient Resupply Forecast
                      </h4>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Ingredient</TableHead>
                            <TableHead className="text-xs text-right">Current Stock</TableHead>
                            <TableHead className="text-xs text-right">7-Day Requirement</TableHead>
                            <TableHead className="text-xs text-right">Runs Out By</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {ingredientStatus.map((item) => {
                            const isSufficient = !item.runsOutDate;
                            const runsOutDay = item.runsOutDate
                              ? dateToDayName(item.runsOutDate)
                              : null;
                            return (
                              <TableRow key={item.ingredientName}>
                                <TableCell className="text-xs font-medium">
                                  {item.ingredientName}
                                </TableCell>
                                <TableCell className="text-xs text-right tabular-nums">
                                  {Math.round(item.currentStock).toLocaleString()}
                                </TableCell>
                                <TableCell className="text-xs text-right tabular-nums">
                                  {Math.round(item.totalRequired7Days).toLocaleString()}
                                </TableCell>
                                <TableCell
                                  className={cn(
                                    "text-xs text-right font-medium",
                                    isSufficient ? "text-green-600" : "text-red-600"
                                  )}
                                >
                                  {isSufficient ? "OK" : runsOutDay}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
