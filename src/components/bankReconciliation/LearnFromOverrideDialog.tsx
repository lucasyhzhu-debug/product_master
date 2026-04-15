/**
 * LearnFromOverrideDialog — Phase 73 D-10/D-11/D-12.
 *
 * Appears after a reviewer changes `overrideCategoryAccountId` on a line.
 * Pre-fills a bank-keyword-rule form from the override + the line's parsed
 * counterparty / description, allowing the reviewer to save a rule so that
 * future lines matching the same pattern auto-classify.
 *
 * All fields editable; calls `createFromOverride` (manager+admin) NOT the
 * admin-only plain `create` mutation (T-73-26).
 */
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, X } from "lucide-react";
import { useCreateRuleFromOverride } from "@/hooks/convex/useBankReconciliation";
import { useAccounts } from "@/hooks/convex/useAccounts";

type PLSection = "Revenue" | "COGS" | "OpEx" | "Below the Line";
type Confidence = "exact" | "strong" | "suggested";
type MatchType =
  | "counterparty"
  | "description_contains"
  | "description_exact"
  | "description_regex"
  | "counterparty_or_keyword"
  | "counterparty_and_keyword"
  | "catch_all";
type Mode = "any" | "all" | "hint";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  line: Doc<"bankStatementLines"> | null;
  overrideAccountId: Id<"accounts"> | null;
  onSaved?: () => void;
}

function extractKeywords(rawDescription: string): string[] {
  return rawDescription
    .split(/\s+/)
    .filter((w) => w.length >= 4)
    .sort((a, b) => b.length - a.length)
    .slice(0, 3);
}

