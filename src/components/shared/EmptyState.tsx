import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <Card className="border-dashed">
      <CardContent className="py-16 text-center">
        {/* Larger icon circle: 96px diameter, muted/50 bg, gentler icon */}
        <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-muted/50 flex items-center justify-center">
          <Icon className="h-12 w-12 text-muted-foreground/60" />
        </div>
        <h3 className="text-lg font-semibold mb-2">{title}</h3>
        <p className="text-muted-foreground mb-6 max-w-md mx-auto leading-relaxed">
          {description}
        </p>
        {action && (
          <Button onClick={action.onClick} size="lg">
            {action.label}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
