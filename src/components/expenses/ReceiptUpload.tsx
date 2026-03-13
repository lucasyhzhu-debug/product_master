import { useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Upload, X, FileImage, Loader2 } from "lucide-react";
import type { Id } from "../../../convex/_generated/dataModel";

interface ReceiptUploadProps {
  generateUploadUrl: () => Promise<string>;
  onUpload: (result: { storageId: Id<"_storage">; hash: string }) => void;
  onRemove: () => void;
  currentFileId?: Id<"_storage">;
  disabled?: boolean;
}

/** Compute SHA-256 hash of a file using Web Crypto API */
async function computeSha256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

export function ReceiptUpload({
  generateUploadUrl,
  onUpload,
  onRemove,
  currentFileId,
  disabled = false,
}: ReceiptUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hashPreview, setHashPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setError(null);

      // Validate file type
      if (!ACCEPTED_TYPES.includes(file.type)) {
        setError("Invalid file type. Accepted: JPEG, PNG, WebP, PDF");
        return;
      }

      // Validate file size
      if (file.size > MAX_FILE_SIZE) {
        setError("File too large. Maximum size is 5MB");
        return;
      }

      setUploading(true);
      setFileName(file.name);

      try {
        // Step 1: Compute SHA-256 hash client-side
        const hash = await computeSha256(file);
        setHashPreview(hash);

        // Step 2: Get signed upload URL
        const uploadUrl = await generateUploadUrl();

        // Step 3: Upload file to Convex storage
        const result = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });

        if (!result.ok) {
          throw new Error(`Upload failed: ${result.statusText}`);
        }

        const { storageId } = await result.json();

        // Step 4: Notify parent
        onUpload({ storageId: storageId as Id<"_storage">, hash });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
        setHashPreview(null);
        setFileName(null);
      } finally {
        setUploading(false);
        // Reset file input so the same file can be re-selected
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    },
    [generateUploadUrl, onUpload]
  );

  const handleRemove = useCallback(() => {
    setFileName(null);
    setHashPreview(null);
    setError(null);
    onRemove();
  }, [onRemove]);

  // Receipt already attached
  if (currentFileId) {
    return (
      <div className="flex items-center gap-2 rounded-md border p-3 bg-muted/30">
        <FileImage className="h-4 w-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">
            {fileName || "Receipt attached"}
          </p>
          {hashPreview && (
            <p className="text-xs text-muted-foreground font-mono">
              SHA-256: {hashPreview.slice(0, 12)}...
            </p>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleRemove}
          disabled={disabled}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  // Uploading state
  if (uploading) {
    return (
      <div className="flex items-center gap-2 rounded-md border p-3 bg-muted/30">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Uploading...</span>
      </div>
    );
  }

  // File input
  return (
    <div>
      <label className="flex items-center gap-2 rounded-md border border-dashed p-3 cursor-pointer hover:bg-accent/50 transition-colors">
        <Upload className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">
          Upload receipt (JPEG, PNG, WebP, PDF, max 5MB)
        </span>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          className="hidden"
          onChange={handleFileSelect}
          disabled={disabled}
        />
      </label>
      {error && <p className="text-sm text-destructive mt-1">{error}</p>}
    </div>
  );
}
