import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Package, ChefHat, Box, Apple, PackageOpen, Sparkles, ShoppingCart, HelpCircle, BookOpen } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { useOnboardingTour } from '@/components/onboarding';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Carousel, LoadingCards } from '@/components/shared';
import { TagFilterBar } from '@/components/shared/TagFilterBar';
import { RecipeCard } from '@/components/recipes/RecipeCard';
import { PackagingCard } from '@/components/packaging/PackagingCard';
import { ProductCard } from '@/components/products/ProductCard';
import { IngredientCard } from '@/components/ingredients/IngredientCard';
import { MaterialCard } from '@/components/materials/MaterialCard';
import {
  OrderStatsCards,
  OrderStatsCardsSkeleton,
  ProductionQueueTable,
  ProductionQueueTableSkeleton,
} from '@/components/dashboard';
import { useRecipes } from '@/hooks/useRecipes';
import { usePackagingRecipes } from '@/hooks/usePackaging';
import { useProducts } from '@/hooks/useProducts';
import { useIngredients } from '@/hooks/useIngredients';
import { useMaterials } from '@/hooks/useMaterials';
import { useTags } from '@/hooks/useTags';
import { useOrderStats } from '@/hooks/useOrderStats';
import type { RecipeSummary, PackagingRecipeSummary, ProductSummary } from '@/lib/types';

