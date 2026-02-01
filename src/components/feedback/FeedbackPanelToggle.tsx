import { MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useConvexOngoingFeedbackCount } from '@/hooks/convex/useFeedback';

interface FeedbackPanelToggleProps {
  open: boolean;
  onToggle: () => void;
}

export function FeedbackPanelToggle({ open, onToggle }: FeedbackPanelToggleProps) {
  const { count, isLoading } = useConvexOngoingFeedbackCount();

  return (
    <div className="fixed bottom-4 right-4 z-40">
      <Button
        size="lg"
        onClick={onToggle}
        className="relative h-14 w-14 rounded-full shadow-lg hover:shadow-xl transition-shadow"
        aria-label={open ? "Close feedback panel" : "Open feedback panel"}
      >
        <MessageSquare className="h-6 w-6" />
        {!isLoading && count > 0 && (
          <Badge
            variant="destructive"
            className="absolute -top-1 -right-1 h-6 w-6 p-0 flex items-center justify-center rounded-full text-xs"
          >
            {count > 99 ? '99+' : count}
          </Badge>
        )}
      </Button>
    </div>
  );
}
