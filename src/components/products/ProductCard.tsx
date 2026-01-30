import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatPercent } from '@/lib/utils';
import type { ProductSummary } from '@/lib/types';
import { cn } from '@/lib/utils';

interface ProductCardProps {
  product: ProductSummary;
}

export function ProductCard({ product }: ProductCardProps) {
  const marginColor =
    product.contribution_margin_pct !== null
      ? product.contribution_margin_pct >= 30
        ? 'text-green-600'
        : product.contribution_margin_pct >= 15
        ? 'text-yellow-600'
        : 'text-red-600'
      : '';

  return (
    <Link to={`/products/${product.id}`}>
      <Card className="w-64 shrink-0 hover:shadow-md transition-shadow cursor-pointer">
        <CardHeader className="pb-2">
          <CardTitle className="text-base truncate">{product.name}</CardTitle>
          <p className="text-xs text-muted-foreground">
            v{product.latest_version} - {product.latest_version_name}
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1">
              {product.tags.slice(0, 3).map((tag) => (
                <Badge key={tag.id} variant="secondary" className="text-xs">
                  {tag.name}
                </Badge>
              ))}
              {product.tags.length > 3 && (
                <Badge variant="outline" className="text-xs">
                  +{product.tags.length - 3}
                </Badge>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              <p>Recipe: {product.recipe_name}</p>
              <p>Packaging: {product.packaging_name}</p>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">COGS:</span>
              <span className="font-medium">{formatCurrency(product.total_cogs)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Retail:</span>
              <span className="font-medium">{formatCurrency(product.retail_price_idr)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Margin:</span>
              <span className={cn('font-medium', marginColor)}>
                {formatPercent(product.contribution_margin_pct)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
