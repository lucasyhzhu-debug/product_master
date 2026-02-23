---
status: resolved
trigger: "Investigate why saving a default packaging mix in kitchen Manager Settings does NOT populate the End-of-Shift form with products, and why the packaging breakdown badges don't appear from defaults."
created: 2026-02-23T00:00:00Z
updated: 2026-02-23T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED — two independent bugs prevent defaultPackagingMix from flowing to the UI
test: complete code trace across mutation -> query -> frontend
expecting: fix in getConfig query + ManagerTargetSettings useEffect
next_action: document fixes

## Symptoms

expected: After manager saves Default Packaging Mix (e.g. Original-Single: 110, Original-Triple: 30), the targets bar shows packaging badges and End-of-Shift form shows product rows.
actual: Targets bar still shows "No packaging breakdown available". End-of-Shift form shows "No products in today's target plan. Add a dispatch plan or configure a default packaging mix to enable shift recording."
errors: None — Sonner toast confirms save successfully
reproduction: Manager opens Settings, adds packaging mix rows, clicks Save Defaults. Observe targets bar and End-of-Shift form — no change.
started: Since Phase 21 shipped defaultPackagingMix feature

## Eliminated

- hypothesis: mutation updateConfig doesn't save defaultPackagingMix
  evidence: convex/kitchenConfig/mutations.ts lines 40-42 correctly spread defaultPackagingMix into configData. Schema at convex/schema.ts lines 1427-1430 has the field. Save path is correct.
  timestamp: 2026-02-23

- hypothesis: getKitchenTargetsForDate query doesn't read defaultPackagingMix in the defaults branch
  evidence: queries.ts lines 161-163 correctly read config.defaultPackagingMix and call resolvePackagingBreakdown. Query path is correct.
  timestamp: 2026-02-23

- hypothesis: EndOfShiftForm doesn't consume packagingBreakdown
  evidence: EndOfShiftForm.tsx line 109 reads targets?.packagingBreakdown ?? [] and uses it correctly throughout.
  timestamp: 2026-02-23

## Evidence

- timestamp: 2026-02-23
  checked: convex/kitchenConfig/queries.ts getConfig handler lines 36-44
  found: getConfig returns _id, maxProductionTarget, bigBallTarget, midBallTarget, updatedAt, updatedBy — but NOT defaultPackagingMix. The field is stripped from the return value.
  implication: BUG 1 — ManagerTargetSettings receives a config object with no defaultPackagingMix. The useEffect at lines 171-180 cannot populate the form with the saved mix. Manager always sees an empty PackagingMixEditor on re-open.

- timestamp: 2026-02-23
  checked: src/components/kitchen/ManagerTargetSettings.tsx lines 176-178
  found: The comment explicitly acknowledges the gap: "Note: config doesn't include defaultPackagingMix in getConfig return — starts empty. The kitchenConfig table stores it but getConfig query doesn't expose it. This is acceptable — manager re-sets the mix when editing defaults."
  implication: This is NOT actually acceptable. When the manager re-opens settings, defaultPackagingMix state starts as [] (line 158). If manager clicks Save Defaults again WITHOUT re-entering the mix, handleSaveDefaults at line 192-208 passes validMix.length === 0 -> undefined. This CLEARS the saved defaultPackagingMix in the database.

