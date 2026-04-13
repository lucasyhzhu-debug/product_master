/**
 * StatementUploadStep — file input for a BCA bank statement.
 *
 * Security invariants:
 *  - 10 MB size cap enforced BEFORE any parser invocation (T-72-25 DoS).
 *  - Extension-dispatched parser: .xlsx/.xls → parseBcaXlsx(arrayBuffer);
 *    .csv → parseBcaCsv(file.text()) via async API — not FileReader (T-72-31).
 *  - No PII logged to console; errors never include account numbers.
 *  - SHA-256 computed via `computeSha256` for server-side dedup (primary key).
 *
 * On success: calls `onParsed({ parsed, fileHash, fileName })`.
 * On ReconciliationError: calls `onError(message, diff)`.
 * On other errors: calls `onError(safe message, undefined)`.
 */

import { useRef, useState } from "react";
import { Upload, FileText, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { parseBcaXlsx } from "@/lib/bankStatement/parseBcaXlsx";
import { parseBcaCsv } from "@/lib/bankStatement/parseBcaCsv";
import { computeSha256 } from "@/lib/bankStatement/fileHash";
import { ReconciliationError, type ParsedStatement, type ReconciliationDiff } from "@/lib/bankStatement/types";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB (T-72-25)

interface StatementUploadStepProps {
  onParsed: (args: { parsed: ParsedStatement; fileHash: string; fileName: string }) => void;
  onError: (message: string, diff?: ReconciliationDiff) => void;
  isBusy?: boolean;
}

export function StatementUploadStep({ onParsed, onError, isBusy = false }: StatementUploadStepProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [pickedFile, setPickedFile] = useState<string | null>(null);

  async function handleFile(file: File) {
    setLocalError(null);
    setPickedFile(file.name);

    // T-72-25: reject oversized files BEFORE touching the parser
    if (file.size > MAX_FILE_SIZE_BYTES) {
      const msg = `File too large (${(file.size / 1024 / 1024).toFixed(2)} MB). Maximum is 10 MB.`;
      setLocalError(msg);
      onError(msg);
      return;
    }

    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!["xlsx", "xls", "csv"].includes(ext)) {
      const msg = `Unsupported file type ".${ext}". Use .xlsx, .xls, or .csv.`;
      setLocalError(msg);
      onError(msg);
      return;
    }

    try {
      const fileHash = await computeSha256(file);

      let parsed: ParsedStatement;
      if (ext === "csv") {
        const text = await file.text();
        parsed = parseBcaCsv(text);
      } else {
        const buffer = await file.arrayBuffer();
        parsed = parseBcaXlsx(buffer);
      }

      onParsed({ parsed, fileHash, fileName: file.name });
    } catch (err) {
      if (err instanceof ReconciliationError) {
        onError(err.message, err.diff);
        return;
      }
      // Never surface stack traces. Message only.
      const safeMsg = err instanceof Error ? err.message : "Failed to parse file.";
      setLocalError(safeMsg);
      onError(safeMsg);
    }
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex flex-col items-center gap-4 py-8">
          <div className="rounded-full bg-primary/10 p-4">
            <Upload className="h-8 w-8 text-primary" />
          </div>
          <div className="text-center">
            <h3 className="text-lg font-semibold">Upload BCA Bank Statement</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Accepts .xlsx, .xls, or .csv up to 10 MB
            </p>
          </div>

          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            disabled={isBusy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                void handleFile(f);
              }
              // reset so the same filename can be picked again after an error
              e.target.value = "";
            }}
          />

          <Button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={isBusy}
            size="lg"
          >
            <FileText className="mr-2 h-4 w-4" />
            {isBusy ? "Processing..." : "Choose File"}
          </Button>

          {pickedFile && !localError && (
            <p className="text-xs text-muted-foreground">Selected: {pickedFile}</p>
          )}

          {localError && (
            <div className="flex items-start gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{localError}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