export function Dashboard() {
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);

  const { data: recipes, isLoading: loadingRecipes } = useRecipes();
  const { data: packaging, isLoading: loadingPackaging } = usePackagingRecipes();
  const { data: products, isLoading: loadingProducts } = useProducts();
  const { data: ingredients, isLoading: loadingIngredients } = useIngredients();
  const { data: materials, isLoading: loadingMaterials } = useMaterials();
  const { data: tags } = useTags();
  const { data: orderStats, isLoading: loadingOrderStats } = useOrderStats();

  // Onboarding tour - auto-starts for first-time users when database is empty
  const isNewUser = (!products || products.length === 0) && (!recipes || recipes.length === 0);
  const { startTour } = useOnboardingTour(isNewUser);

  // Toggle tag selection
  const handleToggleTag = (tagId: number) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId]
    );
  };

  // Create a map of tag names to IDs for recipes/packaging (they use string arrays)
  const tagNameToIdMap = useMemo(() => {
    if (!tags) return new Map<string, number>();
    return new Map(tags.map((tag) => [tag.name, tag.id]));
  }, [tags]);

  // Filter and sort function for recipes/packaging (tags as string[])
  const filterAndSortByTags = <T extends RecipeSummary | PackagingRecipeSummary>(
    items: T[] | undefined,
    selectedIds: number[]
  ): T[] => {
    if (!items) return [];
    if (selectedIds.length === 0) return items;

    // Convert tag names to IDs for each item and calculate match count
    const itemsWithMatchCount = items.map((item) => {
      const itemTagIds = item.tags
        .map((tagName) => tagNameToIdMap.get(tagName))
        .filter((id): id is number => id !== undefined);
      const matchCount = itemTagIds.filter((id) => selectedIds.includes(id)).length;
      return { item, matchCount };
    });

    // Sort by match count (descending) - items with more matching tags first
    return itemsWithMatchCount
      .sort((a, b) => b.matchCount - a.matchCount)
      .map(({ item }) => item);
  };

  // Filter and sort function for products (tags as Tag[])
  const filterAndSortProducts = (
    items: ProductSummary[] | undefined,
    selectedIds: number[]
  ): ProductSummary[] => {
    if (!items) return [];
    if (selectedIds.length === 0) return items;

    const itemsWithMatchCount = items.map((item) => {
      const itemTagIds = item.tags.map((tag) => tag.id);
      const matchCount = itemTagIds.filter((id) => selectedIds.includes(id)).length;
      return { item, matchCount };
    });

    // Sort by match count (descending)
    return itemsWithMatchCount
      .sort((a, b) => b.matchCount - a.matchCount)
      .map(({ item }) => item);
  };

  // Apply filtering and sorting
  const filteredRecipes = useMemo(
    () => filterAndSortByTags(recipes, selectedTagIds),
    [recipes, selectedTagIds, tagNameToIdMap]
  );

  const filteredPackaging = useMemo(
    () => filterAndSortByTags(packaging, selectedTagIds),
    [packaging, selectedTagIds, tagNameToIdMap]
  );

  const filteredProducts = useMemo(
    () => filterAndSortProducts(products, selectedTagIds),
    [products, selectedTagIds]
  );

  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary/10 via-primary/5 to-background border p-6">
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium text-primary">Product Development Hub</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={startTour}
              className="text-muted-foreground hover:text-primary"
            >
              <BookOpen className="h-4 w-4 mr-1" />
              Getting Started
            </Button>
          </div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Welcome to Malo Recipe Master</h1>
          <p className="text-muted-foreground max-w-2xl">
            Your central hub for managing recipes, packaging designs, and finished products.
            Click on any card below to view or edit, or use the "New" buttons to create.
          </p>
        </div>
        {/* Decorative element */}
        <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -right-6 -bottom-6 h-32 w-32 rounded-full bg-primary/10 blur-2xl" />
      </div>

      {/* Tag Filter Bar */}
      {tags && tags.length > 0 && (
        <TagFilterBar
          tags={tags}
          selectedTagIds={selectedTagIds}
          onToggleTag={handleToggleTag}
        />
      )}

      {/* Section Divider - Orders & Production */}
      <div className="flex items-center gap-4 pt-4" data-tour-step="orders">
        <div className="flex items-center gap-2">
          <ShoppingCart className="h-5 w-5 text-emerald-600" />
          <h2 className="text-lg font-semibold text-emerald-600">Orders & Production</h2>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="h-4 w-4 text-muted-foreground hover:text-emerald-600 cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs text-left">
                <p className="font-medium mb-1">Track orders & production</p>
                <p className="text-xs opacity-90">
                  View today's revenue, pending orders, and production status.
                  Click "View All Orders" to create new orders or manage existing ones.
                  The Production Queue shows urgent orders that need attention.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <div className="flex-1 h-px bg-border" />
        <Button variant="outline" size="sm" asChild>
          <Link to="/orders">View All Orders</Link>
        </Button>
      </div>

      {/* Order Stats Cards */}
      {loadingOrderStats ? (
        <OrderStatsCardsSkeleton />
      ) : orderStats ? (
        <OrderStatsCards stats={orderStats} />
      ) : null}

      {/* Production Queue */}
      {loadingOrderStats ? (
        <ProductionQueueTableSkeleton />
      ) : orderStats ? (
        <ProductionQueueTable orders={orderStats.urgent_orders} />
      ) : null}

      {/* Section Divider - Product Development */}
      <div className="flex items-center gap-4 pt-4">
        <div className="flex items-center gap-2">
          <Package className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-primary">Product Development</h2>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="h-4 w-4 text-muted-foreground hover:text-primary cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs text-left">
                <p className="font-medium mb-1">Create & manage products</p>
                <p className="text-xs opacity-90">
                  Products combine a Recipe + Packaging Design with pricing.
                  Click any card to view details, or use "New" buttons to create.
                  Recipes define the food formula; Packaging defines the container.
                  Products calculate COGS and margins automatically.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <div className="flex-1 h-px bg-border" />
      </div>

      <Carousel
        title="Products"
        description="Finished goods with COGS and margin calculations"
        icon={Package}
        itemCount={filteredProducts.length}
        isEmpty={!loadingProducts && filteredProducts.length === 0}
        emptyMessage={
          selectedTagIds.length > 0
            ? "No products match the selected tags."
            : "No products yet. Create your first product!"
        }
        data-tour-step="products"
        action={
          <Button size="sm" asChild className="shadow-sm">
            <Link to="/products/new">
              <Plus className="h-4 w-4 mr-1" />
              New Product
            </Link>
          </Button>
        }
      >
        {loadingProducts ? (
          <LoadingCards count={4} />
        ) : (
          filteredProducts.map((product, index) => (
            <motion.div
              key={product.id}
              layout
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
            >
              <ProductCard product={product} />
            </motion.div>
          ))
        )}
      </Carousel>

      <Carousel
        title="Recipes"
        description="Food formulas with ingredient costs and yield tracking"
        icon={ChefHat}
        itemCount={filteredRecipes.length}
        isEmpty={!loadingRecipes && filteredRecipes.length === 0}
        emptyMessage={
          selectedTagIds.length > 0
            ? "No recipes match the selected tags."
            : "No recipes yet. Create your first recipe!"
        }
        data-tour-step="recipes"
        action={
          <Button size="sm" asChild className="shadow-sm">
            <Link to="/recipes/new">
              <Plus className="h-4 w-4 mr-1" />
              New Recipe
            </Link>
          </Button>
        }
      >
        {loadingRecipes ? (
          <LoadingCards count={4} />
        ) : (
          filteredRecipes.map((recipe, index) => (
            <motion.div
              key={recipe.id}
              layout
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
            >
              <RecipeCard recipe={recipe} />
            </motion.div>
          ))
        )}
      </Carousel>

      <Carousel
        title="Packaging Designs"
        description="Packaging configurations with material costs"
        icon={Box}
        itemCount={filteredPackaging.length}
        isEmpty={!loadingPackaging && filteredPackaging.length === 0}
        emptyMessage={
          selectedTagIds.length > 0
            ? "No packaging designs match the selected tags."
            : "No packaging designs yet. Create your first packaging!"
        }
        data-tour-step="packaging"
        action={
          <Button size="sm" asChild className="shadow-sm">
            <Link to="/packaging/new">
              <Plus className="h-4 w-4 mr-1" />
              New Packaging
            </Link>
          </Button>
        }
      >
        {loadingPackaging ? (
          <LoadingCards count={4} />
        ) : (
          filteredPackaging.map((pkg, index) => (
            <motion.div
              key={pkg.id}
              layout
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
            >
              <PackagingCard packaging={pkg} />
            </motion.div>
          ))
        )}
      </Carousel>

      {/* Section Divider - Raw Materials */}
      <div className="flex items-center gap-4 pt-4">
        <div className="flex items-center gap-2">
          <Apple className="h-5 w-5 text-orange-600" />
          <h2 className="text-lg font-semibold text-orange-600">Raw Materials</h2>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="h-4 w-4 text-muted-foreground hover:text-orange-600 cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs text-left">
                <p className="font-medium mb-1">Manage your inventory items</p>
                <p className="text-xs opacity-90">
                  Ingredients are food items used in Recipes (flour, sugar, etc.).
                  Packaging Materials are containers used in Packaging Designs (boxes, bags, labels).
                  Set purchase prices here to auto-calculate costs in recipes and products.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <div className="flex-1 h-px bg-border" />
      </div>

      <Carousel
        title="Ingredients"
        description="Food ingredients with cost per unit calculations"
        icon={Apple}
        itemCount={ingredients?.length || 0}
        isEmpty={!loadingIngredients && (!ingredients || ingredients.length === 0)}
        emptyMessage="No ingredients yet. Create your first ingredient!"
        data-tour-step="ingredients"
        action={
          <Button size="sm" asChild className="shadow-sm">
            <Link to="/ingredients/new">
              <Plus className="h-4 w-4 mr-1" />
              New Ingredient
            </Link>
          </Button>
        }
      >
        {loadingIngredients ? (
          <LoadingCards count={4} />
        ) : (
          ingredients?.map((ingredient) => (
            <IngredientCard key={ingredient.id} ingredient={ingredient} />
          ))
        )}
      </Carousel>

      <Carousel
        title="Packaging Materials"
        description="Boxes, bags, labels, and other packaging components"
        icon={PackageOpen}
        itemCount={materials?.length || 0}
        isEmpty={!loadingMaterials && (!materials || materials.length === 0)}
        emptyMessage="No packaging materials yet. Create your first material!"
        data-tour-step="materials"
        action={
          <Button size="sm" asChild className="shadow-sm">
            <Link to="/materials/new">
              <Plus className="h-4 w-4 mr-1" />
              New Material
            </Link>
          </Button>
        }
      >
        {loadingMaterials ? (
          <LoadingCards count={4} />
        ) : (
          materials?.map((material) => (
            <MaterialCard key={material.id} material={material} />
          ))
        )}
      </Carousel>
    </div>
  );
}
