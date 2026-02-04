/**
 * Convex hooks for WhatsApp templates.
 * Provides real-time queries and mutations for template management.
 */
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id, Doc } from "../../../convex/_generated/dataModel";
import { toast } from "sonner";

// ============================================
// Types
// ============================================

export type WhatsAppTemplate = Doc<"whatsappTemplates">;

// ============================================
// Query Hooks
// ============================================

/**
 * List all WhatsApp templates.
 */
export function useConvexWhatsAppTemplates() {
  const data = useQuery(api.whatsappTemplates.queries.list);
  return {
    data: data,
    isLoading: data === undefined,
  };
}

/**
 * Get a specific template by code.
 */
export function useConvexWhatsAppTemplateByCode(code: string | undefined) {
  const data = useQuery(
    api.whatsappTemplates.queries.getByCode,
    code ? { code } : "skip"
  );
  return {
    data: data,
    isLoading: data === undefined && code !== undefined,
  };
}

// ============================================
// Mutation Hooks
// ============================================

/**
 * Update a WhatsApp template.
 */
export function useConvexUpdateWhatsAppTemplate() {
  const mutation = useMutation(api.whatsappTemplates.mutations.update);

  return {
    mutate: async (data: {
      id: Id<"whatsappTemplates">;
      templateId: string;
      templateEn: string;
      editedBy?: string;
    }) => {
      try {
        await mutation(data);
        toast.success("Template updated successfully");
        return { success: true };
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Failed to update template";
        toast.error(message);
        throw error;
      }
    },
    mutateAsync: async (data: {
      id: Id<"whatsappTemplates">;
      templateId: string;
      templateEn: string;
      editedBy?: string;
    }) => {
      try {
        await mutation(data);
        toast.success("Template updated successfully");
        return { success: true };
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Failed to update template";
        toast.error(message);
        throw error;
      }
    },
  };
}

/**
 * Reset a WhatsApp template to default.
 */
export function useConvexResetWhatsAppTemplate() {
  const mutation = useMutation(api.whatsappTemplates.mutations.resetToDefault);

  return {
    mutate: async (data: {
      id: Id<"whatsappTemplates">;
      editedBy?: string;
    }) => {
      try {
        await mutation(data);
        toast.success("Template reset to default");
        return { success: true };
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Failed to reset template";
        toast.error(message);
        throw error;
      }
    },
    mutateAsync: async (data: {
      id: Id<"whatsappTemplates">;
      editedBy?: string;
    }) => {
      try {
        await mutation(data);
        toast.success("Template reset to default");
        return { success: true };
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Failed to reset template";
        toast.error(message);
        throw error;
      }
    },
  };
}

/**
 * Seed default templates (admin use).
 */
export function useConvexSeedWhatsAppTemplates() {
  const mutation = useMutation(api.whatsappTemplates.mutations.seedDefaults);

  return {
    mutate: async () => {
      try {
        const result = await mutation({});
        if (result.inserted > 0) {
          toast.success(`Seeded ${result.inserted} templates`);
        } else {
          toast.info("All templates already exist");
        }
        return result;
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Failed to seed templates";
        toast.error(message);
        throw error;
      }
    },
  };
}
