/**
 * LogoUploader -- click-to-upload company logo with preview and remove.
 *
 * Uses Convex file storage: generates a presigned URL, POSTs the file,
 * then returns the storageId to the parent for saving.
 */
import { useState, useRef, useEffect } from "react";
import { Building2, Upload, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";

interface LogoUploaderProps {
  logoUrl: string | null;
  onUpload: (storageId: Id<"_storage"> | undefined) => void;
  generateUploadUrl: () => Promise<string>;
}

const MAX_FILE_SIZE = 1024 * 1024; // 1 MB
const ACCEPTED_TYPES = "image/png,image/jpeg,image/svg+xml";

export function LogoUploader({
  logoUrl,
  onUpload,
  generateUploadUrl,
}: LogoUploaderProps) {
  const [uploading, setUploading] = useState(false);
  // Local preview URL generated from the uploaded file blob for immediate display
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Revoke local object URL on unmount or when no longer needed
  useEffect(() => {
    return () => {
      if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    };
  }, [localPreviewUrl]);

  // Clear local preview when remote URL updates (save + re-fetch completed)
  useEffect(() => {
    if (logoUrl && localPreviewUrl) {
      URL.revokeObjectURL(localPreviewUrl);
      setLocalPreviewUrl(null);
    }
  }, [logoUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleFileSelect(file: File) {
    if (file.size > MAX_FILE_SIZE) {
      toast.error("Logo must be under 1 MB");
      return;
    }

    setUploading(true);
    try {
      const url = await generateUploadUrl();
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });

      if (!response.ok) {
        throw new Error("Upload failed");
      }

      const { storageId } = await response.json();

      // Show immediate preview from local file blob
      if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
      setLocalPreviewUrl(URL.createObjectURL(file));

      onUpload(storageId as Id<"_storage">);
    } catch {
      toast.error("Failed to upload logo");
    } finally {
      setUploading(false);
      // Reset file input so same file can be re-selected
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const previewUrl = localPreviewUrl ?? logoUrl;

  return (
    <div className="flex items-center gap-4">
      {/* Logo preview or placeholder */}
      <div className="flex items-center justify-center w-16 h-16 rounded-lg border bg-muted/50 overflow-hidden shrink-0">
        {previewUrl ? (
          <img
            src={previewUrl}
            alt="Company logo"
            className="h-16 w-auto object-contain"
          />
        ) : (
          <Building2 className="h-8 w-8 text-muted-foreground" />
        )}
      </div>

      {/* Action buttons */}
      <div className="flex flex-col gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Upload className="h-4 w-4 mr-2" />
          )}
          {previewUrl ? "Change Logo" : "Upload Logo"}
        </Button>

        {previewUrl && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            disabled={uploading}
            onClick={() => {
              if (localPreviewUrl) {
                URL.revokeObjectURL(localPreviewUrl);
                setLocalPreviewUrl(null);
              }
              onUpload(undefined);
            }}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Remove Logo
          </Button>
        )}

        <p className="text-xs text-muted-foreground">
          PNG, JPG, or SVG. Max 1 MB.
        </p>
      </div>

      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFileSelect(file);
        }}
      />
    </div>
  );
}
