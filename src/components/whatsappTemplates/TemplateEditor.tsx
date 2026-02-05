import { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { X, CheckCheck, RotateCcw, Save, Loader2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { VariableReference } from "./VariableReference";
import {
  useConvexUpdateWhatsAppTemplate,
  useConvexResetWhatsAppTemplate,
} from "@/hooks/convex/useWhatsAppTemplates";
import { useAuth } from "@/contexts/AuthContext";
import type { Doc } from "../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";

type WhatsAppTemplate = Doc<"whatsappTemplates">;

interface TemplateEditorProps {
  template: WhatsAppTemplate | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Template icons
const TEMPLATE_ICONS: Record<string, string> = {
  payment_request: "💳",
  production_started: "🍳",
  delivery_complete: "📦",
  receipt: "🧾",
  shipping: "🚚",
  pickup_ready: "🏪",
};

// Sample data for preview
const SAMPLE_DATA: Record<string, string> = {
  "{customer_name}": "Budi Santoso",
  "{order_number}": "0204-001",
  "{items_list}": "• 2x Dubai Original (80g) @ 50k\n• 1x Dubai Bite Pack @ 45k",
  "{total_amount}": "IDR 145,000",
  "{delivery_info}": "📍 Delivery to: Jl. Sudirman No. 123, Jakarta",
  "{due_date}": "05 Feb 2026",
  "{discount_note}": "\n(Includes IDR 5,000 discount!)",
  "{payment_info}": "Payment: Paid (BCA Transfer)",
  "{notes_section}": "",
  "{status_label}": "[Confirmed]",
  "{channel_suffix}": " (whatsapp)",
  "{due_date_line}": "\nDue: 05 Feb 2026, 14:00",
  "{shipping_number}": "JNE123456789",
  "{shipping_agency}": "JNE Express",
  "{delivery_address}": "Jl. Sudirman No. 123, Jakarta Pusat 10220",
  "{pickup_location}": "Goldfinch Legato",
};

export function TemplateEditor({
  template,
  open,
  onOpenChange,
}: TemplateEditorProps) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<"id" | "en">("id");
  const [templateId, setTemplateId] = useState("");
  const [templateEn, setTemplateEn] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const updateTemplate = useConvexUpdateWhatsAppTemplate();
  const resetTemplate = useConvexResetWhatsAppTemplate();

  // Reset form when template changes
  useEffect(() => {
    if (template) {
      setTemplateId(template.templateId);
      setTemplateEn(template.templateEn);
    }
  }, [template]);

  // Check if there are unsaved changes
  const hasChanges =
    template &&
    (templateId !== template.templateId || templateEn !== template.templateEn);

  // Render preview with sample data
  const renderPreview = useCallback(
    (content: string) => {
      let result = content;
      for (const [variable, value] of Object.entries(SAMPLE_DATA)) {
        result = result.replace(
          new RegExp(variable.replace(/[{}]/g, "\\$&"), "g"),
          value
        );
      }
      return result;
    },
    []
  );

  // Handle variable insertion
  const handleInsertVariable = (variable: string) => {
    if (!textareaRef.current) return;

    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentValue = activeTab === "id" ? templateId : templateEn;
    const newValue =
      currentValue.slice(0, start) + variable + currentValue.slice(end);

    if (activeTab === "id") {
      setTemplateId(newValue);
    } else {
      setTemplateEn(newValue);
    }

    // Restore cursor position after state update
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(
        start + variable.length,
        start + variable.length
      );
    }, 0);
  };

  // Save handler
  const handleSave = async () => {
    if (!template || !hasChanges) return;

    setIsSaving(true);
    try {
      await updateTemplate.mutateAsync({
        id: template._id,
        templateId,
        templateEn,
        editedBy: user?.name,
      });
      onOpenChange(false);
    } catch {
      // Error already handled by hook
    } finally {
      setIsSaving(false);
    }
  };

  // Reset handler
  const handleReset = async () => {
    if (!template) return;

    setIsSaving(true);
    try {
      await resetTemplate.mutateAsync({
        id: template._id,
        editedBy: user?.name,
      });
      setShowResetConfirm(false);
      onOpenChange(false);
    } catch {
      // Error already handled by hook
    } finally {
      setIsSaving(false);
    }
  };

  if (!template) return null;

  const icon = TEMPLATE_ICONS[template.code] || "📝";
  const currentContent = activeTab === "id" ? templateId : templateEn;
  const previewContent = renderPreview(currentContent);

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-[700px] p-0 overflow-hidden"
          hideCloseButton
        >
          {/* Header */}
          <SheetHeader className="p-4 border-b bg-gradient-to-r from-[#25D366]/10 to-transparent">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{icon}</span>
              <div className="flex-1">
                <SheetTitle className="text-left">{template.name}</SheetTitle>
                <p className="text-xs text-muted-foreground">
                  {template.description}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onOpenChange(false)}
                className="h-8 w-8"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </SheetHeader>

          {/* Content */}
          <div className="flex flex-col h-[calc(100vh-140px)] overflow-hidden">
            {/* Split view: Editor and Preview */}
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 p-4 overflow-hidden">
              {/* Editor Section */}
              <div className="flex flex-col min-h-0">
                <div className="font-medium text-sm mb-2 text-muted-foreground">
                  EDIT TEMPLATE
                </div>

                {/* Language Tabs */}
                <Tabs
                  value={activeTab}
                  onValueChange={(v) => setActiveTab(v as "id" | "en")}
                  className="flex-1 flex flex-col min-h-0"
                >
                  <TabsList className="grid grid-cols-2 w-full mb-3">
                    <TabsTrigger value="id" className="gap-2">
                      🇮🇩 Indonesian
                    </TabsTrigger>
                    <TabsTrigger value="en" className="gap-2">
                      🇬🇧 English
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="id" className="flex-1 min-h-0 mt-0">
                    <Textarea
                      ref={activeTab === "id" ? textareaRef : undefined}
                      value={templateId}
                      onChange={(e) => setTemplateId(e.target.value)}
                      className={cn(
                        "h-full min-h-[200px] font-mono text-sm resize-none",
                        "focus-visible:ring-[#25D366]"
                      )}
                      placeholder="Enter Indonesian template..."
                    />
                  </TabsContent>

                  <TabsContent value="en" className="flex-1 min-h-0 mt-0">
                    <Textarea
                      ref={activeTab === "en" ? textareaRef : undefined}
                      value={templateEn}
                      onChange={(e) => setTemplateEn(e.target.value)}
                      className={cn(
                        "h-full min-h-[200px] font-mono text-sm resize-none",
                        "focus-visible:ring-[#25D366]"
                      )}
                      placeholder="Enter English template..."
                    />
                  </TabsContent>
                </Tabs>
              </div>

              {/* Preview Section */}
              <div className="flex flex-col min-h-0">
                <div className="font-medium text-sm mb-2 text-muted-foreground">
                  📱 LIVE PREVIEW
                </div>

                {/* WhatsApp-style preview */}
                <div className="flex-1 bg-[#ECE5DD] rounded-lg p-4 overflow-auto">
                  <div className="max-w-[300px] mx-auto">
                    {/* Message bubble */}
                    <motion.div
                      key={currentContent}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-[#DCF8C6] rounded-lg p-3 shadow-sm"
                    >
                      <pre className="text-sm text-gray-800 whitespace-pre-wrap font-sans">
                        {previewContent}
                      </pre>

                      {/* Timestamp */}
                      <div className="flex items-center justify-end gap-1 mt-2">
                        <span className="text-[10px] text-[#667781]">
                          {new Date().toLocaleTimeString("en-US", {
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: false,
                          })}
                        </span>
                        <CheckCheck className="h-3.5 w-3.5 text-[#53bdeb]" />
                      </div>
                    </motion.div>

                    {/* Sample data indicator */}
                    <div className="text-center mt-3">
                      <span className="text-xs text-muted-foreground bg-white/50 px-2 py-1 rounded">
                        Using sample data
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Variables Section */}
            <div className="border-t px-4 py-3 bg-gray-50">
              <div className="font-medium text-sm mb-2 text-muted-foreground">
                VARIABLES — Click to insert at cursor
              </div>
              <VariableReference
                variables={template.availableVariables}
                onInsert={handleInsertVariable}
              />
            </div>

            {/* Footer */}
            <div className="border-t p-4 flex items-center justify-between bg-white">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowResetConfirm(true)}
                  disabled={isSaving}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <RotateCcw className="h-4 w-4 mr-1" />
                  Reset to Default
                </Button>

                {template.lastEditedAt && (
                  <span className="text-xs text-muted-foreground">
                    Last edited:{" "}
                    {new Date(template.lastEditedAt).toLocaleDateString()}{" "}
                    {template.lastEditedBy && `by ${template.lastEditedBy}`}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={isSaving}
                >
                  Cancel
                </Button>

                <Button
                  onClick={handleSave}
                  disabled={!hasChanges || isSaving}
                  className={cn(
                    "bg-gradient-to-r from-[#25D366] to-[#128C7E]",
                    "hover:from-[#128C7E] hover:to-[#075E54]",
                    "text-white"
                  )}
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Save Changes
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Reset Confirmation Dialog */}
      <ConfirmDialog
        open={showResetConfirm}
        onOpenChange={setShowResetConfirm}
        title="Reset to Default?"
        description="This will restore the template to its original content. Any customizations will be lost. This action cannot be undone."
        confirmLabel="Reset Template"
        onConfirm={handleReset}
        variant="destructive"
        loading={isSaving}
      />
    </>
  );
}
