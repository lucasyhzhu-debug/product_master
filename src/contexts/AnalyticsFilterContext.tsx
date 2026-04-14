import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import type { Id } from "@convex/_generated/dataModel";

export type DisplayChannel =
  | "Shopee"
  | "Tokopedia"
  | "GoFood"
  | "K3Mart"
  | "Direct"
  | "Consignment"
  | "TikTok"
  | "Other";

export const DISPLAY_CHANNELS: DisplayChannel[] = [
  "Shopee",
  "Tokopedia",
  "GoFood",
  "K3Mart",
  "Direct",
  "Consignment",
  "TikTok",
  "Other",
];

export interface AnalyticsFilters {
  fromTs: number;
  toTs: number;
  channels: DisplayChannel[];
  menuProductIds: Id<"menuProducts">[];
}

const AnalyticsFilterContext = createContext<{
  filters: AnalyticsFilters;
  setFilters: (next: Partial<AnalyticsFilters>) => void;
} | null>(null);

export function AnalyticsFilterProvider({ children }: { children: ReactNode }) {
  const [params, setParams] = useSearchParams();

  const filters = useMemo<AnalyticsFilters>(() => {
    const now = Date.now();
    const defaultFrom = now - 30 * 86400000;
    const fromTs = Number(params.get("from")) || defaultFrom;
    const toTs = Number(params.get("to")) || now;
    const channels = (params.get("channels") ?? "")
      .split(",")
      .filter(Boolean) as DisplayChannel[];
    const menuProductIds = (params.get("products") ?? "")
      .split(",")
      .filter(Boolean) as Id<"menuProducts">[];
    return { fromTs, toTs, channels, menuProductIds };
  }, [params]);

  // Functional update against the live URLSearchParams so rapid sequential
  // setFilters() calls in the same tick do not stomp each other via the
  // render-time `filters` snapshot (see WR-03).
  const setFilters = (next: Partial<AnalyticsFilters>) => {
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        const now = Date.now();
        const defaultFrom = now - 30 * 86400000;
        const prevFromTs = Number(p.get("from")) || defaultFrom;
        const prevToTs = Number(p.get("to")) || now;
        const prevChannels = (p.get("channels") ?? "")
          .split(",")
          .filter(Boolean) as DisplayChannel[];
        const prevMenuProductIds = (p.get("products") ?? "")
          .split(",")
          .filter(Boolean) as Id<"menuProducts">[];

        const merged: AnalyticsFilters = {
          fromTs: next.fromTs ?? prevFromTs,
          toTs: next.toTs ?? prevToTs,
          channels: next.channels ?? prevChannels,
          menuProductIds: next.menuProductIds ?? prevMenuProductIds,
        };
        p.set("from", String(merged.fromTs));
        p.set("to", String(merged.toTs));
        if (merged.channels.length) p.set("channels", merged.channels.join(","));
        else p.delete("channels");
        if (merged.menuProductIds.length)
          p.set("products", merged.menuProductIds.join(","));
        else p.delete("products");
        return p;
      },
      { replace: true },
    );
  };

  return (
    <AnalyticsFilterContext.Provider value={{ filters, setFilters }}>
      {children}
    </AnalyticsFilterContext.Provider>
  );
}

export function useAnalyticsFilters() {
  const ctx = useContext(AnalyticsFilterContext);
  if (!ctx) throw new Error("useAnalyticsFilters must be used inside AnalyticsFilterProvider");
  return ctx;
}
