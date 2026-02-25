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
import {
  CheckCircle2,
  Loader2,
  RefreshCw,
  XCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useProtectedMutation } from "@/hooks/convex/useProtectedMutation";
import { useAction, useQuery } from "convex/react";
import { useSyncGoBiz } from "@/hooks/convex";
import { api } from "../../../convex/_generated/api";
import { formatCountdown } from "@/lib/formatters";

interface GoBizTokenDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  authToken: string;
}

export function GoBizTokenDialog({
  open,
  onOpenChange,
  authToken,
}: GoBizTokenDialogProps) {
  const [jsonInput, setJsonInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);

  const loginWithCredentials = useAction(
    api.integrations.gobiz.adapter.loginWithCredentials
  );
  const saveDirectToken = useProtectedMutation(
    api.platformCredentials.mutations.saveDirectTokenPublic
  );
  const syncGoBiz = useSyncGoBiz();

  // Load current credential status (to show "Active" / "Expired" badge)
  const credStatus = useQuery(
    api.platformCredentials.getCredentialStatus,
    authToken ? { token: authToken, platformId: "gobiz" } : "skip"
  );

  const tokenIsActive =
    credStatus?.hasToken &&
    (credStatus.tokenExpiresIn === undefined ||
      credStatus.tokenExpiresIn === null ||
      credStatus.tokenExpiresIn > 0);
  const tokenIsExpired =
    credStatus?.hasToken &&
    credStatus.tokenExpiresIn !== undefined &&
    credStatus.tokenExpiresIn !== null &&
    credStatus.tokenExpiresIn <= 0;

  // ── One-Click Refresh ───────────────────────────────────────────────────────

  const handleOneClickRefresh = async () => {
    setRefreshing(true);
    setError(null);
    try {
      const result = await loginWithCredentials({ token: authToken });
      if (result.success) {
        toast.success("GoBiz token refreshed successfully");
        onOpenChange(false);
      } else {
        const msg = result.error ?? "One-click refresh failed";
        if (
          msg.includes("not configured") ||
          msg.includes("GOBIZ_EMAIL") ||
          msg.includes("GOBIZ_PASSWORD")
        ) {
          setError(
            "One-click refresh unavailable. Configure GOBIZ_EMAIL and GOBIZ_PASSWORD in the Convex dashboard to enable it."
          );
        } else {
          setError(msg);
          toast.error(msg);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Refresh failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setRefreshing(false);
    }
  };

  // ── Manual Paste Fallback ───────────────────────────────────────────────────

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

      // 2. Trigger immediate sync to validate token
      const result = await syncGoBiz({ triggeredBy: "token-save" });

      if (result.success) {
        toast.success("GoBiz token saved and verified successfully");
        setJsonInput("");
        onOpenChange(false);
      } else if (
        result.error?.includes("401") ||
        result.error?.includes("expired")
      ) {
        setError(
          "Token appears to be expired or invalid. Please get a fresh token."
        );
        toast.error(
          "Token saved but verification failed -- token may be expired"
        );
      } else {
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>GoBiz (GoFood) Token</DialogTitle>
          <DialogDescription>
            Refresh your GoBiz access token for one-click or manual authentication.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Current token status */}
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
                {credStatus?.tokenExpiresIn !== undefined &&
                  credStatus.tokenExpiresIn !== null &&
                  credStatus.tokenExpiresIn > 0 && (
                    <span className="text-xs text-muted-foreground">
                      ({formatCountdown(credStatus.tokenExpiresIn / (24 * 60 * 60 * 1000))} remaining)
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
          </div>

          {/* One-click Refresh Token button (primary) */}
          <div className="space-y-2">
            <div className="text-sm font-medium">One-Click Refresh</div>
            <p className="text-xs text-muted-foreground">
              Uses GOBIZ_EMAIL and GOBIZ_PASSWORD stored in the Convex dashboard.
              No browser session required.
            </p>
            <Button
              onClick={handleOneClickRefresh}
              disabled={refreshing || saving}
              className="w-full min-h-[44px]"
            >
              {refreshing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Refreshing...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" />
                  Refresh Token (One-Click)
                </>
              )}
            </Button>
          </div>

          {/* Error display */}
          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          {/* Manual Paste — collapsible fallback */}
          <div className="border rounded-lg overflow-hidden">
            <button
              className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/50 transition-colors"
              onClick={() => setManualOpen((prev) => !prev)}
              type="button"
            >
              Manual Paste (Fallback)
              {manualOpen ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </button>

            {manualOpen && (
              <div className="px-4 pb-4 space-y-3 border-t">
                <p className="text-xs text-muted-foreground pt-3">
                  Use this if one-click refresh is unavailable. Open{" "}
                  <code className="text-[10px] bg-muted px-1 rounded">
                    https://portal.gofoodmerchant.co.id
                  </code>{" "}
                  → DevTools (F12) → Application → Cookies. Copy access_token and
                  refresh_token values and paste the full JSON object below.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="gobiz-json">Auth JSON</Label>
                  <Textarea
                    id="gobiz-json"
                    placeholder={'{\n  "access_token": "...",\n  "refresh_token": "...",\n  "dbl_enabled": true\n}'}
                    value={jsonInput}
                    onChange={(e) => {
                      setJsonInput(e.target.value);
                      setError(null);
                    }}
                    disabled={saving || refreshing}
                    rows={5}
                    className="font-mono text-xs"
                  />
                </div>
                <Button
                  onClick={handleSaveAndSync}
                  disabled={saving || refreshing || !jsonInput.trim()}
                  variant="outline"
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
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
