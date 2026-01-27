import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/utils';
import type { RecipeSummary } from '@/lib/types';

interface RecipeCardProps {
  recipe: RecipeSummary;
}

export function RecipeCard({ recipe }: RecipeCardProps) {
  return (
    <Link to={`/recipes/${recipe.id}`}>
      <Card className="w-64 shrink-0 hover:shadow-md transition-shadow cursor-pointer">
        <CardHeader className="pb-2">
          <CardTitle className="text-base truncate">{recipe.name}</CardTitle>
          <p className="text-xs text-muted-foreground">
            v{recipe.latest_version} - {recipe.latest_version_name}
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1">
              {recipe.tags.slice(0, 3).map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  {tag}
                </Badge>
              ))}
              {recipe.tags.length > 3 && (
                <Badge variant="outline" className="text-xs">
                  +{recipe.tags.length - 3}
                </Badge>
              )}
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total Cost:</span>
              <span className="font-medium">{formatCurrency(recipe.total_cost)}</span>
            </div>
            {recipe.cost_per_gram !== null && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Per gram:</span>
                <span className="font-medium">{formatCurrency(recipe.cost_per_gram)}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