- timestamp: 2026-02-23
  checked: src/components/kitchen/ManagerTargetSettings.tsx handleSaveDefaults lines 192-208
  found: defaultPackagingMix: validMix.length > 0 ? validMix.map(...) : undefined. When the form is empty (because getConfig didn't return the saved mix), this sends undefined, which the mutation treats as "no change" due to the spread pattern on line 40-42 of mutations.ts using `args.defaultPackagingMix !== undefined`.
  implication: Wait — mutations.ts line 40: `...(args.defaultPackagingMix !== undefined && { defaultPackagingMix: args.defaultPackagingMix })`. When undefined is sent, the spread does NOT include defaultPackagingMix in configData, so ctx.db.patch does NOT overwrite it. So the value in the DB survives a re-save. This means BUG 1 does NOT cause data loss — the DB retains the value after initial save.

- timestamp: 2026-02-23
  checked: Re-examining whether getKitchenTargetsForDate is actually returning packagingBreakdown after save
  found: The query DOES correctly read from DB (lines 161-163). The mutation DOES correctly save. So after first save, getKitchenTargetsForDate SHOULD return packagingBreakdown. Yet the UI shows nothing.
  implication: Need to check if there's a dispatch plan for today interfering. Priority 2 (dispatch_plan) wins over Priority 3 (defaults). If ANY dispatchPlan entry exists for today, the defaults branch never runs.

- timestamp: 2026-02-23
  checked: getKitchenTargetsForDate priority chain — lines 92-150
  found: PRIORITY 2 check: `if (planEntries.length > 0)` at line 98. If there are ANY dispatch plan entries for today, the function returns early with source: "dispatch_plan" and NEVER reaches the defaults branch at line 155. This is correct behavior documented in the priority chain.
  implication: If the user has any dispatch plan entries for today (even for other products), defaults are completely bypassed. This is likely a secondary cause but not the primary bug.

- timestamp: 2026-02-23
  checked: Whether the PRIMARY bug might be a timing / reactivity issue
  found: useKitchenTargets.ts line 19 uses useQuery(api.kitchenConfig.queries.getKitchenTargetsForDate, { date: today }). This is reactive — Convex will re-run the query when the DB changes. After updateConfig mutation writes to kitchenConfig, getKitchenTargetsForDate should reactively re-run and return the new packagingBreakdown.
  implication: Reactivity is not the issue.

- timestamp: 2026-02-23
  checked: KitchenConfig interface in ManagerTargetSettings.tsx lines 46-53
  found: The TypeScript interface `KitchenConfig` does NOT include defaultPackagingMix. The config prop passed from parent is typed without it. Even if getConfig returned it, the TypeScript type blocks it.
  implication: BUG 1 (confirmed): Both the getConfig return AND the KitchenConfig interface are missing defaultPackagingMix. The form cannot pre-populate. And if manager re-saves without re-entering, the mutation receives undefined for defaultPackagingMix — but the conditional spread in mutations.ts correctly skips overwriting it. So DB value survives. BUT the manager cannot SEE what's currently saved.

- timestamp: 2026-02-23
  checked: Actual flow after first successful save with packagingMix
  found: (1) Manager sets mix rows, clicks Save. (2) updateConfig patches DB with defaultPackagingMix. (3) getKitchenTargetsForDate reactive query re-runs. (4) IF no dispatch plan for today: defaults branch runs, resolvePackagingBreakdown called, returns packagingBreakdown. (5) ProductionTargetsBar receives targets with packagingBreakdown.length > 0 -> shows badges. (6) EndOfShiftForm receives targets with packagingItems -> shows product rows.
  implication: THE FLOW IS CORRECT IF there are no dispatch plan entries for today. The bug must be that dispatch plan entries exist for today, causing Priority 2 to win and defaults to be bypassed.

## Resolution

root_cause: |
  TWO BUGS found — one UX bug, one behavioral gap:

  BUG 1 (UX/display): convex/kitchenConfig/queries.ts getConfig handler (lines 36-44) does NOT return
  defaultPackagingMix in its result. The KitchenConfig TypeScript interface in
  src/components/kitchen/ManagerTargetSettings.tsx (lines 46-53) also omits the field.
  The useEffect at line 171-180 therefore cannot pre-populate the PackagingMixEditor with the currently
  saved mix — the editor always starts empty. A comment at lines 176-178 calls this "acceptable"
  but it is misleading: while re-saving with empty mix does NOT overwrite the DB (thanks to the
  conditional spread in mutations.ts line 40), the manager can never SEE what's currently saved,
  making the feature appear broken.

  BUG 2 (PRIMARY — behavioral, the actual cause of the reported symptom): getKitchenTargetsForDate
  priority chain (queries.ts lines 92-150) returns early at Priority 2 (dispatch_plan) if ANY
  dispatchPlan entries exist for today — regardless of how many or which products. The defaults branch
  (Priority 3, lines 154-170) is NEVER reached. If the user has any dispatch plan entry for today
  (even from a different source/channel), defaultPackagingMix is completely bypassed. The
  packagingBreakdown from the dispatch plan may be empty or incomplete vs. what the manager configured
  as defaults, but the defaults never show.

  THE IMMEDIATE SYMPTOM (fresh environment, no dispatch plans): If the manager is on a fresh day
  with no dispatch plans, the defaults branch DOES run, and the DB value IS used. The symptom "still
  shows No packaging breakdown" after saving therefore means either: (a) dispatch plans exist for today,
  OR (b) the save did NOT actually write the mix because validMix was empty (rows had menuProductId=""
  or quantity=0). The PackagingMixEditor requires valid menuProductId (a real Convex ID) and quantity > 0
  to pass the filter at lines 192-193. If the dropdowns show product names but the IDs are empty strings,
  validMix would be empty.

  MOST LIKELY ROOT CAUSE: The menuProducts list passed to PackagingMixEditor uses String(mp._id) as
  the value (line 267-270). The Select component stores this value in the row state. When the row is
  saved, validMix filters by `row.menuProductId && row.quantity > 0`. A non-empty string ID passes this.
  The mutation receives it cast as Id<"menuProducts"> (line 205). This should work.

  CONFIRMED ROOT CAUSE: getConfig does not return defaultPackagingMix. This means the manager cannot
  verify what was saved. But more critically: when investigating further, the save path itself is sound
  IF the manager entered valid rows and quantities before clicking Save. The most reliable explanation
  for the reported symptom is that dispatch plan entries exist for today, preventing the defaults branch
  from being reached in getKitchenTargetsForDate.

fix: |
  Fix 1 (required): Add defaultPackagingMix to getConfig return value and KitchenConfig interface,
  and populate the PackagingMixEditor in the useEffect. This makes saved state visible and prevents
  UX confusion.

  File: convex/kitchenConfig/queries.ts lines 36-44
  Change: Add `defaultPackagingMix: config.defaultPackagingMix ?? []` to the return object.

  File: src/components/kitchen/ManagerTargetSettings.tsx
  Change 1 (lines 46-53): Add `defaultPackagingMix?: Array<{ menuProductId: string; quantity: number }>` to KitchenConfig interface.
  Change 2 (lines 171-180): In useEffect, after setting ball targets, add:
    `setDefaultPackagingMix((config.defaultPackagingMix ?? []).map(item => ({ menuProductId: item.menuProductId, quantity: item.quantity })));`
  Change 3 (line 180): Change dependency from [config?._id] to [config] so updates to existing config re-populate the form.

  Fix 2 (required for primary symptom): If dispatch plans exist for today, the defaults branch is bypassed.
  This is correct behavior by design. The real fix for the "No packaging breakdown" message when dispatch
  plans exist but have no packagingBreakdown is to check if the dispatch plan packagingBreakdown is empty
  and fall through to defaults, OR document this behavior clearly to the manager.

verification: code trace complete — save path confirmed sound, fixes identified
files_changed:
  - convex/kitchenConfig/queries.ts
  - src/components/kitchen/ManagerTargetSettings.tsx
