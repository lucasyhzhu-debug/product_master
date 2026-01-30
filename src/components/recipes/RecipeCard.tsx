import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/utils';

// Support both snake_case (legacy) and camelCase (Convex)
interface RecipeCardProps {
  recipe: {
    // ID can be number (legacy) or string (Convex _id)
    id?: number;
    _id?: string;
    name: string;
    // Support both formats
    latest_version?: number;
    latestVersion?: number;
    latest_version_name?: string;
    latestVersionName?: string;
    // Tags can be string[] or Tag[]
    tags: (string | { id?: number; _id?: string; name: string })[];
    total_cost?: number | null;
    totalCost?: number | null;
    cost_per_gram?: number | null;
    costPerGram?: number | null;
  };
}

export function RecipeCard({ recipe }: RecipeCardProps) {
  // Normalize field access
  const id = recipe._id ?? recipe.id;
  const latestVersion = recipe.latestVersion ?? recipe.latest_version ?? 1;
  const latestVersionName = recipe.latestVersionName ?? recipe.latest_version_name ?? '';
  const totalCost = recipe.totalCost ?? recipe.total_cost ?? 0;
  const costPerGram = recipe.costPerGram ?? recipe.cost_per_gram;

  // Normalize tags - can be string[] or Tag[]
  const tagNames = recipe.tags.map((t) => (typeof t === 'string' ? t : t.name));

  return (
    <Link to={`/recipes/${id}`}>
      <Card className="w-64 shrink-0 hover:shadow-md transition-shadow cursor-pointer">
        <CardHeader className="pb-2">
          <CardTitle className="text-base truncate">{recipe.name}</CardTitle>
          <p className="text-xs text-muted-foreground">
            v{latestVersion} - {latestVersionName}
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1">
              {tagNames.slice(0, 3).map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  {tag}
                </Badge>
              ))}
              {tagNames.length > 3 && (
                <Badge variant="outline" className="text-xs">
                  +{tagNames.length - 3}
                </Badge>
              )}
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total Cost:</span>
              <span className="font-medium">{formatCurrency(totalCost)}</span>
            </div>
            {costPerGram !== null && costPerGram !== undefined && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Per gram:</span>
                <span className="font-medium">{formatCurrency(costPerGram)}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
