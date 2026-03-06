/**
 * StoreStatusTab - GrabFood store status with pause/unpause controls.
 * Extracted from GrabFoodManager.tsx for maintainability.
 */

import { useState, useEffect, useCallback } from "react";
import {
  Store,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

import { formatRelativeTime } from "@/lib/formatters";
import { useGrabFoodActions } from "@/hooks/convex/useGrabFood";

export interface StoreStatusTabProps {
  merchantID: string;
  outletName?: string;
}

export function StoreStatusTab({ merchantID, outletName }: StoreStatusTabProps) {
  const actions = useGrabFoodActions();
  const [loading, setLoading] = useState(false);
  const [pausing, setPausing] = useState(false);
  const [storeData, setStoreData] = useState<any>(null);
  const [lastChecked, setLastChecked] = useState<number | null>(null);
  const [pauseUntil, setPauseUntil] = useState<number | null>(null);
  const [countdown, setCountdown] = useState("");

  const fetchStatus = useCallback(async () => {
    if (!merchantID) return;
    setLoading(true);
    try {
      const result = await actions.getStoreStatus(merchantID);
      if (result.success) {
        setStoreData(result.storeStatus);
        setLastChecked(Date.now());
      } else {
        toast.error(result.error ?? "Failed to fetch store status");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to fetch status");
    } finally {
      setLoading(false);
    }
  }, [merchantID, actions]);

  // Fetch on mount or merchantID change
  useEffect(() => {
    if (merchantID) {
      fetchStatus();
    }
  }, [merchantID]); // eslint-disable-line react-hooks/exhaustive-deps

  // Countdown timer for paused state
  useEffect(() => {
    if (!pauseUntil) {
      setCountdown("");
      return;
    }

    const update = () => {
      const remaining = pauseUntil - Date.now();
      if (remaining <= 0) {
        setCountdown("Resuming...");
        setPauseUntil(null);
        return;
      }
      const mins = Math.ceil(remaining / 60_000);
      setCountdown(`Resumes in ${mins}m`);
    };

    update();
    const interval = setInterval(update, 30_000);
    return () => clearInterval(interval);
  }, [pauseUntil]);

  const handlePause = async (duration: number) => {
    if (!merchantID) return;
    setPausing(true);
    try {
      const result = await actions.pauseStore(merchantID, duration);
      if (result.success) {
        toast.success(result.message);
        setPauseUntil(Date.now() + duration * 60_000);
        await fetchStatus();
      } else {
        toast.error(result.error ?? "Failed to pause store");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to pause store");
    } finally {
      setPausing(false);
    }
  };

  const handleUnpause = async () => {
    if (!merchantID) return;
    setPausing(true);
    try {
      const result = await actions.unpauseStore(merchantID);
      if (result.success) {
        toast.success(result.message);
        setPauseUntil(null);
        await fetchStatus();
      } else {
        toast.error(result.error ?? "Failed to unpause store");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to unpause store");
    } finally {
      setPausing(false);
    }
  };

  // Derive status from store data -- use closeReason from API to detect paused state
  const isOpen = storeData?.isOpen === true;
  const apiPaused = storeData?.closeReason === "mex_paused" || storeData?.closeReason === "ops_paused";
  const isPaused = apiPaused || (pauseUntil !== null && pauseUntil > Date.now());
  const statusLabel = isPaused ? "PAUSED" : isOpen ? "OPEN" : "CLOSED";
  const statusVariant = isPaused
    ? "outline"
    : isOpen
      ? "default"
      : "destructive";
  const statusColor = isPaused
    ? "bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-300"
    : "";

  if (!merchantID) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Select an outlet to view store status.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Store className="h-5 w-5" />
                {outletName ?? "Store"}
              </CardTitle>
              <CardDescription className="mt-1">
                MerchantID: {merchantID}
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchStatus}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              <span className="ml-1">Refresh Status</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {storeData === null && !loading ? (
            <p className="text-muted-foreground text-sm">
              Click Refresh Status to check the store.
            </p>
          ) : loading && storeData === null ? (
            <Skeleton className="h-16 w-full" />
          ) : (
            <div className="space-y-4">
              {/* Status badge */}
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium">Status:</span>
                <Badge
                  variant={statusVariant as any}
                  className={statusColor}
                >
                  {statusLabel}
                </Badge>
                {isPaused && countdown && (
                  <span className="text-sm text-yellow-600 dark:text-yellow-400 font-medium">
                    {countdown}
                  </span>
                )}
              </div>

              {/* Last checked */}
              {lastChecked && (
                <p className="text-xs text-muted-foreground">
                  Last checked: {formatRelativeTime(lastChecked)}
                </p>
              )}

              {/* Pause / Unpause controls */}
              <div className="flex gap-2 pt-2">
                {isOpen && !isPaused && (
                  <>
                    <span className="text-sm self-center mr-1">Pause for:</span>
                    {([{ mins: 30, label: "30 min" }, { mins: 60, label: "1 hour" }, { mins: 1440, label: "24 hours" }] as const).map(({ mins, label }) => (
                      <Button
                        key={mins}
                        variant="outline"
                        size="sm"
                        disabled={pausing}
                        onClick={() => handlePause(mins)}
                      >
                        {pausing ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          label
                        )}
                      </Button>
                    ))}
                  </>
                )}
                {isPaused && (
                  <Button
                    variant="default"
                    size="sm"
                    disabled={pausing}
                    onClick={handleUnpause}
                  >
                    {pausing ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        Unpausing...
                      </>
                    ) : (
                      "Unpause Store"
                    )}
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
