/**
 * RenameComponentDialog - Lightweight rename dialog for component types
 */

import { useState, useEffect } from "react";
import { Pencil } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useConvexUpdateComponentType } from "@/hooks/convex";
import { toast } from "sonner";
import type { Id } from "../../../convex/_generated/dataModel";

interface RenameComponentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  componentId: Id<"componentTypes">;
  currentName: string;
}

export function RenameComponentDialog({
  open,
  onOpenChange,
  componentId,
  currentName,
}: RenameComponentDialogProps) {
  const [newName, setNewName] = useState(currentName);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateComponentType = useConvexUpdateComponentType();

  useEffect(() => {
    if (open) {
      setNewName(currentName);
    }
  }, [open, currentName]);

  const canSubmit = newName.trim().length > 0 && newName.trim() !== currentName;

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setIsSubmitting(true);
    try {
      await updateComponentType({
        id: componentId,
        name: newName.trim(),
      });
      toast.success(`Renamed to "${newName.trim()}"`);
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to rename component"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4" />
            Rename Component
          </DialogTitle>
          <DialogDescription>
            Change the display name for "{currentName}"
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <Label htmlFor="rename-input">Name</Label>
          <Input
            id="rename-input"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canSubmit) handleSubmit();
            }}
            className="mt-2"
            autoFocus
          />
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit || isSubmitting}
          >
            {isSubmitting ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
