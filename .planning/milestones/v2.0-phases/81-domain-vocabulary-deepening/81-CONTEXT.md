# Phase 81: Domain Vocabulary Deepening - Context

**Gathered:** 2026-05-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Collapse three duplicated/inconsistent domain rule clusters into single sources of truth, per the 2026-05-08 graph-primed architecture review (`docs/reviews/architecture-review-2026-05-08-graph-primed-deepening-candidates.md`). Each cluster is a deepening opportunity that the project's `CONTEXT.md` and `CLAUDE.md` already name as canonical but does not yet enforce mechanically.

**In scope (4 plans expected — see D-08 ordering):**
- **C4** — `isProductionUnit(componentType)` predicate consolidation. Single export from `convex/reports/productionUnitHelpers.ts`. Replaces 5 hand-rolled filters (`unitEconomics.ts:458`, `lifetimeHelpers.ts:26`, `staffAttendance/aggregation.ts:186`, `menuProducts/mutations.ts:52`).
- **C3** — WIB date-string helper consolidation. Promote `toWibDateString`'s NaN-guard semantics into the canonical helper at `convex/lib/periodRange.ts`. Delete `getWibDateString` (gofoodDepot/helpers.ts), `toWibDateString` (staffAttendance/flagEngine.ts), `getWibDateStr` from `counter.ts` (re-export from periodRange or move outright), `utcToWibDateStr` (collapsed). Migrate test imports.
- **C1** — `Platform` literal union + `resolvePlatform(row)` + `platformDisplay(p)` exported from `convex/reports/platform.ts`. Migrates ~15 call sites off `sourceToPlatform` (`convex/lib/externalSource.ts`), `toDisplayChannel` and `sourceToDisplayChannel` (`convex/reports/channelTaxonomy.ts`). Deletes the three legacy mappers. Includes user-visible display-string rename (D-02).
- **Docs** — CONTEXT.md (root) and CLAUDE.md updates: close flagged ambiguities 134/138/139/141, tighten Cost→COGS chain to name `isProductionUnit`, fix CONTEXT.md line 223 to point to `periodRange.ts` (not `counter.ts`), cross-reference `isProductionUnit` from CLAUDE.md pitfall #11.

**Out of scope (deferred):**
- Period-comparison orchestrator extraction (Candidate 2 from review). Speculative; revisit after a third clone appears.
- `useProtectedMutation` adoption sweep (Candidate 5). High-effort, low-payoff; post-v2.0 cleanup phase.
- Adding `externalRevenue.underlyingSource` schema field. Required by ADR-0001 to fully resolve BigSeller rows; this phase ships forward-compatible (D-03). Schema field addition is a follow-on phase.
- Ingredient/component sub-domains (raw materials, recipes) — phase scope is reporting/aggregation rules only.

</domain>

<decisions>
## Implementation Decisions

### C4 — BOM production-component predicate
- **D-01:** Canonical rule is **`category === "production"` alone**. No `unit === "pcs"` requirement, no `gramsPerUnit !== undefined` requirement. Future-proofs for non-`pcs` production components (e.g., gram-denominated bulk batches) per CLAUDE.md rule 10's BOM unification trajectory. Predicate exported as `isProductionUnit(ct: ComponentTypeDoc): boolean` from `convex/reports/productionUnitHelpers.ts`.

