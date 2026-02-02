/**
 * UsersManager - Admin-only user management page
 * PRD-4: User management with full CRUD operations
 */
import { useState } from "react";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  User,
  UserPlus,
  Edit,
  KeyRound,
  Power,
  Unlock,
  Shield,
  Clock,
  AlertCircle,
} from "lucide-react";
import { getRoleDisplayName, type UserRole } from "@/lib/types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// Format timestamp to relative time
function formatRelativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);

  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return `${Math.floor(seconds / 604800)}w ago`;
}

export default function UsersManager() {
  useDocumentTitle('Users');
  const users = useQuery(api.auth.queries.listUsers);
  const createUser = useMutation(api.auth.mutations.createUser);
  const updateUser = useMutation(api.auth.mutations.updateUser);
  const resetPin = useMutation(api.auth.mutations.resetPin);
  const setUserActive = useMutation(api.auth.mutations.setUserActive);
  const unlockUser = useMutation(api.auth.mutations.unlockUser);

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showResetPinDialog, setShowResetPinDialog] = useState(false);

  // User type from the query result
  type UserType = NonNullable<typeof users>[number];
  const [selectedUser, setSelectedUser] = useState<UserType | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formPin, setFormPin] = useState("");
  const [formRole, setFormRole] = useState<UserRole>("order_staff");
  const [formAvatarUrl, setFormAvatarUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCreateUser = async () => {
    if (!formName || !formPin) {
      toast.error("Name and PIN are required");
      return;
    }
    if (!/^\d{4,6}$/.test(formPin)) {
      toast.error("PIN must be 4-6 digits");
      return;
    }

    setIsSubmitting(true);
    try {
      await createUser({
        name: formName,
        pin: formPin,
        role: formRole,
        avatarUrl: formAvatarUrl || undefined,
      });
      toast.success("User created successfully");
      setShowCreateDialog(false);
      resetForm();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to create user"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateUser = async () => {
    if (!selectedUser || !formName) return;

    setIsSubmitting(true);
    try {
      await updateUser({
        userId: selectedUser._id as Id<"users">,
        name: formName,
        role: formRole,
        avatarUrl: formAvatarUrl || undefined,
      });
      toast.success("User updated successfully");
      setShowEditDialog(false);
      resetForm();
    } catch (error) {
      toast.error("Failed to update user");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPin = async () => {
    if (!selectedUser || !formPin) return;
    if (!/^\d{4,6}$/.test(formPin)) {
      toast.error("PIN must be 4-6 digits");
      return;
    }

    setIsSubmitting(true);
    try {
      await resetPin({
        userId: selectedUser._id as Id<"users">,
        newPin: formPin,
      });
      toast.success("PIN reset successfully");
      setShowResetPinDialog(false);
      resetForm();
    } catch (error) {
      toast.error("Failed to reset PIN");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (user: UserType) => {
    try {
      await setUserActive({
        userId: user._id as Id<"users">,
        isActive: !user.isActive,
      });
      toast.success(user.isActive ? "User deactivated" : "User activated");
    } catch (error) {
      toast.error("Failed to update user status");
    }
  };

  const handleUnlock = async (user: UserType) => {
    try {
      await unlockUser({ userId: user._id as Id<"users"> });
      toast.success("User unlocked");
    } catch (error) {
      toast.error("Failed to unlock user");
    }
  };

  const resetForm = () => {
    setFormName("");
    setFormPin("");
    setFormRole("order_staff");
    setFormAvatarUrl("");
    setSelectedUser(null);
  };

  const openEditDialog = (user: UserType) => {
    setSelectedUser(user);
    setFormName(user.name);
    setFormRole(user.role as UserRole);
    setFormAvatarUrl(user.avatarUrl || "");
    setShowEditDialog(true);
  };

  const openResetPinDialog = (user: UserType) => {
    setSelectedUser(user);
    setFormPin("");
    setShowResetPinDialog(true);
  };

  const getRoleBadgeColor = (role: UserRole) => {
    const colors: Record<UserRole, string> = {
      admin: "bg-purple-100 text-purple-700",
      manager: "bg-blue-100 text-blue-700",
      order_staff: "bg-green-100 text-green-700",
      kitchen: "bg-orange-100 text-orange-700",
    };
    return colors[role];
  };

  if (users === undefined) {
    return (
      <div className="p-6">
        <PageHeader title="User Management" description="Loading..." />
        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <PageHeader
        title="User Management"
        description="Manage users and their access roles"
      >
        <Button onClick={() => setShowCreateDialog(true)}>
          <UserPlus className="w-4 h-4 mr-2" />
          Add User
        </Button>
      </PageHeader>

      {/* User Cards Grid */}
      <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {users.map((user) => (
          <Card key={user._id} className={cn(!user.isActive && "opacity-60")}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-3">
                  {user.avatarUrl ? (
                    <img
                      src={user.avatarUrl}
                      alt={user.name}
                      className="w-12 h-12 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                      <User className="w-6 h-6 text-muted-foreground" />
                    </div>
                  )}
                  <div>
                    <CardTitle className="text-base">{user.name}</CardTitle>
                    <Badge
                      className={cn(
                        "mt-1",
                        getRoleBadgeColor(user.role as UserRole)
                      )}
                    >
                      {getRoleDisplayName(user.role as UserRole)}
                    </Badge>
                  </div>
                </div>
                {!user.isActive && (
                  <Badge variant="secondary">Inactive</Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Status indicators */}
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                {user.lockedUntil && user.lockedUntil > Date.now() && (
                  <div className="flex items-center text-destructive">
                    <AlertCircle className="w-3 h-3 mr-1" />
                    Locked
                  </div>
                )}
                {user.failedAttempts > 0 && (
                  <div className="flex items-center">
                    <Shield className="w-3 h-3 mr-1" />
                    {user.failedAttempts} failed attempts
                  </div>
                )}
                {user.lastLoginAt && (
                  <div className="flex items-center">
                    <Clock className="w-3 h-3 mr-1" />
                    Last login: {formatRelativeTime(user.lastLoginAt)}
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap gap-2 pt-2 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openEditDialog(user)}
                >
                  <Edit className="w-3 h-3 mr-1" />
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openResetPinDialog(user)}
                >
                  <KeyRound className="w-3 h-3 mr-1" />
                  Reset PIN
                </Button>
                {user.lockedUntil && user.lockedUntil > Date.now() && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleUnlock(user)}
                  >
                    <Unlock className="w-3 h-3 mr-1" />
                    Unlock
                  </Button>
                )}
                <Button
                  variant={user.isActive ? "destructive" : "default"}
                  size="sm"
                  onClick={() => handleToggleActive(user)}
                >
                  <Power className="w-3 h-3 mr-1" />
                  {user.isActive ? "Deactivate" : "Activate"}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Empty state */}
      {users.length === 0 && (
        <div className="text-center py-12">
          <User className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No users yet</p>
          <Button
            onClick={() => setShowCreateDialog(true)}
            className="mt-4"
            variant="outline"
          >
            <UserPlus className="w-4 h-4 mr-2" />
            Create First User
          </Button>
        </div>
      )}

      {/* Create User Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New User</DialogTitle>
            <DialogDescription>
              Add a new user to the system with their name, PIN, and role.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Enter user name"
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pin">PIN (4-6 digits)</Label>
              <Input
                id="pin"
                type="password"
                value={formPin}
                onChange={(e) =>
                  setFormPin(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                placeholder="Enter PIN"
                maxLength={6}
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Select
                value={formRole}
                onValueChange={(v) => setFormRole(v as UserRole)}
                disabled={isSubmitting}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="kitchen">Kitchen Staff</SelectItem>
                  <SelectItem value="order_staff">Order Staff</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="admin">Administrator</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="avatar">Avatar URL (optional)</Label>
              <Input
                id="avatar"
                value={formAvatarUrl}
                onChange={(e) => setFormAvatarUrl(e.target.value)}
                placeholder="https://..."
                disabled={isSubmitting}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateDialog(false);
                resetForm();
              }}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateUser} disabled={isSubmitting}>
              {isSubmitting ? "Creating..." : "Create User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>
              Update user name, role, and avatar. Use Reset PIN to change their
              PIN.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-role">Role</Label>
              <Select
                value={formRole}
                onValueChange={(v) => setFormRole(v as UserRole)}
                disabled={isSubmitting}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="kitchen">Kitchen Staff</SelectItem>
                  <SelectItem value="order_staff">Order Staff</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="admin">Administrator</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-avatar">Avatar URL</Label>
              <Input
                id="edit-avatar"
                value={formAvatarUrl}
                onChange={(e) => setFormAvatarUrl(e.target.value)}
                placeholder="https://..."
                disabled={isSubmitting}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowEditDialog(false);
                resetForm();
              }}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button onClick={handleUpdateUser} disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset PIN Dialog */}
      <Dialog open={showResetPinDialog} onOpenChange={setShowResetPinDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset PIN for {selectedUser?.name}</DialogTitle>
            <DialogDescription>
              Enter a new 4-6 digit PIN for this user. This will also unlock
              the account if locked.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-pin">New PIN (4-6 digits)</Label>
              <Input
                id="new-pin"
                type="password"
                value={formPin}
                onChange={(e) =>
                  setFormPin(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                placeholder="Enter new PIN"
                maxLength={6}
                disabled={isSubmitting}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowResetPinDialog(false);
                resetForm();
              }}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button onClick={handleResetPin} disabled={isSubmitting}>
              {isSubmitting ? "Resetting..." : "Reset PIN"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
