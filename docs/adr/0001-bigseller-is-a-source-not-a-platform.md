# BigSeller is a Source, not a Platform

## Status

accepted

## Context

BigSeller is an external aggregation service that exposes our Shopee and TikTok transaction data via its own API + credential. We do not pull from Shopee or TikTok directly through that pipeline — we authenticate to BigSeller, and BigSeller returns rows that originated on Shopee or TikTok.

The domain has three concepts for "where a transaction came from": **Source** (the data pipeline we pulled from), **Order channel** (the customer touchpoint), and **Platform** (the semantic conversion bucket). BigSeller could plausibly fit as either a Source or, if dropped, as a hidden fetcher that tags rows with the underlying Platform's Source directly.

## Decision

BigSeller is a **Source** (`externalRevenue.source = "bigseller"`). Each BigSeller-pulled row also carries an **Underlying source** field (`shopee` or `tiktok`) that names the actual conversion Platform.

Platform resolution for non-aggregator Sources reads `source` directly. For BigSeller rows, Platform resolution reads `underlyingSource` instead.

## Considered Options

- **Option A (chosen).** Keep `bigseller` in the Source union; add `underlyingSource: "shopee" | "tiktok"` on rows where `source = "bigseller"`.
- **Option B (rejected).** Drop `bigseller` from the Source union; tag BigSeller-pulled rows with the underlying Platform's Source directly (`shopee` or `tiktok`).

## Consequences

- Confidence stays honest. `getChannelRevenueConfidence` can score `bigseller` as `inferred` (CSV-aggregated, fields may be stale) without conflating it with `shopee`-direct (live API, `exact`). Option B would have forced a single confidence per Source and either over-trusted BigSeller or under-trusted direct Shopee.
- Audit trail is preserved. We can always answer "did this row come from the Shopee API or from BigSeller's CSV?" — useful for debugging reconciliation drift.
- A schema change is required: add `underlyingSource: v.optional(v.union(v.literal("shopee"), v.literal("tiktok")))` to `externalRevenue`. Until that ships, BigSeller rows can't be attributed to a Platform reliably.
- Reversing this decision means migrating every BigSeller row in production — not a one-line code change.
