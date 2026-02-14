/**
 * LocationsManager - CRUD for storage locations
 */

import { useState } from "react";
import { MapPin, Plus, Pencil, Trash2, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { PageHeader } from "@/components/layout";
import { ConfirmDialog } from "@/components/shared";
import {
  useConvexStorageLocations,
  useConvexCreateStorageLocation,
  useConvexUpdateStorageLocation,
  useConvexDeleteStorageLocation,
} from "@/hooks/convex";
import type { Id } from "../../convex/_generated/dataModel";

export function LocationsManager() {
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<Id<"storageLocations"> | null>(
    null
  );

  // Form state
  const [name, setName] = useState("");
  const [locationType, setLocationType] = useState<
    "office" | "kitchen" | "venue"
  >("office");
  const [address, setAddress] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [isDefault, setIsDefault] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Queries & mutations
  const locations = useConvexStorageLocations(false);
  const createLocation = useConvexCreateStorageLocation();
  const updateLocation = useConvexUpdateStorageLocation();
  const deleteLocation = useConvexDeleteStorageLocation();

  // Loading state
  if (locations === undefined) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const handleEdit = (id: Id<"storageLocations">) => {
    const location = locations.find((l) => l._id === id);
    if (location) {
      setEditingId(id);
      setName(location.name);
      setLocationType(location.locationType);
      setAddress(location.address || "");
      setIsActive(location.isActive);
      setIsDefault(location.isDefault || false);
      setEditDialogOpen(true);
    }
  };

  const handleNew = () => {
    setEditingId(null);
    setName("");
    setLocationType("office");
    setAddress("");
    setIsActive(true);
    setIsDefault(false);
    setEditDialogOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) return;

    setIsSubmitting(true);
    try {
      if (editingId) {
        await updateLocation.mutate({
          id: editingId,
          name,
          locationType,
          address: address.trim() || undefined,
          isActive,
          isDefault,
        });
      } else {
        await createLocation.mutate({
          name,
          locationType,
          address: address.trim() || undefined,
          isActive,
          isDefault,
        });
      }
      setEditDialogOpen(false);
    } catch {
      // Factory handles toast errors
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!editingId) return;

    try {
      await deleteLocation.mutate({ id: editingId });
      setDeleteDialogOpen(false);
      setEditingId(null);
    } catch {
      // Factory handles toast errors
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Storage Locations"
        action={
          <Button onClick={handleNew} size="lg">
            <Plus className="h-5 w-5 mr-2" />
            New Location
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Locations</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {locations.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <MapPin className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No locations yet. Create one to get started.</p>
              </div>
            ) : (
              locations.map((location) => (
                <div
                  key={location._id}
                  className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <MapPin className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{location.name}</span>
                        <Badge variant="outline">
                          {location.locationType}
                        </Badge>
                        {location.isDefault && (
                          <Badge className="bg-emerald-600">Default</Badge>
                        )}
                        {!location.isActive && (
                          <Badge variant="destructive">Inactive</Badge>
                        )}
                      </div>
                      {location.address && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {location.address}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(location._id)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditingId(location._id);
                        setDeleteDialogOpen(true);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Edit/Create Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Edit Location" : "New Location"}
            </DialogTitle>
            <DialogDescription>
              Configure storage location details
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Location Name *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Kitchen"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="type">Location Type *</Label>
              <Select
                value={locationType}
                onValueChange={(value) =>
                  setLocationType(value as "office" | "kitchen" | "venue")
                }
              >
                <SelectTrigger id="type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="office">Office</SelectItem>
                  <SelectItem value="kitchen">Kitchen</SelectItem>
                  <SelectItem value="venue">Venue</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Address (Optional)</Label>
              <Input
                id="address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="123 Main St, Jakarta"
              />
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="isActive"
                  checked={isActive}
                  onCheckedChange={(checked) =>
                    setIsActive(checked === true)
                  }
                />
                <label
                  htmlFor="isActive"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Active
                </label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="isDefault"
                  checked={isDefault}
                  onCheckedChange={(checked) =>
                    setIsDefault(checked === true)
                  }
                />
                <label
                  htmlFor="isDefault"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 flex items-center gap-1"
                >
                  <CheckCircle className="h-4 w-4" />
                  Set as Default
                </label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditDialogOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSubmitting}>
              {isSubmitting
                ? "Saving..."
                : editingId
                ? "Update"
                : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete Location"
        description="Are you sure? This action cannot be undone. The location must have no inventory."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  );
}