### C1 — Platform resolver + display strings
- **D-02:** Full canonical rename ships in this phase. `"Tokopedia"` → `"TikTok"` everywhere (analytics charts, P&L, CSV exports, badges, color maps). `"K3 Mart"` → `"K3Mart"` (no space). Matches CONTEXT.md line 102 canonical names. CHANGELOG entry under "Changed". No PM gating required (treated as bug fix, not policy change — `sourceToPlatform("tiktok") = "Tokopedia"` is documented-wrong per the 2023 Tokopedia/TikTok-Shop merger note).
- **D-03:** `resolvePlatform` ships now with **graceful BigSeller fallback**. Schema field `externalRevenue.underlyingSource` does not exist yet; deferred to a follow-on phase. Until then, BigSeller rows resolve via `linkedMenuProductId` lookup when present (resolves to the linked product's source's Platform), else fall back to the transitional `"BigSeller"` Platform literal. The fallback path is documented inline + emits a Confidence downgrade to `"inferred"`. When `underlyingSource` lands, behavior tightens automatically without caller changes.
- **D-04:** **No `"Other"` Platform literal.** Union is exactly: `"Direct" | "GoFood" | "GrabFood" | "Shopee" | "TikTok" | "K3Mart" | "Consignment" | "BigSeller"`. `"BigSeller"` is documented as transitional — to be removed once the schema field lands and the fallback path is removed. Every Source must resolve cleanly. Matches CONTEXT.md line 102 / 135 ("the `Other` bucket is dropped — every Source must resolve cleanly").
- **D-05:** Resolution rules (codify in `resolvePlatform`):
  - `internal` → `Direct` (Order channel disambiguates touchpoint inside Direct, doesn't change Platform)
  - `gobiz` → `GoFood`
  - `grabfood` → `GrabFood` (do NOT collapse with `gobiz` — they are different Platforms; closes flagged ambiguity 138)
  - `shopee` → `Shopee`
  - `tiktok` → `TikTok` (NOT `Tokopedia`)
  - `k3mart` → `K3Mart` (no space)
  - `consignment` → `Consignment`
  - `bigseller` → resolve via `underlyingSource` if present; else via `linkedMenuProductId.source` lookup; else `BigSeller` transitional literal

### C3 — WIB date-string helper
- **D-06:** Canonical location is **`convex/lib/periodRange.ts`** (not `convex/lib/counter.ts`). CONTEXT.md line 223 to be updated as part of this phase's docs deliverable (overrides today's literal text). The helper is domain-neutral — it lives in periodRange.ts because that file already owns `WIB_OFFSET_MS`. `counter.ts` re-exports from periodRange for backward compat during the transition; final state deletes the re-export.
- **D-07:** Canonical name is `getWibDateStr(ms: number): string`. NaN-guard semantics from `toWibDateString` are promoted into the canonical (throws on non-finite input — fail-loud, no silent `"Invalid Date"` strings leaking into reports). The 3 duplicates (`getWibDateString`, `toWibDateString`, `utcToWibDateStr`) are deleted; test-only import in `summary.test.ts` is migrated.

### Sequencing + workflow
- **D-08:** Plan order is **C4 → C3 → C1 → Docs** (smallest/safest → largest/riskiest). Each ships as its own plan with its own merge to `main`, on a single feature branch `feature/81-domain-vocabulary-deepening`. C4 is mechanical (1 predicate + 5 swap-in sites); C3 is mechanical-rename (~10 imports); C1 is the largest (~15 callsites + Platform literal union cascade); Docs runs last so it can reference the just-merged code.
- **D-09:** **Triple-review on the C1 plan only** (per workflow `triple_review_gate`; type cascade is the highest-risk piece). C4 + C3 + Docs follow standard plan-phase + execute-phase. All four plans pass standard `code-review` gate.
- **D-10:** **No backwards-compat shims for the deleted helpers/mappers.** Per CLAUDE.md guidance ("Avoid backwards-compatibility hacks"), deleted exports are deleted outright in the same plan that adds the canonical replacement. ESLint guard (D-11) catches any reintroduction.

