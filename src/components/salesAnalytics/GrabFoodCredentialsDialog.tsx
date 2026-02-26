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
import { useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useAuth } from "@/contexts/AuthContext";

interface GrabFoodCredentialsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GrabFoodCredentialsDialog({
  open,
  onOpenChange,
}: GrabFoodCredentialsDialogProps) {
  const { user } = useAuth();
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveCredentials = useProtectedMutation(
    api.platformCredentials.mutations.saveCredentials
  );
  const testConnection = useAction(
    api.integrations.grabfood.adapter.testConnection
  );

  const handleSaveAndTest = async () => {
    if (!clientId.trim() || !clientSecret.trim()) {
      setError("Client ID and Client Secret are required");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // 1. Save credentials (email=clientId, password=clientSecret per config convention)
      await saveCredentials({
        platformId: "grabfood",
        email: clientId.trim(),
        password: clientSecret.trim(),
      });

      // 2. Test OAuth2 connection
      if (!user?.token) {
        throw new Error("Not authenticated");
      }
      const result = await testConnection({ token: user.token });

      if (result.success) {
        toast.success("GrabFood credentials saved and OAuth2 token verified");
        setClientId("");
        setClientSecret("");
        onOpenChange(false);
      } else {
        setError(result.error ?? "OAuth2 token fetch failed");
        toast.error("Credentials saved but connection test failed");
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
          <DialogTitle>GrabFood API Credentials</DialogTitle>
          <DialogDescription>
            Enter your GrabFood Partner API credentials (OAuth2 client
            credentials). Found in the Grab Developer Portal.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="grab-client-id">Client ID</Label>
            <Input
              id="grab-client-id"
              type="text"
              placeholder="Enter Client ID"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              disabled={saving}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="grab-client-secret">Client Secret</Label>
            <Input
              id="grab-client-secret"
              type="password"
              placeholder="Enter Client Secret"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              disabled={saving}
            />
          </div>

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          <Button
            onClick={handleSaveAndTest}
            disabled={saving || !clientId.trim() || !clientSecret.trim()}
            className="w-full min-h-[44px]"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving & Testing...
              </>
            ) : (
              "Save & Test Connection"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
