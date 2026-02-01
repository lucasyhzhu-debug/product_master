import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useConvexFeedbackExport } from '@/hooks/convex/useFeedback';
import { generatePrdMarkdown, copyToClipboard } from '@/lib/feedbackExport';
import { toast } from 'sonner';

export function ExportButton() {
  const { data: feedbackItems, isLoading } = useConvexFeedbackExport();
  const [copied, setCopied] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    if (!feedbackItems || feedbackItems.length === 0) {
      toast.error('No ongoing feedback to export');
      return;
    }

    setIsExporting(true);
    try {
      const markdown = generatePrdMarkdown(feedbackItems);
      await copyToClipboard(markdown);
      setCopied(true);
      toast.success('Copied to clipboard!');

      // Reset copied state after 2 seconds
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to export feedback:', error);
      toast.error('Failed to copy to clipboard');
    } finally {
      setIsExporting(false);
    }
  };

  const hasItems = feedbackItems && feedbackItems.length > 0;
  const disabled = isLoading || !hasItems || isExporting;

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleExport}
      disabled={disabled}
      className="gap-2"
    >
      {copied ? (
        <>
          <Check className="h-4 w-4" />
          Copied!
        </>
      ) : (
        <>
          <Copy className="h-4 w-4" />
          Export PRD
        </>
      )}
    </Button>
  );
}
