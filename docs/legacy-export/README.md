# Legacy Table Export

**Date checked:** 2026-02-23
**Phase:** 22 - Remove Legacy Editors, Tags & Dashboard
**Production environment:** prod:decisive-wombat-7

## Tables Verified Empty Before Dropping

All 11 legacy tables were verified empty in production before being dropped from schema.ts.

| Table | Row Count | Action |
|-------|-----------|--------|
| recipes | 0 | No export needed |
| recipeVersions | 0 | No export needed |
| recipeComponents | 0 | No export needed |
| componentIngredients | 0 | No export needed |
| packagingRecipes | 0 | No export needed |
| packagingVersions | 0 | No export needed |
| packagingComponents | 0 | No export needed |
| packagingComponentMaterials | 0 | No export needed |
| products | 0 | No export needed |
| productVersions | 0 | No export needed |
| tags | 0 | No export needed |

## Verification Method

Queried via Convex CLI:
- `npx convex run --prod tags/queries:list` → []
- `npx convex run --prod recipes/queries:list` → []
- `npx convex run --prod products/queries:list` → []
- `npx convex run --prod packaging/queries:list` → []

## Conclusion

No data export was required. All legacy tables were empty and safe to drop.
