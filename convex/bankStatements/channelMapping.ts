/**
 * Channel-to-externalSource mapping helper (C1 from staff review).
 *
 * Bank `bankStatementLines.linkedChannel` is free-form (set by rule seed or
 * learn-from-override); `externalRevenue.source` is a strict 8-literal union
 * (see convex/schema.ts `externalSource` and convex/lib/externalSource.ts
 * `EXTERNAL_SOURCES`). Joining directly on channel would produce `Diff=infinity`
 * whenever a free-form channel string doesn't literally match an externalSource
 * literal — masking whether the gap is real revenue leakage or just a
 * channel-without-source-tracking case.
 *
 * This helper provides an explicit table from free-form channel to the
 * canonical externalSource union (or `null` when the channel is not tracked
 * in externalRevenue). revenueGapByPeriod splits rows into mapped + unmapped
 * groups so the UI can render "channel not tracked" instead of Diff=infinity.
 *
 * @see convex/schema.ts — externalSource validator
 * @see convex/lib/externalSource.ts — EXTERNAL_SOURCES runtime array
 * @see .planning/phases/73-bank-reconciliation-ui-workflow/73-CONTEXT.md — D-14 (C1)
 */

import type { ExternalSource } from "../lib/externalSource";

/**
 * Channel keys are lowercase. Look up via lowercased+trimmed input in
 * `mapChannelToSource`.
 *
 * Notes:
 * - `gopay`, `gofood` → `gobiz` (GoBiz aggregator payment rail)
 * - `tokopedia` → `null` (Tokopedia merged with TikTok Shop under key "tiktok";
 *   raw "tokopedia" channel string is unmapped at the channel layer)
 * - `ovo`, `dana` → `null` (payment wallets, no externalRevenue source)
 * - `bca`, `mandiri` → `internal` (intra-account transfer)
 */
export const CHANNEL_TO_SOURCE: Readonly<Record<string, ExternalSource | null>> = {
  gopay: "gobiz",
  gofood: "gobiz",
  grabfood: "grabfood",
  shopeefood: "shopee",
  shopee: "shopee",
  tiktok: "tiktok",
  tokopedia: null,
  ovo: null,
  dana: null,
  bca: "internal",
  mandiri: "internal",
};

/**
 * Map a free-form bank `linkedChannel` to an ExternalSource literal.
 *
 * Returns `null` for:
 * - `undefined`, `null`, or empty-string input
 * - Unknown keys (any channel not in CHANNEL_TO_SOURCE)
 * - Explicitly unmapped channels (tokopedia, ovo, dana)
 *
 * Matching is case-insensitive and whitespace-trimmed.
 */
export function mapChannelToSource(
  channel: string | undefined | null,
): ExternalSource | null {
  if (!channel) return null;
  const key = channel.trim().toLowerCase();
  if (!key) return null;
  // Explicit hasOwnProperty check — undefined in the map means "unknown key"
  // (returns null); a null value means "known but untracked" (also null).
  if (!Object.prototype.hasOwnProperty.call(CHANNEL_TO_SOURCE, key)) return null;
  return CHANNEL_TO_SOURCE[key] ?? null;
}
