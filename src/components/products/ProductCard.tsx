import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatPercent } from '@/lib/utils';
import { cn } from '@/lib/utils';

// Support both snake_case (legacy) and camelCase (Convex)
interface ProductCardProps {
  product: {
    // ID can be number (legacy) or string (Convex _id)
    id?: number;
    _id?: string;
    name: string;
    // Support both formats
    latest_version?: number;
    latestVersion?: number;
    latest_version_name?: string;
    latestVersionName?: string;
    // Tags can be Tag[] or { _id, name }[]
    tags: { id?: number; _id?: string; name: string }[];
    recipe_name?: string | null;
    recipeName?: string | null;
    packaging_name?: string | null;
    packagingName?: string | null;
    total_cogs?: number | null;
    totalCogs?: number | null;
    retail_price_idr?: number | null;
    retailPriceIdr?: number | null;
    contribution_margin_pct?: number | null;
    contributionMarginPct?: number | null;
  };
}

export function ProductCard({ product }: ProductCardProps) {
  // Normalize field access
  const id = product._id ?? product.id;
  const latestVersion = product.latestVersion ?? product.latest_version ?? 1;
  const latestVersionName = product.latestVersionName ?? product.latest_version_name ?? '';
  const recipeName = product.recipeName ?? product.recipe_name;
  const packagingName = product.packagingName ?? product.packaging_name;
  const totalCogs = product.totalCogs ?? product.total_cogs ?? 0;
  const retailPriceIdr = product.retailPriceIdr ?? product.retail_price_idr ?? 0;
  const contributionMarginPct = product.contributionMarginPct ?? product.contribution_margin_pct;

  // Normalize tag IDs for keys
  const tags = product.tags.map((t) => ({
    id: t._id ?? t.id,
    name: t.name,
  }));

  const marginColor =
    contributionMarginPct !== null && contributionMarginPct !== undefined
      ? contributionMarginPct >= 30
        ? 'text-green-600'
        : contributionMarginPct >= 15
        ? 'text-yellow-600'
        : 'text-red-600'
      : '';

  return (
    <Link to={`/products/${id}`}>
      <Card className="w-64 shrink-0 hover:shadow-md transition-shadow cursor-pointer">
        <CardHeader className="pb-2">
          <CardTitle className="text-base truncate">{product.name}</CardTitle>
          <p className="text-xs text-muted-foreground">
            v{latestVersion} - {latestVersionName}
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1">
              {tags.slice(0, 3).map((tag) => (
                <Badge key={String(tag.id)} variant="secondary" className="text-xs">
                  {tag.name}
                </Badge>
              ))}
              {tags.length > 3 && (
                <Badge variant="outline" className="text-xs">
                  +{tags.length - 3}
                </Badge>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              <p>Recipe: {recipeName}</p>
              <p>Packaging: {packagingName}</p>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">COGS:</span>
              <span className="font-medium">{formatCurrency(totalCogs)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Retail:</span>
              <span className="font-medium">{formatCurrency(retailPriceIdr)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Margin:</span>
              <span className={cn('font-medium', marginColor)}>
                {formatPercent(contributionMarginPct)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
