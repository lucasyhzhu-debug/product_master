# Deferred Items

Items intentionally deferred during phase execution — surfaced by reviews
but not blocking, or out-of-scope for the current phase. Each entry should
note source review/phase and rationale.

## Phase 81 Plan 03 triple-review nitpicks

Source: `docs/reviews/triple-review-81-03-platform-resolver-2026-05-11.md`

- **I4** — `source: "internal"` placeholder pattern in unitEconomics.ts
  orderChannel callsites. The `source` arg is required even when the
  resolver ignores it (orderChannel takes priority). Refinement: make
  `source` optional via discriminated union OR keep both optional with
  runtime "at least one" assertion. Pre-staffreview filed this as R2;
  executor judged it not worth the signature churn during the migration.
  Defer until next platform.ts touch — small enough to fold into any
  future API change.

- **I5** — CHANGELOG entry for D-02 + D-05 breaking changes. Plan 81-04
  explicitly owns CHANGELOG.md updates per the phase plan; not for the
  triple-review fix sweep.

- **R1** — Promote Test 10 skip-message body into a `// TODO(ADR-0001):`
  block above the `it.skip` so `grep -rn "TODO(ADR-0001)"` catches all 3
  sites (resolver JSDoc, resolver inline note, test file) rather than 2.

- **R3** — Promote local `displayPlatform` sugar from
  `ProductInventorySettings.tsx:106` into `platform.ts` itself as
  `displayPlatform(source: ExternalSource): string =
  platformDisplay(resolvePlatform({source}).platform)`. Saves ~5 chars
  at every callsite, locks the chain mechanically. Defer to a follow-up
  polish pass.

- **R3 (Phase-77 await cascade)** — When ADR-0001 schema field lands
  (`externalRevenue.underlyingSource` + `menuProducts.source`), the
  `linkedMenuProductId.source` lookup branch makes `resolvePlatform`
  return `Promise<{platform, confidence}>`. All 21 callsites will need
  `await`. Speculative — schema field landing has no scheduled phase yet.

- **Important 3 (URL param + CSV breaking changes)** — Plan 81-04
  CHANGELOG entry should call out: (a) saved analytics URLs with
  `?channels=Tokopedia` no longer filter (silently match nothing);
  (b) period-over-period CSVs labeled "GoFood" now exclude grabfood data
  (D-05 closes ambiguity 138). Optional URL-param normalizer (one-shot
  Tokopedia → TikTok migration in `AnalyticsFilterContext.tsx`) is
  recommended but deferred. User base small; ship CHANGELOG note in 81-04.

- **Important 2 (`source` placeholder)** — Same as I4 above; tracked for
  next platform.ts API touch.
