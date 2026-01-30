import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/utils';

// Support both snake_case (legacy) and camelCase (Convex)
interface PackagingCardProps {
  packaging: {
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
  };
}

export function PackagingCard({ packaging }: PackagingCardProps) {
  // Normalize field access
  const id = packaging._id ?? packaging.id;
  const latestVersion = packaging.latestVersion ?? packaging.latest_version ?? 1;
  const latestVersionName = packaging.latestVersionName ?? packaging.latest_version_name ?? '';
  const totalCost = packaging.totalCost ?? packaging.total_cost ?? 0;

  // Normalize tags - can be string[] or Tag[]
  const tagNames = packaging.tags.map((t) => (typeof t === 'string' ? t : t.name));

  return (
    <Link to={`/packaging/${id}`}>
      <Card className="w-64 shrink-0 hover:shadow-md transition-shadow cursor-pointer">
        <CardHeader className="pb-2">
          <CardTitle className="text-base truncate">{packaging.name}</CardTitle>
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
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
