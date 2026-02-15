# Milestones

## v1.0 Concerns Cleanup & Refactor (Shipped: 2026-02-15)

**Phases completed:** 11 phases, 36 plans
**Timeline:** 3 days (2026-02-13 to 2026-02-15)
**Codebase:** 92,416 lines TypeScript

**Key accomplishments:**
1. Comprehensive test safety net for ball distribution, FIFO inventory, order lifecycle, and voucher handling
2. Security hardened: env files removed from VCS, git history scrubbed, credentials rotated, security patterns documented
3. BOM migration complete: all ball composition data flows through unified BOM as single source of truth; deprecated fields removed from schema
4. Performance optimized: N+1 queries eliminated, cursor pagination added, kitchen queries indexed with denormalized isKitchenVisible, COGS cached with eager invalidation
5. Schema tightened: 215 optional fields audited, 13 fields made required, 5 deprecated fields removed, 55 denormalization annotations added
6. UI brand unified: teal brand accent, Inter typography, dark mode, skeleton screens, mobile nav across all 19 pages
7. Frontend factories: EntityManager generic CRUD component + createMutationHook factory reduced boilerplate across 5+ entity pages
8. Production counts consolidated: productionLog is single source of truth, productionCounts archived (read-only), weekly integrity checks automated

**Delivered:** Systematic resolution of 41 concerns across 11 categories (tech debt, bugs, security, performance, testing, BOM migration, schema cleanup, UI brand, frontend factories, and infrastructure). Build passes, no regressions.

---

