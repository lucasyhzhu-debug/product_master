/**
 * RuleFormDialog — create/edit a bankKeywordRules row.
 *
 * Covers all 16 persisted fields. Validation fires on submit:
 *  - ruleCode: /^[A-Z]\d{2}$/ (backend also enforces)
 *  - descriptionPatternsMode: any | all | hint
 *  - matchType → required-field matrix (counterparty vs. description)
 *  - description_regex: each pattern must compile via new RegExp
 *  - priority: 0-200 numeric
 *  - catch_all matchType auto-sets isCatchAll=true
 *
 * Security: admin-only mutations (backend gate); ReDoS mitigation
 * is regex compile-check client-side AND runtime try/catch in the
 * match engine (plan 03).
 */

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import type { Id, Doc } from "../../../convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useCreateBankRule,
  useUpdateBankRule,
} from "@/hooks/convex/useBankReconciliation";

type PLSection = "Revenue" | "COGS" | "OpEx" | "Below the Line";
type Direction = "debit" | "credit" | "any";
type MatchType =
  | "counterparty"
  | "description_contains"
  | "description_exact"
  | "description_regex"
  | "counterparty_or_keyword"
  | "counterparty_and_keyword"
  | "catch_all";
type Mode = "any" | "all" | "hint";
type Confidence = "exact" | "strong" | "suggested";

type AccountOption = { _id: Id<"accounts">; code: string; name: string; isActive: boolean };

type RuleDoc = Doc<"bankKeywordRules">;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  existingRule?: RuleDoc | null;
  accounts: AccountOption[];
}

const RULE_CODE_REGEX = /^[A-Z]\d{2}$/;

const KNOWN_FLAGS = [
  "direction_sensitive",
  "needs_line_item_review",
  "capex_needs_asset_register",
  "negates_revenue",
  "related_party",
  "catch_all_misc",
];

const MATCH_TYPES_NEED_COUNTERPARTY: MatchType[] = [
  "counterparty",
  "counterparty_or_keyword",
  "counterparty_and_keyword",
];
const MATCH_TYPES_NEED_DESCRIPTION: MatchType[] = [
  "description_contains",
  "description_exact",
  "description_regex",
  "counterparty_or_keyword",
  "counterparty_and_keyword",
  "catch_all",
];

// ---------------------------------------------------------------------------
// Chip input helper
// ---------------------------------------------------------------------------

