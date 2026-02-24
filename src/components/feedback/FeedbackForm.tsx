import { useState } from 'react';
import { Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  useGenerateUploadUrl,
  useCreateFeedback,
  uploadScreenshot,
  type FeedbackPriority,
  type FeedbackTag,
} from '@/hooks/convex/useFeedback';

interface FeedbackFormProps {
  capturedBlob: Blob;
  elementSelector?: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export function FeedbackForm({
  capturedBlob,
  elementSelector,
  onSuccess,
  onCancel,
}: FeedbackFormProps) {
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<FeedbackPriority>('medium');
  const [tags, setTags] = useState<FeedbackTag[]>([]);
  const [createdBy, setCreatedBy] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const generateUploadUrl = useGenerateUploadUrl();
  const createFeedback = useCreateFeedback();

  const screenshotUrl = URL.createObjectURL(capturedBlob);
  const pageUrl = window.location.href;
  const pageTitle = document.title;

  const handleSubmit = async () => {
    if (!description.trim()) {
      return;
    }

    setIsSubmitting(true);
    try {
      // Upload screenshot
      const storageId = await uploadScreenshot(
        generateUploadUrl.mutate,
        capturedBlob
      );

      // Create feedback
      await createFeedback.mutate({
        screenshotStorageId: storageId,
        elementSelector,
        pageUrl,
        pageTitle,
        description: description.trim(),
        priority,
        tags,
        createdBy: createdBy.trim() || undefined,
      });

      onSuccess();
    } catch (error) {
      console.error('Failed to submit feedback:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleTag = (tag: FeedbackTag) => {
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const priorities: FeedbackPriority[] = ['low', 'medium', 'high'];
  const availableTags: FeedbackTag[] = ['bug', 'enhancement', 'question'];

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="text-lg">Submit Feedback</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Screenshot preview */}
        <div className="space-y-2">
          <Label>Screenshot Preview</Label>
          <div className="rounded-md overflow-hidden border">
            <img
              src={screenshotUrl}
              alt="Screenshot preview"
              className="w-full max-h-64 object-contain bg-muted"
            />
          </div>
        </div>

        {/* Page info (readonly) */}
        <div className="space-y-2">
          <Label>Page</Label>
          <div className="text-sm space-y-1">
            <p className="font-medium">{pageTitle}</p>
            <p className="text-xs text-muted-foreground truncate">{pageUrl}</p>
          </div>
        </div>

        {/* Element selector (if present) */}
        {elementSelector && (
          <div className="space-y-2">
            <Label>Element</Label>
            <code className="block text-xs bg-muted p-2 rounded-md overflow-x-auto">
              {elementSelector}
            </code>
          </div>
        )}

        {/* Description */}
        <div className="space-y-2">
          <Label htmlFor="description" className="text-destructive">
            Description *
          </Label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the issue, enhancement, or question..."
            className="min-h-[100px]"
            disabled={isSubmitting}
          />
        </div>

        {/* Priority */}
        <div className="space-y-2">
          <Label>Priority</Label>
          <div className="flex gap-2">
            {priorities.map((p) => (
              <Button
                key={p}
                type="button"
                variant={priority === p ? 'default' : 'outline'}
                size="sm"
                onClick={() => setPriority(p)}
                disabled={isSubmitting}
                className="capitalize"
              >
                {p}
              </Button>
            ))}
          </div>
        </div>

        {/* Tags */}
        <div className="space-y-2">
          <Label>Tags</Label>
          <div className="flex gap-2 flex-wrap">
            {availableTags.map((tag) => (
              <Badge
                key={tag}
                variant={tags.includes(tag) ? 'default' : 'outline'}
                className="cursor-pointer capitalize"
                onClick={() => !isSubmitting && toggleTag(tag)}
              >
                {tag}
              </Badge>
            ))}
          </div>
        </div>

        {/* Created by (optional) */}
        <div className="space-y-2">
          <Label htmlFor="createdBy">Your Name (optional)</Label>
          <Input
            id="createdBy"
            value={createdBy}
            onChange={(e) => setCreatedBy(e.target.value)}
            placeholder="Anonymous"
            disabled={isSubmitting}
          />
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 pt-2">
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={isSubmitting}
            className="flex-1"
          >
            <X className="h-4 w-4 mr-1" />
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!description.trim() || isSubmitting}
            className="flex-1"
          >
            <Save className="h-4 w-4 mr-1" />
            {isSubmitting ? 'Submitting...' : 'Submit'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
