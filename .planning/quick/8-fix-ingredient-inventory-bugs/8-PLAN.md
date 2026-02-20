---
phase: quick-8
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/inventory/ComponentTypeDialog.tsx
  - src/components/inventory/ReceiveStockDialog.tsx
  - convex/inventory/mutations.ts
  - src/pages/IngredientsManager.tsx
autonomous: true
requirements: [QUICK-8-A, QUICK-8-B, QUICK-8-C]

must_haves:
  truths:
    - "ComponentTypeDialog unit dropdown defaults to 'g' when category is production"
    - "ReceiveStockDialog create-new form has Packaging/Ingredient category toggle"
    - "Selecting Ingredient category in ReceiveStockDialog sends category=production to backend"
    - "createComponentAndReceiveStock backend accepts and correctly stores category=production"
    - "IngredientsManager shows an Enable Tracking button for ingredients without inventory tracking"
    - "Clicking Enable Tracking calls createIngredientComponentType and links ingredient to componentType"
    - "npm run build passes with no TypeScript errors"
  artifacts:
    - path: "src/components/inventory/ComponentTypeDialog.tsx"
      provides: "Unit Select dropdown defaulting to g for production category"
      contains: "defaultCategory === \"production\" ? \"g\" : \"pcs\""
    - path: "src/components/inventory/ReceiveStockDialog.tsx"
      provides: "Category toggle (Packaging/Ingredient) with g default for production"
      contains: "newComponentCategory === \"production\""
    - path: "convex/inventory/mutations.ts"
      provides: "createComponentAndReceiveStock accepting production category"
      contains: "v.literal(\"production\")"
    - path: "src/pages/IngredientsManager.tsx"
      provides: "EnableTrackingButton per ingredient row calling createIngredientComponentType"
      contains: "EnableTrackingButton"
  key_links:
    - from: "src/components/inventory/ReceiveStockDialog.tsx"
      to: "convex/inventory/mutations.ts createComponentAndReceiveStock"
      via: "createAndReceive({ category: newComponentCategory })"
      pattern: "category.*newComponentCategory"
    - from: "src/pages/IngredientsManager.tsx"
      to: "convex/componentTypes/mutations.ts createIngredientComponentType"
      via: "useConvexCreateIngredientComponentType hook"
      pattern: "createIngredientComponentType"
---

<objective>
Verify and confirm all three ingredient inventory bugs are resolved. Analysis shows all fixes were already applied during Phase 20 (commits fb118b9 and cf00cf9). This plan audits each fix in place, runs the build to confirm no regressions, and closes the quick task.

Purpose: Confirm production-ready state for ingredient inventory tracking.
Output: Verified fixes, clean build, closed quick task.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/debug/ingredient-inventory-unit-bugs.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Audit all three fixes in source files</name>
  <files>
    src/components/inventory/ComponentTypeDialog.tsx
    src/components/inventory/ReceiveStockDialog.tsx
    convex/inventory/mutations.ts
    src/pages/IngredientsManager.tsx
  </files>
  <action>
    Read each file and verify the following fix markers are present. If any are missing, apply the fix inline.

    Issue A — ComponentTypeDialog unit default:
    - `src/components/inventory/ComponentTypeDialog.tsx` line ~47: `useState` for unit must initialize with condition, NOT hardcoded "pcs".
    - The `useEffect` on `open` (line ~63) must set unit to `defaultCategory === "production" ? "g" : "pcs"`.
    - The `useEffect` on `category` change (line ~73) must set unit to `category === "production" ? "g" : "pcs"`.
    - The unit field must be a Select element (not a plain Input) with options: g, kg, ml, l, pcs, box, roll, sheet.

    If any of the above is not present, fix it:
    - Replace `const [unit, setUnit] = useState("pcs")` with `const [unit, setUnit] = useState(defaultCategory === "production" ? "g" : "pcs")`
    - Add/update the category-change useEffect to call `setUnit(category === "production" ? "g" : "pcs")`
    - Replace the unit Input element with a shadcn Select containing all 8 unit options

    Issue B — ReceiveStockDialog category hardcode (frontend):
    - `src/components/inventory/ReceiveStockDialog.tsx` line ~66: `newComponentCategory` state must be typed `"packaging" | "production"` (not just `"packaging"`).
    - The create-new form must show a Packaging/Ingredient toggle (two buttons).
    - Clicking Ingredient button must call `setNewComponentCategory("production")` and `setNewComponentUnit("g")`.
    - The unit buttons shown must be different for production (g, kg, ml, l) vs packaging (pcs, box, sheet, roll, custom).
    - Reset on open (useEffect for `open`) must reset `newComponentCategory` to `"packaging"` and `newComponentUnit` to `"pcs"`.
    - The `selectedLocationId` must be set to null on category change so the location useEffect re-fires (Kitchen preference for production).

    If missing, apply these changes to ReceiveStockDialog.

    Issue B — createComponentAndReceiveStock (backend):
    - `convex/inventory/mutations.ts` createComponentAndReceiveStock args must include `v.literal("production")` in the category union.
    - The handler must NOT hardcode category to "packaging". It must canonicalize: `const category = args.category === "production" ? "production" : "packaging"`.

    If missing, add `v.literal("production")` to the union at lines ~24-28 and fix the category assignment at line ~75.

    Issue C — IngredientsManager Enable Tracking button:
    - `src/pages/IngredientsManager.tsx` must import `useConvexCreateIngredientComponentType`.
    - Must define a top-level `EnableTrackingButton` component (NOT an inline render function) that calls `useConvexCreateIngredientComponentType()` and `useAuth()` as React hooks.
    - The tracking column must render `<EnableTrackingButton ingredient={item} />` when `item.ingredientComponentTypeId` is falsy, and a "Tracked" badge when it's truthy.

    If missing, add the EnableTrackingButton component and wire up the tracking column.

    IMPORTANT — do not introduce any issues:
    - Do not change the `useConvexInventoryTrackedComponents` import in ReceiveStockDialog (it still lists all trackInventory=true components, including production ones, which is correct)
    - Do not alter the receiveStock path (existing component selection mode) — only the create-new path is affected
    - The createIngredientComponentType mutation does NOT need a token-free path; the existing token-required pattern is correct
  </action>
  <verify>
    Read each of the four files and confirm:
    1. ComponentTypeDialog: unit useState not hardcoded "pcs", useEffect for category sets "g" for production, unit field is a Select
    2. ReceiveStockDialog: useState type includes "production", category toggle buttons exist, production unit options include g/kg/ml/l
    3. inventory/mutations.ts: v.literal("production") in args, no hardcoded "packaging" in category assignment
    4. IngredientsManager: EnableTrackingButton defined as named function (not inline), tracking column uses it
  </verify>
  <done>All four fix markers confirmed present in source files with no regressions introduced</done>
