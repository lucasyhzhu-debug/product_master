/**
 * PhotoUpload - Photo upload component for GrabFood menu items.
 * Handles file selection, size validation, Convex file storage upload, and preview.
 */
import { useState, useRef } from "react";
import { Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Id } from "../../../convex/_generated/dataModel";

interface PhotoUploadProps {
  menuItemId: Id<"grabfoodMenuItems">;
  currentPhotoUrl: string | null;
  onUpload: (menuItemId: Id<"grabfoodMenuItems">, storageId: Id<"_storage">) => Promise<void>;
  generateUploadUrl: (args: { token: string }) => Promise<string>;
  token: string;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export function PhotoUpload({
  menuItemId,
  currentPhotoUrl,
  onUpload,
  generateUploadUrl,
  token,
}: PhotoUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input so same file can be re-selected
    e.target.value = "";

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      toast.error("File too large. Maximum size is 5MB.");
      return;
    }

    setIsUploading(true);
    try {
      // Step 1: Get upload URL from Convex
      const uploadUrl = await generateUploadUrl({ token });

      // Step 2: Upload file to Convex storage
      const response = await fetch(uploadUrl, {
        method: "POST",
        body: file,
        headers: { "Content-Type": file.type },
      });

      if (!response.ok) {
        throw new Error("Upload failed");
      }

      const { storageId } = await response.json();

      // Step 3: Save photo reference to menu item (and write back to menuProduct)
      await onUpload(menuItemId, storageId);

      toast.success("Photo uploaded successfully");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      toast.error(msg);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div
      className="relative w-full aspect-square bg-muted rounded-t-lg overflow-hidden cursor-pointer group"
      onClick={handleClick}
    >
      {currentPhotoUrl ? (
        <img
          src={currentPhotoUrl}
          alt="Menu item"
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <Camera className="h-8 w-8 text-muted-foreground" />
        </div>
      )}

      {/* Hover overlay */}
      {!isUploading && (
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <Camera className="h-6 w-6 text-white" />
        </div>
      )}

      {/* Upload progress overlay */}
      {isUploading && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
          <Loader2 className="h-6 w-6 text-white animate-spin" />
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}
