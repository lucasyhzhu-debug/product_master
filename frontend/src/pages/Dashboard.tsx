import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Carousel, LoadingCards } from '@/components/shared';
import { TagFilterBar } from '@/components/shared/TagFilterBar';
import { RecipeCard } from '@/components/recipes/RecipeCard';
import { PackagingCard } from '@/components/packaging/PackagingCard';
import { ProductCard } from '@/components/products/ProductCard';
import { IngredientCard } from '@/components/ingredients/IngredientCard';
import { useRecipes } from '@/hooks/useRecipes';
import { usePackagingRecipes } from '@/hooks/usePackaging';
import { useProducts } from '@/hooks/useProducts';
import { useIngredients } from '@/hooks/useIngredients';
import { useTags } from '@/hooks/useTags';
import type { RecipeSummary, PackagingRecipeSummary, ProductSummary } from '@/lib/types';

export function Dashboard() {
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);

  const { data: recipes, isLoading: loadingRecipes } = useRecipes();
  const { data: packaging, isLoading: loadingPackaging } = usePackagingRecipes();
  const { data: products, isLoading: loadingProducts } = useProducts();
  const { data: ingredients, isLoading: loadingIngredients } = useIngredients();
  const { data: tags } = useTags();

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
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Manage your recipes, packaging, and products
        </p>
      </div>

      {/* Tag Filter Bar */}
      {tags && tags.length > 0 && (
        <TagFilterBar
          tags={tags}
          selectedTagIds={selectedTagIds}
          onToggleTag={handleToggleTag}
        />
      )}

      <Carousel
        title="Products"
        isEmpty={!loadingProducts && filteredProducts.length === 0}
        emptyMessage={
          selectedTagIds.length > 0
            ? "No products match the selected tags."
            : "No products yet. Create your first product!"
        }
        action={
          <Button size="sm" asChild>
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
        isEmpty={!loadingRecipes && filteredRecipes.length === 0}
        emptyMessage={
          selectedTagIds.length > 0
            ? "No recipes match the selected tags."
            : "No recipes yet. Create your first recipe!"
        }
        action={
          <Button size="sm" asChild>
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
        title="Packaging"
        isEmpty={!loadingPackaging && filteredPackaging.length === 0}
        emptyMessage={
          selectedTagIds.length > 0
            ? "No packaging recipes match the selected tags."
            : "No packaging recipes yet. Create your first packaging!"
        }
        action={
          <Button size="sm" asChild>
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

      <Carousel
        title="Ingredients"
        isEmpty={!loadingIngredients && (!ingredients || ingredients.length === 0)}
        emptyMessage="No ingredients yet. Create your first ingredient!"
        action={
          <Button size="sm" asChild>
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
    </div>
  );
}
