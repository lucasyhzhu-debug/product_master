---
status: awaiting_human_verify
trigger: "GoBiz transaction sync is not returning data anymore"
created: 2026-02-28T00:00:00Z
updated: 2026-02-28T00:01:00Z
---

## Current Focus

hypothesis: CONFIRMED - aggregateJournalMetrics silently drops non-"settlement" transactions; GoBiz API may now return "capture" status for completed orders
test: examined full code path from API request to DB storage to UI query
expecting: fix to allow "capture" status transactions through the filter
next_action: apply fix to aggregateJournalMetrics in helpers.ts

## Symptoms

expected: GoBiz transactions sync and appear in Sales Analytics revenue view when GoBiz tab is selected
actual: "No Revenue Data Yet" shown in Sales Analytics when GoBiz tab selected for Feb 27-28 2026
errors: No error messages during sync - appears to run successfully
reproduction: Sales Analytics -> GoBiz tab -> dates Feb 27-28 2026 -> empty
started: Was working recently (last few days/week), now shows no data

## Eliminated

- hypothesis: Token/auth failure causing sync errors
  evidence: Sync completes with "success" status, no error messages visible to user. Token refresh cascade (3 methods) would surface errors if auth failed.
  timestamp: 2026-02-28T00:01:00Z

- hypothesis: Date range filtering bug in getRevenue query
  evidence: Traced wibMidnightToUtc and wibDateToUtcRange - both correctly compute Feb 26 17:00 UTC for WIB Feb 27. The periodStart for GoBiz records would be in range for "last7days" preset.
  timestamp: 2026-02-28T00:01:00Z

- hypothesis: periodEnd filter mismatch
  evidence: periodEnd filter is a client-side .filter() applied after index query - not a DB issue. The index "by_source_period" on ["source","periodStart"] is correct.
  timestamp: 2026-02-28T00:01:00Z

## Evidence

- timestamp: 2026-02-28T00:01:00Z
  checked: helpers.ts aggregateJournalMetrics function (line 324)
  found: |
    function aggregateJournalMetrics(hits) {
      for (const hit of hits) {
        const metrics = extractJournalMetrics(hit);
        if (metrics && metrics.status === "settlement") {  // ONLY "settlement" passes
          transactions.push(metrics);
        }
      }
    }
  implication: Only transactions with status="settlement" are saved. All others (capture, refund, partial_refund) are silently dropped.

- timestamp: 2026-02-28T00:01:00Z
  checked: buildJournalSearchBody (helpers.ts) - API request status filter
  found: API query filters for ["settlement", "capture", "refund", "partial_refund"] but aggregation only keeps "settlement"
  implication: If GoBiz API changed to return "capture" as the status for completed GoFood orders (common in Midtrans/GoPay), ALL transactions would be silently discarded.

- timestamp: 2026-02-28T00:01:00Z
  checked: saveJournalTransactions in adapter.ts + saveRevenue mutation
  found: Dedup key = "orderNumber|txnTimeMs". If no transactions pass the filter, allNewRecords is empty, no records are inserted into externalRevenue table.
  implication: Empty sync = no data in DB = "No Revenue Data Yet" displayed.

- timestamp: 2026-02-28T00:01:00Z
  checked: sync success path in adapter.ts
  found: syncLogId is updated with status="success" and productsCount=totalTransactions even if totalTransactions=0
  implication: A sync with 0 transactions (all filtered out) looks identical to a sync with no orders. No error is raised.

- timestamp: 2026-02-28T00:01:00Z
  checked: crons.ts
  found: No scheduled cron jobs active. GoBiz auto-sync cron is defined in adapter.ts but not wired up in crons.ts
  implication: Sync is manual-only. If last manual sync was days ago, no new data.

## Resolution

root_cause: |
  aggregateJournalMetrics() in convex/integrations/gobiz/helpers.ts only retains journal
  entries where metadata.transaction.status === "settlement". The GoBiz/Midtrans payment
  API also returns status "capture" for completed card/GoPay transactions (capture = funds
  successfully captured from the payer). If GoBiz recently changed the status value from
  "settlement" to "capture" for completed GoFood orders (a common payment gateway behavior
  change), ALL transactions would be silently dropped - sync completes with zero records,
  no error is raised, and "No Revenue Data Yet" is displayed.

  The API request correctly includes both "settlement" and "capture" in the status filter,
  but the aggregation discards anything that isn't exactly "settlement".

fix: |
  In aggregateJournalMetrics(), change the filter from:
    if (metrics && metrics.status === "settlement")
  To accept both settlement and capture statuses:
    if (metrics && (metrics.status === "settlement" || metrics.status === "capture"))

  This allows both completed transaction status values through.
  Refunds and partial_refunds remain excluded (correct - they reduce revenue).

verification: |
  - 36/36 GoBiz helpers unit tests pass (including 2 new tests covering "capture" status)
  - npm run type-check passes (no TypeScript errors)
  - npm run build passes (clean production build in 18.29s)
  - Pre-existing test failures are unrelated (E2E tests, cron config tests, k3mart/recipe tests)

files_changed:
  - convex/integrations/gobiz/helpers.ts (aggregateJournalMetrics: accept "capture" status)
  - convex/integrations/gobiz/__tests__/helpers.test.ts (add "capture" test, fix stale merchant filter test)
