import { useState } from "react";
import { motion } from "framer-motion";
import { MessageSquare, RefreshCw, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { TemplateCard, TemplateEditor } from "@/components/whatsappTemplates";
import {
  useWhatsAppTemplates,
  useSeedWhatsAppTemplates,
  type WhatsAppTemplate,
} from "@/hooks/convex/useWhatsAppTemplates";

// Container animation for staggered card entrance
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
};

export function WhatsAppTemplatesManager() {
  const { data: templates, isLoading } = useWhatsAppTemplates();
  const seedTemplates = useSeedWhatsAppTemplates();
  const [selectedTemplate, setSelectedTemplate] =
    useState<WhatsAppTemplate | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);

  const handleCardClick = (template: WhatsAppTemplate) => {
    setSelectedTemplate(template);
    setEditorOpen(true);
  };

  const handleSeedTemplates = async () => {
    setIsSeeding(true);
    try {
      await seedTemplates.mutate();
    } finally {
      setIsSeeding(false);
    }
  };

  // Sort templates by a logical order
  const sortedTemplates = templates
    ? [...templates].sort((a, b) => {
        const order = [
          "payment_request",
          "production_started",
          "delivery_complete",
          "receipt",
          "shipping",
          "pickup_ready",
        ];
        return order.indexOf(a.code) - order.indexOf(b.code);
      })
    : [];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="WhatsApp Templates"
        description="Manage and customize message templates for orders"
        action={
          templates && templates.length === 0 ? (
            <Button onClick={handleSeedTemplates} disabled={isSeeding}>
              {isSeeding ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Seeding...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Seed Default Templates
                </>
              )}
            </Button>
          ) : undefined
        }
      />

      {/* WhatsApp-style header accent */}
      <div className="flex items-center gap-3 mb-6 p-4 bg-gradient-to-r from-[#25D366]/10 via-[#128C7E]/5 to-transparent rounded-xl border border-[#25D366]/20">
        <div className="w-12 h-12 rounded-full bg-[#25D366] flex items-center justify-center">
          <MessageSquare className="h-6 w-6 text-white" />
        </div>
        <div>
          <h2 className="font-semibold text-foreground">
            Customize Your Messages
          </h2>
          <p className="text-sm text-muted-foreground">
            Edit templates to match your brand voice. Changes apply to all new
            messages.
          </p>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-[#25D366]" />
        </div>
      )}

      {/* Empty State */}
      {!isLoading && templates && templates.length === 0 && (
        <div className="text-center py-20">
          <MessageSquare className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Templates Found</h3>
          <p className="text-muted-foreground mb-4">
            Click the button above to seed the default templates.
          </p>
        </div>
      )}

      {/* Template Grid */}
      {!isLoading && sortedTemplates.length > 0 && (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          {sortedTemplates.map((template, index) => (
            <TemplateCard
              key={template._id}
              template={template}
              onClick={() => handleCardClick(template)}
              index={index}
            />
          ))}
        </motion.div>
      )}

      {/* Info Footer */}
      {!isLoading && sortedTemplates.length > 0 && (
        <div className="mt-8 p-4 bg-muted/50 rounded-lg">
          <div className="flex items-start gap-3">
            <span className="text-2xl">💡</span>
            <div className="text-sm text-muted-foreground">
              <p className="font-medium text-foreground mb-1">
                About Dynamic Templates
              </p>
              <p>
                The <strong>Order Template</strong> (for new customer orders) is
                generated dynamically from your POS product slots and cannot be
                edited here. To change it, update your products in the Menu
                Products Manager.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Template Editor Sheet */}
      <TemplateEditor
        template={selectedTemplate}
        open={editorOpen}
        onOpenChange={setEditorOpen}
      />
    </div>
  );
}
