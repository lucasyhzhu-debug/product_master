import { useState } from 'react';
import { Clipboard, FileText, AlertCircle, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { parseOrderTemplate } from '@/lib/orderTemplateParser';
import type { ParseResult } from '@/lib/orderTemplateParser';
import { toast } from 'sonner';

interface PasteTemplateBoxProps {
  onParsed: (result: ParseResult) => void;
}

export function PasteTemplateBox({ onParsed }: PasteTemplateBoxProps) {
  const [templateText, setTemplateText] = useState('');
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
        <Alert className="border-green-200 bg-green-50 text-green-900">
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
        <Alert className="border-red-200 bg-red-50 text-red-900">
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
      <Alert className="border-amber-200 bg-amber-50 text-amber-900">
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
          Parse & Create
        </Button>
      </div>

      {renderFeedback()}
      {renderWarnings()}
    </div>
  );
}
