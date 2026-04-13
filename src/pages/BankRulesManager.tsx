/**
 * BankRulesManager — admin-only CRUD for bankKeywordRules.
 *
 * Features:
 *  - "Seed Defaults" (confirm dialog) → bankKeywordRules.seedDefaults
 *  - "New Rule" → RuleFormDialog (create mode)
 *  - Edit action → RuleFormDialog (edit mode)
 *  - Deactivate action → confirm → bankKeywordRules.deactivate
 *  - Toggle to show inactive rules
 *  - Sorted by priority DESC then ruleCode ASC (matches engine order).
 *
 * Backend gate: admin-only per D-19. Frontend ProtectedRoute mirrors that.
 */

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { toast } from "sonner";
import { Plus, Pencil, PowerOff, Sparkles, ListChecks } from "lucide-react";

import { api } from "../../convex/_generated/api";
import type { Id, Doc } from "../../convex/_generated/dataModel";
import { useAuth } from "@/contexts/AuthContext";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { RuleFormDialog } from "@/components/bankReconciliation/RuleFormDialog";
import {
  useBankKeywordRules,
  useDeactivateBankRule,
  useSeedBankRules,
} from "@/hooks/convex/useBankReconciliation";

type RuleDoc = Doc<"bankKeywordRules">;

function truncate(s: string | undefined, n: number): string {
  if (!s) return "—";
  if (s.length <= n) return s;
  return s.slice(0, n) + "…";
}

function joinAndTruncate(values: string[] | undefined, n = 40): string {
  if (!values || values.length === 0) return "—";
  return truncate(values.join(", "), n);
}

const PL_SECTION_BADGE: Record<string, string> = {
  Revenue: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  COGS: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  OpEx: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30",
  "Below the Line": "bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30",
};