### Test strategy + regression guards
- **D-11:** **Table-driven tests** for both `resolvePlatform` and `isProductionUnit`. One test file per predicate, each table exhausting every input shape (for `resolvePlatform`: every `(source, underlyingSource?, linkedMenuProductId?, orderChannel?)` tuple including all BigSeller fallback paths; for `isProductionUnit`: every shape of `componentTypes` row — production/packaging × pcs/g × gramsPerUnit defined/undefined). For `getWibDateStr`: NaN-guard invariant test + 1:1 parity tests against the 3 helpers it replaces (each helper's existing test cases re-pointed to the canonical, then deleted).
- **D-12:** **ESLint `no-restricted-imports` rule** added in same plan as each consolidation, banning re-imports of the deleted exports: `sourceToPlatform`, `toDisplayChannel`, `sourceToDisplayChannel`, `getWibDateString`, `toWibDateString`, `getWibDateStr` from `convex/lib/counter.ts`. Each rule includes a `message` directive pointing to the canonical replacement. Prevents the next "WIB helper consolidation never fully shipped" (Phase 73 lesson).

### CONTEXT.md + CLAUDE.md edits (in scope)
- **D-13:** Edits to root `CONTEXT.md` + `CLAUDE.md` are part of phase 81 deliverables, executed in the final "Docs" plan after C1 lands:
  - Close flagged ambiguities 134, 138, 139, 141 in `CONTEXT.md` (each entry deleted or struck-through with the resolution noted).
  - Tighten "Cost → COGS chain" section to name `isProductionUnit` as the canonical predicate.
  - Fix `CONTEXT.md` line 223 to point to `periodRange.ts` (not `counter.ts`) per D-06.
  - Cross-reference `isProductionUnit` from `CLAUDE.md` Pitfall #11 (the deprecated `productionType`/`productionUnits` warning).
  - Add CLAUDE.md Pitfall entry: "Don't import the deleted resolvers — see ESLint rule" pointing to the new banned-imports list.

### Roadmap + milestone status
- **D-14:** **Phase 81 added to `.planning/ROADMAP.md` v2.0 milestone** (between Phase 80.3 and any deferred items) before plan-phase starts. Phase 81 does NOT close v2.0 by itself — v2.0 stays open as in-progress for any other inserts. Add as a doc-only commit during plan-phase (or before), not now in discuss-phase.

### Claude's Discretion
- Test file paths: Claude picks (`convex/reports/__tests__/platform.test.ts`, `convex/reports/__tests__/productionUnitHelpers.test.ts`, `convex/lib/__tests__/periodRange.test.ts` — match existing repo conventions).
- ESLint rule placement: Claude picks `.eslintrc.cjs` or `eslint.config.js` per existing project setup.
- Confidence-downgrade-on-fallback wiring (D-03): Claude resolves whether the BigSeller fallback path also forces `Confidence = "inferred"` on the row, or only on the Platform field. Pick the tighter option that doesn't double-downgrade rows that were already `"inferred"` for unrelated reasons.
- Whether `Platform` literal lives in `convex/reports/platform.ts` or `convex/lib/platform.ts` — Claude picks based on neighboring imports (resolver consumes report shapes, so `reports/` likely fits; `lib/` if circular-import risk surfaces).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Architecture review (originating spec)
- `docs/reviews/architecture-review-2026-05-08-graph-primed-deepening-candidates.md` — Full investigation, scoring, 5 open questions (now resolved here), per-candidate file lists, deletion-test rationale. **Authoritative motivation document.**

### Domain glossary
- `CONTEXT.md` (repo root) — § "Channel taxonomy" (lines 79–104) names Source / Underlying source / Order channel / Platform; flagged ambiguities lines 134–141 are the work this phase enforces; § "WIB business date" line 220–223 names the canonical helper (correction per D-06 is in scope).

### ADRs
- `docs/adr/0001-bigseller-is-a-source-not-a-platform.md` — Currently undelivered (no mapper consults `underlyingSource`); C1 enforces it forward-compatibly per D-03.

### Project rules
- `CLAUDE.md` — Rules 10 and 13 mandate BOM-derived ball counts (C4 enforces mechanically); Pitfall #11 names deprecated `productionType`/`productionUnits` fields (C4 reduces drift surface; CLAUDE.md edit per D-13 cross-references the new predicate).

### Phase 73 lesson (originating loose end)
- `lessons_phase_73_triple_review.md` — "WIB helper consolidation" was named but never fully shipped; C3 closes that loop. ESLint guard per D-12 prevents the next "named-but-not-shipped" instance.

### Phase 80.2 lesson (motivating bug class)
- `lessons_phase_80_2_triple_review.md` — "Retroactive mapping cascades need per-source branches" + "if (!isNew) continue;" guards. Same bug class C1 + C4 prevent (silent divergence across files implementing the same domain rule).

### Skill reference (vocabulary)
- `.claude/skills/improve-codebase-architecture/LANGUAGE.md` — module / interface / seam / adapter / depth / leverage / locality terminology used in the architecture review and throughout this phase.
- `.claude/skills/improve-codebase-architecture/DEEPENING.md` — "deepening candidate" framing.

### Graph report (input to architecture review)
- `graphify-out/GRAPH_REPORT.md` — Surprising Connections + Communities 0/3 that surfaced C1 and C3.

### Phase README
- `.planning/phases/81-domain-vocabulary-deepening/README.md` — Pre-spec scope statement, success criteria, recommended pipeline. Decisions in this CONTEXT.md supersede the README's "open questions" section.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`convex/reports/productionUnitHelpers.ts`** — Already deep (`getProductionUnitsPerProduct`, `unitsForOrderItem`, `getBomMap`). Add `isProductionUnit` predicate alongside; downstream callers already use this module.
- **`convex/lib/periodRange.ts`** — Already owns `WIB_OFFSET_MS` constant + `utcToWibDateStr`. Canonical home for `getWibDateStr` per D-06; needs only the NaN-guard promotion + rename.
- **`convex/lib/confidence.ts`** — Existing `Confidence` type + `worstConfidence` helper. C1 BigSeller fallback (D-03) wires through this for the inferred-downgrade.
- **`src/lib/platformColors.ts`** — Single color source of truth (Phase 1.4 decision). Will need `Platform` literal alignment after C1 — same file, mechanical rename per D-02.
- **Existing tests** — `convex/externalData/__tests__/sourceToPlatform.test.ts` is the test file for the doomed `sourceToPlatform`; migrate its cases into the new `platform.test.ts` table per D-11, then delete.

### Established Patterns
- **Pure function extraction** (CLAUDE.md / Phase 1.6 pattern): keep Convex registrations in original files, move logic to helpers/. C1's `resolvePlatform` follows this — pure function in `platform.ts`, callers stay where they are with imports updated.
- **Schema literal fidelity** (Phase 41 lesson, MEMORY): `Platform` literal union must match downstream consumer types exactly (CSV column types, React component props, color map keys). Type-check after each callsite migration.
- **Table-driven tests for resolvers** (Phase 80.2 K3Mart cascade test): one test file, exhaustive tuples, predicate per row. D-11 follows this.
- **ESLint `no-restricted-imports`** — Repo has existing usage in `eslint.config.js` (verify during plan-phase); D-12 follows the same shape.
- **Triple-review gate** (workflow `triple_review_gate`, MEMORY-enforced): mandatory on C1 plan only per D-09; the other 3 plans use standard `code-review`.

### Integration Points
- **C1 surface (~15 files):** `convex/lib/externalSource.ts` (delete `sourceToPlatform`), `convex/reports/channelTaxonomy.ts` (delete `toDisplayChannel` + `sourceToDisplayChannel` + `DisplayChannel` type), `convex/externalData/queries.ts`, `convex/externalData/helpers/dashboardHelpers.ts`, `convex/reports/incomeStatement.ts`, `convex/reports/unitEconomics.ts`, `src/lib/platformColors.ts`, `src/components/bankReconciliation/InlineRevenueDialog.tsx`, `src/components/channelIntegration/ChannelFlagRow.tsx`, `src/components/channelIntegration/ResolutionPreviewPanel.tsx`, `src/components/channelIntegration/SourceBadge.tsx`, `src/pages/ChannelRoutingManager.tsx`, `src/pages/ProductInventorySettings.tsx`, plus the existing test file.
- **C4 surface (5 files):** `convex/reports/unitEconomics.ts:458`, `convex/externalData/helpers/lifetimeHelpers.ts:26`, `convex/staffAttendance/aggregation.ts:186`, `convex/menuProducts/mutations.ts:52`, plus `convex/reports/productionUnitHelpers.ts` (predicate export site).
- **C3 surface (~5 files):** `convex/lib/counter.ts` (move/re-export `getWibDateStr`), `convex/lib/periodRange.ts` (canonical home), `convex/gofoodDepot/helpers.ts:52` (delete `getWibDateString`), `convex/staffAttendance/flagEngine.ts:31` (delete `toWibDateString`), `convex/kitchenShiftRecords/__tests__/summary.test.ts` (re-point import).
- **Docs surface (3 files):** `CONTEXT.md` (repo root), `CLAUDE.md`, `docs/CHANGELOG.md`.

</code_context>

<specifics>
## Specific Ideas

- **Reality shifts since 2026-05-08 architecture review** — Phase 76 has merged (commit `ca6bd8e3`, 2026-05-09); Phase 77 was deferred to v2.1 (commit `e708dc46`). The review's "ship before 77" urgency framing is no longer load-bearing — phase 81 is now reframed as v2.0 tech-debt closure, not blocking-the-next-phase prep.
- **`Platform` union ordering** — Order literals as: `"Direct" | "GoFood" | "GrabFood" | "Shopee" | "TikTok" | "K3Mart" | "Consignment" | "BigSeller"` (Direct first per CONTEXT.md convention; alphabetical within marketplace cluster; transitional `"BigSeller"` last). Keeps grep-friendly + matches existing `EXTERNAL_SOURCES` export style in `convex/lib/externalSource.ts`.
- **CHANGELOG framing for D-02 rename** — Categorize under "Changed" not "Fixed" — even though `sourceToPlatform("tiktok") = "Tokopedia"` was a bug, the user-visible label rename should be communicated as an intentional consolidation rather than a bug-fix surprise (analytics chart legends will visibly change after deploy).
- **`Platform` literal location debate** — `convex/reports/platform.ts` (recommended) keeps the resolver near the report shapes that consume it. `convex/lib/platform.ts` would be the choice if circular-import risk surfaces between `reports/` and `lib/` — Claude resolves at plan-phase per Discretion item.
- **No "schema migration" risk** — None of the 3 clusters touches Convex `schema.ts`. Pure code reorganization + one new ESLint rule + doc edits. Build gate is the primary safety net.

</specifics>

<deferred>
## Deferred Ideas

- **`externalRevenue.underlyingSource` schema field + BigSeller backfill** — Required by ADR-0001 to fully resolve BigSeller rows. C1 ships forward-compatible (D-03) so this is purely additive. Schedule as a dedicated phase in v2.1 or as a v2.0 micro-phase if BigSeller revenue volume justifies it.
- **Period-comparison orchestrator extraction (Candidate 2 from architecture review)** — Speculative; revisit after a third clone of the orchestration appears (likely from a future P&L period feature). Re-evaluation trigger logged in `docs/reviews/architecture-review-2026-05-08-graph-primed-deepening-candidates.md`.
- **`useProtectedMutation` adoption sweep (Candidate 5)** — ~70 callsites, high-effort low-payoff. Schedule as a dedicated cleanup phase post-v2.0 close. Pair with an ESLint rule forbidding direct `user.token` reads in `src/hooks/convex/*Mutation*.ts`.
- **Removal of transitional `"BigSeller"` Platform literal** — Once the `underlyingSource` schema field is added and BigSeller rows resolve cleanly to `Shopee`/`TikTok`, the `"BigSeller"` literal is removed from the union and the fallback branch in `resolvePlatform` deleted. Schedule alongside the schema field phase.
- **`orders.channel` literal cleanup** — `tokopedia` order channel literal is deprecated per CONTEXT.md flagged ambiguity 137; `gofood` order channel literal is missing per ambiguity 138. Schema-touching follow-on; out of scope for this code-organization phase.
- **Phase 77 (Data Health Dashboard)** — Deferred to v2.1 per commit `e708dc46`. When 77 is re-scheduled, it inherits this phase's `resolvePlatform` + `isProductionUnit` exports for its consistency checks (no re-implementation needed).

</deferred>

---

*Phase: 81-domain-vocabulary-deepening*
*Context gathered: 2026-05-10*
