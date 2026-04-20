/**
 * Phase 74.5.1 Plan 09 — ChannelRoutingManager
 *
 * Route: `/admin/channel-routing`
 * Role:  admin (ProtectedRoute in App.tsx + requireRole on every mutation)
 *
 * Anatomy (per UI-SPEC §ChannelRoutingManager):
 *   1. PageHeader
 *   2. (Optional) K3Mart shape-migration banner — deferred to Plan 10/11
 *   3. Resolution Preview Card (primary anchor)
 *   4. Routing Rules Table Card (+ seed button + add button)
 *   5. Add/Edit Dialog with live validation
 *   6. Delete confirmation via AlertDialog
 *
 * 5 states implemented: idle / loading / empty / error / success.
 */

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { toast } from "sonner";
import { Loader2, Pencil, Plus, Trash2, Database } from "lucide-react";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { SourceBadge } from "@/components/channelIntegration/SourceBadge";
import { ResolutionPreviewPanel } from "@/components/channelIntegration/ResolutionPreviewPanel";
import { useAuth } from "@/contexts/AuthContext";
import { useChannelRouting } from "@/hooks/convex/useChannelRouting";
import { formatShortWIB } from "@/lib/dateUtils";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  EXTERNAL_SOURCES,
  sourceToPlatform,
  type ExternalSource,
} from "../../convex/lib/externalSource";

const ANY_SENTINEL = "__any__";

interface RuleFormState {
  ruleId?: Id<"channelRouting">;
  source: ExternalSource | "";
  outletId: Id<"externalOutlets"> | undefined;
  menuProductId: Id<"menuProducts"> | undefined;
  storageLocationId: Id<"storageLocations"> | undefined;
  isDefault: boolean;
  notes: string;
}

const EMPTY_FORM: RuleFormState = {
  source: "",
  outletId: undefined,
  menuProductId: undefined,
  storageLocationId: undefined,
  isDefault: false,
  notes: "",
};

type RuleRow = {
  _id: Id<"channelRouting">;
  source: ExternalSource;
  outletId?: Id<"externalOutlets">;
  menuProductId?: Id<"menuProducts">;
  storageLocationId: Id<"storageLocations">;
  isDefault: boolean;
  notes?: string;
  updatedBy: string;
  updatedAt: number;
  storageLocationName: string;
  outletName: string | null;
  menuProductName: string | null;
};

