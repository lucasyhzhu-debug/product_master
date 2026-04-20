/**
 * Phase 74.5.1 Plan 10 — AuditIssueTypeBadge
 *
 * Shared badge for the 5 audit issue types. Renders a shadcn Badge with
 * variant driven by severity (warn → secondary, block → destructive).
 *
 * Metadata (labels, tooltips, type enum, severity mapping) lives in
 * ./AuditIssueTypeMeta.ts — extracted per review R1 so this file only
 * exports the component (react-refresh only-export-components rule).
 *
 * No raw hex colors — the Badge `variant` prop resolves to theme tokens.
 */

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import {
  type AuditIssueType,
  TYPE_META,
} from "./AuditIssueTypeMeta";

interface AuditIssueTypeBadgeProps {
  type: AuditIssueType;
  className?: string;
}

export function AuditIssueTypeBadge({
  type,
  className,
}: AuditIssueTypeBadgeProps) {
  const meta = TYPE_META[type];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant={meta.severity === "block" ? "destructive" : "secondary"}
          className={className}
          aria-label={`${meta.label}: ${meta.tooltip}`}
        >
          {meta.label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{meta.tooltip}</TooltipContent>
    </Tooltip>
  );
}
