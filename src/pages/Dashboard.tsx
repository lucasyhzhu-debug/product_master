import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useAuth } from '@/contexts/AuthContext';
import { Plus, Package, ChefHat, Box, Apple, PackageOpen, Sparkles, ShoppingCart, HelpCircle, BookOpen, UtensilsCrossed } from 'lucide-react';
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
  LowStockAlert,
} from '@/components/dashboard';
import {
  useConvexRecipes,
  useConvexPackagingList,
  useConvexProducts,
  useConvexIngredients,
  useConvexMaterials,
  useConvexTags,
  useConvexOrderStats,
} from '@/hooks/convex';

// Type for items with Convex-style tags
type TaggedItem = { tags: { _id: string; name: string }[] };

// Filter and sort function for items with tags - moved outside component
// to satisfy exhaustive-deps rule since it has no component dependencies
function filterAndSortByTags<T extends TaggedItem>(
  items: T[],
  selectedIds: string[]
): T[] {
  if (!items.length) return [];
  if (selectedIds.length === 0) return items;

  const itemsWithMatchCount = items.map((item) => {
    const itemTagIds = item.tags.map((tag) => tag._id);
    const matchCount = itemTagIds.filter((id) => selectedIds.includes(id)).length;
    return { item, matchCount };
  });

  // Sort by match count (descending) - items with more matching tags first
  return itemsWithMatchCount
    .sort((a, b) => b.matchCount - a.matchCount)
    .map(({ item }) => item);
}

export function Dashboard() {
  useDocumentTitle('Dashboard');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const { hasPermission } = useAuth();
  const canAccessMenuProducts = hasPermission('canAccessMenuProducts');

  // Convex hooks - data comes back as raw arrays or undefined
  const rawRecipes = useConvexRecipes();
  const rawPackaging = useConvexPackagingList();
  const rawProducts = useConvexProducts();
  const rawIngredients = useConvexIngredients();
  const rawMaterials = useConvexMaterials();
  const rawTags = useConvexTags();
  const { data: orderStats, isLoading: loadingOrderStats } = useConvexOrderStats();

  // Normalize data - Convex returns undefined while loading, array when ready
  // Memoize to avoid dependency changes in useMemo hooks
  const recipes = useMemo(() => rawRecipes ?? [], [rawRecipes]);
  const packaging = useMemo(() => rawPackaging ?? [], [rawPackaging]);
  const products = useMemo(() => rawProducts ?? [], [rawProducts]);
  const ingredients = useMemo(() => rawIngredients ?? [], [rawIngredients]);
  const materials = useMemo(() => rawMaterials ?? [], [rawMaterials]);
  const tags = useMemo(() => rawTags ?? [], [rawTags]);

  // Loading states
  const loadingRecipes = rawRecipes === undefined;
  const loadingPackaging = rawPackaging === undefined;
  const loadingProducts = rawProducts === undefined;
  const loadingIngredients = rawIngredients === undefined;
  const loadingMaterials = rawMaterials === undefined;

  // Onboarding tour - auto-starts for first-time users when database is empty
  const isNewUser = products.length === 0 && recipes.length === 0;
  const { startTour } = useOnboardingTour(isNewUser);

  // Toggle tag selection (using string IDs for Convex)
  const handleToggleTag = (tagId: string | number) => {
    const id = String(tagId);
    setSelectedTagIds((prev) =>
      prev.includes(id)
        ? prev.filter((existing) => existing !== id)
        : [...prev, id]
    );
  };

  // Apply filtering and sorting - cast to the tag format expected
  const filteredRecipes = useMemo(
    () => filterAndSortByTags(recipes as unknown as TaggedItem[], selectedTagIds) as typeof recipes,
    [recipes, selectedTagIds]
  );

  const filteredPackaging = useMemo(
    () => filterAndSortByTags(packaging as unknown as TaggedItem[], selectedTagIds) as typeof packaging,
    [packaging, selectedTagIds]
  );

  const filteredProducts = useMemo(
    () => filterAndSortByTags(products as unknown as TaggedItem[], selectedTagIds) as typeof products,
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
          <h1 className="text-3xl font-bold tracking-tight mb-2">Welcome to Frollie Recipe Master</h1>
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
      {tags.length > 0 && (
        <TagFilterBar
          tags={tags}
          selectedTagIds={selectedTagIds}
          onToggleTag={handleToggleTag}
        />
      )}

      {/* Low Stock Alerts Widget */}
      <LowStockAlert />

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
        <div className="flex gap-2">
          {canAccessMenuProducts && (
            <Button variant="outline" size="sm" asChild>
              <Link to="/menu-products">
                <UtensilsCrossed className="h-4 w-4 mr-1" />
                Menu Products
              </Link>
            </Button>
          )}
          <Button variant="outline" size="sm" asChild>
            <Link to="/orders">View All Orders</Link>
          </Button>
        </div>
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
          canAccessMenuProducts ? (
            <Button size="sm" asChild className="shadow-sm">
              <Link to="/menu-products">
                <Plus className="h-4 w-4 mr-1" />
                New Product
              </Link>
            </Button>
          ) : undefined
        }
      >
        {loadingProducts ? (
          <LoadingCards count={4} />
        ) : (
          filteredProducts.map((product, index) => (
            <motion.div
              key={product._id}
              layout
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
            >
              <ProductCard product={product as Parameters<typeof ProductCard>[0]['product']} />
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
              key={recipe._id}
              layout
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
            >
              <RecipeCard recipe={recipe as Parameters<typeof RecipeCard>[0]['recipe']} />
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
              key={pkg._id}
              layout
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
            >
              <PackagingCard packaging={pkg as Parameters<typeof PackagingCard>[0]['packaging']} />
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
        itemCount={ingredients.length}
        isEmpty={!loadingIngredients && ingredients.length === 0}
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
          ingredients.map((ingredient) => (
            <IngredientCard key={ingredient._id} ingredient={ingredient as Parameters<typeof IngredientCard>[0]['ingredient']} />
          ))
        )}
      </Carousel>

      <Carousel
        title="Packaging Materials"
        description="Boxes, bags, labels, and other packaging components"
        icon={PackageOpen}
        itemCount={materials.length}
        isEmpty={!loadingMaterials && materials.length === 0}
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
          materials.map((material) => (
            <MaterialCard key={material._id} material={material as Parameters<typeof MaterialCard>[0]['material']} />
          ))
        )}
      </Carousel>
    </div>
  );
}
