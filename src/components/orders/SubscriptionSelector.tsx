import { useEffect } from "react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/utils";
import type { Id } from "../../../convex/_generated/dataModel";

interface SubOption {
  subscriptionId: Id<"subscriptions">;
  label: string;
  creditRemaining: number | null;
}

interface Props {
  subs: SubOption[] | null;
  selectedSubId: Id<"subscriptions"> | null;
  onSelect: (id: Id<"subscriptions">) => void;
}

export function SubscriptionSelector({ subs, selectedSubId, onSelect }: Props) {
  // Auto-select when exactly one active subscription
  useEffect(() => {
    if (subs && subs.length === 1 && selectedSubId !== subs[0].subscriptionId) {
      onSelect(subs[0].subscriptionId);
    }
  }, [subs, selectedSubId, onSelect]);

  if (!subs || subs.length === 0) return null;

  return (
    <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-950">
      <p className="mb-1 text-xs font-semibold text-blue-800 dark:text-blue-200">Subscription</p>
      <RadioGroup
        value={selectedSubId ?? ""}
        onValueChange={(v) => onSelect(v as Id<"subscriptions">)}
        className="gap-1"
      >
        {subs.map((s) => (
          <div key={s.subscriptionId} className="flex items-center gap-2">
            <RadioGroupItem value={s.subscriptionId} id={`sel-${s.subscriptionId}`} />
            <Label
              htmlFor={`sel-${s.subscriptionId}`}
              className="cursor-pointer text-sm text-blue-800 dark:text-blue-200"
            >
              {s.label}
              {s.creditRemaining != null && (
                <span className="ml-1 text-muted-foreground">
                  ({formatCurrency(s.creditRemaining)} left this week)
                </span>
              )}
            </Label>
          </div>
        ))}
      </RadioGroup>
    </div>
  );
}
