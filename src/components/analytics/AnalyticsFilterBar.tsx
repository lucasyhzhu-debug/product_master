import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  useAnalyticsFilters,
  DISPLAY_CHANNELS,
  type DisplayChannel,
} from "@/contexts/AnalyticsFilterContext";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function presetRange(days: number) {
  const now = Date.now();
  return { fromTs: now - days * 86400000, toTs: now };
}

// C3: WIB-aware formatter that round-trips with fromDateInput (both UTC+7 aligned).
// Using `.toISOString().slice(0,10)` would emit a UTC date, shifting the picker
// one day backwards in the afternoon WIB (e.g. 2026-04-15 → 2026-04-14).
function toDateInput(ts: number): string {
  const d = new Date(ts + 7 * 60 * 60 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function fromDateInput(value: string, endOfDay = false): number {
  if (!value) return Date.now();
  // WIB midnight (UTC+7). Backend windows and bucket keys are WIB-aligned;
  // parsing as UTC would shift the intended window by 7 hours.
  const base = new Date(value + "T00:00:00+07:00").getTime();
  return endOfDay ? base + 86400000 - 1 : base;
}

export function AnalyticsFilterBar() {
  const { filters, setFilters } = useAnalyticsFilters();
  // I1: populate product multi-select. `activeOnly: true` keeps the menu short.
  const menuProducts = useQuery(api.menuProducts.queries.list, { activeOnly: true });

  const toggleChannel = (ch: DisplayChannel) => {
    const set = new Set(filters.channels);
    if (set.has(ch)) set.delete(ch);
    else set.add(ch);
    setFilters({ channels: Array.from(set) });
  };

  const toggleProduct = (id: Id<"menuProducts">) => {
    const set = new Set<string>(filters.menuProductIds as string[]);
    if (set.has(id as string)) set.delete(id as string);
    else set.add(id as string);
    setFilters({ menuProductIds: Array.from(set) as Id<"menuProducts">[] });
  };

  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3 shadow-sm">
      <span className="text-xs font-semibold text-muted-foreground">Filters:</span>
      <Button size="sm" variant="outline" onClick={() => setFilters(presetRange(7))}>
        7d
      </Button>
      <Button size="sm" variant="outline" onClick={() => setFilters(presetRange(30))}>
        30d
      </Button>
      <Button size="sm" variant="outline" onClick={() => setFilters(presetRange(90))}>
        90d
      </Button>

      <Popover>
        <PopoverTrigger asChild>
          <Button size="sm" variant="outline">
            Custom range
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 space-y-2">
          <div className="space-y-1">
            <Label htmlFor="filter-from" className="text-xs">
              From
            </Label>
            <Input
              id="filter-from"
              type="date"
              value={toDateInput(filters.fromTs)}
              onChange={(e) =>
                setFilters({ fromTs: fromDateInput(e.target.value, false) })
              }
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="filter-to" className="text-xs">
              To
            </Label>
            <Input
              id="filter-to"
              type="date"
              value={toDateInput(filters.toTs)}
              onChange={(e) =>
                setFilters({ toTs: fromDateInput(e.target.value, true) })
              }
            />
          </div>
        </PopoverContent>
      </Popover>

      <Popover>
        <PopoverTrigger asChild>
          <Button size="sm" variant="outline">
            Channels: {filters.channels.length || "All"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56">
          <div className="space-y-2">
            {DISPLAY_CHANNELS.map((ch) => (
              <label key={ch} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={filters.channels.includes(ch)}
                  onCheckedChange={() => toggleChannel(ch)}
                />
                {ch}
              </label>
            ))}
            {filters.channels.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                className="w-full"
                onClick={() => setFilters({ channels: [] })}
              >
                Clear
              </Button>
            )}
          </div>
        </PopoverContent>
      </Popover>

      <Popover>
        <PopoverTrigger asChild>
          <Button size="sm" variant="outline">
            Products: {filters.menuProductIds.length || "All"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64">
          {menuProducts === undefined ? (
            <div className="text-xs text-muted-foreground">Loading…</div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {menuProducts.map((p) => {
                const id = p._id as Id<"menuProducts">;
                const checked = (filters.menuProductIds as string[]).includes(
                  id as string,
                );
                return (
                  <label key={id as string} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggleProduct(id)}
                    />
                    {p.name}
                  </label>
                );
              })}
              {filters.menuProductIds.length > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="w-full"
                  onClick={() => setFilters({ menuProductIds: [] })}
                >
                  Clear
                </Button>
              )}
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
