# Phase 3: Frontend + Final Verification

## Context
Wires backend from Phase 1+2 into the UI. Updates token dialog, adds commission visibility, adds expandable revenue rows with item details, final verification.

**Depends on Phase 1+2:** All backend ready. Sync action works. Queries return item data.

## Git Workflow
**Branch:** `feature/gobiz-journal-sync`
**Checkpoints:** Single commit after all tasks verified

## Implementation Waves

### Wave 1: Hooks [SEQUENTIAL]
| Task | Files | Details |
|------|-------|---------|
| 1.1 Add `useConvexRevenueItems` hook | `src/hooks/convex/useExternalData.ts` | Skip pattern for conditional fetch |
| 1.2 Export hook from barrel | `src/hooks/convex/index.ts` | Add to useExternalData exports |

#### Hook Implementation
```typescript
export function useConvexRevenueItems(revenueId?: Id<"externalRevenue">) {
  const data = useQuery(
    api.externalData.queries.getRevenueItems,
    revenueId ? { revenueId } : "skip"
  );
  return { data, isLoading: data === undefined };
}
```

### Wave 2: Frontend Components [PARALLEL, after Wave 1]
| Task | Files | Details |
|------|-------|---------|
| 2.1 Update GoBizTokenDialog | `src/components/salesAnalytics/GoBizTokenDialog.tsx` | Add refresh token field |
| 2.2 Update OverviewTab | `src/components/salesAnalytics/OverviewTab.tsx` | Commission card + expandable rows |
| 2.3 Update SettingsTab | `src/components/salesAnalytics/SettingsTab.tsx` | Refresh token badge, updated labels |

#### 2.1 GoBizTokenDialog Changes
- Add second `Textarea` for refresh token (optional, clearly labeled)
- Pass `refreshToken` to `saveDirectToken` mutation
- Update help text: mention both `access_token` and `refresh_token` cookies
- Remove "auto-syncs every 3 hours" text (cron removed in Phase 2)
- Update sync button label to "Save & Sync Journals"

#### 2.2 OverviewTab Changes

**Commission stats card:**
- Add a new stats card alongside existing gross/net cards
- Visible when `totalCommission > 0`
- Shows commission amount formatted as IDR
- Sub-metrics: ad burn, promo burn (if non-zero)
- Page already gated by `canAccessDashboard` (manager/admin)

**Expandable revenue rows:**
- For GoBiz records with `gobizOrderNumber`: add chevron icon
- Click to expand: sub-table with items from `getRevenueItems` query
- Use `useConvexRevenueItems` with skip pattern (only fetch when expanded)
- Each item shows: product name, qty, unit price, total, match status badge

**MatchStatusBadge component (inline):**
- `exact` --> green badge "Matched"
- `price_only` --> blue badge "Price Match"
- `name_only` --> yellow badge "Name Match"
- `none` --> gray badge "Unmatched"

#### 2.3 SettingsTab Changes
- Show "Has Refresh Token" badge next to GoBiz if `hasRefreshToken` is true
- Replace "Revenue auto-syncs every 3 hours" with "Manual sync only" in reconnect steps
- Update sync button label to "Sync Journals" (from "Sync Now")

### Wave 3: Documentation [PARALLEL, after Wave 2]
| Task | Files | Details |
|------|-------|---------|
| 3.1 Update CHANGELOG | `docs/CHANGELOG.md` | Full feature entry for all 3 phases |
| 3.2 Update GOBIZ_SALES_SCRIPT | `docs/GOBIZ_SALES_SCRIPT.md` | Token instructions, refresh token |
| 3.3 Update ROADMAP | `docs/ROADMAP.md` | Mark GoBiz journal sync complete |

### Wave 4: Final Verification [SEQUENTIAL]
| Agent | Task |
|-------|------|
| Bash | `npm run type-check` |
| Bash | `npm run build` |
| Bash | `npm run test` |
| Bash | `npm run lint` |
| Bash | `git diff main...HEAD --stat` (sanity check) |

## Documentation Updates
- [ ] `docs/CHANGELOG.md` -- Complete feature entry covering all 3 phases
- [ ] `docs/GOBIZ_SALES_SCRIPT.md` -- Update token instructions, mention refresh token
- [ ] `docs/ROADMAP.md` -- Mark GoBiz journal sync complete

## Success Criteria
- [ ] Token dialog has both bearer + refresh token fields
- [ ] Commission card shows in overview (manager/admin)
- [ ] Expandable rows show item details with match badges
- [ ] Settings tab reflects cron removal + refresh token status
- [ ] `useConvexRevenueItems` hook works with skip pattern
- [ ] Hook exported from barrel
- [ ] `npm run type-check` passes
- [ ] `npm run build` passes
- [ ] `npm run test` passes (ALL tests: Phase 1 + Phase 2 + Phase 3)
- [ ] `npm run lint` passes
- [ ] `docs/CHANGELOG.md` updated
- [ ] `docs/GOBIZ_SALES_SCRIPT.md` updated
- [ ] `docs/ROADMAP.md` updated

## Git Checkpoint
```
git commit -m "feat: GoBiz frontend integration (token dialog + revenue items + verification)"
```

## Final Delivery
After Phase 3 gate passes:
1. `git diff main...HEAD --stat` -- review all changes
2. Create PR to `main` summarizing all 3 phases
3. Manual smoke test: paste real GoBiz token + refresh token, sync, verify journal records
