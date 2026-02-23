import { useState } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { useAddFeedbackComment } from '@/hooks/convex/useFeedback';
import { formatTimestamp } from '@/lib/feedbackExport';
import type { Id } from '../../../convex/_generated/dataModel';
import type { FeedbackComment } from '@/hooks/convex/useFeedback';

interface CommentSectionProps {
  feedbackId: Id<"feedback">;
  comments?: FeedbackComment[];
}

export function CommentSection({ feedbackId, comments = [] }: CommentSectionProps) {
  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const addComment = useAddFeedbackComment();

  const handleSubmit = async () => {
    if (!newComment.trim()) return;

    setIsSubmitting(true);
    try {
      await addComment.mutate(feedbackId, newComment.trim());
      setNewComment('');
    } catch (error) {
      console.error('Failed to add comment:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="space-y-3">
      <Separator />

      <div className="space-y-3">
        <h4 className="text-sm font-medium">Comments</h4>

        {/* Existing comments */}
        {comments.length > 0 ? (
          <div className="space-y-2">
            {comments.map((comment, index) => (
              <div key={index} className="text-sm space-y-1 p-2 rounded-md bg-muted/50">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium text-xs">
                    {comment.createdBy || 'Anonymous'}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatTimestamp(comment.createdAt)}
                  </span>
                </div>
                <p className="text-muted-foreground whitespace-pre-wrap">
                  {comment.content}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">No comments yet</p>
        )}

        {/* Add comment form */}
        <div className="space-y-2">
          <Textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Add a comment... (Cmd/Ctrl + Enter to submit)"
            className="min-h-[60px] text-sm resize-none"
            disabled={isSubmitting}
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={!newComment.trim() || isSubmitting}
            >
              <Send className="h-3 w-3 mr-1" />
              {isSubmitting ? 'Sending...' : 'Send'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
