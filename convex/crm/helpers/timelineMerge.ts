// Pure function — no convex/server imports, no Date.now() calls.
// Importable by both backend (Convex queries) and frontend.
import { ActivityCategory, EventType, eventTypeToCategory } from "../../lib/activityEvents";

export type TimelineItem = {
  id: string;
  eventType: EventType;
  at: number;
  actor?: string;
  title: string;
  detail: string;
  linkTo: { kind: string; id: string };
};

type BuildOptions = {
  /** Window: drop items older than now - sinceDays * 86400000 */
  sinceDays: number;
  /** Optional category filter (evaluated via eventTypeToCategory). Omit to include all. */
  types?: ActivityCategory[];
  /** Reference timestamp for the window. Defaults to Date.now() — pass explicitly in tests. */
  now?: number;
};

/**
 * Merges derived domain items + manually-logged activity items into a unified timeline.
 *
 * - Windowed: drops items with `at < now - sinceDays * 86400000`
 * - Sorted: DESC by `at`; stable tiebreaker: `id` DESC
 * - Filtered: when `types` is provided, only items whose eventTypeToCategory resolves to
 *   one of the listed categories are included
 */
export function buildCustomerTimeline(
  derived: TimelineItem[],
  logged: TimelineItem[],
  { sinceDays, types, now = Date.now() }: BuildOptions,
): { items: TimelineItem[] } {
  const cutoff = now - sinceDays * 86_400_000;

  const merged = [...derived, ...logged];

  const windowed = merged.filter((item) => item.at >= cutoff);

  const filtered =
    types && types.length > 0
      ? windowed.filter((item) => types.includes(eventTypeToCategory(item.eventType)))
      : windowed;

  // Sort DESC by `at`; stable tiebreaker: `id` DESC (string comparison)
  const sorted = filtered.slice().sort((a, b) => {
    if (b.at !== a.at) return b.at - a.at;
    return b.id > a.id ? 1 : b.id < a.id ? -1 : 0;
  });

  return { items: sorted };
}
