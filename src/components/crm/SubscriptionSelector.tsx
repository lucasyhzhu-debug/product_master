/**
 * SubscriptionSelector — T27
 *
 * Compact subscription picker. Renders when there is ≥1 subscription.
 * Option label = `sub.label` or `···{last-6-chars-of-id}`.
 */
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Id } from "../../../convex/_generated/dataModel";

interface SubscriptionSelectorProps {
  subscriptions: { _id: Id<"subscriptions">; label?: string | null }[];
  value: Id<"subscriptions">;
  onChange: (id: Id<"subscriptions">) => void;
}

export function SubscriptionSelector({
  subscriptions,
  value,
  onChange,
}: SubscriptionSelectorProps) {
  if (subscriptions.length < 1) return null;

  return (
    <Select
      value={value}
      onValueChange={(v) => onChange(v as Id<"subscriptions">)}
    >
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {subscriptions.map((sub) => (
          <SelectItem key={sub._id} value={sub._id}>
            {sub.label ?? `···${sub._id.slice(-6)}`}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
