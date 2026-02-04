import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { getRoleDisplayName, type UserRole } from "../../lib/types";
import { cn } from "../../lib/utils";
import { User, Users } from "lucide-react";

interface AvatarGridProps {
  selectedUserId: Id<"users"> | null;
  onSelectUser: (userId: Id<"users">) => void;
}

export function AvatarGrid({ selectedUserId, onSelectUser }: AvatarGridProps) {
  const activeUsers = useQuery(api.auth.queries.getActiveUsers);

  if (activeUsers === undefined) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (activeUsers.length === 0) {
    return (
      <div className="text-center py-12">
        <Users className="mx-auto h-12 w-12 text-muted-foreground" />
        <h3 className="mt-2 text-sm font-semibold">No Users</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          No active users found. Please contact an administrator.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-6 max-w-md mx-auto">
      {activeUsers.map((user) => (
        <button
          key={user._id}
          onClick={() => onSelectUser(user._id)}
          className={cn(
            "flex flex-col items-center p-6 rounded-xl transition-all",
            "border-2 hover:border-primary hover:bg-primary/5",
            selectedUserId === user._id
              ? "border-primary bg-primary/10 ring-2 ring-primary ring-offset-2"
              : "border-muted"
          )}
        >
          {/* Avatar */}
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={user.name}
              className="w-20 h-20 rounded-full object-cover"
            />
          ) : (
            <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center">
              <User className="w-10 h-10 text-muted-foreground" />
            </div>
          )}

          {/* Name */}
          <span className="mt-3 font-medium text-base text-center truncate w-full">
            {user.name}
          </span>

          {/* Role badge */}
          <span className={cn(
            "mt-2 text-sm px-3 py-1 rounded-full",
            getRoleBadgeColor(user.role as UserRole)
          )}>
            {getRoleDisplayName(user.role as UserRole)}
          </span>
        </button>
      ))}
    </div>
  );
}

function getRoleBadgeColor(role: UserRole): string {
  const colors: Record<UserRole, string> = {
    admin: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
    manager: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
    order_staff: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
    kitchen: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
  };
  return colors[role];
}