export function LearnFromOverrideDialog({
  open,
  onOpenChange,
  line,
  overrideAccountId,
  onSaved,
}: Props) {
  const saveRule = useCreateRuleFromOverride();
  const accounts = useAccounts(true);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [ruleCode, setRuleCode] = useState("");
  const [plSection, setPlSection] = useState<PLSection>("OpEx");
  const [direction, setDirection] = useState<"debit" | "credit" | "any">("any");
  const [matchType, setMatchType] = useState<MatchType>("description_contains");
  const [counterpartyPatterns, setCounterpartyPatterns] = useState<string[]>([]);
  const [descriptionPatterns, setDescriptionPatterns] = useState<string[]>([]);
  const [descriptionPatternsMode, setDescriptionPatternsMode] = useState<Mode>("any");
  const [jeDebitAccountId, setJeDebitAccountId] = useState<Id<"accounts"> | "">("");
  const [jeCreditAccountId, setJeCreditAccountId] = useState<Id<"accounts"> | "">("");
  const [confidence, setConfidence] = useState<Confidence>("strong");
  const [priority, setPriority] = useState(50);

  // Pre-fill when opened
  useEffect(() => {
    if (!open || !line) return;
    setRuleCode("");
    setDirection(line.direction);
    setCounterpartyPatterns(
      line.parsedCounterparty ? [line.parsedCounterparty] : [],
    );
    setDescriptionPatterns(extractKeywords(line.rawDescription));
    setDescriptionPatternsMode("any");
    setConfidence("strong");
    setPriority(50);
    setMatchType("description_contains");
    setPlSection("OpEx");
    setJeDebitAccountId(line.jeDebitAccountId ?? "");
    setJeCreditAccountId(line.jeCreditAccountId ?? "");
  }, [open, line]);

  const accountOptions = useMemo(
    () => (accounts ?? []).filter((a) => a.isActive),
    [accounts],
  );

  async function handleSave() {
    if (!line || !overrideAccountId) return;
    if (!/^[A-Z]\d{2}$/.test(ruleCode)) {
      toast.error("Rule code must match /^[A-Z][0-9]{2}$/ (e.g. O01, R12).");
      return;
    }
    if (!jeDebitAccountId || !jeCreditAccountId) {
      toast.error("JE Debit + Credit accounts are required.");
      return;
    }

    setSubmitting(true);
    try {
      await saveRule({
        ruleCode,
        plSection,
        direction,
        matchType,
        descriptionPatternsMode,
        counterpartyPatterns:
          counterpartyPatterns.length > 0 ? counterpartyPatterns : undefined,
        descriptionPatterns:
          descriptionPatterns.length > 0 ? descriptionPatterns : undefined,
        categoryAccountId: overrideAccountId,
        jeDebitAccountId: jeDebitAccountId as Id<"accounts">,
        jeCreditAccountId: jeCreditAccountId as Id<"accounts">,
        confidence,
        priority,
        isCatchAll: false,
        isActive: true,
      });
      toast.success("Rule saved — future lines will auto-classify");
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save rule.";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  function removeChip(list: string[], setter: (v: string[]) => void, value: string) {
    setter(list.filter((v) => v !== value));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Save as a matching rule?</DialogTitle>
          <DialogDescription>
            Future bank lines matching this pattern will be classified automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 py-2">
          <div className="space-y-1.5 col-span-2">
            <Label htmlFor="ruleCode">Rule Code *</Label>
            <Input
              id="ruleCode"
              value={ruleCode}
              onChange={(e) => setRuleCode(e.target.value.toUpperCase())}
              placeholder="O01, R12, C03…"
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              One uppercase letter + two digits.
            </p>
          </div>

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

          <div className="space-y-1.5">
            <Label htmlFor="direction">Direction</Label>
            <Select
              value={direction}
              onValueChange={(v) => setDirection(v as "debit" | "credit" | "any")}
            >
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

          <div className="space-y-1.5 col-span-2">
            <Label>Counterparty Patterns</Label>
            <div className="flex flex-wrap gap-1">
              {counterpartyPatterns.map((p) => (
                <Badge key={p} variant="secondary" className="gap-1">
                  <span className="font-mono text-xs">{p}</span>
                  <button
                    type="button"
                    onClick={() =>
                      removeChip(counterpartyPatterns, setCounterpartyPatterns, p)
                    }
                    aria-label={`Remove ${p}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>

          <div className="space-y-1.5 col-span-2">
            <Label>Description Patterns</Label>
            <div className="flex flex-wrap gap-1">
              {descriptionPatterns.map((p) => (
                <Badge key={p} variant="secondary" className="gap-1">
                  <span className="font-mono text-xs">{p}</span>
                  <button
                    type="button"
                    onClick={() =>
                      removeChip(descriptionPatterns, setDescriptionPatterns, p)
                    }
                    aria-label={`Remove ${p}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Pre-filled from line description. Edit by removing chips.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="jeDebit">JE Debit Account *</Label>
            <Select
              value={(jeDebitAccountId as string) || undefined}
              onValueChange={(v) => setJeDebitAccountId(v as Id<"accounts">)}
            >
              <SelectTrigger id="jeDebit">
                <SelectValue placeholder="Select debit account…" />
              </SelectTrigger>
              <SelectContent>
                {accountOptions.map((a) => (
                  <SelectItem key={a._id} value={a._id}>
                    <span className="font-mono text-xs mr-2">{a.code}</span>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="jeCredit">JE Credit Account *</Label>
            <Select
              value={(jeCreditAccountId as string) || undefined}
              onValueChange={(v) => setJeCreditAccountId(v as Id<"accounts">)}
            >
              <SelectTrigger id="jeCredit">
                <SelectValue placeholder="Select credit account…" />
              </SelectTrigger>
              <SelectContent>
                {accountOptions.map((a) => (
                  <SelectItem key={a._id} value={a._id}>
                    <span className="font-mono text-xs mr-2">{a.code}</span>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

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

          <div className="space-y-1.5">
            <Label htmlFor="priority">Priority</Label>
            <Input
              id="priority"
              type="number"
              min={0}
              max={200}
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value))}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Don&apos;t save
          </Button>
          <Button onClick={handleSave} disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Save rule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
