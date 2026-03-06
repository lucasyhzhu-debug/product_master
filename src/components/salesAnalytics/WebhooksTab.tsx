/**
 * WebhooksTab - GrabFood webhook endpoints and error display.
 * Extracted from GrabFoodManager.tsx for maintainability.
 */

import { useState } from "react";
import {
  Loader2,
  Copy,
  Eye,
  EyeOff,
  AlertTriangle,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

import { formatRelativeTime } from "@/lib/formatters";
import { useQuery } from "convex/react";
import { useProtectedMutation } from "@/hooks/convex/useProtectedMutation";
import { api } from "../../../convex/_generated/api";

const WEBHOOK_ENDPOINTS = [
  { method: "GET", path: "/api/grabfood/menu", label: "Get menu endpoint" },
  { method: "POST", path: "/api/grabfood/order", label: "Submit order endpoint" },
  { method: "POST", path: "/api/grabfood/order/state", label: "Push order state endpoint" },
  { method: "POST", path: "/api/grabfood/menu-sync", label: "Menu Sync Webhook" },
  { method: "POST", path: "/api/grabfood/integration-status", label: "Integration status" },
  { method: "POST", path: "/api/grabfood/menu/push", label: "Push Grab menu endpoint" },
] as const;

export function WebhooksTab() {
  // Sync error banner
  const webhookError = useQuery(api.externalData.queries.getLatestWebhookError, {
    source: "grabfood",
  });
  const [errorDismissed, setErrorDismissed] = useState(false);

  // HMAC Secret
  const [hmacSecret, setHmacSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [savingSecret, setSavingSecret] = useState(false);
  const saveHmacSecret = useProtectedMutation(
    api.platformCredentials.mutations.saveHmacSecret
  );

  const handleSaveSecret = async () => {
    if (!hmacSecret.trim()) {
      toast.error("HMAC secret cannot be empty");
      return;
    }
    setSavingSecret(true);
    try {
      await saveHmacSecret({
        platformId: "grabfood",
        hmacSecret: hmacSecret.trim(),
      });
      toast.success("HMAC secret saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save secret");
    } finally {
      setSavingSecret(false);
    }
  };

  // Webhook URLs
  const CONVEX_SITE_URL =
    import.meta.env.VITE_CONVEX_URL?.replace(".cloud", ".site") ?? "";

  const handleCopy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Copied!");
    } catch {
      // Fallback for non-HTTPS: select text for manual copy
      toast.error("Copy failed -- use HTTPS or copy manually");
    }
  };

  return (
    <div className="space-y-6">
      {/* Sync Error Banner */}
      {webhookError && !errorDismissed && (
        <div className="flex items-start gap-3 p-4 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700">
          <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
              Menu sync reported errors
            </p>
            <p className="text-sm text-amber-700 dark:text-amber-400 mt-0.5">
              {webhookError.errorMessage}
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-500 mt-1">
              {webhookError.timestamp ? formatRelativeTime(webhookError.timestamp) : "Unknown"}
            </p>
          </div>
          <button
            onClick={() => setErrorDismissed(true)}
            className="text-amber-600 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* HMAC Secret */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Webhook HMAC Secret</CardTitle>
          <CardDescription>
            From GrabFood Developer Portal &rarr; App Configuration &rarr; Webhook Authentication
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-md">
              <Input
                type={showSecret ? "text" : "password"}
                placeholder="Enter HMAC secret"
                value={hmacSecret}
                onChange={(e) => setHmacSecret(e.target.value)}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowSecret(!showSecret)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showSecret ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
            <Button
              onClick={handleSaveSecret}
              disabled={savingSecret || !hmacSecret.trim()}
            >
              {savingSecret ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : null}
              Save
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Webhook URLs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Webhook Endpoints</CardTitle>
          <CardDescription>
            Copy these URLs into GrabFood Developer Portal &rarr; App Configuration
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!CONVEX_SITE_URL ? (
            <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4" />
              Configure VITE_CONVEX_URL to display webhook URLs
            </div>
          ) : (
            <div className="space-y-2">
              {WEBHOOK_ENDPOINTS.map((ep) => {
                const fullUrl = `${CONVEX_SITE_URL}${ep.path}`;
                return (
                  <div
                    key={ep.path}
                    className="flex items-center gap-3 px-3 py-2 rounded-md border bg-muted/30"
                  >
                    <Badge
                      variant={ep.method === "GET" ? "default" : "secondary"}
                      className="font-mono text-xs w-14 justify-center shrink-0"
                    >
                      {ep.method}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{ep.label}</p>
                      <p className="text-xs font-mono text-muted-foreground truncate">
                        {fullUrl}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCopy(fullUrl)}
                      className="shrink-0"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
