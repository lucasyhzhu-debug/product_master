import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useProtectedMutation } from "@/hooks/convex/useProtectedMutation";
import { useConvexRefreshK3MartToken } from "@/hooks/convex";
import { api } from "../../../convex/_generated/api";
import { useAuth } from "@/contexts/AuthContext";

interface K3MartCredentialsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentEmail?: string | null;
}

export function K3MartCredentialsDialog({
  open,
  onOpenChange,
  currentEmail,
}: K3MartCredentialsDialogProps) {
  const { user } = useAuth();
  const [email, setEmail] = useState(currentEmail ?? "");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveCredentials = useProtectedMutation(
    api.platformCredentials.mutations.saveCredentials
  );
  const refreshToken = useConvexRefreshK3MartToken();

  const handleSaveAndRefresh = async () => {
    if (!email.trim() || !password.trim()) {
      setError("Email and password are required");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // 1. Save credentials
      await saveCredentials({
        platformId: "k3mart",
        email: email.trim(),
        password: password.trim(),
      });

      // 2. Immediately trigger token refresh
      if (!user?.token) {
        throw new Error("Not authenticated");
      }
      const result = await refreshToken({ token: user.token });

      if (result.success) {
        toast.success("K3Mart credentials saved and token refreshed");
        setPassword("");
        onOpenChange(false);
      } else {
        setError(result.error ?? "Token refresh failed");
        toast.error("Credentials saved but token refresh failed");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save credentials";
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
          <DialogTitle>K3 Mart Credentials</DialogTitle>
          <DialogDescription>
            Enter your K3 Mart login credentials for automatic token refresh
            every 12 hours.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="k3mart-email">Email</Label>
            <Input
              id="k3mart-email"
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={saving}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="k3mart-password">Password</Label>
            <Input
              id="k3mart-password"
              type="password"
              placeholder="Enter password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={saving}
            />
          </div>

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          <Button
            onClick={handleSaveAndRefresh}
            disabled={saving || !email.trim() || !password.trim()}
            className="w-full min-h-[44px]"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving & Refreshing...
              </>
            ) : (
              "Save & Refresh Now"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
