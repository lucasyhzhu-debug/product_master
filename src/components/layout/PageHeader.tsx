import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PageHeaderProps {
  title: string;
  backTo?: string;
  backLabel?: string;
  action?: React.ReactNode;
}

export function PageHeader({ title, backTo, backLabel, action }: PageHeaderProps) {
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
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
