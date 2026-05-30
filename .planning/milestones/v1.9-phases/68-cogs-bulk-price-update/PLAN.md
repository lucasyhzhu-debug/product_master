# Phase 68: COGS Bulk Price Update

## Goal
Managers can update ingredient and material costs in bulk instead of editing one item at a time.

## Git Workflow
**Branch:** `feature/68-cogs-bulk-price-update`
**Checkpoints:** After Wave 1 (backend), Wave 2 (frontend), Wave 3 (verify)

## Implementation Waves

### Wave 1: Backend [PARALLEL]
| Agent | Task | Files |
|-------|------|-------|
| convex-backend | Add `bulkUpdatePrices` mutation to ingredients | `convex/ingredients/mutations.ts` |
| convex-backend | Add `bulkUpdatePrices` mutation to materials | `convex/materials/mutations.ts` |

### Wave 2: Frontend [PARALLEL, after Wave 1]
| Agent | Task | Files |
|-------|------|-------|
| react-ui-builder | Create bulk price update hook | `src/hooks/convex/useBulkPriceUpdate.ts` |
| react-ui-builder | Export from barrel | `src/hooks/convex/index.ts` |
| react-ui-builder | Create BulkPriceUpdate page with tabs | `src/pages/BulkPriceUpdate.tsx` |
| react-ui-builder | Register route in App.tsx | `src/App.tsx` |
| react-ui-builder | Add hub link in Inventory section | `src/pages/HubPage.tsx` |

### Wave 3: Verification [SEQUENTIAL]
| Agent | Task |
|-------|------|
| code-auditor | Type check + pattern compliance |
| Bash | npm run build |

## Documentation Updates
- [x] CHANGELOG.md
- [x] ROADMAP.md

## Success Criteria
- [x] `npm run type-check` passes
- [x] `npm run build` succeeds
- [x] Bulk price update screen shows all ingredients with inline editable cost fields
- [x] Matching screen exists for packaging materials (tabbed UI)
- [x] Saving recalculates costPerBaseUnit for each changed item
- [x] Cost invalidation cascade triggers for ingredient changes (existing COGS flow preserved)