export function ChannelRoutingManager() {
  const { user } = useAuth();
  const token = user?.token;

  const { rules, createRule, updateRule, deleteRule, seedFromOutlets } =
    useChannelRouting(token);

  // Lookup data for Add/Edit selects
  const outlets = useQuery(api.externalData.queries.listOutlets, {});
  const menuProducts = useQuery(api.menuProducts.queries.list, {
    activeOnly: true,
  });
  const storageLocations = useQuery(api.storageLocations.queries.list, {
    activeOnly: true,
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<RuleFormState>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Id<"channelRouting"> | null>(null);
  const [seedRunning, setSeedRunning] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<RuleRow | null>(null);

  const loadingRules = rules === undefined;
  // useMemo stabilises reference so downstream useMemos that depend on
  // rulesSafe don't re-run every render (review R2).
  const rulesSafe: RuleRow[] = useMemo(() => rules ?? [], [rules]);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setFieldErrors({});
    setDialogOpen(true);
  };

  const openEdit = (row: RuleRow) => {
    setForm({
      ruleId: row._id,
      source: row.source,
      outletId: row.outletId,
      menuProductId: row.menuProductId,
      storageLocationId: row.storageLocationId,
      isDefault: row.isDefault,
      notes: row.notes ?? "",
    });
    setFieldErrors({});
    setDialogOpen(true);
  };

  const isDefaultEligible =
    form.outletId === undefined && form.menuProductId === undefined;

  const canSave =
    !!form.source &&
    !!form.storageLocationId &&
    (!form.isDefault || isDefaultEligible);

  const handleSave = async () => {
    if (!token) return;
    if (!canSave) return;

    setSaving(true);
    setFieldErrors({});

    try {
      if (form.ruleId) {
        await updateRule({
          token,
          ruleId: form.ruleId,
          storageLocationId: form.storageLocationId!,
          isDefault: form.isDefault,
          notes: form.notes || undefined,
        });
        toast.success("Routing rule updated");
      } else {
        await createRule({
          token,
          source: form.source as ExternalSource,
          outletId: form.outletId,
          menuProductId: form.menuProductId,
          storageLocationId: form.storageLocationId!,
          isDefault: form.isDefault,
          notes: form.notes || undefined,
        });
        toast.success("Routing rule saved");
      }
      setDialogOpen(false);
      setForm(EMPTY_FORM);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.startsWith("Duplicate routing rule")) {
        setFieldErrors({
          combo: "A rule already exists for this combination.",
        });
      } else if (msg.startsWith("isDefault=true requires")) {
        setFieldErrors({
          isDefault:
            "isDefault=true requires outlet AND product to be Any (source-level default only).",
        });
      } else {
        toast.error(`Save failed: ${msg}`);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteConfirmed = async () => {
    if (!token || !pendingDelete) return;
    setDeleting(pendingDelete._id);
    try {
      await deleteRule({ token, ruleId: pendingDelete._id });
      toast.success("Routing rule deleted");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Delete failed: ${msg}`);
    } finally {
      setDeleting(null);
      setPendingDelete(null);
    }
  };

  const handleSeed = async () => {
    if (!token) return;
    setSeedRunning(true);
    try {
      await seedFromOutlets({ token });
      toast.success(
        "Seed scheduled. Rows from linked outlets will appear shortly.",
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Seed failed: ${msg}`);
    } finally {
      setSeedRunning(false);
    }
  };

  // Highlight any row matching the form's (source, outletId, menuProductId)
  // if duplicate-combo error is showing — per UI-SPEC §States "Validation error"
  const duplicateHighlightId = useMemo<Id<"channelRouting"> | undefined>(() => {
    if (!fieldErrors.combo) return undefined;
    const match = rulesSafe.find(
      (r) =>
        r.source === form.source &&
        r.outletId === form.outletId &&
        r.menuProductId === form.menuProductId,
    );
    return match?._id;
  }, [fieldErrors.combo, rulesSafe, form.source, form.outletId, form.menuProductId]);

  return (
    <div className="container mx-auto space-y-6 p-6">
      <PageHeader
        title="Channel Routing"
        description="Configure which storage location deducts stock for each (source, outlet, product) combination."
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={handleSeed}
              disabled={seedRunning || !token}
              type="button"
            >
              {seedRunning ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Database className="h-4 w-4" />
              )}
              Seed from outlets
            </Button>
            <Button onClick={openCreate} disabled={!token}>
              <Plus className="h-4 w-4" />
              Add routing rule
            </Button>
          </div>
        }
      />

      {/* Primary anchor — resolution preview */}
      <ResolutionPreviewPanel />

      {/* Routing rules table */}
      <Card>
        <CardHeader>
          <CardTitle>Routing Rules</CardTitle>
          <CardDescription>
            5-tier precedence: (source + outlet + product) &rarr; (source +
            outlet) &rarr; (source + product) &rarr; (source default) &rarr;
            throw CHANNEL_ROUTING_NOT_CONFIGURED.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingRules ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : rulesSafe.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <p className="text-sm font-semibold">No routing rules yet</p>
              <p className="max-w-md text-sm text-muted-foreground">
                Add a rule for each source that should deduct inventory. Without
                a rule,{" "}
                <code className="rounded bg-muted px-1 py-0.5">
                  saveRevenueItems
                </code>{" "}
                will throw CHANNEL_ROUTING_NOT_CONFIGURED at deduction time.
              </p>
              <Button onClick={openCreate} disabled={!token}>
                <Plus className="h-4 w-4" />
                Add routing rule
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source</TableHead>
                    <TableHead>Outlet</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Storage location</TableHead>
                    <TableHead>Default</TableHead>
                    <TableHead>Updated by</TableHead>
                    <TableHead>Updated at</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rulesSafe.map((r) => {
                    const highlighted = duplicateHighlightId === r._id;
                    return (
                      <TableRow
                        key={r._id}
                        className={
                          highlighted
                            ? "border-l-4 border-l-destructive bg-destructive/5"
                            : undefined
                        }
                      >
                        <TableCell>
                          <SourceBadge source={r.source} size="sm" />
                        </TableCell>
                        <TableCell className="text-sm">
                          {r.outletName ?? (
                            <span className="text-muted-foreground">Any</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {r.menuProductName ?? (
                            <span className="text-muted-foreground">Any</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm font-semibold">
                          {r.storageLocationName}
                        </TableCell>
                        <TableCell className="text-sm">
                          {r.isDefault ? "Yes" : ""}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {r.updatedBy}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground tabular-nums">
                          {formatShortWIB(r.updatedAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEdit(r)}
                              aria-label={`Edit routing rule for ${sourceToPlatform(r.source)}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setPendingDelete(r)}
                              disabled={deleting === r._id}
                              aria-label={`Delete routing rule for ${sourceToPlatform(r.source)}`}
                            >
                              {deleting === r._id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
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

      {/* Add / Edit Dialog */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setForm(EMPTY_FORM);
            setFieldErrors({});
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {form.ruleId ? "Edit routing rule" : "Add routing rule"}
            </DialogTitle>
            <DialogDescription>
              {form.ruleId
                ? "Source, outlet, and product are immutable after creation. To rekey, delete + recreate."
                : "Pick the scope (source-only, +outlet, +product, or fully-specific) and a storage location."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {fieldErrors.combo && (
              <Alert variant="destructive">
                <AlertTitle>Duplicate combination</AlertTitle>
                <AlertDescription>{fieldErrors.combo}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="source-select">Source</Label>
              <Select
                value={form.source || ""}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, source: v as ExternalSource }))
                }
                disabled={!!form.ruleId}
              >
                <SelectTrigger id="source-select">
                  <SelectValue placeholder="Select source" />
                </SelectTrigger>
                <SelectContent>
                  {EXTERNAL_SOURCES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {sourceToPlatform(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="outlet-select">Outlet</Label>
              <Select
                value={form.outletId ?? ANY_SENTINEL}
                onValueChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    outletId:
                      v === ANY_SENTINEL
                        ? undefined
                        : (v as Id<"externalOutlets">),
                    isDefault: v === ANY_SENTINEL ? f.isDefault : false,
                  }))
                }
                disabled={!!form.ruleId || outlets === undefined}
              >
                <SelectTrigger id="outlet-select">
                  <SelectValue placeholder="Any outlet" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY_SENTINEL}>Any outlet</SelectItem>
                  {(outlets ?? [])
                    .filter((o) => !form.source || o.source === form.source)
                    .map((o) => (
                      <SelectItem key={o._id} value={o._id}>
                        {o.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="product-select">Product</Label>
              <Select
                value={form.menuProductId ?? ANY_SENTINEL}
                onValueChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    menuProductId:
                      v === ANY_SENTINEL
                        ? undefined
                        : (v as Id<"menuProducts">),
                    isDefault: v === ANY_SENTINEL ? f.isDefault : false,
                  }))
                }
                disabled={!!form.ruleId || menuProducts === undefined}
              >
                <SelectTrigger id="product-select">
                  <SelectValue placeholder="Any product" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY_SENTINEL}>Any product</SelectItem>
                  {(menuProducts ?? []).map((p) => (
                    <SelectItem key={p._id} value={p._id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="storage-select">Storage location</Label>
              <Select
                value={form.storageLocationId ?? ""}
                onValueChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    storageLocationId: v as Id<"storageLocations">,
                  }))
                }
                disabled={storageLocations === undefined}
              >
                <SelectTrigger id="storage-select">
                  <SelectValue placeholder="Select storage location" />
                </SelectTrigger>
                <SelectContent>
                  {(storageLocations ?? []).map((s) => (
                    <SelectItem key={s._id} value={s._id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-start gap-2">
              <Checkbox
                id="is-default"
                checked={form.isDefault}
                disabled={!isDefaultEligible}
                onCheckedChange={(v) =>
                  setForm((f) => ({ ...f, isDefault: v === true }))
                }
              />
              <div className="space-y-1 leading-none">
                <Label htmlFor="is-default" className="text-sm">
                  Source-level default
                </Label>
                <p className="text-xs text-muted-foreground">
                  Only available when both outlet and product are Any. Acts as
                  the Tier 4 fallback for this source.
                </p>
                {fieldErrors.isDefault && (
                  <p className="text-xs text-destructive">
                    {fieldErrors.isDefault}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea
                id="notes"
                value={form.notes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, notes: e.target.value }))
                }
                rows={2}
                placeholder="Migration note, owner, or rollout context"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
              type="button"
            >
              Discard changes
            </Button>
            <Button
              onClick={handleSave}
              disabled={!canSave || saving}
              type="button"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save routing rule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete routing rule
              {pendingDelete
                ? ` for ${sourceToPlatform(pendingDelete.source)}?`
                : "?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Removing this rule means future{" "}
              {pendingDelete ? sourceToPlatform(pendingDelete.source) : ""}{" "}
              sales
              {pendingDelete?.outletName
                ? ` / outlet ${pendingDelete.outletName}`
                : ""}
              {pendingDelete?.menuProductName
                ? ` / ${pendingDelete.menuProductName}`
                : ""}{" "}
              will throw CHANNEL_ROUTING_NOT_CONFIGURED until a new rule is
              added. This does not roll back past deductions.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting !== null}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirmed}
              disabled={deleting !== null}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting !== null ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              Delete rule
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default ChannelRoutingManager;
