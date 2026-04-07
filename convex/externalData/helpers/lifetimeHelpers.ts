/**
 * Lifetime aggregation helpers for the hero card.
 * Pure functions that compute total balls and revenue from pre-fetched data.
 */
import type { Doc } from "../../_generated/dataModel";

/**
 * Fallback average revenue per ball in IDR, used only when zero BOM-linked
 * products exist (cold start / no product mappings yet).
 * Once any products are mapped, the dynamic weighted average takes over.
 */
const FALLBACK_REVENUE_PER_BALL = 35_000;

/**
 * Compute lifetime totals from pre-fetched table data.
 * Resolves BOM to count actual balls, computes dynamic avgRevenuePerBall.
 *
 * @param items - All externalRevenueItems records
 * @param revenues - All externalRevenue records
 * @param bomComponents - All menuProductComponents records
 * @param componentTypes - All componentTypes records
 */
export function computeLifetimeTotals(
  items: Doc<"externalRevenueItems">[],
  revenues: Doc<"externalRevenue">[],
  bomComponents: Doc<"menuProductComponents">[],
  componentTypes: Doc<"componentTypes">[]
): {
  totalBalls: number;
  lifetimeRevenue: number;
  lifetimeTransactions: number;
  avgRevenuePerBall: number;
} {
  // Aggregate lifetime totals from externalRevenue
  let lifetimeRevenue = 0;
  let lifetimeTransactions = 0;
  for (const rev of revenues) {
    lifetimeRevenue += rev.revenueGross ?? 0;
    lifetimeTransactions += rev.transactionCount ?? 1;
  }

  // Delegate ball estimation to computePiecesSold (shared BOM resolution logic)
  const totalBalls = computePiecesSold(items, lifetimeRevenue, bomComponents, componentTypes);

  // Recompute avgRevenuePerBall for the return value (used by UI "Est. at X/ball")
  const avgRevenuePerBall = totalBalls > 0
    ? lifetimeRevenue / totalBalls
    : FALLBACK_REVENUE_PER_BALL;

  return { totalBalls, lifetimeRevenue, lifetimeTransactions, avgRevenuePerBall };
}

/**
 * Compute pieces (balls) sold for a given set of revenue items and gross revenue.
 * Resolves BOM to count actual balls for linked items, then estimates total
 * using avgRevenuePerBall (dynamic from known items, or FALLBACK_REVENUE_PER_BALL).
 *
 * Used by period-filtered hero cards (as opposed to computeLifetimeTotals which
 * operates on all-time data).
 *
 * @param items - externalRevenueItems for the period
 * @param periodGrossRevenue - sum of revenueGross from externalRevenue records
 * @param bomComponents - all menuProductComponents records
 * @param componentTypes - all componentTypes records
 */
export function computePiecesSold(
  items: Doc<"externalRevenueItems">[],
  periodGrossRevenue: number,
  bomComponents: Doc<"menuProductComponents">[],
  componentTypes: Doc<"componentTypes">[]
): number {
  // Build set of production component type IDs (BIG_BALL, MID_BALL, etc.)
  const productionComponentIds = new Set(
    componentTypes
      .filter((ct) => ct.category === "production")
      .map((ct) => ct._id as string)
  );

  // Build menuProductId -> total ball count map from BOM
  const menuProductBallCount = new Map<string, number>();
  for (const comp of bomComponents) {
    if (productionComponentIds.has(comp.componentTypeId as string)) {
      const existing = menuProductBallCount.get(comp.menuProductId as string) ?? 0;
      menuProductBallCount.set(comp.menuProductId as string, existing + comp.quantity);
    }
  }

  // Calculate dynamic avgRevenuePerBall from BOM-linked items
  let knownRevenue = 0;
  let knownBalls = 0;

  for (const item of items) {
    if (!item.linkedMenuProductId) continue;
    const ballsPerProduct = menuProductBallCount.get(item.linkedMenuProductId as string);
    if (!ballsPerProduct || ballsPerProduct <= 0) continue;
    knownRevenue += item.totalPrice;
    knownBalls += item.quantity * ballsPerProduct;
  }

  const avgRevenuePerBall = knownBalls > 0
    ? knownRevenue / knownBalls
    : FALLBACK_REVENUE_PER_BALL;

  return periodGrossRevenue > 0
    ? Math.round(periodGrossRevenue / avgRevenuePerBall)
    : 0;
}
