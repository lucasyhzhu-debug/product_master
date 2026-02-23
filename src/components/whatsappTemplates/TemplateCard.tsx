import { motion } from "framer-motion";
import { CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { Doc } from "../../../convex/_generated/dataModel";

type WhatsAppTemplate = Doc<"whatsappTemplates">;

interface TemplateCardProps {
  template: WhatsAppTemplate;
  onClick: () => void;
  index: number;
}

// Template icons (emojis for visual distinction)
const TEMPLATE_ICONS: Record<string, string> = {
  payment_request: "💳",
  production_started: "🍳",
  delivery_complete: "📦",
  receipt: "🧾",
  shipping: "🚚",
  pickup_ready: "🏪",
};

// Card animation variants
const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: "spring", stiffness: 300, damping: 24 },
  },
};

export function TemplateCard({ template, onClick, index }: TemplateCardProps) {
  const icon = TEMPLATE_ICONS[template.code] || "📝";
  const isModified = template.lastEditedAt !== undefined;
  const variableCount = template.availableVariables.length;

  // Get preview text (first 80 chars of Indonesian template)
  const previewText = template.templateId.slice(0, 80).replace(/\n/g, " ");

  // Format time for WhatsApp-style timestamp
  const timestamp = new Date().toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return (
    <motion.div
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      transition={{ delay: index * 0.08 }}
      whileHover={{
        scale: 1.02,
        boxShadow: "0 8px 30px rgba(37, 211, 102, 0.15)",
      }}
      onClick={onClick}
      className={cn(
        "relative cursor-pointer rounded-xl p-4",
        "bg-card border border-border",
        "hover:border-[#25D366]/50",
        "transition-colors duration-200"
      )}
    >
      {/* Header with emoji and title */}
      <div className="flex items-start gap-3 mb-3">
        <span className="text-2xl">{icon}</span>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-foreground truncate">
            {template.name}
          </h3>
          <p className="text-xs text-muted-foreground truncate">
            {template.description}
          </p>
        </div>
      </div>

      {/* WhatsApp-style message bubble */}
      <div className="relative bg-[#DCF8C6] rounded-lg p-3 mb-3">
        {/* Subtle pattern overlay */}
        <div
          className="absolute inset-0 opacity-[0.03] rounded-lg"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23128C7E' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        />

        {/* Preview text */}
        <p className="relative text-sm text-gray-800 line-clamp-2">
          "{previewText}..."
        </p>

        {/* Timestamp and read receipt */}
        <div className="relative flex items-center justify-end gap-1 mt-2">
          <span className="text-[10px] text-[#667781]">{timestamp}</span>
          <CheckCheck className="h-3.5 w-3.5 text-[#53bdeb]" />
        </div>
      </div>

      {/* Footer with badges */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isModified && (
            <motion.div
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <Badge
                variant="secondary"
                className="bg-[var(--color-status-warning-bg)] text-[var(--color-status-warning)] border-[var(--color-status-warning)]/30"
              >
                Modified
              </Badge>
            </motion.div>
          )}
        </div>

        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <span>{variableCount}</span>
          <span className="inline-block w-2 h-2 bg-[#25D366] rounded-sm" />
        </div>
      </div>
    </motion.div>
  );
}
