/**
 * MenuItemCard - GrabFood-app-like card for a menu item.
 * Shows photo, name, price, description with inline editing,
 * availability toggle, and delete button.
 */
import { useState, useRef, useEffect } from "react";
import { Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { PhotoUpload } from "./PhotoUpload";
import type { Id } from "../../../convex/_generated/dataModel";

interface MenuItemData {
  _id: Id<"grabfoodMenuItems">;
  grabfoodName: string;
  grabfoodPrice: number;
  grabfoodDescription?: string;
  isAvailable: boolean;
  resolvedPhotoUrl: string | null;
  grabfoodItemId?: string;
}

interface MenuItemCardProps {
  item: MenuItemData;
  onUpdate: (
    menuItemId: Id<"grabfoodMenuItems">,
    fields: {
      grabfoodName?: string;
      grabfoodDescription?: string;
      grabfoodPrice?: number;
      isAvailable?: boolean;
    }
  ) => Promise<void>;
  onDelete: (menuItemId: Id<"grabfoodMenuItems">) => Promise<void>;
  onPhotoUpload: (menuItemId: Id<"grabfoodMenuItems">, storageId: Id<"_storage">) => Promise<void>;
  generateUploadUrl: (args: { token: string }) => Promise<string>;
  token: string;
}

/** Inline editable text field with onBlur commit pattern. */
function InlineEditText({
  value,
  placeholder,
  onCommit,
  className = "",
  multiline = false,
}: {
  value: string;
  placeholder: string;
  onCommit: (newValue: string) => void;
  className?: string;
  multiline?: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleBlur = () => {
    setIsEditing(false);
    const trimmed = draft.trim();
    if (trimmed !== value) {
      onCommit(trimmed);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !multiline) {
      (e.target as HTMLElement).blur();
    }
    if (e.key === "Escape") {
      setDraft(value);
      setIsEditing(false);
    }
  };

  if (!isEditing) {
    return (
      <div
        className={`cursor-pointer hover:bg-accent/50 rounded px-1 -mx-1 transition-colors ${className}`}
        onClick={() => setIsEditing(true)}
      >
        {value || (
          <span className="text-muted-foreground italic">{placeholder}</span>
        )}
      </div>
    );
  }

  if (multiline) {
    return (
      <textarea
        ref={inputRef as React.RefObject<HTMLTextAreaElement>}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full text-sm border rounded px-2 py-1 resize-none bg-background"
        rows={2}
      />
    );
  }

  return (
    <Input
      ref={inputRef as React.RefObject<HTMLInputElement>}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      className="h-7 text-sm"
    />
  );
}

/** Inline editable price field with onBlur commit pattern. */
function InlineEditPrice({
  value,
  onCommit,
}: {
  value: number;
  onCommit: (newValue: number) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleBlur = () => {
    setIsEditing(false);
    const parsed = parseInt(draft, 10);
    if (!isNaN(parsed) && parsed !== value && parsed >= 0) {
      onCommit(parsed);
    } else {
      setDraft(String(value));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      (e.target as HTMLElement).blur();
    }
    if (e.key === "Escape") {
      setDraft(String(value));
      setIsEditing(false);
    }
  };

  if (!isEditing) {
    return (
      <div
        className="cursor-pointer hover:bg-accent/50 rounded px-1 -mx-1 transition-colors font-semibold text-[var(--color-grabfood)]"
        onClick={() => setIsEditing(true)}
      >
        {formatCurrency(value)}
      </div>
    );
  }

  return (
    <Input
      ref={inputRef}
      type="number"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      min={0}
      className="h-7 text-sm font-semibold"
    />
  );
}

export function MenuItemCard({
  item,
  onUpdate,
  onDelete,
  onPhotoUpload,
  generateUploadUrl,
  token,
}: MenuItemCardProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleToggleAvailability = async () => {
    await onUpdate(item._id, { isAvailable: !item.isAvailable });
  };

  const handleDelete = async () => {
    if (!confirm("Remove this item from the GrabFood menu?")) return;
    setIsDeleting(true);
    try {
      await onDelete(item._id);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Card
      className={`relative overflow-hidden transition-opacity ${
        !item.isAvailable ? "opacity-60" : ""
      }`}
    >
      {/* Unavailable overlay */}
      {!item.isAvailable && (
        <div className="absolute inset-0 bg-muted/40 z-10 pointer-events-none rounded-lg" />
      )}

      {/* Photo area with availability toggle overlay */}
      <div className="relative">
        <PhotoUpload
          menuItemId={item._id}
          currentPhotoUrl={item.resolvedPhotoUrl}
          onUpload={onPhotoUpload}
          generateUploadUrl={generateUploadUrl}
          token={token}
        />

        {/* Availability toggle - top-right corner */}
        <div className="absolute top-2 right-2 z-20">
          <Switch
            checked={item.isAvailable}
            onCheckedChange={handleToggleAvailability}
            className="data-[state=checked]:bg-[var(--color-grabfood)]"
          />
        </div>
      </div>

      {/* Content area */}
      <div className="p-3 space-y-1.5">
        {/* Name */}
        <InlineEditText
          value={item.grabfoodName}
          placeholder="Item name"
          onCommit={(val) => onUpdate(item._id, { grabfoodName: val })}
          className="font-medium text-sm leading-tight"
        />

        {/* Price */}
        <InlineEditPrice
          value={item.grabfoodPrice}
          onCommit={(val) => onUpdate(item._id, { grabfoodPrice: val })}
        />

        {/* Description */}
        <InlineEditText
          value={item.grabfoodDescription ?? ""}
          placeholder="Add description"
          onCommit={(val) => onUpdate(item._id, { grabfoodDescription: val })}
          className="text-xs text-muted-foreground"
          multiline
        />

        {/* Delete button */}
        <div className="flex justify-end pt-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
