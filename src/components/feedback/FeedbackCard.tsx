import { useState } from 'react';
import { Trash2, Archive, ArchiveRestore, MessageSquare, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/shared';
import { CommentSection } from './CommentSection';
import {
  useConvexDeleteFeedback,
  useConvexToggleFeedbackStatus,
  type FeedbackItem,
} from '@/hooks/convex/useFeedback';
import { formatTimestamp } from '@/lib/feedbackExport';
import { cn } from '@/lib/utils';

interface FeedbackCardProps {
  feedback: FeedbackItem;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

export function FeedbackCard({ feedback, isExpanded, onToggleExpand }: FeedbackCardProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const deleteFeedback = useConvexDeleteFeedback();
  const toggleStatus = useConvexToggleFeedbackStatus();

  const handleDelete = async () => {
    try {
      await deleteFeedback.mutate(feedback._id);
      setShowDeleteDialog(false);
    } catch (error) {
      console.error('Failed to delete feedback:', error);
    }
  };

  const handleToggleStatus = async () => {
    try {
      await toggleStatus.mutate(feedback._id);
    } catch (error) {
      console.error('Failed to toggle status:', error);
    }
  };

  const priorityColors = {
    high: 'bg-red-500',
    medium: 'bg-yellow-500',
    low: 'bg-green-500',
  };

  const priorityColor = priorityColors[feedback.priority];
  const commentCount = feedback.comments?.length || 0;

  return (
    <>
      <Card className="overflow-hidden hover:shadow-md transition-shadow">
        <CardContent className="p-0">
          {/* Collapsed view */}
          <button
            onClick={onToggleExpand}
            className="w-full text-left p-4 space-y-3 hover:bg-muted/50 transition-colors"
          >
            {/* Screenshot thumbnail */}
            {feedback.screenshotUrl && (
              <div className="relative rounded-md overflow-hidden border">
                <img
                  src={feedback.screenshotUrl}
                  alt="Feedback screenshot"
                  className="w-full max-h-24 object-cover object-top"
                />
              </div>
            )}

            {/* Description preview */}
            <p className={cn(
              "text-sm text-muted-foreground",
              !isExpanded && "line-clamp-2"
            )}>
              {feedback.description}
            </p>

            {/* Metadata row */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Priority dot */}
              <div className="flex items-center gap-1.5">
                <div className={cn("h-2 w-2 rounded-full", priorityColor)} />
                <span className="text-xs text-muted-foreground capitalize">
                  {feedback.priority}
                </span>
              </div>

              {/* Tags */}
              {feedback.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  {tag}
                </Badge>
              ))}

              {/* Comment count */}
              {commentCount > 0 && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground ml-auto">
                  <MessageSquare className="h-3 w-3" />
                  {commentCount}
                </div>
              )}

              {/* Expand indicator */}
              <div className="ml-auto">
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </div>

            {/* Timestamp */}
            <p className="text-xs text-muted-foreground">
              {formatTimestamp(feedback._creationTime)}
            </p>
          </button>

          {/* Expanded view */}
          {isExpanded && (
            <div className="px-4 pb-4 space-y-4">
              {/* Full screenshot */}
              {feedback.screenshotUrl && (
                <div className="rounded-md overflow-hidden border">
                  <img
                    src={feedback.screenshotUrl}
                    alt="Feedback screenshot"
                    className="w-full"
                  />
                </div>
              )}

              {/* Element selector */}
              {feedback.elementSelector && (
                <div className="space-y-1">
                  <p className="text-xs font-medium">Element Selector</p>
                  <code className="block text-xs bg-muted p-2 rounded-md overflow-x-auto">
                    {feedback.elementSelector}
                  </code>
                </div>
              )}

              {/* Page URL */}
              <div className="space-y-1">
                <p className="text-xs font-medium">Page</p>
                <a
                  href={feedback.pageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                >
                  {feedback.pageTitle}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>

              {/* Comments section */}
              <CommentSection
                feedbackId={feedback._id}
                comments={feedback.comments}
              />

              {/* Action buttons */}
              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleToggleStatus}
                  className="flex-1"
                >
                  {feedback.status === 'ongoing' ? (
                    <>
                      <Archive className="h-3 w-3 mr-1" />
                      Archive
                    </>
                  ) : (
                    <>
                      <ArchiveRestore className="h-3 w-3 mr-1" />
                      Restore
                    </>
                  )}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setShowDeleteDialog(true)}
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  Delete
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        title="Delete Feedback"
        description="Are you sure you want to delete this feedback? This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </>
  );
}
