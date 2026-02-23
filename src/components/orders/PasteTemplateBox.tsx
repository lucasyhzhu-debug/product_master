import { useState, useEffect } from 'react';
import { Clipboard, FileText, AlertCircle, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { parseOrderTemplate } from '@/lib/orderTemplateParser';
import type { ParseResult } from '@/lib/orderTemplateParser';
import { toast } from 'sonner';

interface PasteTemplateBoxProps {
  onParsed: (result: ParseResult) => void;
  initialValue?: string;
}

export function PasteTemplateBox({ onParsed, initialValue = '' }: PasteTemplateBoxProps) {
  const [templateText, setTemplateText] = useState(initialValue);

  // Update textarea when initialValue changes (for async loading from Convex)
  useEffect(() => {
    if (initialValue && !templateText) {
      setTemplateText(initialValue);
    }
  }, [initialValue, templateText]);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setTemplateText(text);
      toast.success('Pasted from clipboard');
    } catch {
      toast.error('Could not access clipboard');
    }
  };

  const handleParse = () => {
    if (!templateText.trim()) {
      toast.error('Please paste a template first');
      return;
    }

    const result = parseOrderTemplate(templateText);
    setParseResult(result);

    if (result.parseSuccess) {
      onParsed(result);
      toast.success('Template parsed successfully');
    } else {
      toast.error('Failed to parse template');
    }
  };

  const renderFeedback = () => {
    if (!parseResult) return null;

    // Success (items found)
    if (parseResult.parseSuccess && parseResult.items.length > 0) {
      const itemCount = parseResult.items.length;
      const customerFound = parseResult.customer !== null;

      return (
        <Alert className="border-[var(--color-status-success)]/30 bg-[var(--color-status-success-bg)] text-[var(--color-status-success)]">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertTitle>Success</AlertTitle>
          <AlertDescription>
            Parsed {itemCount} item{itemCount !== 1 ? 's' : ''}{customerFound ? ', customer found' : ', no customer info'}
          </AlertDescription>
        </Alert>
      );
    }

    // Failure (no products)
    if (!parseResult.parseSuccess) {
      return (
        <Alert className="border-[var(--color-status-error)]/30 bg-[var(--color-status-error-bg)] text-[var(--color-status-error)]">
          <AlertCircle className="h-4 w-4 text-red-600" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            No products found in template
          </AlertDescription>
        </Alert>
      );
    }

    return null;
  };

  const renderWarnings = () => {
    if (!parseResult || parseResult.parseWarnings.length === 0) return null;

    return (
      <Alert className="border-[var(--color-status-warning)]/30 bg-[var(--color-status-warning-bg)] text-[var(--color-status-warning)]">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <AlertTitle>Warnings</AlertTitle>
        <AlertDescription>
          <ul className="list-disc list-inside space-y-1 mt-1">
            {parseResult.parseWarnings.map((warning, index) => (
              <li key={index} className="text-sm">{warning}</li>
            ))}
          </ul>
        </AlertDescription>
      </Alert>
    );
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Textarea
          value={templateText}
          onChange={(e) => setTemplateText(e.target.value)}
          placeholder="Paste WhatsApp order template here..."
          className="min-h-[120px] font-mono text-sm"
        />
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <Button
          variant="outline"
          onClick={handlePaste}
          className="w-full sm:w-auto"
        >
          <Clipboard className="h-4 w-4 mr-2" />
          Paste from Clipboard
        </Button>
        <Button onClick={handleParse} className="w-full sm:w-auto">
          <FileText className="h-4 w-4 mr-2" />
          Load Customer Orders
        </Button>
      </div>

      {renderFeedback()}
      {renderWarnings()}
    </div>
  );
}
