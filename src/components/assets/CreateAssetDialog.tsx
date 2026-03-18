/**
 * Create Asset dialog.
 *
 * Captures name, category (PSAK defaults auto-populate), acquisition date,
 * cost, useful life, salvage value, location, characteristics, and attachments.
 */
import { useState, useCallback } from "react";
import { X, Plus, Upload, ClipboardPaste } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ASSET_CATEGORIES, parseCharacteristicsCSV } from "@/lib/assetHelpers";
import { useCreateAsset, useGenerateAssetUploadUrl } from "@/hooks/convex/useFixedAssets";

interface CreateAssetDialogProps {
  open: boolean;
  onClose: () => void;
}

export function CreateAssetDialog({ open, onClose }: CreateAssetDialogProps) {
  const { mutate: createAsset } = useCreateAsset();
  const generateUploadUrl = useGenerateAssetUploadUrl();

  // Form state
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [acquisitionDate, setAcquisitionDate] = useState("");
  const [cost, setCost] = useState("");
  const [usefulLifeYears, setUsefulLifeYears] = useState("");
  const [salvageValue, setSalvageValue] = useState("");
  const [location, setLocation] = useState("");
  const [characteristics, setCharacteristics] = useState<Array<{ key: string; value: string }>>([]);
  const [newCharKey, setNewCharKey] = useState("");
  const [newCharValue, setNewCharValue] = useState("");
  const [csvText, setCsvText] = useState("");
  const [showCsvPaste, setShowCsvPaste] = useState(false);
  const [attachmentIds, setAttachmentIds] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // When category changes, auto-populate PSAK defaults
  const handleCategoryChange = useCallback((value: string) => {
    setCategory(value);
    const cat = ASSET_CATEGORIES.find((c) => c.key === value);
    if (cat) {
      if (cat.usefulLifeYears !== null) {
        setUsefulLifeYears(String(cat.usefulLifeYears));
      } else {
        setUsefulLifeYears("");
      }
      // Salvage will be derived from cost * salvagePercent on submit
      // For now, show the percentage hint in the UI and let user override
      if (cost) {
        const costNum = parseInt(cost, 10);
        if (!isNaN(costNum)) {
          setSalvageValue(String(Math.round(costNum * cat.salvagePercent / 100)));
        }
      }
    }
  }, [cost]);

  // Recalculate salvage when cost changes (if category has a default)
  const handleCostChange = useCallback((value: string) => {
    setCost(value);
    if (category) {
      const cat = ASSET_CATEGORIES.find((c) => c.key === category);
      if (cat && !salvageValue) {
        const costNum = parseInt(value, 10);
        if (!isNaN(costNum)) {
          setSalvageValue(String(Math.round(costNum * cat.salvagePercent / 100)));
        }
      }
    }
  }, [category, salvageValue]);

  const addCharacteristic = useCallback(() => {
    if (!newCharKey.trim()) return;
    setCharacteristics((prev) => [...prev, { key: newCharKey.trim(), value: newCharValue.trim() }]);
    setNewCharKey("");
    setNewCharValue("");
  }, [newCharKey, newCharValue]);

  const removeCharacteristic = useCallback((index: number) => {
    setCharacteristics((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleCsvPaste = useCallback(() => {
    const parsed = parseCharacteristicsCSV(csvText);
    if (parsed.length === 0) {
      toast.error("No valid key,value pairs found");
      return;
    }
    setCharacteristics((prev) => [...prev, ...parsed]);
    setCsvText("");
    setShowCsvPaste(false);
    toast.success(`Added ${parsed.length} characteristic(s)`);
  }, [csvText]);

  const handleFileUpload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const newIds: string[] = [];
      for (const file of Array.from(files)) {
        const uploadUrl = await generateUploadUrl({});
        const response = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });
        const { storageId } = await response.json();
        newIds.push(storageId);
      }
      setAttachmentIds((prev) => [...prev, ...newIds]);
      toast.success(`Uploaded ${newIds.length} file(s)`);
    } catch {
      toast.error("Failed to upload file(s)");
    } finally {
      setUploading(false);
    }
  }, [generateUploadUrl]);

  const handleSubmit = useCallback(async () => {
    if (!name.trim() || !category || !acquisitionDate || !cost) {
      toast.error("Please fill in all required fields");
      return;
    }

    const costNum = parseInt(cost, 10);
    const salvageNum = parseInt(salvageValue || "0", 10);
    const lifeYears = parseInt(usefulLifeYears || "0", 10);

    if (isNaN(costNum) || costNum <= 0) {
      toast.error("Cost must be a positive number");
      return;
    }

    const cat = ASSET_CATEGORIES.find((c) => c.key === category);
    if (cat?.depreciable && lifeYears <= 0) {
      toast.error("Useful life must be greater than 0 for depreciable assets");
      return;
    }

    setSubmitting(true);
    try {
      // Convert date string to epoch ms (midnight WIB)
      const dateMs = new Date(acquisitionDate + "T00:00:00+07:00").getTime();

      await createAsset({
        name: name.trim(),
        category,
        acquisitionDate: dateMs,
        cost: costNum,
        salvageValue: salvageNum || undefined,
        usefulLifeMonths: lifeYears > 0 ? lifeYears * 12 : undefined,
        location: location.trim() || undefined,
        characteristics,
        attachmentIds: attachmentIds as any, // eslint-disable-line @typescript-eslint/no-explicit-any -- Convex Id<"_storage"> branded type from upload flow
      });

      // Reset form
      setName("");
      setCategory("");
      setAcquisitionDate("");
      setCost("");
      setUsefulLifeYears("");
      setSalvageValue("");
      setLocation("");
      setCharacteristics([]);
      setAttachmentIds([]);
      onClose();
    } catch {
      // Error toast handled by createMutationHook
    } finally {
      setSubmitting(false);
    }
  }, [name, category, acquisitionDate, cost, salvageValue, usefulLifeYears, location, characteristics, attachmentIds, createAsset, onClose]);

  const selectedCategory = ASSET_CATEGORIES.find((c) => c.key === category);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Fixed Asset</DialogTitle>
          <DialogDescription>
            Register a new asset. PSAK defaults auto-populate from category.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="asset-name">Name *</Label>
            <Input
              id="asset-name"
              placeholder="e.g., Kitchen Mixer KitchenAid"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* Category */}
          <div className="space-y-1.5">
            <Label>Category *</Label>
            <Select value={category} onValueChange={handleCategoryChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {ASSET_CATEGORIES.map((cat) => (
                  <SelectItem key={cat.key} value={cat.key}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Acquisition Date */}
          <div className="space-y-1.5">
            <Label htmlFor="acquisition-date">Acquisition Date *</Label>
            <Input
              id="acquisition-date"
              type="date"
              value={acquisitionDate}
              onChange={(e) => setAcquisitionDate(e.target.value)}
            />
          </div>

          {/* Cost */}
          <div className="space-y-1.5">
            <Label htmlFor="asset-cost">Cost (IDR) *</Label>
            <Input
              id="asset-cost"
              type="number"
              placeholder="e.g., 10000000"
              value={cost}
              onChange={(e) => handleCostChange(e.target.value)}
            />
          </div>

          {/* Useful Life + Salvage Value (side by side) */}
          {selectedCategory?.depreciable && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Label htmlFor="useful-life" className="cursor-help underline decoration-dotted">
                      Useful Life (years)
                    </Label>
                  </TooltipTrigger>
                  <TooltipContent>
                    PSAK default: {selectedCategory.usefulLifeYears} years
                  </TooltipContent>
                </Tooltip>
                <Input
                  id="useful-life"
                  type="number"
                  value={usefulLifeYears}
                  onChange={(e) => setUsefulLifeYears(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Label htmlFor="salvage-value" className="cursor-help underline decoration-dotted">
                      Salvage Value (IDR)
                    </Label>
                  </TooltipTrigger>
                  <TooltipContent>
                    PSAK default: {selectedCategory.salvagePercent}% of cost
                  </TooltipContent>
                </Tooltip>
                <Input
                  id="salvage-value"
                  type="number"
                  value={salvageValue}
                  onChange={(e) => setSalvageValue(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Location */}
          <div className="space-y-1.5">
            <Label htmlFor="asset-location">Location</Label>
            <Input
              id="asset-location"
              placeholder="e.g., Kitchen, Office, Warehouse"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>

          {/* Characteristics */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Characteristics</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setShowCsvPaste(!showCsvPaste)}
              >
                <ClipboardPaste className="h-3 w-3 mr-1" />
                Paste CSV
              </Button>
            </div>

            {showCsvPaste && (
              <div className="space-y-1.5 p-2 border rounded-md bg-muted/30">
                <Textarea
                  placeholder="key,value (one per line)&#10;Serial,ABC123&#10;Model,X500 Pro"
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                  rows={3}
                  className="text-sm"
                />
                <Button type="button" size="sm" className="h-7 text-xs" onClick={handleCsvPaste}>
                  Parse & Add
                </Button>
              </div>
            )}

            {characteristics.length > 0 && (
              <div className="space-y-1">
                {characteristics.map((c, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className="font-medium min-w-[80px]">{c.key}:</span>
                    <span className="flex-1 text-muted-foreground truncate">{c.value}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => removeCharacteristic(i)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <Input
                placeholder="Key"
                value={newCharKey}
                onChange={(e) => setNewCharKey(e.target.value)}
                className="text-sm"
              />
              <Input
                placeholder="Value"
                value={newCharValue}
                onChange={(e) => setNewCharValue(e.target.value)}
                className="text-sm"
                onKeyDown={(e) => e.key === "Enter" && addCharacteristic()}
              />
              <Button type="button" variant="outline" size="icon" className="shrink-0" onClick={addCharacteristic}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Attachments */}
          <div className="space-y-1.5">
            <Label>Attachments</Label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploading}
                onClick={() => document.getElementById("asset-file-input")?.click()}
              >
                <Upload className="h-4 w-4 mr-1" />
                {uploading ? "Uploading..." : "Upload Files"}
              </Button>
              <input
                id="asset-file-input"
                type="file"
                multiple
                accept="image/*,.pdf,.doc,.docx"
                className="hidden"
                onChange={(e) => handleFileUpload(e.target.files)}
              />
              {attachmentIds.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {attachmentIds.length} file(s) attached
                </span>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Creating..." : "Create Asset"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
