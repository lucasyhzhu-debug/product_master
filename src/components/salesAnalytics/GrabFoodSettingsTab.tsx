/**
 * GrabFoodSettingsTab - GrabFood settings with MerchantID management and OAuth.
 * Named GrabFoodSettingsTab (not SettingsTab) to avoid collision with the
 * existing product mapping SettingsTab in the salesAnalytics barrel.
 * Extracted from GrabFoodManager.tsx for maintainability.
 */

import { useState } from "react";
import {
  Plus,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { useQuery } from "convex/react";
import { useProtectedMutation } from "@/hooks/convex/useProtectedMutation";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { GrabFoodCredentialsDialog } from "./GrabFoodCredentialsDialog";
import { OutletDialog } from "./OutletDialog";

export interface GrabFoodSettingsTabProps {
  outlets: Array<{
    _id: string;
    name: string;
    externalId: string;
    isActive: boolean;
    source: string;
  }>;
  isAdmin: boolean;
}

export function GrabFoodSettingsTab({ outlets, isAdmin }: GrabFoodSettingsTabProps) {
  const [credDialogOpen, setCredDialogOpen] = useState(false);
  const [outletDialogOpen, setOutletDialogOpen] = useState(false);
  const [editingOutlet, setEditingOutlet] = useState<{
    name: string;
    merchantId: string;
  } | null>(null);

  // Product mappings for GrabFood price/availability
  const mappings = useQuery(api.externalData.queries.getProductMappings, {
    source: "grabfood",
  });
  const updateMappingFields = useProtectedMutation(
    api.externalData.mutations.updateProductMappingFields
  );

  const handlePriceUpdate = async (mappingId: Id<"externalProductMappings">, value: string) => {
    const price = parseInt(value, 10);
    if (isNaN(price) || price < 0) return;
    try {
      await updateMappingFields({ mappingId, grabfoodPrice: price });
      toast.success("Price updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update price");
    }
  };

  const handleAvailabilityToggle = async (mappingId: Id<"externalProductMappings">, isAvailable: boolean) => {
    try {
      await updateMappingFields({ mappingId, isAvailable });
      toast.success(isAvailable ? "Item enabled" : "Item disabled");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update availability");
    }
  };

  return (
    <div className="space-y-6">
      {/* OAuth Credentials */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">OAuth Credentials</CardTitle>
          <CardDescription>
            GrabFood Partner API client credentials (OAuth2 client_credentials grant)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => setCredDialogOpen(true)}>
            Configure Credentials
          </Button>
        </CardContent>
      </Card>

      {/* Outlet / MerchantID Management */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">GrabFood Outlets</CardTitle>
              <CardDescription>
                Manage outlet names and MerchantIDs. Each outlet corresponds to a
                store registered in GrabFood Merchant Portal.
              </CardDescription>
            </div>
            <Button
              size="sm"
              onClick={() => {
                setEditingOutlet(null);
                setOutletDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Outlet
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {outlets.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No outlets configured. Click "Add Outlet" to register a GrabFood outlet
              with its MerchantID.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Outlet Name</TableHead>
                  <TableHead>MerchantID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {outlets.map((outlet) => (
                  <TableRow key={outlet._id}>
                    <TableCell className="font-medium">{outlet.name}</TableCell>
                    <TableCell className="font-mono text-sm">
                      {outlet.externalId}
                    </TableCell>
                    <TableCell>
                      <Badge variant={outlet.isActive ? "default" : "secondary"}>
                        {outlet.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingOutlet({
                            name: outlet.name,
                            merchantId: outlet.externalId,
                          });
                          setOutletDialogOpen(true);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Product Mapping -- GrabFood Price & Availability */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Product Mapping</CardTitle>
          <CardDescription>
            Set GrabFood-specific prices and availability per product. Items marked unavailable
            will be excluded from the GET /menu response.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {mappings === undefined ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : mappings.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No product mappings found. Sync menu data or add mappings to configure pricing.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>External Code</TableHead>
                  <TableHead className="w-[160px]">GrabFood Price (IDR)</TableHead>
                  <TableHead className="w-[100px]">Available</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mappings.map((mapping) => (
                  <TableRow key={mapping._id}>
                    <TableCell className="font-medium text-sm">
                      {mapping.externalProductName}
                    </TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">
                      {mapping.externalProductCode}
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        step={1000}
                        placeholder="Use default"
                        defaultValue={mapping.grabfoodPrice ?? ""}
                        onBlur={(e) => {
                          if (e.target.value && isAdmin) {
                            handlePriceUpdate(mapping._id as Id<"externalProductMappings">, e.target.value);
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && isAdmin) {
                            (e.target as HTMLInputElement).blur();
                          }
                        }}
                        disabled={!isAdmin}
                        className="w-[140px] h-8"
                      />
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={mapping.isAvailable !== false}
                        onCheckedChange={(checked) => {
                          if (isAdmin) {
                            handleAvailabilityToggle(mapping._id as Id<"externalProductMappings">, checked);
                          }
                        }}
                        disabled={!isAdmin}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <GrabFoodCredentialsDialog
        open={credDialogOpen}
        onOpenChange={setCredDialogOpen}
      />
      <OutletDialog
        open={outletDialogOpen}
        onOpenChange={setOutletDialogOpen}
        editingOutlet={editingOutlet}
      />
    </div>
  );
}
