import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Carousel, LoadingCards } from '@/components/shared';
import { RecipeCard } from '@/components/recipes/RecipeCard';
import { PackagingCard } from '@/components/packaging/PackagingCard';
import { ProductCard } from '@/components/products/ProductCard';
import { useRecipes } from '@/hooks/useRecipes';
import { usePackagingRecipes } from '@/hooks/usePackaging';
import { useProducts } from '@/hooks/useProducts';

export function Dashboard() {
  const { data: recipes, isLoading: loadingRecipes } = useRecipes();
  const { data: packaging, isLoading: loadingPackaging } = usePackagingRecipes();
  const { data: products, isLoading: loadingProducts } = useProducts();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Manage your recipes, packaging, and products
        </p>
      </div>

      <Carousel
        title="Products"
        isEmpty={!loadingProducts && (!products || products.length === 0)}
        emptyMessage="No products yet. Create your first product!"
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
          products?.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))
        )}
      </Carousel>

      <Carousel
        title="Recipes"
        isEmpty={!loadingRecipes && (!recipes || recipes.length === 0)}
        emptyMessage="No recipes yet. Create your first recipe!"
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
          recipes?.map((recipe) => (
            <RecipeCard key={recipe.id} recipe={recipe} />
          ))
        )}
      </Carousel>

      <Carousel
        title="Packaging"
        isEmpty={!loadingPackaging && (!packaging || packaging.length === 0)}
        emptyMessage="No packaging recipes yet. Create your first packaging!"
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
          packaging?.map((pkg) => (
            <PackagingCard key={pkg.id} packaging={pkg} />
          ))
        )}
      </Carousel>
    </div>
  );
}
