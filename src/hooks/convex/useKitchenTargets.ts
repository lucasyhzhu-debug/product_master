/**
 * Kitchen targets hook for the redesigned KitchenViewV2.
 *
 * Provides today's production targets (ball totals + packaging breakdown)
 * and today's shift records. Uses WIB (UTC+7) date, same as useKitchenProduction.ts.
 */

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

export function useKitchenTargets() {
  const today = useMemo(() => {
    const now = new Date();
    const wibNow = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    return wibNow.toISOString().slice(0, 10);
  }, []);

  const targets = useQuery(api.kitchenConfig.queries.getKitchenTargetsForDate, {
    date: today,
  });
  const todayShiftRecords = useQuery(
    api.kitchenShiftRecords.queries.getShiftRecordsByDate,
    { date: today }
  );

  return { today, targets, todayShiftRecords };
}
