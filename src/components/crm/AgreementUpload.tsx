/**
 * AgreementUpload — Convex file upload for supply agreements.
 *
 * Two modes:
 *   "create"      — first upload; parent calls createSupplyAgreement.
 *   "add-version" — subsequent upload; parent calls addAgreementVersion.
 *
 * Upload flow (mirrors ReceiptUpload pattern):
 *   1. User selects a file.
 *   2. Call generateAgreementUploadUrl() → uploadUrl.
 *   3. POST file to uploadUrl → { storageId }.
 *   4. Invoke onUploaded(storageId, fileName, lang).
 *
 * Accepted types: PDF, JPEG, PNG, WebP (max 10 MB).
 * Lang selector: "id" | "en" — required for each version.
 */

import { useState, useCallback, useRef } from "react";
import { Upload, Loader2, FileText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { Id } from "../../../convex/_generated/dataModel";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ACCEPTED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
];
const ACCEPTED_ACCEPT = "application/pdf,image/jpeg,image/png,image/webp";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface AgreementUploadProps {
  /** Convex storage upload-url generator — manager+admin only. */
  generateUploadUrl: () => Promise<string>;
  /** Called after successful upload with the resulting storageId + metadata. */
  onUploaded: (
    storageId: Id<"_storage">,
    fileName: string,
    lang: "id" | "en",
    fileSize: number,
  ) => void;
  mode: "create" | "add-version";
  disabled?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AgreementUpload({
  generateUploadUrl,
  onUploaded,
  mode,
  disabled = false,
}: AgreementUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [lang, setLang] = useState<"id" | "en">("id");
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setError(null);

      if (!ACCEPTED_TYPES.includes(file.type)) {
        setError("Invalid file type. Accepted: PDF, JPEG, PNG, WebP");
        return;
      }

      if (file.size > MAX_FILE_SIZE) {
        setError("File too large. Maximum size is 10 MB");
        return;
      }

      setUploading(true);
      setFileName(file.name);

      try {
        // Step 1: Get signed upload URL from Convex.
        const uploadUrl = await generateUploadUrl();

        // Step 2: POST file to Convex storage.
        const result = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });

        if (!result.ok) {
          throw new Error(`Upload failed: ${result.statusText}`);
        }

        const { storageId } = (await result.json()) as { storageId: string };

        // Step 3: Notify parent.
        onUploaded(storageId as Id<"_storage">, file.name, lang, file.size);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
        setFileName(null);
      } finally {
        setUploading(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    },
    [generateUploadUrl, onUploaded, lang],
  );

  const handleReset = useCallback(() => {
    setFileName(null);
    setError(null);
  }, []);

  // Uploading indicator
  if (uploading) {
    return (
      <div className="flex items-center gap-2 rounded-md border p-3 bg-muted/30">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">
          Uploading {fileName ?? "file"}…
        </span>
      </div>
    );
  }

  // File selected but not yet submitted (shouldn't reach here since we auto-upload on select)
  if (fileName) {
    return (
      <div className="flex items-center gap-2 rounded-md border p-3 bg-muted/30">
        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium truncate flex-1">{fileName}</span>
        <Button type="button" variant="ghost" size="sm" onClick={handleReset}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  // Upload input
  return (
    <div className="space-y-2">
      {/* Lang selector */}
      <div className="flex items-center gap-3">
        <Label className="text-xs text-muted-foreground">Agreement language</Label>
        <div className="flex items-center gap-2">
          {(["id", "en"] as const).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLang(l)}
              disabled={disabled}
              className={`px-2.5 py-0.5 rounded text-xs font-medium border transition-colors ${
                lang === l
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-transparent text-muted-foreground border-border hover:border-foreground/40"
              }`}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* File drop zone */}
      <label
        className={`flex items-center gap-2 rounded-md border border-dashed p-3 transition-colors ${
          disabled
            ? "opacity-50 cursor-not-allowed"
            : "cursor-pointer hover:bg-accent/50"
        }`}
      >
        <Upload className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-sm text-muted-foreground">
          {mode === "create" ? "Upload agreement" : "Upload new version"}{" "}
          <span className="text-xs">(PDF, JPEG, PNG, WebP · max 10 MB)</span>
        </span>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_ACCEPT}
          className="hidden"
          onChange={handleFileSelect}
          disabled={disabled}
          aria-label={mode === "create" ? "Upload agreement" : "Upload new version"}
        />
      </label>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
