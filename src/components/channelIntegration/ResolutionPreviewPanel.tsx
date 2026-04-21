/**
 * Phase 74.5.1 Plan 09 — ResolutionPreviewPanel
 *
 * Read-only admin widget that previews the 5-tier `resolveChannelRoute`
 * precedence for a chosen (source, outlet?, product?) tuple. Used standalone
 * on the ChannelRoutingManager page (primary visual anchor per UI-SPEC) and
 * optionally inside the Add/Edit dialog to validate routing before save.
 *
 * States (per UI-SPEC §ChannelRoutingManager):
 *   - idle: no lookup triggered
 *   - loading: query undefined
 *   - success: `{ok:true, tier, storageLocationName}`
 *   - error: `{ok:false, tier:5, errorCode: CHANNEL_ROUTING_NOT_CONFIGURED}`
 */

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  EXTERNAL_SOURCES,
  sourceToPlatform,
  type ExternalSource,
} from "../../../convex/lib/externalSource";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { Search } from "lucide-react";

const ANY_SENTINEL = "__any__";

interface ResolutionPreviewPanelProps {
  /** Optional presets for embedded usage inside the edit dialog. */
  initialSource?: ExternalSource;
  initialOutletId?: Id<"externalOutlets">;
  initialMenuProductId?: Id<"menuProducts">;
}

export function ResolutionPreviewPanel({
  initialSource,
  initialOutletId,
  initialMenuProductId,
}: ResolutionPreviewPanelProps = {}) {
  const { user } = useAuth();
  const token = user?.token;

  const [source, setSource] = useState<ExternalSource | undefined>(
    initialSource,
  );
  const [outletId, setOutletId] = useState<Id<"externalOutlets"> | undefined>(
    initialOutletId,
  );
  const [menuProductId, setMenuProductId] = useState<
    Id<"menuProducts"> | undefined
  >(initialMenuProductId);
  const [triggered, setTriggered] = useState(false);

  const outlets = useQuery(
    api.externalData.queries.listOutlets,
    source ? { source } : {},
  );
  const menuProducts = useQuery(api.menuProducts.queries.list, {
    activeOnly: true,
  });

  const shouldQuery = triggered && !!source && !!token;
  const preview = useQuery(
    api.productInventory.channelRoutingQueries.previewRouteResolution,
    shouldQuery
      ? {
          token: token!,
          source: source!,
          outletId,
          menuProductId,
        }
      : "skip",
  );

  // Reset trigger whenever input tuple changes so admin re-clicks "Preview".
  const previewKey = useMemo(
    () => `${source ?? ""}|${outletId ?? ""}|${menuProductId ?? ""}`,
    [source, outletId, menuProductId],
  );
  const [lastKey, setLastKey] = useState<string>("");
  if (triggered && previewKey !== lastKey && shouldQuery) {
    // Allow setState-during-render only once per key change.
    setLastKey(previewKey);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Resolution Preview</CardTitle>
        <CardDescription>
          Try a (source, outlet, product) combination and see which tier
          resolves.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <label className="text-sm font-semibold">Source</label>
            <Select
              value={source ?? ""}
              onValueChange={(v) => {
                setSource(v as ExternalSource);
                setTriggered(false);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select source" />
              </SelectTrigger>
              <SelectContent>
                {EXTERNAL_SOURCES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {sourceToPlatform(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold">Outlet (optional)</label>
            <Select
              value={outletId ?? ANY_SENTINEL}
              onValueChange={(v) => {
                setOutletId(
                  v === ANY_SENTINEL
                    ? undefined
                    : (v as Id<"externalOutlets">),
                );
                setTriggered(false);
              }}
              disabled={!source || outlets === undefined}
            >
              <SelectTrigger>
                <SelectValue placeholder="Any outlet" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY_SENTINEL}>Any outlet</SelectItem>
                {(outlets ?? []).map((o) => (
                  <SelectItem key={o._id} value={o._id}>
                    {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold">Product (optional)</label>
            <Select
              value={menuProductId ?? ANY_SENTINEL}
              onValueChange={(v) => {
                setMenuProductId(
                  v === ANY_SENTINEL ? undefined : (v as Id<"menuProducts">),
                );
                setTriggered(false);
              }}
              disabled={menuProducts === undefined}
            >
              <SelectTrigger>
                <SelectValue placeholder="Any product" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY_SENTINEL}>Any product</SelectItem>
                {(menuProducts ?? []).map((p) => (
                  <SelectItem key={p._id} value={p._id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button
          onClick={() => setTriggered(true)}
          disabled={!source || !token}
          type="button"
        >
          <Search className="h-4 w-4" />
          Preview resolution
        </Button>

        {triggered && preview === undefined && (
          <Skeleton className="h-16 w-full" />
        )}

        {triggered && preview && preview.ok && (
          <Alert role="status">
            <AlertTitle>Tier {preview.tier} match</AlertTitle>
            <AlertDescription>
              Resolves to:{" "}
              <span className="font-semibold">{preview.storageLocationName}</span>
            </AlertDescription>
          </Alert>
        )}

        {triggered && preview && !preview.ok && (
          <Alert variant="destructive" role="status">
            <AlertTitle>Routing not configured</AlertTitle>
            <AlertDescription className="break-words">
              {preview.message}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
