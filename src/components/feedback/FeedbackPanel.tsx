import { useState } from 'react';
import { Plus, Inbox } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { FeedbackCard } from './FeedbackCard';
import { ExportButton } from './ExportButton';
import { useConvexFeedbackList, type FeedbackStatus } from '@/hooks/convex/useFeedback';

interface FeedbackPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStartCapture: () => void;
}

export function FeedbackPanel({ open, onOpenChange, onStartCapture }: FeedbackPanelProps) {
  const [activeTab, setActiveTab] = useState<FeedbackStatus>('ongoing');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: feedbackList, isLoading } = useConvexFeedbackList(activeTab);

  const handleToggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:w-96 sm:max-w-96 p-0 flex flex-col"
      >
        {/* Header */}
        <SheetHeader className="px-6 py-4 border-b">
          <div className="flex items-center justify-between">
            <SheetTitle>Feedback</SheetTitle>
            <ExportButton />
          </div>
        </SheetHeader>

        {/* Tabs */}
        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as FeedbackStatus)}
          className="flex-1 flex flex-col overflow-hidden"
        >
          <div className="px-6 pt-4">
            <TabsList className="w-full grid grid-cols-2">
              <TabsTrigger value="ongoing">Ongoing</TabsTrigger>
              <TabsTrigger value="archived">Archived</TabsTrigger>
            </TabsList>
          </div>

          {/* Ongoing Tab */}
          <TabsContent value="ongoing" className="flex-1 overflow-hidden m-0">
            <ScrollArea className="h-full px-6 py-4">
              {isLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-48 w-full" />
                  <Skeleton className="h-48 w-full" />
                  <Skeleton className="h-48 w-full" />
                </div>
              ) : feedbackList && feedbackList.length > 0 ? (
                <div className="space-y-4 pb-4">
                  {feedbackList.map((feedback) => (
                    <FeedbackCard
                      key={feedback._id}
                      feedback={feedback}
                      isExpanded={expandedId === feedback._id}
                      onToggleExpand={() => handleToggleExpand(feedback._id)}
                    />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Inbox className="h-12 w-12 text-muted-foreground mb-3" />
                  <p className="text-sm font-medium">No ongoing feedback</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Capture your first feedback below
                  </p>
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          {/* Archived Tab */}
          <TabsContent value="archived" className="flex-1 overflow-hidden m-0">
            <ScrollArea className="h-full px-6 py-4">
              {isLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-48 w-full" />
                  <Skeleton className="h-48 w-full" />
                </div>
              ) : feedbackList && feedbackList.length > 0 ? (
                <div className="space-y-4 pb-4">
                  {feedbackList.map((feedback) => (
                    <FeedbackCard
                      key={feedback._id}
                      feedback={feedback}
                      isExpanded={expandedId === feedback._id}
                      onToggleExpand={() => handleToggleExpand(feedback._id)}
                    />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Inbox className="h-12 w-12 text-muted-foreground mb-3" />
                  <p className="text-sm font-medium">No archived feedback</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Archived items will appear here
                  </p>
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>

        {/* Footer */}
        <div className="px-6 py-4 border-t">
          <Button
            className="w-full"
            onClick={() => {
              onStartCapture();
              onOpenChange(false);
            }}
          >
            <Plus className="h-4 w-4 mr-2" />
            New Capture
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