</task>

<task type="auto">
  <name>Task 2: Build verification</name>
  <files></files>
  <action>
    Run the TypeScript type check and build from the project root:

    ```
    npm run type-check
    npm run build
    ```

    The build must exit with code 0. CSS warnings from Tailwind are acceptable (they are pre-existing and not related to these fixes). Any TypeScript errors must be resolved before proceeding.

    Common errors to watch for:
    - Type mismatch if ReceiveStockDialog `newComponentCategory` state type was not updated to include "production"
    - Missing import for `useConvexCreateIngredientComponentType` in IngredientsManager
    - Incorrect Convex validator type if production literal was not added to args schema

    If errors are found, fix them inline in the relevant file and re-run `npm run build` until it passes.
  </action>
  <verify>
    `npm run build` completes with exit code 0. Output shows "built in X.XXs" with no TypeScript errors. Only allowable warnings are CSS-related (Tailwind `*` token, esbuild unsupported-css-property).
  </verify>
  <done>Build passes clean. All three fixes compile without TypeScript errors.</done>
</task>

<task type="auto">
  <name>Task 3: Commit and update STATE.md</name>
  <files>
    .planning/STATE.md
  </files>
  <action>
    Since this is a quick task on main branch (fixes already merged in Phase 20), no new commit is needed for source files if they were already committed. However:

    1. If Task 1 required any actual code changes (fixes were NOT already present), stage and commit those files:
       ```
       git add src/components/inventory/ComponentTypeDialog.tsx
       git add src/components/inventory/ReceiveStockDialog.tsx
       git add convex/inventory/mutations.ts
       git add src/pages/IngredientsManager.tsx
       git commit -m "fix(ingredient-inventory): unit default g for production, category toggle, enable tracking button"
       ```

    2. If Task 1 confirmed fixes were already present (no changes needed), skip the commit.

    3. Update `.planning/STATE.md` to append this quick task to the "Quick Tasks Completed" table:
       ```
       | 8 | Fix ingredient inventory bugs: ComponentTypeDialog unit default, ReceiveStockDialog category, IngredientsManager Enable Tracking | 2026-02-20 | (commit hash or "already fixed in Phase 20") | Done | [8-fix-ingredient-inventory-bugs](.planning/quick/8-fix-ingredient-inventory-bugs/) |
       ```

    Use `git log --oneline -1` to get the commit hash if a new commit was made, or "cf00cf9" if no new commit was needed (Phase 20 commit).
  </action>
  <verify>
    `.planning/STATE.md` Quick Tasks Completed table includes quick task #8 row with correct status.
    If new commit was made: `git log --oneline -1` shows the fix commit.
  </verify>
  <done>STATE.md updated. Quick task #8 recorded. Repository in clean state.</done>
</task>

</tasks>

<verification>
After all tasks complete, confirm:
- ComponentTypeDialog defaults to "g" for production category (unit Select, not Input)
- ReceiveStockDialog has Packaging/Ingredient toggle with correct unit defaults per category
- createComponentAndReceiveStock backend accepts category="production" without rejecting or overriding
- IngredientsManager shows Enable Tracking button for untracked ingredients (calls createIngredientComponentType)
- `npm run build` passes with exit code 0
- STATE.md records quick task #8 as done
</verification>

<success_criteria>
- All three bug fixes confirmed in source code (audit or applied)
- Build passes clean (npm run build exit 0)
- Quick task #8 recorded in STATE.md
- Production ingredients created via ReceiveStockDialog land in Production category, not Packaging
- Ingredient rows in IngredientsManager show "Enable Tracking" button (or "Tracked" badge if already linked)
</success_criteria>

<output>
After completion, create `.planning/quick/8-fix-ingredient-inventory-bugs/8-SUMMARY.md` following the summary template at `.claude/get-shit-done/templates/summary.md`.
</output>
