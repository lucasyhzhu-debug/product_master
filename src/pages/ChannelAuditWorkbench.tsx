/**
 * Phase 74.5.1 Plan 10 — ChannelAuditWorkbench
 *
 * Route: `/admin/channel-audit`
 * Role:  admin (ProtectedRoute in App.tsx + requireRole on every mutation)
 *
 * Anatomy (per UI-SPEC §ChannelAuditWorkbench):
 *   1. PageHeader
 *   2. Top action row: [Run full audit] + "Last run …" meta
 *   3. Summary card — 5-stat grid (click-to-jump)
 *   4. Tabs — 5 issue-type tabs with count badges
 *   5. Per-tab table: Source · External ref · Detail · Detected at · Actions
 *   6. Per-type resolution dialog (keeps 74.5.1 scope: records resolution;
 *      actual data remap lives under /admin/product-mappings — see 74.5.2)
 *   7. Dismiss AlertDialog with mandatory reason Textarea
 *
 * 5 states implemented: idle / loading / empty / error / success / destructive.
 *
 * Scope note (74.5.1): resolution actions RECORD the resolution string; they
 * do NOT mutate externalRevenueItems.linkedMenuProductId directly. Remap /
 * Re-link open `/admin/product-mappings?...` in a new tab so the admin can
 * complete the mapping there, then flip the issue to resolved here.
 */

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Play, Trash2, CheckCircle2, XCircle } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

import { AuditIssueTypeBadge } from "@/components/channelIntegration/AuditIssueTypeBadge";
import {
  getAuditIssueTypeMeta,
  type AuditIssueType,
} from "@/components/channelIntegration/AuditIssueTypeMeta";
import { SourceBadge } from "@/components/channelIntegration/SourceBadge";
import { useChannelAudit } from "@/hooks/convex/useChannelAudit";
import { useAuth } from "@/contexts/AuthContext";
import { formatShortWIB } from "@/lib/dateUtils";
import { cn } from "@/lib/utils";
import type { Doc, Id } from "../../convex/_generated/dataModel";

/**
 * All 5 audit issue types. Ordering drives tab order + summary-grid column order.
 * Do not reorder — the tab underline animation keys on index.
 */
const ISSUE_TYPES: AuditIssueType[] = [
  "unmapped_sku",
  "stale_mapping",
  "malformed_item",
  "duplicate_transaction",
  "orphan_item",
];

/** Copy for per-type primary resolution action button + dialog wording. */
const RESOLUTION_META: Record<
  AuditIssueType,
  {
    primaryLabel: string;
    dialogTitle: string;
    dialogDescription: string;
    /** If set, opens this admin surface in a new tab before recording resolution. */
    externalHref?: (issue: AuditIssue) => string;
    /** Destructive variant on the confirm button (e.g. Delete orphan). */
    destructive?: boolean;
    /** Default resolution-text prefill to reduce friction. */
    defaultResolution: string;
  }
> = {
  unmapped_sku: {
    primaryLabel: "Remap SKU",
    dialogTitle: "Remap unmapped SKU",
    dialogDescription:
      "Opening /admin/product-mappings in a new tab. Complete the mapping there, then record the resolution below so this audit row is marked resolved.",
    externalHref: (issue) =>
      `/admin/product-mappings?prefill=${encodeURIComponent(issue.source)}`,
    defaultResolution:
      "Remapped via /admin/product-mappings — see audit trail in externalProductMappings.",
  },
  stale_mapping: {
    primaryLabel: "Re-link mapping",
    dialogTitle: "Re-link stale mapping",
    dialogDescription:
      "Opening /admin/product-mappings in a new tab. Pick a current active menu product to replace the stale mapping, then record the resolution below.",
    externalHref: (issue) =>
      `/admin/product-mappings?prefill=${encodeURIComponent(issue.source)}`,
    defaultResolution:
      "Re-linked to active menu product via /admin/product-mappings.",
  },
  malformed_item: {
    primaryLabel: "Exclude item",
    dialogTitle: "Exclude malformed item",
    dialogDescription:
      "Marks this item as excluded from deduction. The row remains in externalRevenueItems but will not be re-audited.",
    defaultResolution:
      "Excluded — malformed item (quantity<=0 or totalPrice<0 or missing required fields).",
  },
  duplicate_transaction: {
    primaryLabel: "Merge duplicate",
    dialogTitle: "Merge duplicate transaction",
    dialogDescription:
      "Keep the older row, mark the newer as merged. Actual row deletion is deferred to a separate admin operation — this action records the decision.",
    defaultResolution:
      "Marked as duplicate — older row kept as canonical; newer row to be deleted via DB repair.",
  },
  orphan_item: {
    primaryLabel: "Delete orphan",
    dialogTitle: "Delete orphan externalRevenueItem?",
    dialogDescription:
      "This item has no revenue parent and cannot be deducted. 74.5.1 records the decision here; actual row deletion is a separate admin action (Convex dashboard or deferred cleanup).",
    destructive: true,
    defaultResolution:
      "Orphan item — parent revenue missing. Marked for deletion via DB repair.",
  },
};

