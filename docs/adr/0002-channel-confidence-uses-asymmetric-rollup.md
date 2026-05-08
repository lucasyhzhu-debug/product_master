# Channel Confidence uses an asymmetric rollup rule

## Status

accepted

## Context

Period P&L emits a `Confidence` value on every channel row. Two confidence axes feed into it:

- **Revenue confidence** — fixed per Source (`internal`/`gobiz`/`shopee`/`tiktok`/`grabfood`/`consignment` → `exact`; `k3mart` and unknowns → `inferred`).
- **Item COGS confidence** — `calculated` when `linkedMenuProductId` resolves through the BOM, `missing` otherwise. `exact` is structurally unreachable today (no FIFO actual-cost path).

The rollup rule for the channel-level value could plausibly take the worst of the two axes via `worstConfidence(revenue, cogs)` — every `calculated` COGS would then drag `exact` revenue down to `calculated`.

## Decision

The rollup is **asymmetric**: Revenue confidence is the baseline; the channel value downgrades to `missing` only when at least one item on the channel has `missing` Item COGS confidence. **`calculated` Item COGS does not downgrade `exact` Revenue confidence.**

```
channelConfidence = anyItemMissing
  ? worstConfidence(revenueConfidence, "missing")
  : revenueConfidence;
```

## Consequences

- Confidence on a channel row reads as a *revenue trust* signal. Users see `exact` and trust the revenue numbers; they don't see it pulled down to `calculated` just because COGS came from BOM resolution (which is the standard, expected path — not a quality penalty).
- `missing` COGS *does* bleed into the channel value, because at that point profit is unmeasurable and the consumer of the figure should be warned.
- A future FIFO actual-cost path that produces `exact` Item COGS will not change channel confidence at all (still bounded by Revenue confidence) — by design.
- A future reader who expects symmetric `worstConfidence` rollups will find this rule surprising. The justification is the asymmetry of meaning between the two axes, not the symmetry of the type.
- Reversing this decision changes every channel row's confidence value overnight — not a one-line revert in practice, since downstream UI assumptions ("exact = green badge") would all need to be re-evaluated.
