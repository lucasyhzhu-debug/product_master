# Phase 25: Codebase Cleanup - Context

**Gathered:** 2026-02-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Standardize code patterns across four independent streams: dark mode coverage, hook naming, mutation wrapper expansion, and query factory expansion. No new user-facing features — purely internal code quality and consistency. Each stream is independently executable and independently commitable.

</domain>

<decisions>
## Implementation Decisions

### Dark Mode Coverage
- **Scope:** Full audit of all `src/` components — fix ANY hardcoded colors found, not just K3Mart
- **Approach:** Use cascaded Tailwind `dark:` variants and CSS variables from the project's design system. Do NOT reinvent colors with inline styles or hardcoded hex values
- **Reference:** Review `docs/CODE_STYLE.md` (or equivalent UI standards doc) — implementation uses global `.dark` class on `<html>` (Tailwind class strategy)
- **WhatsApp live preview specifically:** The preview bubble should mimic WhatsApp's own dark mode aesthetic (dark background, teal/green adapted bubbles) — NOT default to generic card/muted colors. Same approach was applied to the templates manager page text; apply consistently here
- **Rule:** If a component is simulating an external UI (WhatsApp), match that app's dark mode. For all other components, use the project's design system variables

### Hook Rename Scope
- **Pre-flight audit required:** Not all 24 hooks may have the `useConvex` prefix — scan all files in `src/hooks/convex/` before renaming anything
- **Collision audit required:** Check for any `useOrders`, `useRecipes`, etc. defined outside `src/hooks/convex/` that would collide after rename
- **What to rename:** Both file names AND exported function names (audit to confirm if they match)
- **Cut-over strategy:** Claude's discretion — clean cut-over is preferred (rename hook + update all import sites in one operation per batch), no compatibility shim exports
- **Execution:** Rename in batches of 5-6 hooks. Run `npm run type-check` after each batch before continuing

### protectedMutation Rollout
- **Scope:** Apply `protectedMutation` wrapper to ALL mutations in `orders/`, `recipes/`, and `products/` — including public/unauthenticated ones (pass empty roles array for public mutations)
- **Existing inline auth:** Keep existing `requireRole()` calls in place — do NOT remove them. Belt-and-suspenders approach. Auth is security-critical
- **Query factory:** Apply generic query factory only to query files where it provides significant benefit — not a blanket rollout. Claude audits each file and applies selectively based on whether the pattern is a clean fit

### Execution Strategy
- **Parallelism:** All four streams are independent and can run in parallel (separate agents)
- **Commits:** One atomic commit per stream — four commits total. Easier to bisect and independently revertable
- **Hook rename specifically:** Batched execution (5-6 hooks per batch, verify per batch)
- **Sequence within each stream:** Audit → implement → type-check → commit

### Claude's Discretion
- Exact batching order for hook rename (which hooks to rename first)
- Specific query files selected for query factory (based on audit)
- Exact dark mode color values for WhatsApp preview bubble adaptation
- Whether to use feature branch per stream or one branch for the whole phase

</decisions>

<specifics>
## Specific Ideas

- WhatsApp live preview dark mode: User referenced how the templates manager page text was previously updated — use the same pattern. The bubble should feel like WhatsApp's dark mode, not a generic card
- Dark mode principle stated by user: "use cascaded formatting, not reinventing the wheel — we have UI standards for a reason"
- Hook rename principle: Audit-first approach. Don't assume all 24 hooks have the prefix, and don't assume no collisions exist

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 25-codebase-cleanup*
*Context gathered: 2026-02-23*
