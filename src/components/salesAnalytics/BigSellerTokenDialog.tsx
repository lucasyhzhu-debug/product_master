import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ClipboardPaste,
} from "lucide-react";
import { toast } from "sonner";
import { useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { formatCountdown } from "@/lib/formatters";
import { cn } from "@/lib/utils";

interface BigSellerTokenDialogProps {
  open: boolean;
  onClose: () => void;
  authToken: string;
  reconnectSteps: string[];
}

type PreviewState =
  | { type: "idle" }
  | { type: "loading" }
  | { type: "success"; expiresAt: number; daysRemaining: number; uid?: string }
  | { type: "error"; error: string };

export function BigSellerTokenDialog({
  open,
  onClose,
  authToken,
  reconnectSteps,
}: BigSellerTokenDialogProps) {
  const [tokenInput, setTokenInput] = useState("");
  const [preview, setPreview] = useState<PreviewState>({ type: "idle" });
  const [saving, setSaving] = useState(false);
  const [instructionsOpen, setInstructionsOpen] = useState(false);

  const previewBigSellerToken = useAction(
    api.integrations.bigseller.adapter.previewBigSellerToken
  );
  const saveBigSellerToken = useAction(
    api.integrations.bigseller.adapter.saveBigSellerToken
  );

  // Preview expiry on paste (auto-trigger when token input changes)
  const handleTokenChange = async (value: string) => {
    setTokenInput(value);
    const trimmed = value.trim();

    if (!trimmed) {
      setPreview({ type: "idle" });
      return;
    }

    // Only attempt decode when input looks like a JWT (has 2 dots)
    if (trimmed.split(".").length !== 3) {
      setPreview({ type: "idle" });
      return;
    }

    setPreview({ type: "loading" });

    try {
      const result = await previewBigSellerToken({
        token: authToken,
        mucToken: trimmed,
      });

      if (result.success) {
        setPreview({
          type: "success",
          expiresAt: result.expiresAt,
          daysRemaining: result.daysRemaining,
          uid: result.uid,
        });
      } else {
        let friendlyError = result.error;

        if (result.error.includes("already expired")) {
          friendlyError =
            "Token is already expired. Log in to bigseller.com and copy a fresh muc_token.";
        } else if (result.error.includes("no expiry") || result.error.includes("JWT has no expiry")) {
          friendlyError =
            "Could not read token expiry. This may not be a valid muc_token.";
        } else if (result.error.includes("Invalid JWT")) {
          friendlyError =
            "Invalid token format. Make sure you copied the muc_token cookie value.";
        }

        setPreview({ type: "error", error: friendlyError });
      }
    } catch (err) {
      setPreview({
        type: "error",
        error: err instanceof Error ? err.message : "Failed to decode token",
      });
    }
  };

  const handleSave = async () => {
    if (preview.type !== "success") return;

    setSaving(true);
    try {
      const result = await saveBigSellerToken({
        token: authToken,
        mucToken: tokenInput.trim(),
      });

      if (result.success) {
        toast.success(
          `BigSeller token saved — ${formatCountdown(result.daysRemaining)} remaining`
        );
        handleClose();
      } else {
        toast.error(result.error ?? "Failed to save token");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save token";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setTokenInput("");
    setPreview({ type: "idle" });
    setSaving(false);
    setInstructionsOpen(false);
    onClose();
  };

  // Preview color thresholds: green >7d, yellow 3-7d, red <3d
  function getExpiryColorClass(daysRemaining: number): string {
    if (daysRemaining > 7) return "border-green-500 text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/30";
    if (daysRemaining >= 3) return "border-amber-500 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30";
    return "border-red-500 text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/30";
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>BigSeller Token</DialogTitle>
          <DialogDescription>
            Paste your BigSeller muc_token to update authentication. The token
            expiry will be previewed before saving.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Step 1: Paste token */}
          <div className="space-y-2">
            <Label htmlFor="bigseller-token" className="flex items-center gap-1.5">
              <ClipboardPaste className="h-3.5 w-3.5" />
              Paste muc_token
            </Label>
            <Textarea
              id="bigseller-token"
              placeholder="Paste your muc_token from BigSeller browser cookies (eyJ...)"
              value={tokenInput}
              onChange={(e) => handleTokenChange(e.target.value)}
              disabled={saving}
              rows={4}
              className="font-mono text-xs"
            />
          </div>

          {/* Step 2: Preview */}
          {preview.type === "loading" && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground p-3 rounded-lg bg-muted/50">
              <Loader2 className="h-4 w-4 animate-spin" />
              Decoding token...
            </div>
          )}

          {preview.type === "error" && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800">
              <XCircle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700 dark:text-red-300">{preview.error}</p>
            </div>
          )}

          {preview.type === "success" && (
            <div className="p-3 rounded-lg border bg-muted/30 space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                <span className="text-sm font-medium">Token decoded successfully</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Expires:</span>
                <span>{new Date(preview.expiresAt).toLocaleDateString("id-ID", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Time remaining:</span>
                <Badge
                  variant="outline"
                  className={cn("text-xs", getExpiryColorClass(preview.daysRemaining))}
                >
                  {formatCountdown(preview.daysRemaining)}
                </Badge>
                {preview.daysRemaining < 3 && (
                  <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    Renew soon
                  </span>
                )}
              </div>
              {preview.uid && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">User ID:</span>
                  <span className="font-mono text-xs">{preview.uid}</span>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Save button */}
          <Button
            onClick={handleSave}
            disabled={preview.type !== "success" || saving}
            className="w-full min-h-[44px]"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Token"
            )}
          </Button>

          {/* Instructions — collapsible, driven by reconnectSteps registry data */}
          {reconnectSteps.length > 0 && (
            <div className="border rounded-lg overflow-hidden">
              <button
                className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/50 transition-colors"
                onClick={() => setInstructionsOpen((prev) => !prev)}
                type="button"
              >
                How to find your muc_token
                {instructionsOpen ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </button>

              {instructionsOpen && (
                <ol className="px-4 pb-4 space-y-1.5 border-t pt-3">
                  {reconnectSteps.map((step, i) => (
                    <li key={i} className="flex gap-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground shrink-0">{i + 1}.</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
