import { Badge } from "@/components/ui/badge";
import type { MatchConfidence } from "./overviewUtils";

export function MatchStatusBadge({ status }: { status?: MatchConfidence | null }) {
  switch (status) {
    case "exact":
      return (
        <Badge variant="outline" className="border-green-500 dark:border-green-600 text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/30">
          Matched
        </Badge>
      );
    case "price_only":
      return (
        <Badge variant="outline" className="border-blue-500 dark:border-blue-600 text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30">
          Price Match
        </Badge>
      );
    case "name_only":
      return (
        <Badge variant="outline" className="border-yellow-500 dark:border-yellow-600 text-yellow-700 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-950/30">
          Name Match
        </Badge>
      );
    case "none":
      return (
        <Badge variant="outline" className="border-muted-foreground/40 text-muted-foreground bg-muted/50">
          Unmatched
        </Badge>
      );
    default:
      return null;
  }
}
