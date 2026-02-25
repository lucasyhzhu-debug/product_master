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
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { useProtectedMutation } from "@/hooks/convex/useProtectedMutation";
import { useSyncGoBiz } from "@/hooks/convex";
import { api } from "../../../convex/_generated/api";

interface GoBizTokenDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hasExistingToken?: boolean;
  tokenExpiresIn?: number | null;
  hasRefreshToken?: boolean;
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "Expired";
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}

export function GoBizTokenDialog({
  open,
  onOpenChange,
  hasExistingToken,
  tokenExpiresIn,
  hasRefreshToken,
}: GoBizTokenDialogProps) {
  const [jsonInput, setJsonInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveDirectToken = useProtectedMutation(
    api.platformCredentials.mutations.saveDirectTokenPublic
  );
  const syncGoBiz = useSyncGoBiz();

  const handleSaveAndSync = async () => {
    const raw = jsonInput.trim();
    if (!raw) {
      setError("Paste the GoBiz auth JSON to continue");
      return;
    }

    let parsed: { access_token?: string; refresh_token?: string };
    try {
      parsed = JSON.parse(raw);
    } catch {
      setError("Invalid JSON — paste the full JSON object from GoBiz");
      return;
    }

    const accessToken = parsed.access_token?.trim();
    const refreshToken = parsed.refresh_token?.trim();

    if (!accessToken) {
      setError("JSON does not contain access_token");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // 1. Save token(s) to DB
      await saveDirectToken({
        platformId: "gobiz",
        bearerToken: accessToken,
        ...(refreshToken ? { refreshToken } : {}),
      });

      // 2. Trigger immediate sync to validate token (instant verification)
      const result = await syncGoBiz({ triggeredBy: "token-save" });

      if (result.success) {
        toast.success("GoBiz token saved and verified successfully");
        setJsonInput("");
        onOpenChange(false);
      } else if (result.error?.includes("401") || result.error?.includes("expired")) {
        setError("Token appears to be expired or invalid. Please get a fresh token.");
        toast.error("Token saved but verification failed -- token may be expired");
      } else {
        // Token saved, but sync had other issues
        toast.success("GoBiz token saved (sync had issues, try again later)");
        setJsonInput("");
        onOpenChange(false);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save token";
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  // Determine current token status
  const tokenIsActive =
    hasExistingToken &&
    (tokenExpiresIn === undefined || tokenExpiresIn === null || tokenExpiresIn > 0);
  const tokenIsExpired =
    hasExistingToken &&
    tokenExpiresIn !== undefined &&
    tokenExpiresIn !== null &&
    tokenExpiresIn <= 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>GoBiz (GoFood) Token</DialogTitle>
          <DialogDescription>
            Paste the full auth JSON object from your GoBiz session. It should contain
            access_token, refresh_token, and dbl_enabled fields.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Current token status display */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
            <span className="text-sm font-medium">Current status:</span>
            {tokenIsActive ? (
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className="border-green-500 dark:border-green-600 text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/30"
                >
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Active
                </Badge>
                {tokenExpiresIn !== undefined &&
                  tokenExpiresIn !== null &&
                  tokenExpiresIn > 0 && (
                    <span className="text-xs text-muted-foreground">
                      ({formatCountdown(tokenExpiresIn)} remaining)
                    </span>
                  )}
              </div>
            ) : tokenIsExpired ? (
              <Badge
                variant="outline"
                className="border-red-500 dark:border-red-600 text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/30"
              >
                <XCircle className="h-3 w-3 mr-1" />
                Expired
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="border-red-500 dark:border-red-600 text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/30"
              >
                <XCircle className="h-3 w-3 mr-1" />
                No token
              </Badge>
            )}
            {hasRefreshToken && (
              <Badge
                variant="outline"
                className="border-green-500 dark:border-green-600 text-green-700 dark:text-green-400 text-[10px] px-1.5 py-0"
              >
                Refresh token saved
              </Badge>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="gobiz-json">Auth JSON</Label>
            <Textarea
              id="gobiz-json"
              placeholder={'{\n  "access_token": "...",\n  "refresh_token": "...",\n  "dbl_enabled": true\n}'}
              value={jsonInput}
              onChange={(e) => { setJsonInput(e.target.value); setError(null); }}
              disabled={saving}
              rows={6}
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              Open https://portal.gofoodmerchant.co.id → DevTools (F12) → Network tab →
              find any API request → copy the Authorization JSON from the request payload or
              cookie storage. Paste the full JSON object here.
            </p>
          </div>

          {hasExistingToken && (
            <p className="text-xs text-amber-600">
              A token is already saved. Pasting a new one will replace it.
            </p>
          )}

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          <Button
            onClick={handleSaveAndSync}
            disabled={saving || !jsonInput.trim()}
            className="w-full min-h-[44px]"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving & Verifying...
              </>
            ) : (
              "Save & Verify Token"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
