import * as React from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Check, Copy, Globe, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// ============================================
// Types
// ============================================

export type WhatsAppTemplateType =
  | 'payment_request'
  | 'production_started'
  | 'delivery_complete'
  | 'receipt'
  | 'shipping'
  | 'pickup_ready';

export type Language = 'id' | 'en';

interface StepWhatsAppTemplateProps {
  orderId: Id<'orders'>;
  templateType: WhatsAppTemplateType;
  customerPhone?: string | null;
  className?: string;
}

// ============================================
// Template Display Names
// ============================================

const TEMPLATE_NAMES: Record<WhatsAppTemplateType, { id: string; en: string }> = {
  payment_request: { id: 'Permintaan Pembayaran', en: 'Payment Request' },
  production_started: { id: 'Produksi Dimulai', en: 'Production Started' },
  delivery_complete: { id: 'Pengiriman Selesai', en: 'Delivery Complete' },
  receipt: { id: 'Struk Order', en: 'Order Receipt' },
  shipping: { id: 'Konfirmasi Pengiriman', en: 'Shipping Confirmation' },
  pickup_ready: { id: 'Siap Diambil', en: 'Ready for Pickup' },
};

// ============================================
// Main Component
// ============================================

export function StepWhatsAppTemplate({
  orderId,
  templateType,
  customerPhone,
  className,
}: StepWhatsAppTemplateProps) {
  const [language, setLanguage] = React.useState<Language>('id');
  const [copied, setCopied] = React.useState(false);

  // Fetch WhatsApp message from Convex
  const message = useQuery(api.orders.whatsapp.getMessage, {
    orderId,
    template: templateType,
  });

  const isLoading = message === undefined;

  // Handle copy to clipboard
  const handleCopy = React.useCallback(async () => {
    if (!message) return;

    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
      toast.error('Failed to copy');
    }
  }, [message]);

  // Handle send via WhatsApp
  const handleSendWhatsApp = React.useCallback(() => {
    if (!message) return;

    const encodedMessage = encodeURIComponent(message);
    const phoneNumber = customerPhone?.replace(/\D/g, '') || '';

    // Construct WhatsApp URL
    const url = phoneNumber
      ? `https://wa.me/${phoneNumber}?text=${encodedMessage}`
      : `https://wa.me/?text=${encodedMessage}`;

    window.open(url, '_blank');
  }, [message, customerPhone]);

  // Toggle language
  const toggleLanguage = React.useCallback(() => {
    setLanguage((prev) => (prev === 'id' ? 'en' : 'id'));
  }, []);

  const templateName = TEMPLATE_NAMES[templateType]?.[language] || templateType;

  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardContent className="p-4 space-y-3">
        {/* Header with language toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-green-600" />
            <span className="font-medium text-sm">{templateName}</span>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={toggleLanguage}
            className="h-7 px-2 text-xs gap-1"
          >
            <Globe className="h-3 w-3" />
            {language.toUpperCase()}
          </Button>
        </div>

        {/* Message Preview */}
        <div className="rounded-lg bg-muted/50 p-3 min-h-[100px] max-h-[200px] overflow-y-auto">
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ) : (
            <pre className="text-sm whitespace-pre-wrap font-sans text-foreground/80">
              {message}
            </pre>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopy}
            disabled={isLoading || !message}
            className="flex-1 gap-2"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4 text-green-500" />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                Copy
              </>
            )}
          </Button>

          <Button
            variant="default"
            size="sm"
            onClick={handleSendWhatsApp}
            disabled={isLoading || !message}
            className="flex-1 gap-2 bg-green-600 hover:bg-green-700"
          >
            <MessageCircle className="h-4 w-4" />
            Send WA
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default StepWhatsAppTemplate;
