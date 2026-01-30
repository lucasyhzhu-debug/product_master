/**
 * Convex hooks barrel export.
 * Import from here for cleaner imports in components.
 */

// Ingredients
export {
  useConvexIngredients,
  useConvexIngredient,
  useConvexIngredientSearch,
  useConvexCreateIngredient,
  useConvexUpdateIngredient,
  useConvexDeleteIngredient,
  type ConvexIngredient,
  type IngredientCreateInput,
} from "./useIngredients";

// Packaging Materials
export {
  useConvexMaterials,
  useConvexMaterial,
  useConvexMaterialSearch,
  useConvexCreateMaterial,
  useConvexUpdateMaterial,
  useConvexDeleteMaterial,
  type ConvexPackagingMaterial,
  type MaterialCreateInput,
} from "./useMaterials";

// Tags
export {
  useConvexTags,
  useConvexTag,
  useConvexTagsMany,
  useConvexCreateTag,
  useConvexUpdateTag,
  useConvexDeleteTag,
  useConvexSeedTags,
  type ConvexTag,
  type TagCreateInput,
} from "./useTags";

// Recipes
export {
  useConvexRecipes,
  useConvexRecipe,
  useConvexRecipeVersion,
  useConvexReusableComponents,
  useConvexRecipesUsingComponent,
  useConvexRecipeSearch,
  useConvexCreateRecipe,
  useConvexCopyRecipeVersion,
  useConvexCreateRecipeVersion,
  useConvexUpdateRecipeTags,
  useConvexUpdateRecipeName,
  useConvexDeleteRecipe,
  useConvexRecalculateRecipeCosts,
  type ComponentIngredientInput,
  type RecipeComponentInput,
  type RecipeVersionInput,
  type RecipeCreateInput,
} from "./useRecipes";

// Packaging
export {
  useConvexPackagingList,
  useConvexPackaging,
  useConvexPackagingVersion,
  useConvexPackagingSearch,
  useConvexCreatePackaging,
  useConvexCopyPackagingVersion,
  useConvexCreatePackagingVersion,
  useConvexUpdatePackagingTags,
  useConvexUpdatePackagingName,
  useConvexDeletePackaging,
  useConvexRecalculatePackagingCosts,
  type PackagingMaterialInput,
  type PackagingComponentInput,
  type PackagingVersionInput,
  type PackagingCreateInput,
} from "./usePackaging";

// Products
export {
  useConvexProducts,
  useConvexProduct,
  useConvexProductVersion,
  useConvexProductsUsingRecipe,
  useConvexProductsUsingPackaging,
  useConvexProductSearch,
  useConvexCreateProduct,
  useConvexCopyProductVersion,
  useConvexCreateProductVersion,
  useConvexUpdateProductTags,
  useConvexUpdateProductName,
  useConvexDeleteProduct,
  useConvexRecalculateProductCogs,
  type ProductVersionInput,
  type ProductCreateInput,
} from "./useProducts";
