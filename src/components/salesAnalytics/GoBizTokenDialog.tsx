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
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useProtectedMutation } from "@/hooks/convex/useProtectedMutation";
import { useConvexSyncGoBiz } from "@/hooks/convex";
import { api } from "../../../convex/_generated/api";

interface GoBizTokenDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hasExistingToken?: boolean;
}

export function GoBizTokenDialog({
  open,
  onOpenChange,
  hasExistingToken,
}: GoBizTokenDialogProps) {
  const [bearerToken, setBearerToken] = useState("");
  const [refreshToken, setRefreshToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveDirectToken = useProtectedMutation(
    api.platformCredentials.mutations.saveDirectToken
  );
  const syncGoBiz = useConvexSyncGoBiz();

  const handleSaveAndSync = async () => {
    const trimmed = bearerToken.trim();
    if (!trimmed) {
      setError("Access token is required");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // 1. Save token(s) to DB
      await saveDirectToken({
        platformId: "gobiz",
        bearerToken: trimmed,
        ...(refreshToken.trim() ? { refreshToken: refreshToken.trim() } : {}),
      });

      // 2. Trigger immediate sync to validate token
      const result = await syncGoBiz({ triggeredBy: "token-save" });

      if (result.success) {
        toast.success("GoBiz token saved and sync completed");
        setBearerToken("");
        setRefreshToken("");
        onOpenChange(false);
      } else if (result.error?.includes("401") || result.error?.includes("expired")) {
        setError("Token appears to be expired or invalid. Please get a fresh token.");
        toast.error("Token saved but sync failed — token may be expired");
      } else {
        // Token saved, but sync had other issues
        toast.success("GoBiz token saved (sync had issues, try again later)");
        setBearerToken("");
        setRefreshToken("");
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
            Paste both the access_token and refresh_token cookies from your GoBiz
            browser session. Access token expires in ~1 hour; refresh token lasts
            days/weeks and enables auto-renewal.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="gobiz-token">Access Token (required)</Label>
            <Textarea
              id="gobiz-token"
              placeholder="Paste your GoBiz access_token here..."
              value={bearerToken}
              onChange={(e) => setBearerToken(e.target.value)}
              disabled={saving}
              rows={3}
              className="font-mono text-xs"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="gobiz-refresh-token">Refresh Token (recommended)</Label>
            <Textarea
              id="gobiz-refresh-token"
              placeholder="Paste your GoBiz refresh_token here..."
              value={refreshToken}
              onChange={(e) => setRefreshToken(e.target.value)}
              disabled={saving}
              rows={3}
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              Open https://portal.gofoodmerchant.co.id → DevTools (F12) → Application
              → Cookies → copy both access_token and refresh_token values
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
            disabled={saving || !bearerToken.trim()}
            className="w-full min-h-[44px]"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving & Syncing...
              </>
            ) : (
              "Save & Sync Journals"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
