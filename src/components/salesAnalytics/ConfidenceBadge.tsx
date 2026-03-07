import { Badge } from "@/components/ui/badge";
import type { ConfidenceLevel } from "./overviewUtils";

export function ConfidenceBadge({ confidence }: { confidence: ConfidenceLevel }) {
  switch (confidence) {
    case "exact":
      return (
        <Badge variant="default" className="bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 border-green-200 dark:border-green-800">
          Exact
        </Badge>
      );
    case "inferred":
      return (
        <Badge variant="secondary" className="bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800">
          Inferred
        </Badge>
      );
    case "manual":
      return <Badge variant="outline">Manual</Badge>;
    default:
      return null;
  }
}
