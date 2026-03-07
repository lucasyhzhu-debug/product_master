/**
 * FinishedGoodsSettings — Collapsible settings panel for finished goods inventory.
 *
 * Contains:
 * - Global low-stock threshold
 * - Default add-stock location
 * - Auto-advance on drawdown toggle (admin only)
 * - Alert mode selector (admin only)
 * - Location platform type tagging (admin only)
 */

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Settings } from "lucide-react";
import { toast } from "sonner";
import { locationTypeLabel } from "./finishedGoodsUtils";

export type FinishedGoodsSettingsProps = {
  thresholdInput: string;
  onThresholdChange: (value: string) => void;
  settingsDefaultLocation: string;
  onDefaultLocationChange: (value: string) => void;
  autoAdvance: boolean;
  onAutoAdvanceChange: (checked: boolean) => void;
  alertMode: "toast" | "toast_and_badge";
  onAlertModeChange: (value: "toast" | "toast_and_badge") => void;
  locations: Array<{
    _id: string;
    name: string;
    isDefault?: boolean;
    isActive: boolean;
    locationType: string;
  }>;
  onUpdateLocationType: (locId: string, newType: string) => Promise<void>;
  onSave: () => void;
  isSaving: boolean;
  isAdmin: boolean;
};

export function FinishedGoodsSettings({
  thresholdInput,
  onThresholdChange,
  settingsDefaultLocation,
  onDefaultLocationChange,
  autoAdvance,
  onAutoAdvanceChange,
  alertMode,
  onAlertModeChange,
  locations,
  onUpdateLocationType,
  onSave,
  isSaving,
  isAdmin,
}: FinishedGoodsSettingsProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Settings className="h-4 w-4" />
          Finished Goods Settings
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Global low-stock threshold */}
          <div className="space-y-2">
            <Label htmlFor="fg-threshold" className="text-sm">
              Global Low-Stock Threshold
            </Label>
            <Input
              id="fg-threshold"
              type="number"
              min="0"
              value={thresholdInput}
              onChange={(e) => onThresholdChange(e.target.value)}
              placeholder="5"
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Alert when stock at any location falls at or below this number
            </p>
          </div>

          {/* Default add-stock location */}
          <div className="space-y-2">
            <Label htmlFor="fg-default-loc" className="text-sm">
              Default Add-Stock Location
            </Label>
            <Select
              value={settingsDefaultLocation}
              onValueChange={(v) => onDefaultLocationChange(v)}
            >
              <SelectTrigger id="fg-default-loc">
                <SelectValue placeholder="Select location..." />
              </SelectTrigger>
              <SelectContent>
                {locations.map((loc) => (
                  <SelectItem key={loc._id} value={loc._id}>
                    {loc.name}
                    {loc.isDefault && " (default)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {isAdmin && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t">
            {/* Auto-advance on drawdown */}
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label className="text-sm">Auto-advance on Drawdown</Label>
                <p className="text-xs text-muted-foreground">
                  When ON, fulfilling an order from inventory automatically moves it to "Awaiting Delivery" — no manual status change needed.
                </p>
              </div>
              <Switch
                checked={autoAdvance}
                onCheckedChange={onAutoAdvanceChange}
              />
            </div>

            {/* Alert mode */}
            <div className="space-y-2">
              <Label className="text-sm">Alert Mode</Label>
              <Select
                value={alertMode}
                onValueChange={(v) => onAlertModeChange(v as "toast" | "toast_and_badge")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="toast">Toast only</SelectItem>
                  <SelectItem value="toast_and_badge">Toast + Badge</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                How to notify when stock runs low: "Toast only" shows a pop-up; "Toast + Badge" also shows a red indicator on the Finished Goods tab.
              </p>
            </div>
          </div>
        )}

        {isAdmin && (
          <div className="pt-2 border-t space-y-3">
            <div>
              <Label className="text-sm">Location Platform Types</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Tag each storage location as Internal Inventory, GoFood, or K3Mart. Controls the "By Platform" grouping and hero stat cards.
              </p>
            </div>
            <div className="space-y-2">
              {locations.filter((l) => l.isActive).map((loc) => (
                <div key={loc._id} className="flex items-center justify-between gap-3">
                  <span className="text-sm">{loc.name}</span>
                  <Select
                    value={loc.locationType}
                    onValueChange={async (newType) => {
                      try {
                        await onUpdateLocationType(loc._id, newType);
                        toast.success(`${loc.name} tagged as ${locationTypeLabel(newType)}`);
                      } catch {
                        toast.error("Failed to update location type");
                      }
                    }}
                  >
                    <SelectTrigger className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="office">Internal Inventory (Office)</SelectItem>
                      <SelectItem value="kitchen">Internal Inventory (Kitchen)</SelectItem>
                      <SelectItem value="depot">GoFood</SelectItem>
                      <SelectItem value="venue">K3Mart</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button
            size="sm"
            onClick={onSave}
            disabled={isSaving}
          >
            {isSaving ? "Saving..." : "Save Settings"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