type AuditIssue = Doc<"channelAuditIssues">;
type AuditReport = Doc<"channelAuditReports">;

export function ChannelAuditWorkbench() {
  const { user } = useAuth();
  const token = user?.token;

  // Scope all issues (for summary counts) + active-tab filtered issues.
  // Both queries hit the same `listAuditIssues` backend; Convex reactive
  // dedupes identical arg shapes so there's no redundant fetch work.
  const allAudit = useChannelAudit(token);
  const [activeTab, setActiveTab] = useState<AuditIssueType>("unmapped_sku");
  const tabAudit = useChannelAudit(token, { issueType: activeTab });

  // Selection scoped per tab — cleared on tab change.
  const [selected, setSelected] = useState<Set<Id<"channelAuditIssues">>>(
    new Set(),
  );

  // Resolve / Dismiss dialog state
  const [resolveTarget, setResolveTarget] = useState<AuditIssue | null>(null);
  const [resolveText, setResolveText] = useState("");
  const [resolving, setResolving] = useState(false);

  const [dismissTarget, setDismissTarget] = useState<AuditIssue | null>(null);
  const [dismissReason, setDismissReason] = useState("");
  const [dismissing, setDismissing] = useState(false);

  // Bulk dismiss uses the same AlertDialog/Textarea pattern as single
  // dismiss (per UI-SPEC §Destructive Confirmations). window.prompt breaks on
  // mobile and is not test-automatable.
  const [bulkDismissOpen, setBulkDismissOpen] = useState(false);
  const [bulkDismissReason, setBulkDismissReason] = useState("");

  const [triggering, setTriggering] = useState(false);

  const isLoadingAll = allAudit.issues === undefined;
  const isLoadingTab = tabAudit.issues === undefined;
  const openIssuesAll = useMemo(
    () => (allAudit.issues ?? []).filter((i) => i.resolvedAt === undefined),
    [allAudit.issues],
  );
  const openIssuesInTab = useMemo(
    () =>
      (tabAudit.issues ?? []).filter(
        (i) => i.resolvedAt === undefined && i.issueType === activeTab,
      ),
    [tabAudit.issues, activeTab],
  );

  const countsByType = useMemo(() => {
    const acc: Record<AuditIssueType, number> = {
      unmapped_sku: 0,
      stale_mapping: 0,
      malformed_item: 0,
      duplicate_transaction: 0,
      orphan_item: 0,
    };
    for (const issue of openIssuesAll) {
      acc[issue.issueType]++;
    }
    return acc;
  }, [openIssuesAll]);

  const totalOpen = openIssuesAll.length;
  const lastReport: AuditReport | undefined = allAudit.reports?.[0];
  const neverRun = allAudit.reports !== undefined && allAudit.reports.length === 0;

  const handleTabChange = (value: string) => {
    setActiveTab(value as AuditIssueType);
    setSelected(new Set());
  };

  const handleTriggerAudit = async () => {
    if (!token) return;
    setTriggering(true);
    try {
      await allAudit.triggerAudit({ token });
      toast.success(
        "Audit scheduled. Counts will refresh automatically in a few seconds.",
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Audit failed to schedule: ${msg}`);
    } finally {
      setTriggering(false);
    }
  };

  const openResolveDialog = (issue: AuditIssue) => {
    const meta = RESOLUTION_META[issue.issueType];
    setResolveTarget(issue);
    setResolveText(meta.defaultResolution);
    // External href opens alongside the dialog so the admin can complete the
    // mapping in another tab while confirming resolution here.
    if (meta.externalHref) {
      window.open(meta.externalHref(issue), "_blank", "noopener,noreferrer");
    }
  };

  const handleResolveConfirm = async () => {
    if (!token || !resolveTarget) return;
    if (!resolveText.trim()) {
      toast.error("Resolution text is required.");
      return;
    }
    setResolving(true);
    try {
      await tabAudit.resolveIssue({
        token,
        issueId: resolveTarget._id,
        resolution: resolveText.trim(),
      });
      toast.success(
        `${getAuditIssueTypeMeta(resolveTarget.issueType).label} resolved`,
      );
      setResolveTarget(null);
      setResolveText("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Resolve failed: ${msg}`);
    } finally {
      setResolving(false);
    }
  };

  const handleDismissConfirm = async () => {
    if (!token || !dismissTarget) return;
    if (!dismissReason.trim()) {
      toast.error("Reason is required.");
      return;
    }
    setDismissing(true);
    try {
      await tabAudit.dismissIssue({
        token,
        issueId: dismissTarget._id,
        reason: dismissReason.trim(),
      });
      toast.success("Issue dismissed");
      setDismissTarget(null);
      setDismissReason("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Dismiss failed: ${msg}`);
    } finally {
      setDismissing(false);
    }
  };

  const toggleRow = (id: Id<"channelAuditIssues">) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllInTab = (checked: boolean) => {
    if (!checked) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(openIssuesInTab.map((i) => i._id)));
  };

  const handleBulkResolve = async () => {
    if (!token || selected.size === 0) return;
    const meta = RESOLUTION_META[activeTab];
    const resolution = `Bulk ${meta.primaryLabel.toLowerCase()} — ${selected.size} items · ${meta.defaultResolution}`;
    setResolving(true);
    let ok = 0;
    let fail = 0;
    for (const id of selected) {
      try {
        await tabAudit.resolveIssue({ token, issueId: id, resolution });
        ok++;
      } catch {
        fail++;
      }
    }
    setResolving(false);
    setSelected(new Set());
    if (fail === 0) toast.success(`${ok} issues resolved`);
    else toast.error(`${ok} resolved, ${fail} failed`);
  };

  const handleBulkDismiss = () => {
    if (!token || selected.size === 0) return;
    setBulkDismissReason("");
    setBulkDismissOpen(true);
  };

  const handleBulkDismissConfirm = async () => {
    if (!token || selected.size === 0) return;
    if (!bulkDismissReason.trim()) {
      toast.error("Reason is required.");
      return;
    }
    setDismissing(true);
    let ok = 0;
    let fail = 0;
    for (const id of selected) {
      try {
        await tabAudit.dismissIssue({
          token,
          issueId: id,
          reason: bulkDismissReason.trim(),
        });
        ok++;
      } catch {
        fail++;
      }
    }
    setDismissing(false);
    setSelected(new Set());
    setBulkDismissOpen(false);
    setBulkDismissReason("");
    if (fail === 0) toast.success(`${ok} issues dismissed`);
    else toast.error(`${ok} dismissed, ${fail} failed`);
  };

  // Visual aria-live counter for tab badges (accessibility).
  const lastRunMeta = lastReport
    ? `Last run ${formatShortWIB(lastReport.startedAt)} \u00b7 ${totalOpen} open`
    : null;

  return (
    <div className="container mx-auto space-y-6 p-6">
      <PageHeader
        title="Channel Audit Workbench"
        description="Review and resolve data quality issues across all channel revenue items."
        action={
          <Button
            onClick={handleTriggerAudit}
            disabled={triggering || !token}
            type="button"
          >
            {triggering ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {triggering ? "Running audit\u2026" : "Run full audit"}
          </Button>
        }
      />

      {lastRunMeta && (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {lastRunMeta}
        </p>
      )}

      {/* Summary — 5-stat grid */}
      <Card>
        <CardHeader>
          <CardTitle>Summary</CardTitle>
          <CardDescription>
            Click a stat panel to jump to the matching issue-type tab.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {neverRun ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <p className="text-sm font-semibold">Audit not yet run</p>
              <p className="max-w-md text-sm text-muted-foreground">
                Click{" "}
                <span className="font-semibold text-foreground">
                  Run full audit
                </span>{" "}
                above to scan all externalRevenueItems for the 5 issue types.
              </p>
            </div>
          ) : isLoadingAll ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {ISSUE_TYPES.map((t) => (
                <Skeleton key={t} className="h-24 w-full" />
              ))}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {ISSUE_TYPES.map((t) => {
                const count = countsByType[t];
                const meta = getAuditIssueTypeMeta(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => handleTabChange(t)}
                    className={cn(
                      "rounded-md border p-4 text-left transition-colors hover:bg-muted/50",
                      count > 0
                        ? meta.severity === "block"
                          ? "border-l-4 border-l-destructive"
                          : "border-l-4 border-l-primary"
                        : "border-l-4 border-l-muted-foreground/30",
                      activeTab === t && "bg-muted/40 ring-1 ring-ring",
                    )}
                    aria-label={`${meta.label}: ${count} open issues. Click to view.`}
                  >
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {meta.label}
                    </div>
                    <div className="mt-1 text-2xl font-semibold tabular-nums">
                      {count}
                    </div>
                    <div className="text-xs text-muted-foreground">open</div>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Issue type tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="h-auto flex-wrap gap-1">
          {ISSUE_TYPES.map((t) => (
            <TabsTrigger
              key={t}
              value={t}
              className="flex items-center gap-2"
              aria-label={`${getAuditIssueTypeMeta(t).label}: ${countsByType[t]} open`}
            >
              <AuditIssueTypeBadge type={t} />
              <span className="tabular-nums text-xs text-muted-foreground">
                ({countsByType[t]})
              </span>
            </TabsTrigger>
          ))}
        </TabsList>

        {ISSUE_TYPES.map((t) => (
          <TabsContent key={t} value={t} className="mt-4">
            <IssuesTable
              issueType={t}
              issues={activeTab === t ? openIssuesInTab : []}
              loading={activeTab === t && isLoadingTab}
              selected={selected}
              onToggleRow={toggleRow}
              onToggleAll={toggleAllInTab}
              onResolveClick={openResolveDialog}
              onDismissClick={(issue) => {
                setDismissTarget(issue);
                setDismissReason("");
              }}
              onBulkResolve={handleBulkResolve}
              onBulkDismiss={handleBulkDismiss}
              bulkBusy={resolving || dismissing}
            />
          </TabsContent>
        ))}
      </Tabs>

      {/* Resolve dialog (non-destructive for warn types; destructive variant for orphan_item) */}
      <Dialog
        open={!!resolveTarget}
        onOpenChange={(open) => {
          if (!open) {
            setResolveTarget(null);
            setResolveText("");
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {resolveTarget
                ? RESOLUTION_META[resolveTarget.issueType].dialogTitle
                : "Resolve issue"}
            </DialogTitle>
            <DialogDescription>
              {resolveTarget
                ? RESOLUTION_META[resolveTarget.issueType].dialogDescription
                : ""}
            </DialogDescription>
          </DialogHeader>
          {resolveTarget && (
            <div className="space-y-3">
              <Alert>
                <AlertTitle className="flex items-center gap-2">
                  <SourceBadge source={resolveTarget.source} size="sm" />
                  <AuditIssueTypeBadge type={resolveTarget.issueType} />
                </AlertTitle>
                <AlertDescription className="mt-2 text-sm">
                  {resolveTarget.detail}
                </AlertDescription>
              </Alert>
              <div className="space-y-1.5">
                <Label htmlFor="resolve-text">Resolution (required)</Label>
                <Textarea
                  id="resolve-text"
                  rows={3}
                  value={resolveText}
                  onChange={(e) => setResolveText(e.target.value)}
                  placeholder="Describe what was done"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setResolveTarget(null)}
              disabled={resolving}
              type="button"
            >
              Cancel
            </Button>
            <Button
              onClick={handleResolveConfirm}
              disabled={resolving || !resolveText.trim()}
              type="button"
              variant={
                resolveTarget &&
                RESOLUTION_META[resolveTarget.issueType].destructive
                  ? "destructive"
                  : "default"
              }
            >
              {resolving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Record resolution
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dismiss AlertDialog (per UI-SPEC §Destructive Confirmations — default variant, reason required) */}
      <AlertDialog
        open={!!dismissTarget}
        onOpenChange={(open) => {
          if (!open) {
            setDismissTarget(null);
            setDismissReason("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {dismissTarget
                ? `Dismiss ${getAuditIssueTypeMeta(dismissTarget.issueType).label} issue?`
                : "Dismiss issue?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Dismissing marks this item as reviewed. It will not re-appear in
              future audits. Add a reason below.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="dismiss-reason">Reason (required)</Label>
            <Textarea
              id="dismiss-reason"
              rows={3}
              value={dismissReason}
              onChange={(e) => setDismissReason(e.target.value)}
              placeholder="Why is this issue being dismissed?"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={dismissing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDismissConfirm}
              disabled={dismissing || !dismissReason.trim()}
            >
              {dismissing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Dismiss issue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Dismiss AlertDialog — same pattern as single dismiss (previously
          used window.prompt which breaks on mobile + test automation). */}
      <AlertDialog
        open={bulkDismissOpen}
        onOpenChange={(open) => {
          if (!open) {
            setBulkDismissOpen(false);
            setBulkDismissReason("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Dismiss {selected.size} selected issue{selected.size === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Bulk dismissal marks all selected items as reviewed. They will not
              re-appear in future audits. Add a reason below — the same reason
              applies to every selected issue.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="bulk-dismiss-reason">Reason (required)</Label>
            <Textarea
              id="bulk-dismiss-reason"
              rows={3}
              value={bulkDismissReason}
              onChange={(e) => setBulkDismissReason(e.target.value)}
              placeholder="Why are these issues being dismissed?"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={dismissing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDismissConfirm}
              disabled={dismissing || !bulkDismissReason.trim()}
            >
              {dismissing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Dismiss {selected.size} issue{selected.size === 1 ? "" : "s"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ============================================================================
// IssuesTable — in-file sub-component (one table per tab)
// ============================================================================

interface IssuesTableProps {
  issueType: AuditIssueType;
  issues: AuditIssue[];
  loading: boolean;
  selected: Set<Id<"channelAuditIssues">>;
  onToggleRow: (id: Id<"channelAuditIssues">) => void;
  onToggleAll: (checked: boolean) => void;
  onResolveClick: (issue: AuditIssue) => void;
  onDismissClick: (issue: AuditIssue) => void;
  onBulkResolve: () => void;
  onBulkDismiss: () => void;
  bulkBusy: boolean;
}

function IssuesTable({
  issueType,
  issues,
  loading,
  selected,
  onToggleRow,
  onToggleAll,
  onResolveClick,
  onDismissClick,
  onBulkResolve,
  onBulkDismiss,
  bulkBusy,
}: IssuesTableProps) {
  const meta = RESOLUTION_META[issueType];
  const typeMeta = getAuditIssueTypeMeta(issueType);
  const allChecked =
    issues.length > 0 && issues.every((i) => selected.has(i._id));
  const someChecked = issues.some((i) => selected.has(i._id));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AuditIssueTypeBadge type={issueType} />
          <span>
            {typeMeta.label} {"\u00b7"} {issues.length} open
          </span>
        </CardTitle>
        <CardDescription>{typeMeta.tooltip}</CardDescription>
      </CardHeader>
      <CardContent>
        {selected.size >= 1 && (
          <div className="mb-3 flex items-center justify-between rounded-md border border-dashed bg-muted/40 px-3 py-2">
            <span className="text-sm font-medium">
              {selected.size} selected
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={onBulkResolve}
                disabled={bulkBusy}
              >
                <CheckCircle2 className="h-4 w-4" />
                Bulk resolve
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={onBulkDismiss}
                disabled={bulkBusy}
              >
                <XCircle className="h-4 w-4" />
                Bulk dismiss
              </Button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : issues.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <p className="text-sm font-semibold">No {typeMeta.label} issues</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Items matching this pattern will appear here after the next audit
              run.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={
                        allChecked
                          ? true
                          : someChecked
                            ? "indeterminate"
                            : false
                      }
                      onCheckedChange={(v) => onToggleAll(v === true)}
                      aria-label="Select all issues in this tab"
                    />
                  </TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>External ref</TableHead>
                  <TableHead>Detail</TableHead>
                  <TableHead>Detected at</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {issues.map((issue) => {
                  const checked = selected.has(issue._id);
                  return (
                    <TableRow key={issue._id} data-state={checked ? "selected" : undefined}>
                      <TableCell>
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => onToggleRow(issue._id)}
                          aria-label={`Select issue ${issue._id}`}
                        />
                      </TableCell>
                      <TableCell>
                        <SourceBadge source={issue.source} size="sm" />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {issue.itemId ? (
                          <span className="tabular-nums">{issue.itemId}</span>
                        ) : (
                          <Badge variant="outline">no item</Badge>
                        )}
                      </TableCell>
                      <TableCell className="max-w-sm text-sm">
                        {issue.detail}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground tabular-nums">
                        {formatShortWIB(issue.detectedAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center gap-1">
                          <Button
                            variant={meta.destructive ? "destructive" : "default"}
                            size="sm"
                            onClick={() => onResolveClick(issue)}
                            aria-label={`${meta.primaryLabel} for issue ${issue._id}`}
                          >
                            {meta.destructive ? (
                              <Trash2 className="h-4 w-4" />
                            ) : null}
                            {meta.primaryLabel}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onDismissClick(issue)}
                            aria-label={`Dismiss issue ${issue._id}`}
                          >
                            <XCircle className="h-4 w-4" />
                            Dismiss
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default ChannelAuditWorkbench;