export function BankRulesManager() {
  useDocumentTitle("Bank Rules");

  const [showInactive, setShowInactive] = useState(false);
  const { user } = useAuth();
  const rules = useBankKeywordRules(showInactive);
  // Skip the accounts query until the user is authed — matches the pattern used
  // by `useBankKeywordRules`. Without this, unauthed renders fire a pointless
  // query and inconsistent hook behavior across the page.
  const accounts = useQuery(api.accounts.queries.list, user?.token ? {} : "skip");
  const deactivate = useDeactivateBankRule();
  const seedDefaults = useSeedBankRules();

  const [seedConfirmOpen, setSeedConfirmOpen] = useState(false);
  const [seedBusy, setSeedBusy] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [formRule, setFormRule] = useState<RuleDoc | null>(null);

  const [deactivateTarget, setDeactivateTarget] = useState<RuleDoc | null>(null);

  const accountsById = useMemo(() => {
    const map = new Map<string, Doc<"accounts">>();
    if (accounts) for (const a of accounts) map.set(a._id, a);
    return map;
  }, [accounts]);

  // Ensure ordering (backend already sorts, defensive on client too)
  const sortedRules = useMemo(() => {
    if (!rules) return undefined;
    return [...rules].sort((a, b) => {
      if (a.priority !== b.priority) return b.priority - a.priority;
      return a.ruleCode.localeCompare(b.ruleCode);
    });
  }, [rules]);

  async function handleSeed() {
    setSeedBusy(true);
    try {
      const result = await seedDefaults();
      const created = result.filter((r) => r.action === "created").length;
      const updated = result.filter((r) => r.action === "updated").length;
      toast.success(`Seeded ${result.length} rules — ${created} created, ${updated} updated.`);
      setSeedConfirmOpen(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Seed failed.";
      toast.error(msg);
    } finally {
      setSeedBusy(false);
    }
  }

  async function handleDeactivate() {
    if (!deactivateTarget) return;
    try {
      await deactivate({ id: deactivateTarget._id });
      toast.success(`Rule ${deactivateTarget.ruleCode} deactivated.`);
      setDeactivateTarget(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to deactivate.";
      toast.error(msg);
    }
  }

  function openCreate() {
    setFormMode("create");
    setFormRule(null);
    setFormOpen(true);
  }

  function openEdit(rule: RuleDoc) {
    setFormMode("edit");
    setFormRule(rule);
    setFormOpen(true);
  }

  function accountLabel(id: Id<"accounts"> | undefined): string {
    if (!id) return "—";
    const a = accountsById.get(id);
    if (!a) return String(id).slice(-6);
    return `${a.code} · ${a.name}`;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bank Rules"
        description="Classifier rules applied to bank statement lines during import. Admin only."
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setSeedConfirmOpen(true)}>
              <Sparkles className="mr-2 h-4 w-4" />
              Seed Defaults
            </Button>
            <Button onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              New Rule
            </Button>
          </div>
        }
      />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <ListChecks className="h-4 w-4" />
            {sortedRules?.length ?? 0} rules
          </CardTitle>
          <div className="flex items-center gap-2">
            <Checkbox
              id="showInactive"
              checked={showInactive}
              onCheckedChange={(v) => setShowInactive(Boolean(v))}
            />
            <Label htmlFor="showInactive" className="cursor-pointer text-sm">
              Show inactive
            </Label>
          </div>
        </CardHeader>
        <CardContent>
          {sortedRules === undefined ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : sortedRules.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
              <p>No bank rules yet.</p>
              <p>
                Run <span className="font-mono">accounts:seedDefaults</span> in the Convex
                dashboard first, then click <strong>Seed Defaults</strong> above to import
                the 26 canonical rules.
              </p>
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-xs">Rule</TableHead>
                    <TableHead className="text-xs">P&amp;L</TableHead>
                    <TableHead className="text-xs">Dir.</TableHead>
                    <TableHead className="text-xs">Match Type</TableHead>
                    <TableHead className="text-xs">Counterparty</TableHead>
                    <TableHead className="text-xs">Description</TableHead>
                    <TableHead className="text-xs text-right">Priority</TableHead>
                    <TableHead className="text-xs">Confidence</TableHead>
                    <TableHead className="text-xs">Category</TableHead>
                    <TableHead className="text-xs">Active</TableHead>
                    <TableHead className="text-xs text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedRules.map((r) => (
                    <TableRow key={r._id}>
                      <TableCell className="text-xs font-mono font-medium">{r.ruleCode}</TableCell>
                      <TableCell className="text-xs">
                        <Badge
                          variant="outline"
                          className={`text-[10px] font-medium ${PL_SECTION_BADGE[r.plSection] ?? ""}`}
                        >
                          {r.plSection}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs capitalize">{r.direction}</TableCell>
                      <TableCell className="text-xs">
                        {r.matchType.replace(/_/g, " ")}
                        {r.isCatchAll && (
                          <Badge variant="outline" className="ml-1 text-[10px]">
                            catch-all
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {joinAndTruncate(r.counterpartyPatterns)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {joinAndTruncate(r.descriptionPatterns)}
                      </TableCell>
                      <TableCell className="text-xs text-right tabular-nums">
                        {r.priority}
                      </TableCell>
                      <TableCell className="text-xs capitalize">{r.confidence}</TableCell>
                      <TableCell className="text-xs">
                        {accountLabel(r.categoryAccountId)}
                      </TableCell>
                      <TableCell className="text-xs">
                        {r.isActive ? (
                          <Badge variant="outline" className="text-[10px]">
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-muted-foreground">
                            Inactive
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openEdit(r)}
                            aria-label={`Edit rule ${r.ruleCode}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          {r.isActive && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setDeactivateTarget(r)}
                              aria-label={`Deactivate rule ${r.ruleCode}`}
                            >
                              <PowerOff className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <RuleFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        mode={formMode}
        existingRule={formRule}
        accounts={accounts ?? []}
      />

      <ConfirmDialog
        open={seedConfirmOpen}
        onOpenChange={setSeedConfirmOpen}
        title="Seed default bank rules?"
        description="Idempotent: inserts missing canonical rules and updates existing ones to match the current seed values. Requires accounts:seedDefaults to have run first."
        confirmLabel={seedBusy ? "Seeding…" : "Seed Defaults"}
        loading={seedBusy}
        onConfirm={handleSeed}
      />

      <ConfirmDialog
        open={deactivateTarget !== null}
        onOpenChange={(o) => !o && setDeactivateTarget(null)}
        title={`Deactivate ${deactivateTarget?.ruleCode ?? ""}?`}
        description="The rule will be skipped during future imports but kept in history. You can reactivate it later by editing the rule."
        confirmLabel="Deactivate"
        variant="destructive"
        onConfirm={handleDeactivate}
      />
    </div>
  );
}

export default BankRulesManager;
