import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/utils';
import type { PackagingRecipeSummary } from '@/lib/types';

interface PackagingCardProps {
  packaging: PackagingRecipeSummary;
}

export function PackagingCard({ packaging }: PackagingCardProps) {
  return (
    <Link to={`/packaging/${packaging.id}`}>
      <Card className="w-64 shrink-0 hover:shadow-md transition-shadow cursor-pointer">
        <CardHeader className="pb-2">
          <CardTitle className="text-base truncate">{packaging.name}</CardTitle>
          <p className="text-xs text-muted-foreground">
            v{packaging.latest_version} - {packaging.latest_version_name}
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1">
              {packaging.tags.slice(0, 3).map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  {tag}
                </Badge>
              ))}
              {packaging.tags.length > 3 && (
                <Badge variant="outline" className="text-xs">
                  +{packaging.tags.length - 3}
                </Badge>
              )}
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total Cost:</span>
              <span className="font-medium">{formatCurrency(packaging.total_cost)}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