function ChipsInput({
  id,
  values,
  onChange,
  placeholder,
}: {
  id?: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");

  function commitDraft() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    if (values.includes(trimmed)) {
      setDraft("");
      return;
    }
    onChange([...values, trimmed]);
    setDraft("");
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {values.map((v) => (
          <Badge key={v} variant="secondary" className="gap-1">
            <span className="text-xs font-mono">{v}</span>
            <button
              type="button"
              className="rounded-full hover:bg-muted p-0.5"
              onClick={() => onChange(values.filter((x) => x !== v))}
              aria-label={`Remove ${v}`}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          id={id}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              commitDraft();
            }
          }}
        />
        <Button type="button" variant="outline" onClick={commitDraft}>
          Add
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Searchable-ish account picker (native select is adequate for ~60 accounts)
// ---------------------------------------------------------------------------

function AccountPicker({
  id,
  value,
  onChange,
  accounts,
  placeholder,
}: {
  id?: string;
  value: Id<"accounts"> | null;
  onChange: (v: Id<"accounts"> | null) => void;
  accounts: AccountOption[];
  placeholder?: string;
}) {
  return (
    <Select
      value={value ?? undefined}
      onValueChange={(v) => onChange(v as Id<"accounts">)}
    >
      <SelectTrigger id={id}>
        <SelectValue placeholder={placeholder ?? "Select account…"} />
      </SelectTrigger>
      <SelectContent>
        {accounts
          .filter((a) => a.isActive)
          .map((a) => (
            <SelectItem key={a._id} value={a._id}>
              <span className="font-mono text-xs mr-2">{a.code}</span>
              {a.name}
            </SelectItem>
          ))}
      </SelectContent>
    </Select>
  );
}

// ---------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------

export function RuleFormDialog({ open, onOpenChange, mode, existingRule, accounts }: Props) {
  const createFn = useCreateBankRule();
  const updateFn = useUpdateBankRule();

  const [ruleCode, setRuleCode] = useState("");
  const [plSection, setPlSection] = useState<PLSection>("OpEx");
  const [direction, setDirection] = useState<Direction>("any");
  const [matchType, setMatchType] = useState<MatchType>("description_contains");
  const [counterpartyPatterns, setCounterpartyPatterns] = useState<string[]>([]);
  const [descriptionPatterns, setDescriptionPatterns] = useState<string[]>([]);
  const [descriptionPatternsMode, setDescriptionPatternsMode] = useState<Mode>("any");
  const [isCatchAll, setIsCatchAll] = useState(false);
  const [categoryAccountId, setCategoryAccountId] = useState<Id<"accounts"> | null>(null);
  const [subCategoryTemplate, setSubCategoryTemplate] = useState("");
  const [jeDebitAccountId, setJeDebitAccountId] = useState<Id<"accounts"> | null>(null);
  const [jeCreditAccountId, setJeCreditAccountId] = useState<Id<"accounts"> | null>(null);
  const [linkedChannel, setLinkedChannel] = useState("");
  const [confidence, setConfidence] = useState<Confidence>("suggested");
  const [priority, setPriority] = useState<number>(50);
  const [flags, setFlags] = useState<string[]>([]);
  const [isActive, setIsActive] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load existing values when editing
  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && existingRule) {
      setRuleCode(existingRule.ruleCode);
      setPlSection(existingRule.plSection as PLSection);
      setDirection(existingRule.direction as Direction);
      setMatchType(existingRule.matchType as MatchType);
      setCounterpartyPatterns(existingRule.counterpartyPatterns ?? []);
      setDescriptionPatterns(existingRule.descriptionPatterns ?? []);
      setDescriptionPatternsMode((existingRule.descriptionPatternsMode ?? "any") as Mode);
      setIsCatchAll(existingRule.isCatchAll);
      setCategoryAccountId(existingRule.categoryAccountId);
      setSubCategoryTemplate(existingRule.subCategoryTemplate ?? "");
      setJeDebitAccountId(existingRule.jeDebitAccountId);
      setJeCreditAccountId(existingRule.jeCreditAccountId);
      setLinkedChannel(existingRule.linkedChannel ?? "");
      setConfidence(existingRule.confidence as Confidence);
      setPriority(existingRule.priority);
      setFlags(existingRule.flags ?? []);
      setIsActive(existingRule.isActive);
    } else if (mode === "create") {
      setRuleCode("");
      setPlSection("OpEx");
      setDirection("any");
      setMatchType("description_contains");
      setCounterpartyPatterns([]);
      setDescriptionPatterns([]);
      setDescriptionPatternsMode("any");
      setIsCatchAll(false);
      setCategoryAccountId(null);
      setSubCategoryTemplate("");
      setJeDebitAccountId(null);
      setJeCreditAccountId(null);
      setLinkedChannel("");
      setConfidence("suggested");
      setPriority(50);
      setFlags([]);
      setIsActive(true);
    }
    setError(null);
  }, [open, mode, existingRule]);

  // Auto-sync isCatchAll with matchType
  useEffect(() => {
    if (matchType === "catch_all" && !isCatchAll) {
      setIsCatchAll(true);
    }
  }, [matchType, isCatchAll]);

  const needsCounterparty = useMemo(
    () => MATCH_TYPES_NEED_COUNTERPARTY.includes(matchType),
    [matchType],
  );
  const needsDescription = useMemo(
    () => MATCH_TYPES_NEED_DESCRIPTION.includes(matchType),
    [matchType],
  );

  async function handleSubmit() {
    setError(null);

    // --- Client-side validation ----------------------------------------
    if (mode === "create" && !RULE_CODE_REGEX.test(ruleCode)) {
      setError("Rule code must match /^[A-Z][0-9]{2}$/ (e.g. R01, C03, O09, B02).");
      return;
    }
    if (needsCounterparty && counterpartyPatterns.length === 0) {
      setError(`matchType "${matchType}" requires at least one counterparty pattern.`);
      return;
    }
    if (needsDescription && descriptionPatterns.length === 0) {
      setError(`matchType "${matchType}" requires at least one description pattern.`);
      return;
    }
    if (matchType === "description_regex") {
      for (const p of descriptionPatterns) {
        try {
          new RegExp(p);
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Invalid regex";
          setError(`Invalid regex "${p}": ${msg}`);
          return;
        }
      }
    }
    if (!Number.isFinite(priority) || priority < 0 || priority > 200) {
      setError("Priority must be a number between 0 and 200.");
      return;
    }
    if (!categoryAccountId) {
      setError("Category Account is required.");
      return;
    }
    if (!jeDebitAccountId) {
      setError("JE Debit Account is required.");
      return;
    }
    if (!jeCreditAccountId) {
      setError("JE Credit Account is required.");
      return;
    }

    setSubmitting(true);
    try {
      const commonFields = {
        plSection,
        direction,
        matchType,
        counterpartyPatterns: counterpartyPatterns.length > 0 ? counterpartyPatterns : undefined,
        descriptionPatterns: descriptionPatterns.length > 0 ? descriptionPatterns : undefined,
        descriptionPatternsMode,
        isCatchAll: matchType === "catch_all" ? true : isCatchAll,
        categoryAccountId,
        subCategoryTemplate: subCategoryTemplate.trim() || undefined,
        jeDebitAccountId,
        jeCreditAccountId,
        linkedChannel: linkedChannel.trim() || undefined,
        confidence,
        priority,
        flags: flags.length > 0 ? flags : undefined,
        isActive,
      };

      if (mode === "create") {
        await createFn({ ruleCode, ...commonFields });
        toast.success(`Rule ${ruleCode} created.`);
      } else if (existingRule) {
        await updateFn({ id: existingRule._id, ...commonFields });
        toast.success(`Rule ${existingRule.ruleCode} updated.`);
      }
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save rule.";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "New Bank Rule" : `Edit Rule ${existingRule?.ruleCode}`}
          </DialogTitle>
          <DialogDescription>
            Classifier rule for auto-matching bank statement lines. Applied server-side in
            priority DESC, ruleCode ASC order.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 py-2">
          {/* Rule code */}
          <div className="space-y-1.5">
            <Label htmlFor="ruleCode">
              Rule Code <span className="text-destructive">*</span>
            </Label>
            <Input
              id="ruleCode"
              value={ruleCode}
              onChange={(e) => setRuleCode(e.target.value.toUpperCase())}
              disabled={mode === "edit"}
              placeholder="R01, C03, O09…"
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Format: one uppercase letter + two digits. Immutable after creation.
            </p>
          </div>

          {/* priority */}
          <div className="space-y-1.5">
            <Label htmlFor="priority">
              Priority <span className="text-destructive">*</span>
            </Label>
            <Input
              id="priority"
              type="number"
              min={0}
              max={200}
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">
              0–200. Higher runs first. Common: 20/40/60/80/100.
            </p>
          </div>

          {/* plSection */}
          <div className="space-y-1.5">
            <Label htmlFor="plSection">P&amp;L Section</Label>
            <Select value={plSection} onValueChange={(v) => setPlSection(v as PLSection)}>
              <SelectTrigger id="plSection">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Revenue">Revenue</SelectItem>
                <SelectItem value="COGS">COGS</SelectItem>
                <SelectItem value="OpEx">OpEx</SelectItem>
                <SelectItem value="Below the Line">Below the Line</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* direction */}
          <div className="space-y-1.5">
            <Label htmlFor="direction">Direction</Label>
            <Select value={direction} onValueChange={(v) => setDirection(v as Direction)}>
              <SelectTrigger id="direction">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="debit">Debit</SelectItem>
                <SelectItem value="credit">Credit</SelectItem>
                <SelectItem value="any">Any</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* matchType */}
          <div className="space-y-1.5 col-span-2">
            <Label htmlFor="matchType">Match Type</Label>
            <Select value={matchType} onValueChange={(v) => setMatchType(v as MatchType)}>
              <SelectTrigger id="matchType">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="counterparty">Counterparty</SelectItem>
                <SelectItem value="description_contains">Description contains</SelectItem>
                <SelectItem value="description_exact">Description exact</SelectItem>
                <SelectItem value="description_regex">Description regex</SelectItem>
                <SelectItem value="counterparty_or_keyword">Counterparty OR keyword</SelectItem>
                <SelectItem value="counterparty_and_keyword">Counterparty AND keyword</SelectItem>
                <SelectItem value="catch_all">Catch-all</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* counterpartyPatterns */}
          {needsCounterparty && (
            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="counterpartyPatterns">
                Counterparty Patterns <span className="text-destructive">*</span>
              </Label>
              <ChipsInput
                id="counterpartyPatterns"
                values={counterpartyPatterns}
                onChange={setCounterpartyPatterns}
                placeholder="e.g. BCA, GOJEK — press Enter to add"
              />
            </div>
          )}

          {/* descriptionPatterns + mode */}
          {needsDescription && (
            <>
              <div className="space-y-1.5 col-span-2">
                <Label htmlFor="descriptionPatterns">
                  Description Patterns{" "}
                  {matchType !== "catch_all" && <span className="text-destructive">*</span>}
                </Label>
                <ChipsInput
                  id="descriptionPatterns"
                  values={descriptionPatterns}
                  onChange={setDescriptionPatterns}
                  placeholder={
                    matchType === "description_regex"
                      ? "Regex pattern, e.g. ^BIAYA\\s"
                      : "e.g. BIAYA ADM — press Enter to add"
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="descriptionPatternsMode">Match Mode</Label>
                <Select
                  value={descriptionPatternsMode}
                  onValueChange={(v) => setDescriptionPatternsMode(v as Mode)}
                >
                  <SelectTrigger id="descriptionPatternsMode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any (OR)</SelectItem>
                    <SelectItem value="all">All (AND)</SelectItem>
                    <SelectItem value="hint">Hint (boost only)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {/* isCatchAll */}
          <div className="flex items-center gap-2 col-span-2 pt-2">
            <Checkbox
              id="isCatchAll"
              checked={isCatchAll}
              onCheckedChange={(v) => setIsCatchAll(Boolean(v))}
              disabled={matchType === "catch_all"}
            />
            <Label htmlFor="isCatchAll" className="cursor-pointer">
              Is catch-all (only one rule may hold this across the active set)
            </Label>
          </div>

          {/* categoryAccountId */}
          <div className="space-y-1.5 col-span-2">
            <Label htmlFor="categoryAccountId">
              Category Account <span className="text-destructive">*</span>
            </Label>
            <AccountPicker
              id="categoryAccountId"
              value={categoryAccountId}
              onChange={setCategoryAccountId}
              accounts={accounts}
              placeholder="Primary GL account for this rule"
            />
          </div>

          {/* subCategoryTemplate */}
          <div className="space-y-1.5 col-span-2">
            <Label htmlFor="subCategoryTemplate">Sub-Category Template</Label>
            <Input
              id="subCategoryTemplate"
              value={subCategoryTemplate}
              onChange={(e) => setSubCategoryTemplate(e.target.value)}
              placeholder="Optional. Free-text label."
            />
          </div>

          {/* jeDebit / jeCredit */}
          <div className="space-y-1.5">
            <Label htmlFor="jeDebitAccountId">
              JE Debit Account <span className="text-destructive">*</span>
            </Label>
            <AccountPicker
              id="jeDebitAccountId"
              value={jeDebitAccountId}
              onChange={setJeDebitAccountId}
              accounts={accounts}
              placeholder="Proposed debit account"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="jeCreditAccountId">
              JE Credit Account <span className="text-destructive">*</span>
            </Label>
            <AccountPicker
              id="jeCreditAccountId"
              value={jeCreditAccountId}
              onChange={setJeCreditAccountId}
              accounts={accounts}
              placeholder="Proposed credit account"
            />
          </div>

          {/* linkedChannel */}
          <div className="space-y-1.5">
            <Label htmlFor="linkedChannel">Linked Channel</Label>
            <Input
              id="linkedChannel"
              value={linkedChannel}
              onChange={(e) => setLinkedChannel(e.target.value)}
              placeholder="Optional. e.g. bca-direct"
            />
          </div>

          {/* confidence */}
          <div className="space-y-1.5">
            <Label htmlFor="confidence">Confidence</Label>
            <Select value={confidence} onValueChange={(v) => setConfidence(v as Confidence)}>
              <SelectTrigger id="confidence">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="exact">Exact</SelectItem>
                <SelectItem value="strong">Strong</SelectItem>
                <SelectItem value="suggested">Suggested</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* flags */}
          <div className="space-y-1.5 col-span-2">
            <Label htmlFor="flags">Flags</Label>
            <div className="flex flex-wrap gap-1 mb-1">
              {KNOWN_FLAGS.map((f) => (
                <Button
                  key={f}
                  type="button"
                  size="sm"
                  variant={flags.includes(f) ? "secondary" : "outline"}
                  onClick={() =>
                    setFlags(
                      flags.includes(f) ? flags.filter((x) => x !== f) : [...flags, f],
                    )
                  }
                  className="h-7 text-xs"
                >
                  {f}
                </Button>
              ))}
            </div>
            <ChipsInput
              id="flags"
              values={flags.filter((f) => !KNOWN_FLAGS.includes(f))}
              onChange={(custom) => {
                const known = flags.filter((f) => KNOWN_FLAGS.includes(f));
                setFlags([...known, ...custom]);
              }}
              placeholder="Custom flag (Enter to add)"
            />
          </div>

          {/* isActive */}
          <div className="flex items-center gap-2 col-span-2 pt-2">
            <Checkbox
              id="isActive"
              checked={isActive}
              onCheckedChange={(v) => setIsActive(Boolean(v))}
            />
            <Label htmlFor="isActive" className="cursor-pointer">
              Active
            </Label>
          </div>
        </div>

        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting
              ? "Saving…"
              : mode === "create"
              ? "Create Rule"
              : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
