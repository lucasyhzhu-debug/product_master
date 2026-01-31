import { useState, useEffect } from 'react';
import { Copy, Check, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import type { OrderDetail, WhatsAppTemplateTab, WhatsAppLanguage } from '@/lib/types';
import {
  generateTemplate,
  getVisibleTabs,
  getTabLabel,
} from '@/lib/whatsappTemplates';

interface OrderWhatsAppPanelProps {
  order: OrderDetail;
  copied: boolean;
  onCopy: (text: string) => void;
}

export function OrderWhatsAppPanel({
  order,
  copied,
  onCopy,
}: OrderWhatsAppPanelProps) {
  const [language, setLanguage] = useState<WhatsAppLanguage>('id');
  const [activeTab, setActiveTab] = useState<WhatsAppTemplateTab>('order_confirmation');
  const [editedTexts, setEditedTexts] = useState<Record<string, string>>({});

  // Get visible tabs based on order status
  const visibleTabs = getVisibleTabs(order.status);

  // Reset to first tab if current tab is no longer visible
  useEffect(() => {
    if (!visibleTabs.includes(activeTab)) {
      setActiveTab(visibleTabs[0]);
    }
  }, [order.status, activeTab, visibleTabs]);

  // Get current template text (edited or generated)
  const getTemplateText = (tab: WhatsAppTemplateTab): string => {
    const key = `${tab}_${language}`;
    if (editedTexts[key] !== undefined) {
      return editedTexts[key];
    }
    return generateTemplate(tab, order, language);
  };

  // Handle text edit
  const handleTextChange = (tab: WhatsAppTemplateTab, text: string) => {
    const key = `${tab}_${language}`;
    setEditedTexts((prev) => ({ ...prev, [key]: text }));
  };

  // Reset edited text to generated template
  const handleResetText = (tab: WhatsAppTemplateTab) => {
    const key = `${tab}_${language}`;
    setEditedTexts((prev) => {
      const updated = { ...prev };
      delete updated[key];
      return updated;
    });
  };

  const isEdited = editedTexts[`${activeTab}_${language}`] !== undefined;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            WhatsApp Messages
          </CardTitle>
          {/* Language Toggle */}
          <div className="flex items-center gap-1 bg-muted rounded-md p-0.5">
            <Button
              variant={language === 'id' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setLanguage('id')}
            >
              Bahasa
            </Button>
            <Button
              variant={language === 'en' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setLanguage('en')}
            >
              English
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as WhatsAppTemplateTab)}
        >
          <TabsList className="w-full flex-wrap h-auto gap-1 p-1">
            {visibleTabs.map((tab) => (
              <TabsTrigger
                key={tab}
                value={tab}
                className="text-xs px-2 py-1.5 flex-1 min-w-[70px]"
              >
                {getTabLabel(tab, language)}
              </TabsTrigger>
            ))}
          </TabsList>

          {visibleTabs.map((tab) => (
            <TabsContent key={tab} value={tab} className="mt-3">
              <div className="space-y-2">
                <Textarea
                  value={getTemplateText(tab)}
                  onChange={(e) => handleTextChange(tab, e.target.value)}
                  className="min-h-[280px] text-xs font-mono leading-relaxed"
                />
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    className="flex-1 justify-center"
                    onClick={() => onCopy(getTemplateText(tab))}
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Copy to Clipboard
                  </Button>
                  {isEdited && tab === activeTab && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleResetText(tab)}
                    >
                      Reset
                    </Button>
                  )}
                </div>
              </div>
            </TabsContent>
          ))}
        </Tabs>

        {copied && (
          <div className="flex items-center justify-center text-sm text-green-600 animate-in fade-in slide-in-from-bottom-2">
            <Check className="h-4 w-4 mr-1" />
            Copied to clipboard!
          </div>
        )}
      </CardContent>
    </Card>
  );
}
