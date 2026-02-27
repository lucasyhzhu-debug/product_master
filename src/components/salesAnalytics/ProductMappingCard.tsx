import { useState } from "react";
import { ArrowRight, Check, AlertTriangle, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/shared";
import { useAuth } from "@/contexts/AuthContext";
import {
  useCountMappingImpact,
  useUpdateProductMapping,
} from "@/hooks/convex";
import type { Id } from "../../../convex/_generated/dataModel";

interface ProductMapping {
  _id: Id<"externalProductMappings">;
  source: "k3mart" | "gobiz" | "internal" | "grabfood" | "bigseller" | "consignment" | "shopee" | "tiktok";
  externalProductCode: string;
  externalProductName: string;
  menuProductId?: Id<"menuProducts">;
  isAutoMapped: boolean;
}

interface MenuProduct {
  _id: Id<"menuProducts">;
  name: string;
  code?: string;
  defaultPrice?: number;
}

interface ProductMappingCardProps {
  mapping: ProductMapping;
  menuProducts: MenuProduct[];
  linkedMenuProduct?: MenuProduct;
}

/**
 * Card pair component for external-to-internal product mapping.
 * Shows external product on left, internal menuProduct on right,
 * with confidence indicator and edit capability.
 */
export function ProductMappingCard({
  mapping,
  menuProducts,
  linkedMenuProduct,
}: ProductMappingCardProps) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [isEditing, setIsEditing] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string>(
    mapping.menuProductId ?? ""
  );
  const [showConfirm, setShowConfirm] = useState(false);

  const updateMapping = useUpdateProductMapping();
  const { data: impact } = useCountMappingImpact(
    showConfirm ? mapping.source : undefined,
    showConfirm ? mapping.externalProductName : undefined
  );

  const isMapped = !!linkedMenuProduct;
  const confidenceColor = isMapped
    ? mapping.isAutoMapped
      ? "text-yellow-500"
      : "text-green-500"
    : "text-red-500";
  const confidenceIcon = isMapped ? (
    <Check className={`h-4 w-4 ${confidenceColor}`} />
  ) : (
    <AlertTriangle className="h-4 w-4 text-red-500" />
  );

  const handleSave = () => {
    setShowConfirm(true);
  };

  const handleConfirm = async () => {
    if (!user?.token) return;
    const resolvedId = selectedProductId && selectedProductId !== "__none__"
      ? (selectedProductId as Id<"menuProducts">)
      : undefined;
    await updateMapping({
      token: user.token,
      mappingId: mapping._id,
      menuProductId: resolvedId,
    });
    setIsEditing(false);
    setShowConfirm(false);
  };

  const handleCancel = () => {
    setSelectedProductId(mapping.menuProductId ?? "");
    setIsEditing(false);
  };

  return (
    <>
      <div
        className={`flex items-center gap-3 rounded-lg border p-3 ${
          !isMapped ? "border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30" : "border-border"
        }`}
      >
        {/* Left: External Product */}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">
            {mapping.externalProductName}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Code: {mapping.externalProductCode}
          </div>
        </div>

        {/* Center: Confidence indicator */}
        <div className="flex items-center gap-1 shrink-0">
          {confidenceIcon}
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
        </div>

        {/* Right: Internal Product or Unmapped */}
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <div className="space-y-2">
              <Select
                value={selectedProductId}
                onValueChange={setSelectedProductId}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Select product..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">
                    <span className="text-muted-foreground">Unmapped</span>
                  </SelectItem>
                  {menuProducts.map((mp) => (
                    <SelectItem key={mp._id} value={mp._id}>
                      {mp.name}
                      {mp.code ? ` (${mp.code})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex gap-1">
                <Button size="sm" variant="default" className="h-6 text-xs" onClick={handleSave}>
                  Save
                </Button>
                <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={handleCancel}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : linkedMenuProduct ? (
            <div>
              <div className="text-sm font-medium truncate">
                {linkedMenuProduct.name}
              </div>
              {linkedMenuProduct.code && (
                <div className="text-xs text-muted-foreground mt-0.5">
                  {linkedMenuProduct.code}
                </div>
              )}
              {mapping.isAutoMapped && (
                <Badge variant="outline" className="text-[10px] mt-1 border-yellow-400 text-yellow-600 dark:text-yellow-400">
                  Auto-matched
                </Badge>
              )}
            </div>
          ) : (
            <div>
              <Badge variant="outline" className="border-amber-400 text-amber-600 dark:text-amber-400">
                Needs mapping
              </Badge>
            </div>
          )}
        </div>

        {/* Edit button (admin only) */}
        {isAdmin && !isEditing && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 shrink-0"
            onClick={() => setIsEditing(true)}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* Retroactive update confirmation dialog */}
      <ConfirmDialog
        open={showConfirm}
        onOpenChange={setShowConfirm}
        title="Update Product Mapping"
        description={
          impact
            ? `${impact.count} historical sales record${impact.count !== 1 ? "s" : ""} will be updated to reflect this new mapping.`
            : "Calculating impact..."
        }
        confirmLabel="Update Mapping"
        variant="default"
        onConfirm={handleConfirm}
      />
    </>
  );
}
