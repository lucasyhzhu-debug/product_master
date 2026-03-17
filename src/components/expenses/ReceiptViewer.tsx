/**
 * ReceiptViewer -- clickable receipt badge that opens a photo dialog.
 * Shows receipt image in a lightbox-style dialog for approver review.
 * Handles both image types (JPEG, PNG, WebP) and PDF receipts.
 */
import { useState, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Receipt, ExternalLink } from "lucide-react";

interface ReceiptViewerProps {
  receiptUrl: string | null;
  expenseNumber: string;
  className?: string;
}

export function ReceiptViewer({ receiptUrl, expenseNumber, className }: ReceiptViewerProps) {
  const [open, setOpen] = useState(false);
  // Convex storage URLs are opaque (no file extension), so we try <img> first
  // and fall back to <object> (PDF) if the image fails to load.
  const [imgFailed, setImgFailed] = useState(false);

  const openDialog = useCallback(() => {
    if (receiptUrl) setOpen(true);
  }, [receiptUrl]);

  const handleOpen = useCallback((e: React.SyntheticEvent) => {
    e.stopPropagation(); // Prevent card click from firing
    openDialog();
  }, [openDialog]);

  const handleOpenInNewTab = useCallback(() => {
    if (receiptUrl) {
      window.open(receiptUrl, "_blank", "noopener,noreferrer");
    }
  }, [receiptUrl]);

  if (!receiptUrl) {
    // No URL available -- show non-interactive badge
    return (
      <Badge variant="outline" className={`text-xs font-normal ${className ?? ""}`}>
        <Receipt className="h-3 w-3 mr-1" />
        Receipt attached
      </Badge>
    );
  }

  return (
    <>
      <Badge
        variant="outline"
        className={`text-xs font-normal cursor-pointer hover:bg-accent transition-colors ${className ?? ""}`}
        onClick={handleOpen}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); openDialog(); } }}
      >
        <Receipt className="h-3 w-3 mr-1" />
        View Receipt
      </Badge>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Receipt - {expenseNumber}</DialogTitle>
            <DialogDescription>
              Receipt photo for expense {expenseNumber}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-3">
            {!imgFailed ? (
              <img
                src={receiptUrl}
                alt={`Receipt for ${expenseNumber}`}
                className="max-w-full max-h-[60vh] rounded-md border object-contain"
                onError={() => setImgFailed(true)}
              />
            ) : (
              <object
                data={receiptUrl}
                type="application/pdf"
                className="w-full h-[60vh] rounded-md border"
              >
                <p className="text-sm text-muted-foreground p-4">
                  Unable to display receipt. Click below to open in a new tab.
                </p>
              </object>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleOpenInNewTab}
            >
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
              Open in New Tab
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
