import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PageHeaderProps {
  title: string;
  description?: string;
  backTo?: string;
  backLabel?: string;
  action?: ReactNode;
  children?: ReactNode;
  badge?: ReactNode;
}

export function PageHeader({ title, description, backTo, backLabel, action, children, badge }: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-4">
        {backTo && (
          <Button variant="ghost" size="sm" asChild>
            <Link to={backTo} className="flex items-center gap-1">
              <ChevronLeft className="h-4 w-4" />
              {backLabel || 'Back'}
            </Link>
          </Button>
        )}
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            {badge}
          </div>
          {description && (
            <p className="text-sm text-muted-foreground mt-1">{description}</p>
          )}
        </div>
      </div>
      {(action || children) && <div>{action || children}</div>}
    </div>
  );
}
