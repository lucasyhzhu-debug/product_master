import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Save, RotateCcw, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { StockStatusBadge } from "./StockStatusBadge";
import { toast } from "sonner";

interface RestockTargetRowProps {
  productKey: string;
  productName: string;
  currentStock?: number;
  weekdayDailyRate: number;
  weekendDailyRate: number;
  overallDailyRate: number;
  daysRemaining?: number;
  status?: "critical" | "warning" | "ok";
  suggestedWeekday: number;
  suggestedWeekend: number;
  targetWeekday?: number;
  targetWeekend?: number;
  trendDirection: "up" | "down" | "flat";
  confidence: "high" | "medium" | "low";
  showStock: boolean;
  onSave: (weekdayTarget: number, weekendTarget: number) => Promise<void>;
}

export function RestockTargetRow({
  productName,
  currentStock,
  weekdayDailyRate,
  weekendDailyRate,
  daysRemaining,
  status,
  suggestedWeekday,
  suggestedWeekend,
  targetWeekday,
  targetWeekend,
  trendDirection,
  confidence,
  showStock,
  onSave,
}: RestockTargetRowProps) {
  const [weekdayVal, setWeekdayVal] = useState<string>(
    targetWeekday !== undefined ? String(targetWeekday) : ""
  );
  const [weekendVal, setWeekendVal] = useState<string>(
    targetWeekend !== undefined ? String(targetWeekend) : ""
  );
  const [saving, setSaving] = useState(false);

  const hasOverride = targetWeekday !== undefined || targetWeekend !== undefined;
  const isDirty =
    (weekdayVal !== "" ? Number(weekdayVal) : undefined) !== targetWeekday ||
    (weekendVal !== "" ? Number(weekendVal) : undefined) !== targetWeekend;

  async function handleSave() {
    const wd = weekdayVal !== "" ? Number(weekdayVal) : suggestedWeekday;
    const we = weekendVal !== "" ? Number(weekendVal) : suggestedWeekend;
    if (isNaN(wd) || isNaN(we) || wd < 0 || we < 0) {
      toast.error("Please enter valid numbers");
      return;
    }
    setSaving(true);
    try {
      await onSave(wd, we);
      toast.success(`Target saved for ${productName}`);
    } catch {
      toast.error("Failed to save target");
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setWeekdayVal("");
    setWeekendVal("");
  }

  const TrendIcon =
    trendDirection === "up" ? TrendingUp : trendDirection === "down" ? TrendingDown : Minus;
  const trendColor =
    trendDirection === "up"
      ? "text-green-600 dark:text-green-400"
      : trendDirection === "down"
        ? "text-red-600 dark:text-red-400"
        : "text-muted-foreground";

  return (
    <tr className="border-b last:border-b-0 hover:bg-muted/50">
      <td className="py-2 px-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate max-w-[180px]">{productName}</span>
          <span
            className={cn(
              "text-[10px] px-1.5 py-0.5 rounded-full",
              confidence === "high" && "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
              confidence === "medium" && "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
              confidence === "low" && "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
            )}
          >
            {confidence}
          </span>
        </div>
      </td>

      {showStock && (
        <td className="py-2 px-3 text-center">
          <span className="text-sm font-mono">{currentStock ?? "-"}</span>
        </td>
      )}

      <td className="py-2 px-3 text-center">
        <div className="text-sm font-mono">
          {weekdayDailyRate} / {weekendDailyRate}
        </div>
      </td>

      {showStock && (
        <td className="py-2 px-3 text-center">
          {status ? (
            <StockStatusBadge status={status} daysRemaining={daysRemaining} />
          ) : (
            <span className="text-sm text-muted-foreground">-</span>
          )}
        </td>
      )}

      <td className="py-2 px-3 text-center">
        <TrendIcon className={cn("h-4 w-4 mx-auto", trendColor)} />
      </td>

      <td className="py-2 px-3">
        <div className="flex items-center gap-1.5">
          <Input
            type="number"
            min={0}
            value={weekdayVal}
            onChange={(e) => setWeekdayVal(e.target.value)}
            placeholder={String(suggestedWeekday)}
            className={cn(
              "w-16 h-8 text-center text-sm",
              hasOverride && weekdayVal !== "" && "font-bold"
            )}
          />
          <span className="text-xs text-muted-foreground">/</span>
          <Input
            type="number"
            min={0}
            value={weekendVal}
            onChange={(e) => setWeekendVal(e.target.value)}
            placeholder={String(suggestedWeekend)}
            className={cn(
              "w-16 h-8 text-center text-sm",
              hasOverride && weekendVal !== "" && "font-bold"
            )}
          />
        </div>
      </td>

      <td className="py-2 px-3">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleSave}
            disabled={saving || !isDirty}
          >
            <Save className="h-3.5 w-3.5" />
          </Button>
          {hasOverride && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground"
              onClick={handleReset}
              title="Reset to suggestion"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}
