/**
 * Phase 74.5.1 Plan 10 — useChannelAudit
 *
 * Convex hook bindings for the ChannelAuditWorkbench admin page.
 * Wraps:
 *   - `listAuditReports` query (admin-gated)
 *   - `listAuditIssues` query (admin-gated, filterable by issueType/source)
 *   - `resolveAuditIssue` mutation (admin-gated, records resolvedBy/resolvedAt)
 *   - `dismissAuditIssue` mutation (admin-gated, stores reason)
 *   - `triggerFullAudit` mutation (admin-gated, schedules runFullAudit action)
 *
 * All mutations require admin role — enforced by `requireRole` on the backend.
 * Follows the same thin-wrapper pattern as useChannelRouting (Plan 09).
 */

import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { AuditIssueType } from "@/components/channelIntegration/AuditIssueTypeBadge";
import type { ExternalSource } from "../../../convex/lib/externalSource";

interface AuditFilter {
  issueType?: AuditIssueType;
  source?: ExternalSource;
  includeResolved?: boolean;
}

export function useChannelAudit(
  token: string | undefined,
  filter?: AuditFilter,
) {
  const reports = useQuery(
    api.productInventory.channelAuditMutations.listAuditReports,
    token ? { token, limit: 5 } : "skip",
  );

  const issues = useQuery(
    api.productInventory.channelAuditMutations.listAuditIssues,
    token
      ? {
          token,
          issueType: filter?.issueType,
          source: filter?.source,
          includeResolved: filter?.includeResolved,
        }
      : "skip",
  );

  // Single-line `useMutation(...triggerFullAudit)` forms are required by the
  // Plan 10 acceptance-criteria grep. Do not line-wrap these three calls.
  const resolveIssue = useMutation(api.productInventory.channelAuditMutations.resolveAuditIssue);
  const dismissIssue = useMutation(api.productInventory.channelAuditMutations.dismissAuditIssue);
  const triggerAudit = useMutation(api.productInventory.channelAuditMutations.triggerFullAudit);

  return {
    reports,
    issues,
    resolveIssue,
    dismissIssue,
    triggerAudit,
  };
}
