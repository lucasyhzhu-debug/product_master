/**
 * Lifetime aggregation helpers for the hero card.
 * Pure functions that compute total balls and revenue from pre-fetched data.
 */
import type { Doc } from "../../_generated/dataModel";
import { isProductionUnit } from "../../reports/productionUnitHelpers";

/**
 * Fallback average revenue per ball in IDR, used only when zero BOM-linked
 * products exist (cold start / no product mappings yet).
 * Once any products are mapped, the dynamic weighted average takes over.
 */
const FALLBACK_REVENUE_PER_BALL = 35_000;

/**
 * Build a map from menuProductId -> total ball count from BOM.
 * Filters componentTypes to production-only, then sums BOM component quantities.
 *
 * Shared between lifetime and period-filtered computations.
 */
export function buildBallCountMap(
  bomComponents: Doc<"menuProductComponents">[],
  componentTypes: Doc<"componentTypes">[]
): Map<string, number> {
  // Phase 81 / D-01: canonical predicate (already-canonical rule shape — mechanical swap).
  const productionComponentIds = new Set(
    componentTypes
      .filter(isProductionUnit)
      .map((ct) => ct._id as string)
  );

  const menuProductBallCount = new Map<string, number>();
  for (const comp of bomComponents) {
    if (productionComponentIds.has(comp.componentTypeId as string)) {
      const existing = menuProductBallCount.get(comp.menuProductId as string) ?? 0;
      menuProductBallCount.set(comp.menuProductId as string, existing + comp.quantity);
    }
  }
  return menuProductBallCount;
}

/**
 * Compute avgRevenuePerBall from BOM-linked revenue items.
 * "Known" items have a linkedMenuProductId with production BOM components.
 * Returns the dynamic weighted average, or FALLBACK_REVENUE_PER_BALL when
 * no linked items exist.
 */
function computeAvgRevenuePerBall(
  items: Doc<"externalRevenueItems">[],
  menuProductBallCount: Map<string, number>
): { avgRevenuePerBall: number; knownBalls: number; knownRevenue: number } {
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

  return { avgRevenuePerBall, knownBalls, knownRevenue };
}

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
  const menuProductBallCount = buildBallCountMap(bomComponents, componentTypes);
  const { avgRevenuePerBall } = computeAvgRevenuePerBall(items, menuProductBallCount);

  // Aggregate lifetime totals from externalRevenue
  let lifetimeRevenue = 0;
  let lifetimeTransactions = 0;
  for (const rev of revenues) {
    lifetimeRevenue += rev.revenueGross ?? 0;
    lifetimeTransactions += rev.transactionCount ?? 1;
  }

  // Estimate total balls sold from lifetime gross revenue
  const totalBalls = lifetimeRevenue > 0
    ? Math.round(lifetimeRevenue / avgRevenuePerBall)
    : 0;

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
  const menuProductBallCount = buildBallCountMap(bomComponents, componentTypes);
  const { avgRevenuePerBall } = computeAvgRevenuePerBall(items, menuProductBallCount);

  return periodGrossRevenue > 0
    ? Math.round(periodGrossRevenue / avgRevenuePerBall)
    : 0;
}
